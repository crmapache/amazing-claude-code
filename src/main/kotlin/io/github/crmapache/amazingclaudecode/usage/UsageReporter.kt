package io.github.crmapache.amazingclaudecode.usage

import com.intellij.openapi.components.Service
import com.intellij.openapi.components.service
import com.intellij.openapi.diagnostic.thisLogger
import com.intellij.util.concurrency.AppExecutorUtil
import io.github.crmapache.amazingclaudecode.feedback.DiagnosticsLog
import io.github.crmapache.amazingclaudecode.feedback.FeedbackEnvironment
import io.github.crmapache.amazingclaudecode.stats.StatsLedger
import io.github.crmapache.amazingclaudecode.toolwindow.ClaudePanels
import java.nio.file.Path
import java.time.LocalDate
import java.util.TreeMap
import java.util.concurrent.atomic.AtomicBoolean
import kotlinx.serialization.json.Json
import kotlinx.serialization.json.JsonObject

/**
 * The anonymous usage report: whether it may go, when it goes, and taking it back.
 *
 * Nothing goes until a person has said yes (see UsageConsent.tsx, the card that asks once). Then a report
 * goes a few times a day, and only while the plugin is being used: the moments that set it off are a
 * message sent, an answer finished and the panel opening (see [nudge]), never a timer of its own - an IDE
 * left open over a weekend sends nothing. JetBrains asks exactly this of a plugin (Marketplace approval
 * guidelines, 2.2.d and 2.2.e), and it is also simply what "while you use it" means.
 *
 * Saying no later takes the past with it: the identifier is dropped, and the service is asked to delete
 * everything kept under it - retried until it answers, even with the report switched off, because a
 * deletion is the one request the switch must never stand in the way of.
 */
@Service(Service.Level.APP)
internal class UsageReporter(
    private val state: UsageState,
    private val clock: () -> Long,
    /** Everything below is the IDE's own in the IDE and a stand-in in a test - no network, no platform. */
    private val ledger: () -> StatsLedger = { StatsLedger.getInstance() },
    private val environment: () -> UsageReport.Environment = UsageFacts::environment,
    private val settings: () -> Map<String, Any> = UsageFacts::settings,
    private val post: (String) -> Boolean = UsageSender::post,
    private val forget: (String) -> Boolean = UsageSender::forget,
    /** The CLI's version costs a process to learn, so it is asked for once and read when it is there. */
    private val warmUp: () -> Unit = { FeedbackEnvironment.warmUp(null) },
    private val execute: (Runnable) -> Unit = { AppExecutorUtil.getAppExecutorService().execute(it) },
) {

    /** The platform's own way in. */
    @Suppress("unused")
    constructor() : this(UsageState(stateFile()), System::currentTimeMillis)

    /** One pass at a time. */
    private val busy = AtomicBoolean(false)

    /**
     * A nudge arrived while a pass was running: run once more when it ends. Dropping it instead would
     * leave a "no" said mid-report waiting for the next message to be sent before its deletion goes out.
     */
    private val again = AtomicBoolean(false)

    @Volatile
    private var lastNudge = 0L

    /**
     * Told when the answer or the last report changes. Every open panel shows it, in every project - the
     * answer is the machine's, and a second window still offering the question after it was answered in
     * the first would be asking twice. A test puts something of its own here.
     */
    @Volatile
    var onChanged: () -> Unit = { ClaudePanels.everyPanel { it.usageChanged() } }

    /** What the panel is shown: the answer, and when a report last went through. */
    fun snapshot(): UsageState.Data = state.read()

    /**
     * Somebody is using the plugin: if a report is due, send it. Cheap to call on every message - the
     * decision to look at all is held to once a minute here, and the real one is made on a pooled thread.
     */
    fun nudge() {
        val now = clock()
        if (now - lastNudge < NUDGE_GAP_MS) return
        lastNudge = now
        if (!busy.compareAndSet(false, true)) {
            again.set(true)
            return
        }

        execute {
            try {
                do {
                    again.set(false)
                    runCatching { runOnce(clock()) }
                        .onFailure { thisLogger().warn("The usage report failed (${it::class.simpleName})") }
                } while (again.get())
            } finally {
                busy.set(false)
            }
        }
    }

    /** The person answered - on the card, or with the switch in the settings. */
    fun setConsent(granted: Boolean) {
        val today = today()
        state.update { current ->
            when {
                granted && current.consent == UsageState.Consent.GRANTED && current.id.isNotEmpty() -> current
                granted -> current.copy(
                    consent = UsageState.Consent.GRANTED,
                    id = UsageState.newId(),
                    since = today,
                    sent = emptyMap(),
                    lastAttempt = 0,
                    lastSent = 0,
                )
                else -> current.copy(
                    consent = UsageState.Consent.DECLINED,
                    id = "",
                    since = "",
                    sent = emptyMap(),
                    lastAttempt = 0,
                    lastSent = 0,
                    forget = if (current.id.isNotEmpty()) (current.forget + current.id).distinct() else current.forget,
                )
            }
        }
        DiagnosticsLog.note(DiagnosticsLog.STATS, "usage report ${if (granted) "allowed" else "declined"}")
        onChanged()

        // Answering is using the panel. A yes sends the first report now; a no asks for the deletion now.
        lastNudge = 0
        nudge()
    }

    /**
     * The report as it would go next, whole, for the screen that shows it. Before a yes there is no
     * identifier yet, so a placeholder stands in its place - and today is what the first report would
     * carry.
     */
    fun preview(): String {
        val data = state.read()
        val id = data.id.ifEmpty { PREVIEW_ID }
        val from = earliest(if (data.consent == UsageState.Consent.GRANTED) data.since else today())
        return PRETTY.encodeToString(JsonObject.serializer(), build(id, from, emptyMap()).first)
    }

    private fun runOnce(now: Long) {
        warmUp()

        forgetPending()

        val data = state.read()
        if (data.consent != UsageState.Consent.GRANTED || data.id.isEmpty()) return
        // Nothing goes sooner than this after the last attempt, whatever changed - no need to look.
        if (now - data.lastAttempt < RETRY_MS) return

        val today = today()
        val (report, days) = build(data.id, earliest(data.since), data.sent)
        if (days.isEmpty()) return

        // Only today has changed since the last report: that can wait for the interval. A finished day
        // that changed - the last hours of yesterday - goes at the next chance after a short pause.
        val finishedChanged = days.any { it.day < today }
        val wait = if (finishedChanged) RETRY_MS else SEND_INTERVAL_MS
        if (now - data.lastAttempt < wait) return

        state.update { it.copy(lastAttempt = now) }
        if (!post(report.toString())) return

        val window = earliest("")
        state.update { current ->
            // Answered no while this one was on its way: nothing is recorded under an identifier that is
            // already on its way to being deleted.
            if (current.id != data.id || current.consent != UsageState.Consent.GRANTED) return@update current
            current.copy(
                lastSent = now,
                sent = (current.sent + days.associate { it.day to it.digest }).filterKeys { it >= window },
            )
        }
        onChanged()
    }

    /** Ask the service to delete what it holds under every identifier given up, until it has. */
    private fun forgetPending() {
        val pending = state.read().forget
        if (pending.isEmpty()) return

        val done = pending.filter { forget(it) }.toSet()
        if (done.isEmpty()) return

        state.update { current -> current.copy(forget = current.forget - done) }
        DiagnosticsLog.note(DiagnosticsLog.STATS, "usage reports deleted on the service (${done.size})")
    }

    /**
     * The report, and the days in it: every day from [from] on that saw anything and has changed since it
     * was last sent. Built under the book's lock and nothing of the book kept afterwards.
     */
    private fun build(id: String, from: String, sent: Map<String, String>): Pair<JsonObject, List<UsageReport.Day>> {
        val days = ledger().read { snapshot ->
            UsageReport.days(TreeMap(snapshot.daysTogether()), from).filter { sent[it.day] != it.digest }
        }
        return UsageReport.report(id, environment(), settings(), days) to days
    }

    /** The later of a day and the start of the window: nothing older than a fortnight is ever sent. */
    private fun earliest(since: String): String {
        val window = LocalDate.parse(today()).minusDays(UsageReport.DAYS_BACK).toString()
        return if (since > window) since else window
    }

    private fun today(): String = LocalDate.ofInstant(java.time.Instant.ofEpochMilli(clock()), java.time.ZoneId.systemDefault()).toString()

    companion object {
        fun getInstance(): UsageReporter = service()

        /**
         * Where the answer lives: beside the statistics book, one file for every IDE on the machine. A run
         * pointed at another service - a sandbox, a test - keeps an answer of its own, so that saying yes
         * in a sandbox is not saying yes on the machine's real IDE.
         */
        fun stateFile(): Path {
            val name = if (UsageSender.isCustom()) "usage-report.dev.json" else UsageState.FILE_NAME
            return StatsLedger.directory().resolve(name)
        }

        /** Nudges closer together than this are one nudge. */
        const val NUDGE_GAP_MS = 60_000L

        /** How often a report goes while only today is changing. */
        const val SEND_INTERVAL_MS = 4L * 60 * 60 * 1000

        /** How long after a failed or finished-day attempt the next may be made. */
        const val RETRY_MS = 15L * 60 * 1000

        const val PREVIEW_ID = "(a random id, made when you allow this)"

        private val PRETTY = Json { prettyPrint = true }
    }
}

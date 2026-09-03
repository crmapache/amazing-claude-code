package io.github.crmapache.amazingclaudecode.claude

import com.intellij.openapi.Disposable
import com.intellij.openapi.diagnostic.thisLogger
import com.intellij.openapi.util.Disposer
import com.intellij.util.concurrency.AppExecutorUtil
import java.util.concurrent.TimeUnit
import java.util.concurrent.atomic.AtomicBoolean
import java.util.concurrent.atomic.AtomicReference
import java.util.concurrent.atomic.AtomicLong
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.JsonObjectBuilder
import kotlinx.serialization.json.addJsonObject
import kotlinx.serialization.json.booleanOrNull
import kotlinx.serialization.json.buildJsonObject
import kotlinx.serialization.json.contentOrNull
import kotlinx.serialization.json.jsonPrimitive
import kotlinx.serialization.json.put
import kotlinx.serialization.json.putJsonArray
import kotlinx.serialization.json.putJsonObject

/**
 * Everything the panel counts rather than draws: the subscription's usage windows, today's tokens, the
 * context window and the model catalogue.
 *
 * Apart from the panel itself because this is the one part of it with a life of its own - schedules,
 * retries, two routes to one and the same figure and a threshold between them. Kept beside the panel's
 * message routing, it swallowed a third of the file and buried the routing under retry rules nobody
 * looks for there.
 *
 * It owns nothing: neither the conversations nor the channel into the interface. Both arrive as
 * functions, because both change during the panel's life - the conversations appear only with the
 * browser, and there is no channel at all until the page is ready.
 */
internal class ProjectUsage(
    private val workingDirectory: String?,
    private val hub: ClaudeSessionHub,
    /**
     * Without a sign-in there is nothing to ask: a process would come up only to answer that the user
     * is not signed in.
     */
    private val isLoggedIn: () -> Boolean,
) {

    private val sessions: ClaudeSessions get() = hub.conversations

    /**
     * The memory of the usage windows: snapshots arrive by two routes with different lags, and folding
     * them into one truthful picture is that memory's work (see [ClaudeUsage.Tracker]), not the
     * panel's.
     */
    private val windows = ClaudeUsage.Tracker()

    /**
     * Extra usage - the work that goes on past an exhausted limit, paid for on top of the plan.
     *
     * It is put together out of two different routes, because neither one alone knows the whole of it:
     * the stream's limit events say whether it is being spent right now (see [noteRateLimit]), the
     * answer to `get_usage` how much of the month's budget for it has already gone. Kept here rather
     * than sent onwards as it comes, so that a message about one of the two does not wipe the other.
     */
    /**
     * Null until the first limit event arrives - "we do not know yet" rather than "no".
     *
     * The difference matters exactly once per launch, and it is the whole of a bug: the CLI repeats the
     * event on every turn while the state holds, so the first one after a restart says "money is being
     * spent" about a state that began hours ago. Read as a change from "no", that fires a notification to
     * every paired phone - and once per open project, so three projects and one restart meant three
     * buzzes about one morning's spending.
     */
    private val extraActive = AtomicReference<Boolean?>(null)

    /**
     * Which window the extra usage is spent past, in the CLI's words. The panel decides by it which of
     * its rings burns: a used-up five-hour window and a used-up weekly one arrive as the same event and
     * are two different rings on the screen.
     */
    @Volatile
    private var extraWindow = ""

    @Volatile
    private var extraKnown: ClaudeUsage.Extra? = null

    /**
     * When a ping for the usage was last raised. The polling goes every half-minute, but for a sleeping
     * panel every round costs a separate process for a few seconds, while usage barely moves without
     * conversations - so we ping less often (see [refreshLimits]).
     */
    private val lastPing = AtomicLong(0)

    /** The model catalogue is asked for once per panel's life - see [refreshModels]. */
    private val modelsRequested = AtomicBoolean(false)

    /**
     * When the sign-in last moved to another account - see [forget]. Everything a process raised before
     * that moment says about the usage is about the previous account.
     */
    private val accountChangedAt = AtomicLong(0)

    /**
     * The usage windows get a round of their own, twice as often as the rest: they are visible on the
     * rings right by the input field, and while the agent works the share grows before one's eyes. With
     * a live conversation this costs nothing (the question goes into a process already up), and a
     * sleeping panel is protected from extra processes by a separate threshold in [refreshLimits].
     */
    fun scheduleUpdates(parentDisposable: Disposable) {
        val limits = AppExecutorUtil.getAppScheduledExecutorService().scheduleWithFixedDelay(
            { refreshLimits() },
            LIMITS_PERIOD_SECONDS,
            LIMITS_PERIOD_SECONDS,
            TimeUnit.SECONDS,
        )

        Disposer.register(parentDisposable) { limits.cancel(false) }
    }

    /**
     * The whole usage at once, at the panel's own request: both the subscription windows and the day's
     * tokens. It asks for this when it opens - so we ask straight away, without looking at the ping's
     * threshold.
     */
    fun refreshAll() {
        refreshLimits(urgent = true)
        refreshTodayTokens()
    }

    /**
     * The subscription's usage windows.
     *
     * We ask the working conversation - the one that has just finished a turn, or the one whose turn is
     * running right now: a process learns its share from the server's answers to its own requests, and
     * a working one has the freshest possible. It is free, too: the process is already up.
     *
     * An idle conversation cannot be asked that way: it will repeat the figure that arrived with its
     * last answer - and it may have worked yesterday. For the real one we go to the server, by a
     * one-off lightweight ping (`--safe-mode`, no customizations) through [ClaudeControlPing].
     *
     * A ping costs starting a process for a few seconds, so it does not go on every round but by a
     * threshold of its own: without work, usage grows only from a terminal or a browser - which is what
     * the threshold is left for, instead of not asking at all. [urgent] lifts it: that is how the panel
     * asks when it opens and when it retries, where the figures are needed now rather than "next
     * round".
     */
    fun refreshLimits(
        attempt: Int = 0,
        /** The conversation that has just been working: its share is the freshest of all. */
        preferred: String? = null,
        urgent: Boolean = false,
        /** Past the conversations, straight to the server: its answer is what cures a frozen one. */
        viaPing: Boolean = false,
    ) {
        if (!isLoggedIn()) return

        // Which account this question is being asked on behalf of. An answer takes seconds to come back,
        // and the sign-in can move to another account in the meantime: what returns then describes the
        // previous account's shares - the very figures forget() has just thrown away - and letting them
        // through puts them straight back on the rings, where they sit until their window resets, which
        // is precisely what the forgetting exists to prevent.
        val askedFor = accountChangedAt.get()
        val onUsage = { usage: JsonObject ->
            if (accountChangedAt.get() == askedFor) receiveUsage(usage, attempt, preferred)
        }
        // Who to ask. The one that has just finished a turn knows the freshest share - it got it in the
        // answer to its own request. A turn running right now is the same thing, the share growing
        // before its eyes. An idle conversation, though, answers with exactly what has already arrived:
        // we leave it alone and go to the server.
        val live = when {
            viaPing -> null
            preferred != null && sessions.isRunning(preferred) -> preferred
            else -> sessions.busySession()
        }?.takeIf { fromThisAccount(it) }

        if (live != null) {
            sessions.requestUsage(
                live,
                onUsage,
                // The conversation may not answer at all (a control request has a timeout of its own):
                // then we go to the server for the figures anyway, or the rings would freeze until the
                // end of the day on whatever the panel learned last.
                onFailure = { error ->
                    thisLogger().info("Usage from live session unavailable: $error")
                    if (attempt < RETRY_LIMIT) refreshLimits(attempt + 1, preferred, viaPing = true)
                },
            )
            return
        }

        val now = System.currentTimeMillis()
        val since = now - lastPing.get()
        if (!urgent && since < TimeUnit.SECONDS.toMillis(PING_MIN_SECONDS)) return
        lastPing.set(now)

        ClaudeControlPing.request(
            workingDirectory,
            subtype = "get_usage",
            onResult = onUsage,
            onError = { error -> thisLogger().info("Usage ping skipped: $error") },
        )
    }

    /**
     * Whether this conversation may be believed about the usage at all.
     *
     * The CLI reads the credentials when it starts: a process raised before the account switched goes on
     * working as the previous account and answers with its shares - the very figures that have just been
     * thrown away. Such a conversation is left alone and the question goes to the server by a ping, which
     * starts a process of its own and so asks under the credentials in force now.
     */
    private fun fromThisAccount(sessionId: String): Boolean =
        sessions.startedAt(sessionId) >= accountChangedAt.get()

    /**
     * The sign-in has moved to another account: everything counted here was about the previous one.
     *
     * Thrown away rather than left to be overwritten by the next answer, because it would not be. A
     * weekly window the new account has not opened yet arrives with no reset time at all, and the memory
     * of the windows - rightly, for its usual job - keeps the known share in that case (see
     * [ClaudeUsage.Tracker]). That is exactly how the panel came to show a five-hour window of one
     * account beside a weekly window of another.
     */
    fun forget() {
        windows.forget()
        extraKnown = null
        extraActive.set(null)
        extraWindow = ""
        accountChangedAt.set(System.currentTimeMillis())
        // The threshold on the ping means "nothing can have changed since we last asked", and an account
        // switch is the opposite of that.
        lastPing.set(0)
        // The catalogue belongs to the account as well - a plan without Opus does not offer it. Only the
        // latch is released here: the sign-in check asks for the list itself once the new account is
        // confirmed (see ClaudeSessionHub, onSignedIn).
        modelsRequested.set(false)

        // The interface is told to forget too, and told separately: its own state is merged field by
        // field (see mergeUsage in feed/usage.ts), so silence about a window means "nothing new", not
        // "that window is nobody's now".
        hub.broadcastProject(
            buildJsonObject {
                put("type", "usage")
                put("reset", true)
            }.toString(),
        )

        // Past the conversations, straight to the server: the processes already up are the previous
        // account's, and the rings would be filled from them again.
        refreshLimits(urgent = true, viaPing = true)
    }

    /**
     * A line from a conversation's stream, in case it is a limit event: extra usage starts and ends
     * without any question from us, and the rings must not wait for the next round of polling to learn
     * of it (the whole point of the paint is that the limit has been passed right now).
     *
     * Only the change is said out loud: the CLI repeats the event on every turn while the state holds,
     * and repeating a message that says the same thing would be noise on the wire - a phone across the
     * city is on the other end of it.
     *
     * Returns whether the spending has just started - the switch from the plan's own window to money on
     * top of it. Only this side can tell that moment from the state that follows it, and it is the one
     * occasion a person away from the desk is called about that is not in any message (see
     * NotificationReasons.EXTRA_USAGE). Only the switch on, not a change of window while it lasts: a
     * second window running out changes nothing about the fact that the money is already going.
     *
     * And never on the first event after a launch, whatever it says: see [extraActive]. Nor twice for one
     * window, however many projects are open to see it - see [ExtraUsageAnnouncements].
     */
    fun noteRateLimit(line: String): Boolean {
        val verdict = ClaudeRateLimit.of(line) ?: return false
        val active = verdict.extraUsage
        val window = if (active) verdict.window else ""
        val wasActive = extraActive.getAndSet(active)
        val changed = wasActive != active || extraWindow != window

        extraWindow = window
        if (!changed) return false

        hub.broadcastProject(
            buildJsonObject {
                put("type", "usage")
                putExtra()
            }.toString(),
        )

        /*
         * A crossing seen from a state we knew about: it was off, it is on now.
         *
         * "Was false" rather than "was not true": the first event after a launch has nothing before it
         * (see [extraActive]), and it is a reading rather than a crossing - told to the panel, which has
         * to paint the rings, and not to a phone, which would be woken about nothing.
         *
         * Claimed rather than simply reported: the limit is the account's, and every open project sees
         * the same crossing in its own agent's stream (see ExtraUsageAnnouncements).
         */
        return active && wasActive == false &&
            ExtraUsageAnnouncements.getInstance().claim(verdict.window, verdict.resetsAt)
    }

    /**
     * Today's tokens - a scan of EVERY project's transcripts rather than a question to the current
     * conversation: it has a cost of its own, so it runs in the background, goes upwards as a separate
     * message and lives on the rarest round of them all (see ClaudePanel.scheduleTokenUpdates).
     */
    fun refreshTodayTokens() {
        if (!isLoggedIn()) return

        AppExecutorUtil.getAppExecutorService().submit {
            hub.broadcastProject(
                buildJsonObject {
                    put("type", "usage")
                    put("todayTokens", ClaudeTokenUsage.today(workingDirectory))
                }.toString(),
            )
        }
    }

    /**
     * The answer to get_usage. A freshly raised CLI manages to answer before it learns the subscription
     * windows from the server - then there are no limits in the answer at all, and the usage rings in
     * the panel are empty. Waiting for the shared round in that case serves nothing: we ask again in a
     * few seconds, and the rings appear right after the project opens rather than whenever luck has it.
     */
    private fun receiveUsage(usage: JsonObject, attempt: Int, preferred: String?) {
        val snapshot = sendUsage(usage)
        if (attempt >= RETRY_LIMIT) return

        // The answer is frozen: it came from a process that has not gone to the server since the
        // previous window (in a panel with open tabs such a one lives for days). Its share the panel has
        // already thrown away, and the real one can only be had from the server.
        //
        // Urgent, exactly as the retry below: the ping's threshold exists to avoid asking when nothing
        // can have changed, and a snapshot we already know to be frozen is the opposite of that. Without
        // this the retry is silently eaten by the threshold while its attempt is spent all the same, and
        // the rings go on showing yesterday's window until the next scheduled round.
        if (snapshot.isStale()) {
            refreshLimits(attempt + 1, preferred, urgent = true, viaPing = true)
            return
        }

        if (snapshot.hasLimits) return

        AppExecutorUtil.getAppScheduledExecutorService().schedule(
            // A retry is one of the cases where the figures are needed now: the ping's threshold is out
            // of place here, or the attempts would go into it rather than to the CLI.
            { refreshLimits(attempt + 1, preferred, urgent = true) },
            RETRY_SECONDS,
            TimeUnit.SECONDS,
        )
    }

    /**
     * The get_usage answer upwards - no matter whether it came from a live conversation or from a ping.
     * Returns the parsed answer itself: the decision whether to ask again is made by it (see
     * [receiveUsage]). The message upwards goes in any case - the context window's size is sometimes in
     * the answer even when the limit windows are not.
     */
    private fun sendUsage(usage: JsonObject): ClaudeUsage.Snapshot {
        val snapshot = ClaudeUsage.parse(usage)
        // What goes upwards is not the raw answer but one checked against what was seen before: on its
        // own a snapshot does not say whether it is about the present window (see ClaudeUsage.Tracker).
        val merged = windows.merge(snapshot)

        // A one-off ping answers about extra usage as fully as a live conversation does, while an answer
        // from a process that has not yet learned the account's settings carries no such block at all -
        // and silence is not "extra usage went away".
        snapshot.extra?.let { extraKnown = it }

        hub.broadcastProject(
            buildJsonObject {
                put("type", "usage")
                merged.session?.let { putWindow("session", it) }
                merged.week?.let { putWindow("week", it) }
                merged.contextWindow?.let { put("contextWindow", it) }
                putExtra()
            }.toString(),
        )

        // Outside we hand over the raw answer rather than the checked one: the decision whether to ask
        // again is made by it (see [receiveUsage]). The checked one would come out with both "there are
        // limits" and "the window is the present one" even when the CLI said nothing this time: the
        // memory holds windows from previous rounds.
        return snapshot
    }

    /**
     * Extra usage upwards: whether it is being spent right now and how much of its monthly budget has
     * gone. Always as a whole rather than field by field - the two halves come from different routes,
     * and half a picture on the wire would mean the ring goes back to a percentage the moment the other
     * half arrives.
     */
    private fun JsonObjectBuilder.putExtra() {
        val known = extraKnown
        val active = extraActive.get() == true
        if (known == null && !active) return

        putJsonObject("extra") {
            put("active", active)
            if (active && extraWindow.isNotEmpty()) put("window", extraWindow)
            known?.let { put("enabled", it.enabled) }
            known?.percent?.let { put("percent", it) }
        }
    }

    private fun JsonObjectBuilder.putWindow(name: String, window: ClaudeUsage.Window) {
        putJsonObject(name) {
            put("percent", window.percent)
            put("resets", window.resets)
        }
    }

    /**
     * The model catalogue - the same one `/model` shows in a terminal.
     *
     * The list cannot be kept on our side: which models are available is decided by the account, the
     * provider and the organization's policy, while names and captions change with CLI versions. We ask
     * a live conversation, and before the first message a one-off ping.
     *
     * Once per panel: the list does not change because we asked again, while the request costs starting
     * a process. A slip is not a reason to close the subject forever, though - see the latch below.
     */
    fun refreshModels(mainSession: String) {
        if (!isLoggedIn()) return
        if (!modelsRequested.compareAndSet(false, true)) return

        val onError = { error: String ->
            thisLogger().info("Model catalogue unavailable: $error")
            // Release the latch, and the next sign-in check will ask for the catalogue again. Otherwise
            // one unlucky ping (a cold CLI start that did not fit the timeout, a killed process) would
            // leave the panel with its hardcoded list of models until the project closes - along with
            // models this organization has long forbidden.
            modelsRequested.set(false)
        }

        if (sessions.isRunning(mainSession)) {
            sessions.requestModels(mainSession, onResult = ::sendModels, onFailure = onError)
        } else {
            ClaudeControlPing.request(
                workingDirectory,
                subtype = "list_models",
                onResult = ::sendModels,
                onError = onError,
            )
        }
    }

    private fun sendModels(payload: JsonObject) {
        val models = payload.items("models") ?: run {
            // An answer without a list is the same miss as an error: we have no catalogue, and asking
            // for it once more should be possible.
            modelsRequested.set(false)
            return
        }
        thisLogger().info("Model catalogue from CLI: ${models.size} entries")

        hub.broadcastProject(
            buildJsonObject {
                put("type", "models")
                putJsonArray("models") {
                    for (element in models) {
                        val model = element as? JsonObject ?: continue
                        val value = model["value"]?.jsonPrimitive?.contentOrNull ?: continue

                        addJsonObject {
                            put("value", value)
                            put("label", model["displayName"]?.jsonPrimitive?.contentOrNull.orEmpty())
                            put("description", model["description"]?.jsonPrimitive?.contentOrNull.orEmpty())
                            put("resolved", model["resolvedModel"]?.jsonPrimitive?.contentOrNull.orEmpty())
                            model["disabled"]?.jsonPrimitive?.booleanOrNull?.let { put("disabled", it) }
                        }
                    }
                }
            }.toString(),
        )
    }

    /**
     * How much of the context window is taken - as a figure from the CLI itself (the same one
     * `/context` prints) rather than counted from a turn's usage: the window's size depends on the
     * model - with "1M" models it is five times the usual - and arithmetic of our own on the panel's
     * side would show "the context is full" on an almost empty conversation.
     *
     * Only a live conversation is asked: a sleeping one's context is empty by definition, while a
     * one-off ping would answer about its own process.
     */
    fun refreshContext(sessionId: String) {
        sessions.requestContextUsage(
            sessionId,
            onResult = { usage -> sendContext(sessionId, usage) },
            onFailure = { error -> thisLogger().debug("Context usage unavailable: $error") },
        )
    }

    private fun sendContext(sessionId: String, usage: JsonObject) {
        val used = usage["totalTokens"]?.jsonPrimitive?.contentOrNull?.toIntOrNull() ?: return
        val max = usage["maxTokens"]?.jsonPrimitive?.contentOrNull?.toIntOrNull() ?: return
        if (max <= 0) return

        hub.broadcast(
            sessionId,
            buildJsonObject {
                put("type", "context")
                put("sessionId", sessionId)
                put("used", used)
                put("max", max)
            }.toString(),
        )
    }

    private companion object {
        /**
         * Retrying the limits when the CLI answered without them (see [receiveUsage]): a couple of
         * seconds is enough for it to learn the subscription windows from the server. There are few
         * attempts - beyond that the shared round picks it up anyway, and for a sleeping panel each one
         * costs a separate process.
         */
        const val RETRY_SECONDS = 3L
        const val RETRY_LIMIT = 3

        /**
         * The round for the usage windows themselves - more often than the shared one: while the agent
         * works the share grows before one's eyes, and asking a live conversation costs nothing.
         */
        const val LIMITS_PERIOD_SECONDS = 30L

        /**
         * For a sleeping panel, though, the same question costs starting a separate process for a few
         * seconds, and we do not ask more often than this: without conversations usage grows only from
         * work in a terminal or in a browser.
         */
        const val PING_MIN_SECONDS = 60L
    }
}

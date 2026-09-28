package io.github.crmapache.amazingclaudecode.claude

import com.intellij.openapi.Disposable
import com.intellij.openapi.diagnostic.thisLogger
import com.intellij.openapi.util.Disposer
import com.intellij.util.concurrency.AppExecutorUtil
import io.github.crmapache.amazingclaudecode.claude.accounts.ClaudeAccounts
import java.util.concurrent.ConcurrentHashMap
import java.util.concurrent.TimeUnit
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.addJsonObject
import kotlinx.serialization.json.booleanOrNull
import kotlinx.serialization.json.buildJsonObject
import kotlinx.serialization.json.contentOrNull
import kotlinx.serialization.json.jsonPrimitive
import kotlinx.serialization.json.put
import kotlinx.serialization.json.putJsonArray

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
 *
 * Nor does it own the subscription's figures, only the questions about them. What it learns belongs to
 * the account and goes to every open project (see AccountUsage) - kept here, it left every other project
 * with whatever it had learned itself, which for a project that kept losing the right to ask was nothing
 * for the better part of an hour.
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
     * What is known about each account's usage, for the whole IDE: every answer asked from here is folded
     * into it and goes to every open project, this one included.
     */
    private val book: AccountUsage get() = AccountUsage.getInstance()

    /** How often the server may be asked about an account, and whether its answer is about it at all. */
    private val probes: UsageProbes get() = UsageProbes.getInstance()

    /** Whose figures a question with nobody named is about: the account new conversations start on. */
    private fun currentAccount(): String = ClaudeAccounts.getInstance().currentId

    /** The model catalogue is asked for once per account - see [refreshModels]. */
    private val modelsRequested = ConcurrentHashMap<String, Boolean>()

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
     *
     * What the IDE already knows goes first: another project may have learned the figures a moment ago,
     * and they are as true for this panel as for that one - without them the rings stand empty for as
     * long as the pace makes this question wait.
     */
    fun refreshAll() {
        book.pictures().forEach(hub::broadcastProject)
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
     * the threshold is left for, instead of not asking at all. The threshold is the account's rather
     * than this project's: the answer goes to every open project (see AccountUsage), so a question any
     * of them put inside the last minute has already answered this round too. [urgent] lowers it to the
     * server's own pace: that is how the panel asks when it opens and when it retries, where the figures
     * are needed now rather than "next round".
     */
    fun refreshLimits(
        attempt: Int = 0,
        /** The conversation that has just been working: its share is the freshest of all. */
        preferred: String? = null,
        urgent: Boolean = false,
        /** Past the conversations, straight to the server: its answer is what cures a frozen one. */
        viaPing: Boolean = false,
        /**
         * Whose figures these are. Defaults to the account new conversations start on - which is what
         * the scheduled rounds and the panel's own request mean.
         */
        account: String = currentAccount(),
    ) {
        if (!isLoggedIn()) return

        // The answer is filed under the account it was asked for, not under whoever is current when it
        // comes back. An answer takes seconds, and in the meantime the current account can change or a
        // tab on another account can answer about its own subscription: filed by "current", one account's
        // shares would land on the other's rings and stay there until their window reset.
        //
        // `borrowable` says which of the two routes it came by, because only one of them can answer with
        // somebody else's figures: a live conversation runs in the CLI's own configuration, where the
        // usage cache belongs to whoever signed in last, while the ping below has a configuration of its
        // own (see UsageProbes.trust).
        val onUsage = { borrowable: Boolean ->
            { usage: JsonObject -> receiveUsage(usage, attempt, preferred, account, borrowable) }
        }
        // Who to ask. The one that has just finished a turn knows the freshest share - it got it in the
        // answer to its own request. A turn running right now is the same thing, the share growing
        // before its eyes. An idle conversation, though, answers with exactly what has already arrived:
        // we leave it alone and go to the server.
        val live = when {
            viaPing -> null
            preferred != null && sessions.isRunning(preferred) -> preferred
            else -> sessions.busySession()
        }?.takeIf { sessions.accountOf(it) == account }

        if (live != null) {
            // A question into a process already up costs nothing of ours, but it still goes to the
            // server, and the server counts those per account (see UsageProbes). Refused here means
            // simply skipping this round: whoever was granted the question is asking about this very
            // account, and its answer comes to this project's rings as well.
            if (probes.claim(account, UsageProbes.URGENT_GAP_MS) > 0) return

            sessions.requestUsage(
                live,
                onUsage(true),
                // The conversation may not answer at all (a control request has a timeout of its own):
                // then we go to the server for the figures anyway, or the rings would freeze until the
                // end of the day on whatever the panel learned last.
                onFailure = { error ->
                    thisLogger().info("Usage from live session unavailable: $error")
                    if (attempt < RETRY_LIMIT) {
                        refreshLimits(attempt + 1, preferred, viaPing = true, account = account)
                    }
                },
            )
            return
        }

        // The machine-wide pace, one register for the account across every open project. It is the one
        // that matters for the truth of the figures: asked too often, the usage endpoint starts refusing,
        // and a refused request is not an empty answer - the CLI quietly answers out of a cache, up to an
        // hour old, and says nothing about having done so.
        //
        // An urgent request is not dropped by it but postponed: the accounts screen asks for a figure
        // beside every row, and a row that stays empty because a neighbour asked first is the very
        // thing that screen exists to avoid. One postponed question per account covers everyone who
        // asks meanwhile - its answer reaches them all.
        val wait = probes.claim(account, if (urgent) UsageProbes.URGENT_GAP_MS else PING_GAP_MS)
        if (wait > 0) {
            if (!urgent) return
            if (!probes.hold(account)) return

            AppExecutorUtil.getAppScheduledExecutorService().schedule(
                {
                    probes.release(account)
                    refreshLimits(attempt, preferred, urgent = true, viaPing = true, account = account)
                },
                wait + WAIT_SLACK_MS,
                TimeUnit.MILLISECONDS,
            )
            return
        }

        // The ping runs in that account's own environment, which is what lets an account be asked about
        // without switching to it: the credential travels per process. It is also what puts real figures
        // beside every row of the accounts screen rather than a green tick that means only "a credential
        // is filed" (see ClaudeAccounts.health).
        ClaudeControlPing.request(
            workingDirectory,
            subtype = "get_usage",
            accountId = account,
            // With a config directory of its own, and this is the whole difference between a figure and
            // a rumour: sharing the CLI's own directory, a process that cannot reach the usage endpoint
            // answers out of a cache belonging to whoever fetched last - measured here, three drawers of
            // three different subscriptions reporting one weekly percentage. Isolated, there is nothing
            // to borrow: the answer is this account's or blank (see AccountStore.usageProbeEnvironment).
            isolated = true,
            onResult = onUsage(false),
            onError = { error -> thisLogger().info("Usage ping skipped: $error") },
        )
    }

    /**
     * The sign-in has moved to another account: everything counted about it was about the previous one.
     *
     * [identity] is who the sign-in is now, when this is a switch being noticed: every open project
     * notices it for itself, and the figures, which are the whole IDE's, go only once (see
     * AccountUsage.forget).
     */
    fun forget(account: String = currentAccount(), identity: String? = null) {
        // The catalogue belongs to the account as well - a plan without Opus does not offer it. Only the
        // latch is released here: the sign-in check asks for the list itself once the new account is
        // confirmed (see ClaudeSessionHub, onSignedIn). This project's own latch, so released by every
        // project that notices, whether or not the figures below are already gone.
        modelsRequested.remove(account)

        if (!book.forget(account, identity)) return

        // Including the window this account was last recognised by: kept, it would make the NEXT
        // account's honest answer look like a borrowed one (see UsageProbes.trust).
        probes.forget(account)

        // Past the conversations, straight to the server: a process already up may be the previous
        // account's, and the rings would be filled from it again.
        refreshLimits(urgent = true, viaPing = true, account = account)
    }

    /**
     * A line from a conversation's stream, in case it is a limit event: extra usage starts and ends
     * without any question from us, and the rings must not wait for the next round of polling to learn
     * of it (the whole point of the paint is that the limit has been passed right now).
     *
     * Returns whether the spending has just started - the one moment a phone is called about (see
     * AccountUsage.noteRateLimit, where the state it is a change of lives).
     */
    fun noteRateLimit(sessionId: String, line: String): Boolean {
        val verdict = ClaudeRateLimit.of(line) ?: return false

        // Attributed to the account whose process said it. Without this a limit event from a tab on one
        // account repaints the other account's rings - and with two accounts running side by side that is
        // not an edge case, it is every time one of them runs out.
        return book.noteRateLimit(sessions.accountOf(sessionId), verdict)
    }

    /**
     * Today's tokens - a scan of EVERY project's transcripts rather than a question to the current
     * conversation: it has a cost of its own, so it runs in the background, goes upwards as a separate
     * message and lives on the rarest round of them all (see ClaudePanel.scheduleTokenUpdates).
     */
    fun refreshTodayTokens() {
        if (!isLoggedIn()) return

        AppExecutorUtil.getAppExecutorService().submit {
            // No account on this one, deliberately, and the omission is the message: today's tokens are
            // counted by reading the transcripts on disk, and that is ONE folder with no account marker
            // in any line of it. The only way to split it would be CLAUDE_CONFIG_DIR, which this feature
            // refuses for good reason (see AccountStore) - so the figure is the machine's, across every
            // account, and the panel keeps it in a shared slot rather than against any set of rings.
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
    private fun receiveUsage(
        usage: JsonObject,
        attempt: Int,
        preferred: String?,
        account: String,
        borrowable: Boolean,
    ) {
        val snapshot = ClaudeUsage.parse(usage)

        // Whose figures these are, before they are anybody's. A process that could not reach the usage
        // endpoint answers out of a cache the whole machine shares, without a word about having done so,
        // and the only thing that gives it away is that another account has just answered with the same
        // window (see UsageProbes.trust). Such an answer is not shown at all: an empty row is a row a
        // person can act on, a row filled with somebody else's percentages is not.
        if (!probes.trust(account, snapshot, borrowable)) {
            thisLogger().info("Usage answer for an account repeated another account's window; asking again")
            retryLater(attempt, preferred, account)
            return
        }

        sendUsage(snapshot, account)
        if (attempt >= RETRY_LIMIT) return

        // The answer is frozen: it came from a process that has not gone to the server since the
        // previous window (in a panel with open tabs such a one lives for days). Its share the panel has
        // already thrown away, and the real one can only be had from the server.
        //
        // Urgent and past the conversations, exactly as [retryLater]: this project's threshold exists to
        // avoid asking when nothing can have changed, and a snapshot we already know to be frozen is the
        // opposite of that. Without this the retry is silently eaten by the threshold while its attempt
        // is spent all the same, and the rings go on showing yesterday's window until the next round.
        if (snapshot.isStale()) {
            refreshLimits(attempt + 1, preferred, urgent = true, viaPing = true, account = account)
            return
        }

        if (snapshot.hasLimits) return

        retryLater(attempt, preferred, account)
    }

    /**
     * Ask again, later rather than at once.
     *
     * Later grows with the attempt, and that is the whole lesson of this file: three retries three
     * seconds apart are four questions inside ten seconds, which is precisely what makes the endpoint
     * refuse and the CLI answer out of the shared cache. The pace itself is enforced elsewhere (see
     * UsageProbes) - this only stops us queueing against it on purpose.
     *
     * Urgent, because this project's own "not more than once a minute" threshold exists to avoid asking
     * when nothing can have changed, and a retry is the opposite of that.
     */
    private fun retryLater(attempt: Int, preferred: String?, account: String) {
        if (attempt >= RETRY_LIMIT) return

        AppExecutorUtil.getAppScheduledExecutorService().schedule(
            { refreshLimits(attempt + 1, preferred, urgent = true, viaPing = true, account = account) },
            RETRY_SECONDS * (attempt + 1),
            TimeUnit.SECONDS,
        )
    }

    /**
     * The get_usage answer upwards - no matter whether it came from a live conversation or from a ping,
     * and to every open project rather than this one (see AccountUsage). It goes in any case, limits or
     * not: the context window's size is sometimes in the answer even when the limit windows are not.
     */
    private fun sendUsage(snapshot: ClaudeUsage.Snapshot, account: String) = book.fold(account, snapshot)

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
    fun refreshModels(mainSession: String, account: String = currentAccount()) {
        if (!isLoggedIn()) return
        // Once per ACCOUNT, not once per panel: which models exist is decided by the plan, so an account
        // that has never been asked has to be, however many times another one has.
        if (modelsRequested.putIfAbsent(account, true) != null) return

        val onError = { error: String ->
            thisLogger().info("Model catalogue unavailable: $error")
            // Release the latch, and the next sign-in check will ask for the catalogue again. Otherwise
            // one unlucky ping (a cold CLI start that did not fit the timeout, a killed process) would
            // leave the panel with its hardcoded list of models until the project closes - along with
            // models this organization has long forbidden.
            modelsRequested.remove(account)
            Unit
        }

        val onResult = { payload: JsonObject -> sendModels(payload, account) }

        if (sessions.isRunning(mainSession) && sessions.accountOf(mainSession) == account) {
            sessions.requestModels(mainSession, onResult = onResult, onFailure = onError)
        } else {
            ClaudeControlPing.request(
                workingDirectory,
                subtype = "list_models",
                accountId = account,
                onResult = onResult,
                onError = onError,
            )
        }
    }

    private fun sendModels(payload: JsonObject, account: String) {
        val models = payload.items("models") ?: run {
            // An answer without a list is the same miss as an error: we have no catalogue, and asking
            // for it once more should be possible.
            modelsRequested.remove(account)
            return
        }
        thisLogger().info("Model catalogue from CLI: ${models.size} entries")

        // Remembered against the account, because it is what makes moving a conversation safe: a model
        // may only be carried onto an account whose own catalogue names it (see ClaudeAccounts.canRun).
        // Without `disabled` this list is worse than no list at all. The CLI names models the account may
        // NOT choose and marks them so - the menu greys them out (see modelOptions) - and taken into the
        // catalogue whole they made canRun answer "yes, it can run that" about exactly the models the
        // clamp exists for. The broadcast below still sends them: the menu wants to show them greyed.
        ClaudeAccounts.getInstance().noteModels(
            account,
            models.flatMap { element ->
                val model = element as? JsonObject ?: return@flatMap emptyList()
                if (model["disabled"]?.jsonPrimitive?.booleanOrNull == true) return@flatMap emptyList()

                // Both names, because both are asked about: the value is what a person picks and the CLI
                // is launched with, the resolved identifier is what a transcript signs its answers with.
                listOfNotNull(
                    model["value"]?.jsonPrimitive?.contentOrNull,
                    model["resolvedModel"]?.jsonPrimitive?.contentOrNull,
                )
            }.filter { it.isNotEmpty() }.toSet(),
        )

        hub.broadcastProject(
            buildJsonObject {
                put("type", "models")
                // Whose catalogue it is. A Pro account's tab offered the Max account's list would let a
                // person pick a model the CLI refuses before the first turn.
                put("account", account)
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
         * Retrying the limits when the CLI answered without them, or with somebody else's (see
         * [retryLater]). The step grows with the attempt: a few seconds is enough for a fresh process to
         * learn the windows from the server, while a borrowed answer means the server is refusing us and
         * the cure for that is time, not another question. There are few attempts either way - beyond
         * them the shared round picks it up, and for a sleeping panel each one costs a separate process.
         */
        const val RETRY_SECONDS = 5L
        const val RETRY_LIMIT = 3

        /**
         * A moment on top of the machine-wide wait before a postponed ping goes. Waiting exactly as long
         * as we were told leaves the two clocks racing, and losing that race costs a whole round.
         */
        const val WAIT_SLACK_MS = 500L

        /**
         * The round for the usage windows themselves - more often than the shared one: while the agent
         * works the share grows before one's eyes, and asking a live conversation costs nothing.
         */
        const val LIMITS_PERIOD_SECONDS = 30L

        /**
         * For a sleeping panel, though, the same question costs starting a separate process for a few
         * seconds, and the account is not asked more often than this: without conversations usage grows
         * only from work in a terminal or in a browser. Counted per account across the IDE, not per
         * project - three open projects asking once a minute each were three questions a minute about one
         * subscription, whose answers now reach all three anyway.
         */
        const val PING_GAP_MS = 60_000L
    }
}

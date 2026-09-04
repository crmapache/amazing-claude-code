package io.github.crmapache.amazingclaudecode.claude

import com.intellij.openapi.Disposable
import com.intellij.openapi.diagnostic.thisLogger
import com.intellij.openapi.util.Disposer
import com.intellij.util.concurrency.AppExecutorUtil
import io.github.crmapache.amazingclaudecode.claude.accounts.ClaudeAccounts
import java.util.concurrent.ConcurrentHashMap
import java.util.concurrent.TimeUnit
import java.util.concurrent.atomic.AtomicBoolean
import java.util.concurrent.atomic.AtomicLong
import java.util.concurrent.atomic.AtomicReference
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
     * Everything counted here, kept per Claude account.
     *
     * Per account rather than one set of figures, because two accounts genuinely run at once now: a
     * conversation carries its account for its whole life (see ClaudeSession), so a tab on one account
     * and a tab on another are both live, both answering about their own subscription, and both feeding
     * this. Held as one picture they would interleave - one account's five-hour window beside the
     * other's weekly one, which is exactly the corruption [forget] was written to undo, except that no
     * switch would be needed to produce it.
     *
     * Keyed by the account id, with the empty string for the CLI's ordinary sign-in.
     */
    private class PerAccount {
        /**
         * The memory of the usage windows: snapshots arrive by two routes with different lags, and
         * folding them into one truthful picture is that memory's work (see [ClaudeUsage.Tracker]), not
         * the panel's.
         */
        val windows = ClaudeUsage.Tracker()

        /**
         * Extra usage - the work that goes on past an exhausted limit, paid for on top of the plan.
         *
         * It is put together out of two different routes, because neither one alone knows the whole of
         * it: the stream's limit events say whether it is being spent right now (see [noteRateLimit]),
         * the answer to `get_usage` how much of the month's budget for it has already gone. Kept here
         * rather than sent onwards as it comes, so that a message about one of the two does not wipe the
         * other.
         *
         * Null until the first limit event arrives - "we do not know yet" rather than "no". The
         * difference matters exactly once per launch, and it is the whole of a bug: the CLI repeats the
         * event on every turn while the state holds, so the first one after a restart says "money is
         * being spent" about a state that began hours ago. Read as a change from "no", that fires a
         * notification to every paired phone - and once per open project, so three projects and one
         * restart meant three buzzes about one morning's spending.
         */
        val extraActive = AtomicReference<Boolean?>(null)

        /**
         * Which window the extra usage is spent past, in the CLI's words. The panel decides by it which
         * of its rings burns: a used-up five-hour window and a used-up weekly one arrive as the same
         * event and are two different rings on the screen.
         */
        @Volatile
        var extraWindow = ""

        @Volatile
        var extraKnown: ClaudeUsage.Extra? = null

        /**
         * When a ping for the usage was last raised BY THIS PROJECT. The polling goes every half-minute,
         * but for a sleeping panel every round costs a separate process for a few seconds, while usage
         * barely moves without conversations - so we ping less often (see [refreshLimits]).
         *
         * How often the SERVER may be asked is a different question with a different owner: it counts
         * per account, across every open project, and lives in [UsageProbes].
         */
        val lastPing = AtomicLong(0)

        /**
         * Whether a ping is already waiting out the machine-wide pace before it goes.
         *
         * Without it every urgent request that arrives during that wait would queue one of its own: the
         * accounts screen alone asks for every row at once, and reopening it a second later would double
         * the queue rather than reuse the answer already on its way.
         */
        val waiting = AtomicBoolean(false)
    }

    private val perAccount = ConcurrentHashMap<String, PerAccount>()

    /** How often the server may be asked about an account, and whether its answer is about it at all. */
    private val probes: UsageProbes get() = UsageProbes.getInstance()

    private fun of(account: String): PerAccount = perAccount.getOrPut(account) { PerAccount() }

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
            // simply skipping this round: the next one is half a minute away and nothing on screen is
            // waiting for this one.
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

        val held = of(account)
        val now = System.currentTimeMillis()
        val since = now - held.lastPing.get()
        if (!urgent && since < TimeUnit.SECONDS.toMillis(PING_MIN_SECONDS)) return

        // And the machine-wide pace on top of this project's own. It is the one that matters for the
        // truth of the figures: asked too often, the usage endpoint starts refusing, and a refused
        // request is not an empty answer - the CLI quietly answers out of a cache shared by every
        // account, so the refusal arrives as another account's percentages under this account's name.
        //
        // An urgent request is not dropped by it but postponed: the accounts screen asks for a figure
        // beside every row, and a row that stays empty because a neighbour asked first is the very
        // thing that screen exists to avoid.
        val wait = probes.claim(account, UsageProbes.URGENT_GAP_MS)
        if (wait > 0) {
            if (!urgent) return
            if (!held.waiting.compareAndSet(false, true)) return

            AppExecutorUtil.getAppScheduledExecutorService().schedule(
                {
                    held.waiting.set(false)
                    refreshLimits(attempt, preferred, urgent = true, viaPing = true, account = account)
                },
                wait + WAIT_SLACK_MS,
                TimeUnit.MILLISECONDS,
            )
            return
        }

        held.lastPing.set(now)

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
     * The sign-in has moved to another account: everything counted here was about the previous one.
     *
     * Thrown away rather than left to be overwritten by the next answer, because it would not be. A
     * weekly window the new account has not opened yet arrives with no reset time at all, and the memory
     * of the windows - rightly, for its usual job - keeps the known share in that case (see
     * [ClaudeUsage.Tracker]). That is exactly how the panel came to show a five-hour window of one
     * account beside a weekly window of another.
     */
    fun forget(account: String = currentAccount()) {
        val held = of(account)

        held.windows.forget()
        // Including the window this account was last recognised by: kept, it would make the NEXT
        // account's honest answer look like a borrowed one (see UsageProbes.trust).
        probes.forget(account)
        held.extraKnown = null
        held.extraActive.set(null)
        held.extraWindow = ""
        // The threshold on the ping means "nothing can have changed since we last asked", and an account
        // switch is the opposite of that.
        held.lastPing.set(0)
        // The catalogue belongs to the account as well - a plan without Opus does not offer it. Only the
        // latch is released here: the sign-in check asks for the list itself once the new account is
        // confirmed (see ClaudeSessionHub, onSignedIn).
        modelsRequested.remove(account)

        // The interface is told to forget too, and told separately: its own state is merged field by
        // field (see mergeUsage in feed/usage.ts), so silence about a window means "nothing new", not
        // "that window is nobody's now". Named, so it clears that account's rings and not whichever
        // account's the panel happens to be drawing.
        hub.broadcastProject(
            buildJsonObject {
                put("type", "usage")
                put("account", account)
                put("reset", true)
            }.toString(),
        )

        // Past the conversations, straight to the server: a process already up may be the previous
        // account's, and the rings would be filled from it again.
        refreshLimits(urgent = true, viaPing = true, account = account)
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
    fun noteRateLimit(sessionId: String, line: String): Boolean {
        val verdict = ClaudeRateLimit.of(line) ?: return false

        // Attributed to the account whose process said it. Without this a limit event from a tab on one
        // account repaints the other account's rings - and with two accounts running side by side that is
        // not an edge case, it is every time one of them runs out.
        val account = sessions.accountOf(sessionId)
        val held = of(account)

        val active = verdict.extraUsage
        val window = if (active) verdict.window else ""
        val wasActive = held.extraActive.getAndSet(active)
        val changed = wasActive != active || held.extraWindow != window

        held.extraWindow = window
        if (!changed) return false

        hub.broadcastProject(
            buildJsonObject {
                put("type", "usage")
                put("account", account)
                putExtra(held)
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
            ExtraUsageAnnouncements.getInstance().claim(account, verdict.window, verdict.resetsAt)
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
     * The get_usage answer upwards - no matter whether it came from a live conversation or from a ping.
     * It goes in any case, limits or not: the context window's size is sometimes in the answer even when
     * the limit windows are not.
     */
    private fun sendUsage(snapshot: ClaudeUsage.Snapshot, account: String) {
        val held = of(account)
        // What goes upwards is not the raw answer but one checked against what was seen before: on its
        // own a snapshot does not say whether it is about the present window (see ClaudeUsage.Tracker).
        val merged = held.windows.merge(snapshot)

        // A one-off ping answers about extra usage as fully as a live conversation does, while an answer
        // from a process that has not yet learned the account's settings carries no such block at all -
        // and silence is not "extra usage went away".
        snapshot.extra?.let { held.extraKnown = it }

        hub.broadcastProject(
            buildJsonObject {
                put("type", "usage")
                // Whose figures these are. The panel keeps a set of rings per account and draws the ones
                // belonging to the tab on screen: without this field it merges every answer into one
                // picture, and two accounts running at once produce one account's five-hour window beside
                // the other's weekly one.
                put("account", account)
                merged.session?.let { putWindow("session", it) }
                merged.week?.let { putWindow("week", it) }
                merged.contextWindow?.let { put("contextWindow", it) }
                putExtra(held)
            }.toString(),
        )
    }

    /**
     * Extra usage upwards: whether it is being spent right now and how much of its monthly budget has
     * gone. Always as a whole rather than field by field - the two halves come from different routes,
     * and half a picture on the wire would mean the ring goes back to a percentage the moment the other
     * half arrives.
     */
    private fun JsonObjectBuilder.putExtra(held: PerAccount) {
        val known = held.extraKnown
        val active = held.extraActive.get() == true
        if (known == null && !active) return

        putJsonObject("extra") {
            put("active", active)
            if (active && held.extraWindow.isNotEmpty()) put("window", held.extraWindow)
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
         * seconds, and we do not ask more often than this: without conversations usage grows only from
         * work in a terminal or in a browser.
         */
        const val PING_MIN_SECONDS = 60L
    }
}

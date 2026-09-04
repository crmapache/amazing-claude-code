package io.github.crmapache.amazingclaudecode.claude

import com.intellij.openapi.Disposable
import com.intellij.openapi.util.Disposer
import com.intellij.util.concurrency.AppExecutorUtil
import io.github.crmapache.amazingclaudecode.claude.accounts.ClaudeAccounts
import io.github.crmapache.amazingclaudecode.feedback.DiagnosticsLog
import java.util.concurrent.ConcurrentHashMap
import java.util.concurrent.ScheduledFuture
import java.util.concurrent.TimeUnit
import kotlinx.serialization.json.JsonObject

/**
 * One panel's set of conversations.
 *
 * There are several of them for two reasons: session tabs and side branches. Each branch has a process
 * of its own, so its context physically cannot leak into the main conversation - which is exactly what
 * the panel promises the user.
 */
internal class ClaudeSessions(
    private val workingDirectory: String?,
    private val parentDisposable: Disposable,
    private val onEvent: (sessionId: String, line: String) -> Unit,
    private val onError: (sessionId: String, message: String) -> Unit,
    /** The process said something past the event stream - see ClaudeSession.onDiagnostic. */
    private val onDiagnostic: (sessionId: String, message: String) -> Unit = { _, _ -> },
    private val onFinished: (sessionId: String) -> Unit,
    /** A conversation's process died on its own - the panel has something to close and explain. */
    private val onCrashed: (sessionId: String, exitCode: Int) -> Unit = { _, _ -> },
    /** The agent asks the panel for permission: until someone answers, the turn stands still. */
    private val onToolPermission: (sessionId: String, request: PermissionChannel.ToolPermission) -> Unit = { _, _ -> },
    /** The agent took its question back - see ClaudeSession.onPermissionWithdrawn. */
    private val onPermissionWithdrawn: (sessionId: String, requestId: String) -> Unit = { _, _ -> },
    /** An LLM picked the conversation's name by its first message - see ClaudeSession.onTitle. */
    private val onTitle: (sessionId: String, title: String) -> Unit = { _, _ -> },
    /** Whether this conversation still needs a name of its own - see ClaudeSession.titleWanted. */
    private val titleWanted: (sessionId: String) -> Boolean = { true },
    /** The turn ended - the panel should clear its work; see ClaudeSession.onTurnEnded. */
    private val onTurnEnded: (sessionId: String) -> Unit = {},
    /** The turn started on its own, without a send from the panel; see ClaudeSession.onTurnStarted. */
    private val onTurnStarted: (sessionId: String) -> Unit = {},
    /**
     * A conversation has just been born, and this is the effort it was born with.
     *
     * Said out loud because nobody else can say it later: the CLI never announces the effort and cannot
     * be asked about it (see ClaudeSession.setEffort), so a tab whose effort nobody has touched would
     * otherwise be drawn by whatever the setting holds NOW - that is, by a choice made in a neighbouring
     * tab after this conversation had already started on something else.
     */
    private val onBorn: (sessionId: String, effort: String, model: String, accountId: String) -> Unit =
        { _, _, _, _ -> },
    /**
     * A conversation is being stopped so that it can move to another account.
     *
     * Said out loud because the clients cannot tell: an interrupt the IDE issues looks to them exactly
     * like a turn that finished by itself, so the feed captioned it "Worked 3s", the finished sound
     * played and a push went to the phone about work nobody completed (see ClaudeSessionHub).
     */
    private val onMoveStopping: (sessionId: String) -> Unit = {},
    /**
     * The interrupt was not answered in time and the process is about to be taken down anyway.
     *
     * Everything it was holding dies with it: a permission card, a plan, a question with options. They
     * are pinned above the input field and nothing else would ever take them off it.
     */
    private val onMoveForced: (sessionId: String) -> Unit = {},
    /**
     * The conversation has been replaced and stands ready on the account now chosen.
     *
     * The tab is idle from this moment, and on the forced path there is nobody else to say it: a message
     * queued while the old turn ran is waiting for exactly that word, and the only other thing that would
     * have said it - the old process dying - is deliberately ignored while the swap is in progress (see
     * [isMoving]). Every other way into a move has a caller that speaks a line later, so this is NOT
     * fired there: said twice, the queue drains twice.
     */
    private val onMoved: (sessionId: String) -> Unit = {},
) : Disposable {

    private val sessions = ConcurrentHashMap<String, ClaudeSession>()

    /**
     * What a conversation is to start on when it was not the settings that decided - see SessionLaunch.
     *
     * Written down when the tab is opened and read when its process is first raised, because those are
     * two different moments: an empty tab starts nothing, and the choice made in the request has to
     * survive until somebody writes into it.
     */
    private val launches = ConcurrentHashMap<String, SessionLaunch>()

    init {
        Disposer.register(parentDisposable, this)
    }

    fun prompt(sessionId: String, text: String, images: List<ImageAttachment> = emptyList()) {
        // Before anything is said into it: a move this tab was asked to make and has not made yet
        // happens now, so the words below are billed to the account the person chose (see
        // [applyPendingAccount]).
        applyPendingAccount(sessionId)
        session(sessionId).sendPrompt(text, images)
    }

    /**
     * A branch off another conversation: the branch gets its whole transcript and an identifier of its
     * own. Continuing in the branch leaves the parent untouched, and if the parent has never answered
     * yet, there is nothing to branch off - we start an ordinary conversation.
     *
     * It starts on what the PARENT runs on - its model, its effort, its permission mode - rather than on
     * what the settings hold. The two disagree more often than it seems: every selector writes the
     * machine's default as well as changing its own tab, so a model picked in a neighbouring tab decided
     * what a fork made here started on. Carrying on the same conversation on another model and at another
     * effort is not what "fork" says on the button.
     *
     * The mode travels along for the same reason and with the same limit as the rest: it applies to this
     * conversation and writes nothing into the settings (see SessionLaunch), so an approved plan frees
     * the fork of the conversation it continues without deciding anything about the next tab opened from
     * "+".
     */
    fun branchFrom(parentId: String, branchId: String) {
        if (sessions.containsKey(branchId)) return

        val parent = sessions[parentId]
        // Field by field rather than one or the other: a request that names a model is still a fork, and
        // the effort and the mode it said nothing about are still the parent's. Written whole, the
        // request's silence would have meant "the settings decide", which is the one answer neither side
        // asked for. An empty field of the parent's means the same thing and is right there: that is what
        // a tab nobody has touched is itself running on.
        val chosen = launches[branchId] ?: SessionLaunch()
        launches[branchId] = SessionLaunch(
            model = chosen.model.ifEmpty { parent?.model.orEmpty() },
            effort = chosen.effort.ifEmpty { parent?.effort.orEmpty() },
            mode = chosen.mode.ifEmpty { parent?.permissionMode.orEmpty() },
        )
        // The account does NOT travel with it, unlike the three above. A fork starts on the account
        // everything else on this machine is on: that is the whole of the rule now, and a fork of a tab
        // launched last week was the last thing still quietly beating it.

        sessions[branchId] = newSession(branchId, forkFrom = parent?.conversationId).also {
            Disposer.register(this, it)
        }
    }

    /**
     * Continuing a past conversation: it comes up with its own transcript.
     *
     * A past conversation opens in the tab it was chosen from (see App.resume), and that tab may
     * already hold a process of its own - with a transcript this tab no longer needs to continue.
     * Continuing the chosen conversation inside it is impossible: a conversation is given to a process
     * at launch. So the previous one is closed and a new one raised, exactly as when a tab is closed.
     */
    fun resume(sessionId: String, conversationId: String) {
        // Taken across the close on purpose. `close` drops an unspent choice, which is right when a tab
        // is abandoned and wrong here: this tab is being repurposed, and a choice made FOR this resume -
        // a model, an effort, a mode - would otherwise be wiped a line before it is read.
        val chosen = launches[sessionId]

        close(sessionId)
        chosen?.let { launches[sessionId] = it }

        sessions[sessionId] = newSession(sessionId, forkFrom = null, resumeFrom = conversationId).also {
            Disposer.register(this, it)
        }
    }

    /**
     * Every conversation in this project onto another account - the whole point of choosing one.
     *
     * A conversation cannot be told to change account: the CLI reads its credentials once, when the
     * process comes up. So each one is replaced the way a resume replaces it - a new process over the
     * same transcript - and everything else about it is carried across by hand, or the new process would
     * fall back to the machine's defaults and quietly change the model out from under the person.
     *
     * A tab whose turn is running is INTERRUPTED for it, the way Stop interrupts it, and moves on the
     * result that follows (see [pendingAccounts] and ClaudeSessionHub, onTurnEnded). A turn runs for
     * minutes, and a conversation billed all that time to the account the person has just left is not
     * what pressing Select says. Nothing written is lost by it: the CLI closes the interrupted call and
     * puts a "[Request interrupted by user]" line into the transcript, so the process raised on the new
     * account resumes onto everything that was said.
     *
     * A tab with no process at all is left alone: it has nothing to move, and whenever it does start it
     * reads the register itself - which by then says exactly this.
     */
    fun switchAllTo() {
        sessions.keys.toList().forEach(::moveTo)
    }

    /**
     * Every LIVE conversation of this account, raised again over its own transcript.
     *
     * Signing in a second time as an account already on the list does not double it: the new credential
     * drawer becomes the live one and the old one is deleted (see ClaudeAccounts.completeSignIn). A
     * process reads its credential once, at start, so the processes from before that go on pointing at a
     * drawer that no longer exists. They work for exactly as long as the token they are already holding
     * does, and then fail at a moment nobody connects with a sign-in that happened an hour ago.
     *
     * Only the live ones. A tab with no process has nothing pointing anywhere: it reads the register when
     * it starts, which by then names the new drawer - and raising it here would cost a birth announcement
     * to every client for a conversation that has not changed in any way.
     *
     * A turn in flight is NOT interrupted for this, and that is the difference from a move between
     * accounts: the money is going to the same subscription either way, so the honest thing is to let the
     * turn finish on the token it already holds and raise the process afterwards (see [moveTo] and
     * [applyPendingAccount]).
     */
    fun relaunchOn(accountId: String) {
        sessions.filterValues { it.accountId == accountId && it.isRunning }
            .keys.toList()
            .forEach { moveTo(it, renew = true) }
    }

    /**
     * The account a conversation is to move onto once the turn it is in has been stopped.
     *
     * Kept beside the sessions rather than inside them: a session that is mid-turn is precisely the one
     * that will be replaced, and a note held by the thing being thrown away is a note that is lost.
     */
    private val pendingAccounts = ConcurrentHashMap<String, String>()

    /**
     * The tabs whose process has to be raised again on the account it is ALREADY on - see [relaunchOn].
     *
     * Apart from [pendingAccounts] because it is not a move and must not be read as one: nothing about
     * the subscription is changing, so there is no turn to interrupt and no deadline to arm. It only has
     * to happen before the conversation says anything else.
     */
    private val pendingRenewals = ConcurrentHashMap.newKeySet<String>()

    /**
     * The deadline under a move that is waiting for a turn to stop.
     *
     * Keyed to the tab and checked against the account it was armed for: two switches in a row, or a
     * switch racing a turn that ends by itself, would otherwise leave a timer that force-kills a live
     * turn for a move nobody is making any more.
     */
    private val forcedMoves = ConcurrentHashMap<String, ScheduledFuture<*>>()

    /**
     * The tabs whose conversation is being replaced this instant.
     *
     * A move takes the old process down and puts a new one up, and the gap between those two is a real
     * moment on a real thread. Taking the process down ends its turn, which tells the panel the tab is
     * free, which sends whatever was queued into it - and there is nothing there to send it into: the
     * old conversation is gone from the register and the new one is not in yet, so the queue would raise
     * a bare third session of its own, on no transcript, and the message would go into that.
     */
    private val moving = ConcurrentHashMap.newKeySet<String>()

    /** Whether this tab is between its two processes right now - see [moving]. */
    fun isMoving(sessionId: String): Boolean = sessionId in moving

    /**
     * A conversation that was asked to move while it worked moves now.
     *
     * Called at the end of a turn (see ClaudeSessionHub, RESULT_MARKER) and again wherever a
     * conversation is about to live: a prompt, a wake, a restart. The end of a turn alone was not
     * enough, because a turn does not always end with one - a crashed process, a killed one, the
     * restart that reconnects an MCP server all leave the last word unsaid, and the note then waited
     * for a `result` that was never coming while the tab went on working, and being billed, on the
     * account the person had just left.
     */
    fun applyPendingAccount(sessionId: String) {
        forcedMoves.remove(sessionId)?.cancel(false)
        // A renewal left waiting by a turn that was running (see [relaunchOn]). Both can be outstanding
        // at once - a drawer replaced while a move was already waiting for the same turn - and one move
        // settles both: what it does is raise the process on whatever the register says now.
        val renew = pendingRenewals.remove(sessionId)
        if (pendingAccounts.remove(sessionId) == null && !renew) return

        moveTo(sessionId, renew = renew)
    }

    /**
     * One conversation onto the account chosen now.
     *
     * The account is read here rather than handed in, and that is deliberate: [newSession] reads it too,
     * a moment later, from the same place. Passed as an argument it would be a second opinion, and the
     * window between the two is exactly where a sibling IDE's switch lands (see ClaudeAccounts).
     */
    private fun moveTo(
        sessionId: String,
        force: Boolean = false,
        /**
         * Raise the process again even though the account is not changing - its credential drawer has
         * been replaced under it (see [relaunchOn]).
         */
        renew: Boolean = false,
    ) {
        val session = sessions[sessionId] ?: return
        val accountId = ClaudeAccounts.getInstance().currentId

        if (session.accountId == accountId && !renew) {
            // Already where it should be, so any move still outstanding for it is void - and the deadline
            // under that move has to go with it. Left armed, it fired eight seconds later against a turn
            // that is still running: the cards it was holding were taken off the screen while the CLI
            // went on waiting for an answer nothing could supply, and every client was told the turn had
            // been stopped for a change that never happened. The way in is ordinary: press Select on
            // another account, change your mind inside the eight seconds, press Select on this one.
            forcedMoves.remove(sessionId)?.cancel(false)
            pendingAccounts.remove(sessionId)
            return
        }

        if (session.isBusy && !force) {
            // A renewal waits for the turn instead of taking it away, and the test is the account rather
            // than the flag: nothing is being billed anywhere it should not be - it is the same
            // subscription on both sides of this - so a turn stopped mid-sentence would cost the person
            // an answer to buy nothing at all. It runs on the token the process is already holding, and
            // the new drawer is waiting for the process after it (see [relaunchOn]).
            if (session.accountId == accountId) {
                pendingRenewals.add(sessionId)
                return
            }

            // Asked to stop rather than waited out. A turn can run for minutes, and a conversation going
            // on being billed to the account the person has just left for that long is not what pressing
            // Select says - so the turn is interrupted exactly as the Stop button interrupts it, and the
            // move lands on the result that follows (see ClaudeSessionHub, onTurnEnded).
            //
            // The partial answer is not lost by it: the CLI closes the interrupted call and writes a
            // "[Request interrupted by user]" line into the transcript, so the process raised on the new
            // account resumes onto everything that was said.
            if (pendingAccounts.put(sessionId, accountId) == accountId) return

            onMoveStopping(sessionId)
            session.interrupt()
            armForcedMove(sessionId, accountId)
            return
        }

        forcedMoves.remove(sessionId)?.cancel(false)

        // Continued only if there is something to continue. The CLI mints an identifier the moment a
        // process comes up, before a single word has been said, and asking it to resume that identifier
        // fails outright - "No conversation found with session ID", exit code 1, on the person's first
        // message after choosing an account. The transcript on disk is what tells the two apart: a tab
        // that has said nothing has no file, and moves as the empty tab it is.
        val conversationId = session.conversationId
            ?.takeIf { ClaudeHistory.transcriptFile(workingDirectory, it) != null }

        // A fork nobody has spoken in yet has no transcript of its own, and everything it is about
        // belongs to its parent: raised as an ordinary tab it would come up empty, which is the same
        // loss as a fork starting on the machine's defaults.
        val forkFrom = if (conversationId == null) session.forkFrom else null

        val carried = SessionLaunch(
            // Clamped to what the account it is moving ONTO can actually run - see [modelFor]. Carried
            // whole, a tab left an account whose plan had the model and arrived at one whose plan does
            // not, looking perfectly well and dying on the next message.
            model = modelFor(accountId, session.model),
            effort = session.effort,
            mode = session.permissionMode.orEmpty(),
        )

        moving.add(sessionId)
        try {
            close(sessionId)
            launches[sessionId] = carried

            sessions[sessionId] = newSession(sessionId, forkFrom = forkFrom, resumeFrom = conversationId).also {
                Disposer.register(this, it)
            }
        } finally {
            moving.remove(sessionId)
        }
    }

    /**
     * What to do when the interrupt is never answered: take the process down and move anyway.
     *
     * A wall-clock deadline rather than the control request's own timeout, which measures something
     * else - the CLI answering "yes, I will interrupt" is explicitly not "the turn is over". Eight
     * seconds is the panel's own precedent for the same wait (STOP_GRACE_MS), and the wait exists at all
     * because a tab that cannot be stopped is a tab left on a subscription the person has walked away
     * from.
     *
     * Armed against the account it was asked for, so a second switch, or a turn that ends on its own in
     * the meantime, cannot leave a kill standing for a move that no longer exists.
     */
    private fun armForcedMove(sessionId: String, accountId: String) {
        forcedMoves.remove(sessionId)?.cancel(false)

        forcedMoves[sessionId] = AppExecutorUtil.getAppScheduledExecutorService().schedule(
            {
                forcedMoves.remove(sessionId)
                if (pendingAccounts[sessionId] != accountId) return@schedule
                pendingAccounts.remove(sessionId)

                DiagnosticsLog.note(DiagnosticsLog.AGENT, "a turn would not stop for an account change")
                // Whatever it was holding is about to die with it, and only this says so.
                onMoveForced(sessionId)
                moveTo(sessionId, force = true)
                // And only here: every other way into a move has a caller that speaks for the tab a line
                // later - the end of a turn sends the status itself, a prompt sends the message. Said
                // twice, the queue drains twice, and the second message is written into the turn the
                // first one has just started.
                onMoved(sessionId)
            },
            FORCED_MOVE_SECONDS,
            TimeUnit.SECONDS,
        )
    }

    /**
     * The model to start on, given the account that will pay - the carried one when it may be run there,
     * and that account's own otherwise.
     *
     * The CLI does not refuse a model an account has no access to at launch: the process comes up, says
     * the model in its init event, replays the transcript and looks perfectly well, and then dies on the
     * person's first message with an HTTP 404 (see ClaudeAccounts.canRun). Nothing on the screen names
     * the account, and nothing puts it right by itself - so it is put right here, before the process is
     * raised, and the panel is told the model it actually got.
     *
     * Only a definite NO replaces anything. Unknown leaves the model alone, and that way round is not a
     * coin toss: an unasked catalogue is the ordinary state of the first seconds of a project, and
     * treating it as a refusal would throw away the model of every conversation opened from the history -
     * including the one this rule exists to protect, an old chat on a million-token model. The catalogue
     * is asked for when a conversation is born on an account and again when the accounts screen opens
     * (see AccountDesk.round), which is the screen a person has to visit to switch at all.
     */
    private fun modelFor(accountId: String, model: String): String {
        val accounts = ClaudeAccounts.getInstance()
        if (accounts.canRun(accountId, model) != false) return model

        val own = accounts.account(accountId)?.model.orEmpty()
        if (own.isNotEmpty() && accounts.canRun(accountId, own) != false) return own

        // The machine's default gets the same test as the other two, and it is the case that matters
        // most: every applied pick writes that default, so choosing Opus on a Max account is exactly what
        // leaves it standing when the move lands on a Pro one. Unchecked, this branch handed back the
        // very model the first branch had just refused - and an account nobody has chosen a model for
        // (the ordinary sign-in among them, which has no record at all) reaches it every time.
        val preferred = ClaudePreferences.model
        if (accounts.canRun(accountId, preferred) != false) return preferred

        // Everything this tab could have asked for is refused, so what is left is the account's own
        // default - NAMED rather than left out. Leaving the flag out is not the same thing here: a move
        // resumes the transcript, and the CLI resumed without `--model` carries on at the model written
        // in it, which is very likely the one just refused. Naming it is only possible when the account
        // has answered with a catalogue at all; without one there is nothing honest left to say.
        return DEFAULT_MODEL.takeIf { accounts.canRun(accountId, it) == true }.orEmpty()
    }

    /**
     * Which account this conversation's process runs on.
     *
     * A tab with no process yet answers with the account it WOULD start on rather than with the empty
     * string. Empty is not "nothing yet" here - it names the CLI's ordinary sign-in - so an untouched
     * tab used to claim the default account to every client, and the prompt-improve button and the
     * model catalogue asked about it too.
     */
    fun accountOf(sessionId: String): String =
        sessions[sessionId]?.accountId ?: ClaudeAccounts.getInstance().currentId

    /**
     * Bring a conversation up without sending anything into it - see [ClaudeSession.wake]. Needed by a
     * resumed conversation: it has something to say about itself from the first second, and only a live
     * process with its transcript can say it.
     */
    fun wake(sessionId: String) {
        applyPendingAccount(sessionId)
        sessions[sessionId]?.wake()
    }

    /**
     * The model a conversation opened from the history carries on at - its own, read off the transcript,
     * rather than the setting (see ClaudeSessionHub.resumeConversation for why). Only before the process
     * is up: a launch flag is all this is, and a running conversation changes its model by [setModel].
     * The setting is left alone on purpose: this is what the conversation was on, not a choice anybody
     * made for the next tab.
     */
    fun adoptModel(sessionId: String, model: String): String {
        // Nothing said is nothing to adopt: a transcript whose model could not be read leaves the
        // conversation on whatever it was born with, which is the setting's.
        if (model.isEmpty()) return sessions[sessionId]?.model.orEmpty()

        val session = sessions[sessionId] ?: return model
        // Clamped to what the account paying for it can run, and the answer is what was ACTUALLY adopted
        // so the caller tells the panel the truth. A transcript's model is a fact about the account it
        // used to run on, and since everything now runs on the account chosen today, that is regularly a
        // different one - a model it may have no access to at all (see [modelFor]).
        val adopted = modelFor(session.accountId, model)

        session.adoptModel(adopted)
        return adopted
    }

    /**
     * The person's answer to the agent's permission question. The conversation may already be gone -
     * then there is nobody to answer, and the question died along with the process.
     */
    fun answerPermission(
        sessionId: String,
        requestId: String,
        allow: Boolean,
        message: String = "",
        extraInput: JsonObject? = null,
        remember: Boolean = false,
    ) {
        sessions[sessionId]?.answerPermission(requestId, allow, message, extraInput, remember)
    }

    /**
     * Whether the conversation is waiting for an answer to this very request.
     *
     * A card in the feed outlives a process: the conversation may have been restarted (an MCP
     * reconnect, a mode change), and then the old question died along with the previous process - the
     * new one will not recognise an answer to it and will silently throw it away. We ask in advance, so
     * that instead of a silent loss we take the fallback path.
     */
    fun isAwaitingPermission(sessionId: String, requestId: String): Boolean =
        sessions[sessionId]?.isAwaitingPermission(requestId) == true

    /** Kill one of the conversation's tasks - see [ClaudeSession.stopTask]. */
    fun stopTask(sessionId: String, taskId: String, onFailure: (String) -> Unit = {}) {
        if (taskId.isEmpty()) return
        // The conversation is already gone - there is nothing to kill: its tasks went with it.
        sessions[sessionId]?.stopTask(taskId, onFailure)
    }

    /**
     * This conversation's MCP - status, sign-in, reconnect (see [ClaudeSession]).
     *
     * The conversation is brought up for this if it is still asleep: MCP servers live inside the
     * process, and a sleeping one simply has none - no status, and nothing to connect to. The terminal
     * behaves exactly the same way: `/mcp` there is asked of a running session.
     */
    fun mcpStatus(sessionId: String, onResult: (JsonObject) -> Unit, onFailure: (String) -> Unit = {}) {
        awake(sessionId).requestMcpStatus(onResult, onFailure)
    }

    fun mcpAuthenticate(
        sessionId: String,
        server: String,
        onResult: (JsonObject) -> Unit,
        onFailure: (String) -> Unit = {},
    ) {
        awake(sessionId).authenticateMcp(server, onResult, onFailure)
    }

    fun mcpReconnect(
        sessionId: String,
        server: String,
        onResult: (JsonObject) -> Unit,
        onFailure: (String) -> Unit = {},
    ) {
        awake(sessionId).reconnectMcp(server, onResult, onFailure)
    }

    /** A conversation that definitely has a process: we start one and wake it if need be. */
    private fun awake(sessionId: String): ClaudeSession = session(sessionId).also { it.wake() }

    /** Interrupting a turn: the conversation stays alive, unlike closing the session. */
    fun interrupt(sessionId: String, onTimeout: () -> Unit = {}) {
        // The conversation is already gone - the panel will show it as free anyway, nothing to explain.
        sessions[sessionId]?.interrupt(onTimeout)
    }

    fun stop(sessionId: String) {
        sessions[sessionId]?.stop()
    }

    /**
     * Restarting a conversation's process without losing the transcript - MCP servers reconnect by it
     * (see ClaudeSession.restart). False means there was no process: there is nothing to connect to
     * yet.
     */
    fun restart(sessionId: String): Boolean {
        // A restart takes the process down and puts it back up, which is what a move does as well - so
        // an outstanding move is honoured here rather than undone by a process coming back on the
        // account it was asked to leave. Nothing to bring up afterwards is an honest "false": the
        // servers connect by themselves with the first message.
        applyPendingAccount(sessionId)

        return sessions[sessionId]?.restart() ?: false
    }

    /** Whether the process is alive right now - without creating one, unlike [session]. */
    fun isRunning(sessionId: String): Boolean = sessions[sessionId]?.isRunning == true

    /**
     * A conversation with a turn running right now - any of the tabs.
     *
     * This is for the subscription usage: it is shared across the whole account, and any process will
     * answer about it, but only a working one answers meaningfully - a process learns the fresh share
     * from the server's answers to its own requests. Asking the main tab specifically would be a miss:
     * the work may be happening in any of them.
     */
    fun busySession(): String? = sessions.entries.firstOrNull { it.value.isBusy }?.key

    /**
     * The mode applies at once, to the very next tool calls, and to THIS conversation alone. The
     * conversation is started for this even if it does not exist yet: a chosen mode must survive the
     * moment before the first question, or the process would come up with the ordinary one.
     *
     * Nothing is saved here, on purpose. "What I work in right now" and "what new tabs start in" are
     * two different questions, and one control cannot answer both: a mode picked for one tab would
     * become the starting mode everywhere - every other tab, every other project, every launch from
     * then on - with nothing said about it. The second question has a control of its own now, in the
     * header's menu (see ClaudePanel's "setDefaultMode").
     */
    fun setPermissionMode(sessionId: String, mode: String, onApplied: (ClaudeSession.ModeChange) -> Unit) {
        session(sessionId).setPermissionMode(mode, onApplied)
    }

    /**
     * The mode this conversation is genuinely in right now - null when it has no process and no chosen
     * mode of its own yet.
     *
     * Asked rather than taken from the saved preference, because the two are allowed to disagree: after
     * a plan is approved, the tab it was approved in works without questions while the setting stays as
     * the person left it (see [setPermissionMode]). Without creating a conversation, unlike [session]:
     * this is a question about one, not a reason to start one.
     */
    fun permissionMode(sessionId: String): String? = sessions[sessionId]?.permissionMode

    /** The transcript this conversation is filed under, once the CLI has named one - see ClaudeHistory. */
    fun conversationIdOf(sessionId: String): String? = sessions[sessionId]?.conversationId

    /**
     * The model and the effort. The choice is remembered: new conversations will start with it.
     *
     * The conversation is started for this even if it does not exist yet - as with the permission mode:
     * a choice made on an empty panel, before the first message, has to survive the launch rather than
     * be lost silently just because the process is not up. No process needs raising for it: a sleeping
     * conversation simply remembers the choice and starts with it (see ClaudeSession.setModel).
     */
    fun setModel(sessionId: String, model: String, onApplied: (ClaudeSession.ModelChange) -> Unit = {}) {
        session(sessionId).setModel(model) { change ->
            // We remember only what the agent genuinely took - as with the permission mode. Writing the
            // wish down straight away would leave a rejected model in the settings forever: every next
            // tab would go into its launch with a flag the CLI refuses before the first turn.
            //
            // Against the account as well as the machine, and the account is the one that matters: plans
            // differ in which models they have, so a pick made on one account must not decide what a tab
            // on another starts with (see newSession).
            if (change.applied) {
                ClaudePreferences.model = change.model
                ClaudeAccounts.getInstance().rememberChoice(accountOf(sessionId), model = change.model)
            }
            onApplied(change)
        }
    }

    /**
     * The effort, and unlike the model the setting is written straight away: this channel never refuses
     * (see ClaudeSession.setEffort), so there is nothing to hold it back for.
     */
    fun setEffort(sessionId: String, effort: String) {
        ClaudePreferences.effort = effort
        ClaudeAccounts.getInstance().rememberChoice(accountOf(sessionId), effort = effort)
        session(sessionId).setEffort(effort)
    }

    /**
     * What effort this conversation works at - null when there is no conversation yet, and then the
     * saved setting is the honest answer (that is what such a tab will start on).
     *
     * Asked of the conversation for the same reason as the permission mode: the setting is one for the
     * whole application, while every open tab keeps what it was started with. And unlike the model and
     * the mode there is nobody else to ask at all - the CLI neither announces the effort nor answers
     * questions about it (see ClaudeSession.setEffort).
     */
    fun effort(sessionId: String): String? = sessions[sessionId]?.effort

    /**
     * The model this conversation runs on, or null when there is no such conversation - then the saved
     * setting is the honest answer, exactly as with the effort above.
     *
     * Asked for the same reason: the setting is one for the whole application, while a tab keeps what it
     * was started with, and a fork has to be started on its parent's model rather than on a choice made
     * in some third tab (see [branchFrom]).
     */
    fun model(sessionId: String): String? = sessions[sessionId]?.model

    /**
     * This conversation starts on what was chosen for it rather than on what the settings hold.
     *
     * Only before it has begun: past that the process is up on flags already given, and the ordinary
     * ways of changing them ([setModel], [setEffort], [setPermissionMode]) are the ones that reach it.
     */
    fun rememberLaunch(sessionId: String, launch: SessionLaunch) {
        if (launch.isEmpty || sessions.containsKey(sessionId)) return

        launches[sessionId] = launch
    }

    /**
     * The model catalogue from a live conversation. Asking a sleeping one is pointless: the answer
     * comes from the process itself, and raising one for a list is not worth it - there is a one-off
     * lightweight ping for that (see ClaudeControlPing).
     */
    fun requestModels(sessionId: String, onResult: (JsonObject) -> Unit, onFailure: (String) -> Unit = {}) {
        val session = sessions[sessionId]
        if (session == null || !session.isRunning) {
            onFailure("no live session")
            return
        }
        session.requestModels(onResult, onFailure)
    }

    /** A live conversation's context window usage - a sleeping one's is empty by definition. */
    fun requestContextUsage(
        sessionId: String,
        onResult: (JsonObject) -> Unit,
        onFailure: (String) -> Unit = {},
    ) {
        val session = sessions[sessionId]
        if (session == null || !session.isRunning) {
            onFailure("no live session")
            return
        }
        session.requestContextUsage(onResult, onFailure)
    }

    /**
     * Usage is asked of the conversation, raising it if need be: otherwise the figures would appear
     * only after the first message, while one wants to see them right away.
     */
    fun requestUsage(
        sessionId: String,
        onUsage: (JsonObject) -> Unit,
        onFailure: (String) -> Unit = {},
    ) {
        session(sessionId).requestUsage(onUsage, onFailure)
    }

    fun close(sessionId: String) {
        // A tab closed before anything was written into it takes its unspent choice with it.
        launches.remove(sessionId)
        // And an outstanding move: there is nothing left to move it to. Kept, the note would be found
        // by a tab that happens to be opened under the same id later, and its deadline would take down
        // whatever is running there by then.
        pendingAccounts.remove(sessionId)
        pendingRenewals.remove(sessionId)
        forcedMoves.remove(sessionId)?.cancel(false)

        sessions.remove(sessionId)?.let { session ->
            session.stop()
            Disposer.dispose(session)
        }
    }

    override fun dispose() {
        sessions.keys.toList().forEach(::close)
    }

    /** The process comes up lazily: an empty tab should start nothing. */
    private fun session(sessionId: String): ClaudeSession = sessions.getOrPut(sessionId) {
        newSession(sessionId, forkFrom = null).also { Disposer.register(this, it) }
    }

    private fun newSession(
        sessionId: String,
        forkFrom: String?,
        resumeFrom: String? = null,
    ): ClaudeSession {
        /*
         * Whether the conversation raising this callback is still the one the tab holds.
         *
         * A move replaces the conversation and takes the old process down, and a process does not die at
         * once: its termination arrives afterwards, on another thread, still carrying this tab's id. Left
         * unguarded it announced the tab idle over the turn the NEW conversation had meanwhile started -
         * and an idle drains the queue, so the message after it went into a turn already running.
         *
         * Only the callbacks that speak about the tab's STATE are held to this. What the dying process
         * still has to say - its last lines, its crash - is said: it happened, and the feed is a record.
         */
        val slot = arrayOfNulls<ClaudeSession>(1)
        val current = { sessions[sessionId] === slot[0] }
        // Chosen for this conversation alone, or nothing at all - the usual case, in which the settings
        // decide (see SessionLaunch).
        val launch = launches.remove(sessionId) ?: SessionLaunch()

        val accounts = ClaudeAccounts.getInstance()

        /*
         * Which account pays: the one chosen for this machine, and nothing else.
         *
         * There used to be a chain here - the transcript's own account, then the request's, then the
         * machine's - so that a conversation came back on the subscription it had been billed to. It is
         * gone deliberately. Choosing an account now means "everything I do is on this one", history and
         * forks included, and a chain of exceptions is the same thing as not having chosen.
         */
        val account = accounts.currentId

        // Per account rather than machine-wide, and that is not symmetry for its own sake. Every
        // successful pick writes the machine's default, so a model chosen on a Max account decided what
        // a tab on a Pro account launched with - and a plan that has no Opus cannot run one. An account
        // nobody has chosen for falls back to the default.
        val remembered = accounts.account(account)

        val effort = launch.effort.ifEmpty { remembered?.effort.orEmpty() }.ifEmpty { ClaudePreferences.effort }
        // A new conversation starts with whatever is chosen now: re-picking the model in every tab is
        // work over nothing. A conversation opened from the history is the exception, and it is told
        // its own model a moment later, once its transcript has been read (see adoptModel).
        val model = modelFor(
            account,
            launch.model.ifEmpty { remembered?.model.orEmpty() }.ifEmpty { ClaudePreferences.model },
        )

        onBorn(sessionId, effort, model, account)

        return ClaudeSession(
            workingDirectory = workingDirectory,
            forkFrom = forkFrom,
            resumeFrom = resumeFrom,
            model = model,
            effort = effort,
            accountId = account,
            // Never chosen at all - we start in the same mode a terminal would start in this directory (see
            // PermissionDefaultMode).
            permissionMode = PermissionModes.resolve(
                launch.mode.ifEmpty { ClaudePreferences.mode },
                fallback = PermissionDefaultMode.of(workingDirectory),
            ),
            onEvent = { line -> onEvent(sessionId, line) },
            onError = { message -> onError(sessionId, message) },
            onDiagnostic = { message -> onDiagnostic(sessionId, message) },
            onFinished = { if (current()) onFinished(sessionId) },
            onCrashed = { exitCode -> onCrashed(sessionId, exitCode) },
            onToolPermission = { request -> onToolPermission(sessionId, request) },
            onPermissionWithdrawn = { requestId -> onPermissionWithdrawn(sessionId, requestId) },
            onTitle = { title -> onTitle(sessionId, title) },
            titleWanted = { titleWanted(sessionId) },
            onTurnEnded = { if (current()) onTurnEnded(sessionId) },
            onTurnStarted = { if (current()) onTurnStarted(sessionId) },
        ).also { slot[0] = it }
    }

    companion object {
        /**
         * The identifier of the tab a panel opens with, and the one a message with no conversation named
         * in it belongs to.
         *
         * Declared once and here rather than beside each of its users: the panel routes incoming
         * messages by it while the permission cards send answers back by it, and the two agreeing is the
         * whole point. Kept apart, a change in one place would quietly send permission cards into a tab
         * the interface has never heard of - and neither the build nor the tests would notice.
         */
        const val MAIN_SESSION = "main"

        /** How long a turn is given to stop of its own accord before it is taken down - see [armForcedMove]. */
        private const val FORCED_MOVE_SECONDS = 8L

        /**
         * The CLI's own name for "whatever this account's default is" - the one model every plan can run.
         *
         * Its own word rather than ours: it is what the CLI lists in the model catalogue and what the
         * panel's own menu sends when a person picks the first entry (see DEFAULT_MODEL in catalog.ts).
         */
        private const val DEFAULT_MODEL = "default"
    }
}

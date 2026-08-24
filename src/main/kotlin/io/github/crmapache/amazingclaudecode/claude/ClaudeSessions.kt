package io.github.crmapache.amazingclaudecode.claude

import com.intellij.openapi.Disposable
import com.intellij.openapi.util.Disposer
import java.util.concurrent.ConcurrentHashMap
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
    /** An LLM picked the conversation's name by its first message - see ClaudeSession.onTitle. */
    private val onTitle: (sessionId: String, title: String) -> Unit = { _, _ -> },
    /** Whether this conversation still needs a name of its own - see ClaudeSession.titleWanted. */
    private val titleWanted: (sessionId: String) -> Boolean = { true },
    /** The turn ended - the panel should clear its work; see ClaudeSession.onTurnEnded. */
    private val onTurnEnded: (sessionId: String) -> Unit = {},
    /** The turn started on its own, without a send from the panel; see ClaudeSession.onTurnStarted. */
    private val onTurnStarted: (sessionId: String) -> Unit = {},
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
        session(sessionId).sendPrompt(text, images)
    }

    /**
     * A branch off another conversation: the branch gets its whole transcript and an identifier of its
     * own. Continuing in the branch leaves the parent untouched, and if the parent has never answered
     * yet, there is nothing to branch off - we start an ordinary conversation.
     */
    fun branchFrom(parentId: String, branchId: String) {
        if (sessions.containsKey(branchId)) return

        val parent = sessions[parentId]?.conversationId
        sessions[branchId] = newSession(branchId, forkFrom = parent).also {
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
        close(sessionId)

        sessions[sessionId] = newSession(sessionId, forkFrom = null, resumeFrom = conversationId).also {
            Disposer.register(this, it)
        }
    }

    /**
     * Bring a conversation up without sending anything into it - see [ClaudeSession.wake]. Needed by a
     * resumed conversation: it has something to say about itself from the first second, and only a live
     * process with its transcript can say it.
     */
    fun wake(sessionId: String) {
        sessions[sessionId]?.wake()
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
    fun restart(sessionId: String): Boolean = sessions[sessionId]?.restart() ?: false

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
            if (change.applied) ClaudePreferences.model = change.model
            onApplied(change)
        }
    }

    fun setEffort(sessionId: String, effort: String) {
        ClaudePreferences.effort = effort
        session(sessionId).setEffort(effort)
    }

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
        // Chosen for this conversation alone, or nothing at all - the usual case, in which the settings
        // decide (see SessionLaunch).
        val launch = launches.remove(sessionId) ?: SessionLaunch()

        return ClaudeSession(
            workingDirectory = workingDirectory,
            forkFrom = forkFrom,
            resumeFrom = resumeFrom,
            // A new conversation starts with whatever is chosen now: re-picking the model in every tab is
            // work over nothing.
            model = launch.model.ifEmpty { ClaudePreferences.model },
            effort = launch.effort.ifEmpty { ClaudePreferences.effort },
            // Never chosen at all - we start in the same mode a terminal would start in this directory (see
            // PermissionDefaultMode).
            permissionMode = PermissionModes.resolve(
                launch.mode.ifEmpty { ClaudePreferences.mode },
                fallback = PermissionDefaultMode.of(workingDirectory),
            ),
            onEvent = { line -> onEvent(sessionId, line) },
            onError = { message -> onError(sessionId, message) },
            onDiagnostic = { message -> onDiagnostic(sessionId, message) },
            onFinished = { onFinished(sessionId) },
            onCrashed = { exitCode -> onCrashed(sessionId, exitCode) },
            onToolPermission = { request -> onToolPermission(sessionId, request) },
            onTitle = { title -> onTitle(sessionId, title) },
            titleWanted = { titleWanted(sessionId) },
            onTurnEnded = { onTurnEnded(sessionId) },
            onTurnStarted = { onTurnStarted(sessionId) },
        )
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
    }
}

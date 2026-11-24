package io.github.crmapache.amazingclaudecode.claude.terminal

import com.intellij.openapi.application.ApplicationManager
import com.intellij.openapi.diagnostic.thisLogger
import com.intellij.openapi.project.Project
import io.github.crmapache.amazingclaudecode.claude.ClaudeExecutable
import io.github.crmapache.amazingclaudecode.claude.ClaudeHistory
import io.github.crmapache.amazingclaudecode.claude.ClaudeHome
import io.github.crmapache.amazingclaudecode.claude.ClaudeLaunch
import io.github.crmapache.amazingclaudecode.claude.ClaudeSessionHub
import io.github.crmapache.amazingclaudecode.claude.HostOs
import io.github.crmapache.amazingclaudecode.claude.SessionSnapshot
import io.github.crmapache.amazingclaudecode.claude.SettingSources
import io.github.crmapache.amazingclaudecode.claude.accounts.ClaudeAccounts
import io.github.crmapache.amazingclaudecode.feedback.DiagnosticsLog
import java.io.File
import java.util.concurrent.ConcurrentHashMap

/**
 * A conversation carried on in the CLI's own interface, in a terminal of the IDE, and given back to its tab
 * afterwards.
 *
 * Asked for in a review (2026-11-24) by somebody coming from JetBrains Air, where an agent runs either as a chat
 * or in its own terminal interface. The panel is the chat; this is the other half, for the same conversation:
 * the person moves it into a terminal for whatever the CLI does only on its own screens, and comes back to the
 * chat with everything that was done there.
 *
 * **One writer at a time, and that is the whole design.** A conversation is a transcript, and two processes over
 * one transcript each write their own turns into it - what is said in one does not exist for the other (see
 * history.md). So the tab gives its process up before the terminal raises one, and from then on the tab is
 * HELD: nothing raises a process for it - not a message, not the queue, not a phone, not a scenario, not the MCP
 * screen, not a restored tab being looked at. The one place every process of a tab comes up through is
 * ClaudeSession.start, and the question is asked there (see [holds]), so a road added tomorrow is held as well.
 * What is written into a held tab waits in its queue and goes once the conversation is back.
 *
 * **The hold ends with the terminal's process, not with a button.** The CLI ending - `/exit`, the tab closed,
 * the IDE's own "close session" - is what gives the conversation back; Return to chat in the panel simply closes
 * that tab. A button that released the tab while the terminal still ran would be the two writers again.
 *
 * **Somebody else's terminal holds it the same way.** `claude --resume <id>` pasted from `/status`, a terminal
 * outside the IDE, another tool driving the CLI - each is a second writer the tab knew nothing about. Before a
 * process comes up, the CLI's own register of live processes is asked whether one already holds the
 * conversation (see ConversationHolders); if so, the tab is held by it until that process ends.
 *
 * **What was done in the terminal is played into the feed on the way back** (see
 * ClaudeSessionHub.terminalReleased): the transcript after the last line the feed already holds, the way a
 * conversation opened from the history is played.
 */
internal class TerminalDesk(
    private val project: Project,
    private val hub: ClaudeSessionHub,
) {

    /**
     * What may stop a conversation from going into the terminal - each a reason the panel words for itself.
     *
     * The panel asks most of these itself before it offers the move (see the tab's menu), so arriving here they
     * are a race: a turn begun by a background task a moment before the press, a phone's message.
     */
    enum class Refusal(val code: String) {
        /** Nothing to carry on: the tab has not been written into yet, or its transcript is gone. */
        NO_CONVERSATION("noConversation"),

        /** A turn is running, or a card waits for the person: killing the process now loses them. */
        BUSY("busy"),

        /**
         * A background subagent or command is alive: it is a child of the process, and goes with it - silently,
         * with its card still turning (see IdleSleep for the same rule and why).
         */
        BACKGROUND("background"),

        /** There is no `claude` to run. */
        NOT_FOUND("notFound"),

        /** The tab's account would not resolve - carrying on would run it as somebody else (see ClaudeAccounts). */
        ACCOUNT("account"),

        /** This IDE has no terminal, or it would not start. */
        NO_TERMINAL("noTerminal"),
    }

    /**
     * A tab held by a terminal. [tab] is ours when we opened it - null for somebody else's process, and for a
     * moment while ours is coming up. [pid] is somebody else's process; null for ours.
     */
    private class Hold(val conversationId: String, val pid: Long?) {
        @Volatile
        var tab: TerminalTab? = null
    }

    private val holds = ConcurrentHashMap<String, Hold>()

    /** What the panel draws for [sessionId]: [HERE], [ELSEWHERE], or null when the tab is its own. */
    fun stateOf(sessionId: String): String? = holds[sessionId]?.let { if (it.pid == null) HERE else ELSEWHERE }

    /** The held tabs and their states, for a client joining (see ClaudeSessionHub.attach). */
    fun states(): Map<String, String> = holds.keys.mapNotNull { id -> stateOf(id)?.let { id to it } }.toMap()

    /**
     * Whether the tab's conversation is held by a terminal - ours, or a live process somebody else started - so
     * that nothing may be said into it now.
     *
     * The register is read only when the tab's own process is not running: a running one is the conversation's
     * writer, whoever else may have tried since.
     */
    fun holding(sessionId: String): Boolean {
        if (holds.containsKey(sessionId)) return true
        if (hub.conversations.isRunning(sessionId)) return false
        val conversationId = hub.conversations.conversationIdOf(sessionId) ?: return false
        return holds(sessionId, conversationId, own = hub.conversations.ownPids(sessionId))
    }

    /**
     * The minute's look over a tab (see ClaudeSessionHub.noticeOutsideWriters): has a process somebody else started
     * taken its conversation meanwhile - `claude --resume` pasted into a terminal of one's own, say?
     *
     * A tab with no process of its own is simply held (see [holding]). One whose process is alive is the case the
     * launch's own check never sees: both are already up, and from here on each writes its own turns into one
     * transcript. The tab's process steps aside - through the idle sweep's door, so only when it holds nothing a
     * person would lose (see IdleSleep) - and the tab is held until the other one ends. A process in the middle of a
     * turn is left to finish it; the next look tries again.
     */
    fun notice(sessionId: String) {
        if (holds.containsKey(sessionId)) return
        val conversations = hub.conversations
        val conversationId = conversations.conversationIdOf(sessionId) ?: return

        if (!conversations.isRunning(sessionId)) {
            holds(sessionId, conversationId, own = conversations.ownPids(sessionId))
            return
        }

        val holder = ConversationHolders.holderOf(conversationId, ClaudeHome.of(project.basePath), conversations.ownPids(sessionId))
            ?: return
        if (!conversations.sleep(sessionId) { idleNow(sessionId) }) return

        DiagnosticsLog.note(DiagnosticsLog.AGENT, "a conversation's process stepped aside for one the panel did not start")
        holdElsewhere(sessionId, conversationId, holder.pid)
    }

    /**
     * Whether [conversationId] may not be raised in [sessionId] now - asked by ClaudeSession.start before every
     * launch. [own] are the pids that conversation raised itself (see ConversationHolders.holderOf).
     *
     * A hold over another conversation than the one being raised is a tab that has since taken a different one:
     * it is let go, and the new one answers for itself.
     */
    fun holds(sessionId: String, conversationId: String, own: Set<Long>): Boolean {
        holds[sessionId]?.let { hold ->
            if (hold.conversationId == conversationId) return true
            holds.remove(sessionId, hold)
        }

        val holder = ConversationHolders.holderOf(conversationId, ClaudeHome.of(project.basePath), own) ?: return false
        holdElsewhere(sessionId, conversationId, holder.pid)
        return true
    }

    /**
     * Carry [sessionId]'s conversation on in a terminal. Off the interface thread: the checks read the disk,
     * and taking a process down is not instant.
     */
    fun handOver(sessionId: String) {
        holds[sessionId]?.let { hold ->
            hold.tab?.let { tab -> ApplicationManager.getApplication().invokeLater({ tab.show() }, project.disposed) }
            return
        }

        val conversations = hub.conversations
        val conversationId = conversations.conversationIdOf(sessionId)
            ?.takeIf { ClaudeHistory.transcriptFile(project.basePath, it) != null }
            ?: return refuse(sessionId, Refusal.NO_CONVERSATION)

        val snapshot = hub.snapshotOf(sessionId)
        if (snapshot.status == SessionSnapshot.STATUS_RUNNING || snapshot.awaitsYou) return refuse(sessionId, Refusal.BUSY)
        if (snapshot.pendingAgents.isNotEmpty() || snapshot.pendingCommands.isNotEmpty()) {
            return refuse(sessionId, Refusal.BACKGROUND)
        }

        val executable = ClaudeExecutable.find() ?: return refuse(sessionId, Refusal.NOT_FOUND)

        // The tab's own account, handed to the process as a map exactly as the panel's own are - never typed into
        // a shell (see AccountTerminal). A refusal stops the move: carried on, the conversation would run as
        // whoever the ordinary sign-in is.
        val account = ClaudeAccounts.getInstance().variablesFor(conversations.accountOf(sessionId), project.basePath)
            ?: return refuse(sessionId, Refusal.ACCOUNT)

        val hold = Hold(conversationId, pid = null)
        if (holds.putIfAbsent(sessionId, hold) != null) return

        // The panel's process goes before the terminal's comes up. Through the idle sweep's own door, asked once
        // more at the last moment: a turn a background task began since the checks above is not killed on its
        // first words (see ClaudeSessions.sleep).
        if (conversations.isRunning(sessionId) && !conversations.sleep(sessionId) { idleNow(sessionId) }) {
            holds.remove(sessionId, hold)
            return refuse(sessionId, Refusal.BUSY)
        }

        hub.terminalChanged(sessionId)

        val remote = ClaudeHome.of(project.basePath).remote
        val sources = conversations.settingSourcesNow()
        val arguments = ClaudeLaunch.terminalArguments(
            model = conversations.model(sessionId).orEmpty(),
            effort = conversations.effort(sessionId).orEmpty(),
            permissionMode = conversations.permissionMode(sessionId),
            conversationId = conversationId,
            // A WSL distribution's CLI is not the one asked here; it is given only what every CLI knows.
            allowBypassSwitch = !remote && ClaudeExecutable.supportsFlag(executable, ClaudeLaunch.ALLOW_BYPASS_FLAG),
            settingSources = if (!remote && ClaudeExecutable.supportsFlag(executable, SettingSources.FLAG)) sources else SettingSources.ALL,
        )
        val command = if (remote) null else launcher(executable) + arguments
        val typed = if (remote) (listOf("claude") + arguments).joinToString(" ", transform = ResumeLine::word) else null
        // The tab's environment for a process of this machine. A distribution's shell is not one: the IDE's own
        // environment is a Windows one, and the account there is always the ordinary sign-in (a drawer cannot be
        // carried into WSL - see ClaudeAccounts). What it is given is what the conversation's tools depend on.
        val variables = if (remote) {
            mapOf(ClaudeLaunch.TODO_TOOLS_VARIABLE to "1")
        } else {
            ClaudeLaunch.environment(account)
        }

        val title = hub.tabs.tabs().firstOrNull { it.id == sessionId }?.title?.takeIf { it.isNotBlank() }
        val name = title?.let { "Claude: $it" } ?: "Claude"

        ApplicationManager.getApplication().invokeLater({
            val opened = TerminalTab.open(
                project = project,
                parentDisposable = hub,
                title = name,
                command = command,
                typed = typed,
                variables = variables,
                workingDirectory = project.basePath,
                onExit = { release(sessionId, hold) },
            )

            if (opened == null) {
                holds.remove(sessionId, hold)
                hub.terminalChanged(sessionId)
                refuse(sessionId, Refusal.NO_TERMINAL)
                return@invokeLater
            }

            hold.tab = opened
            // The kind of launch, never the conversation or the path: this buffer travels in bug reports.
            DiagnosticsLog.note(DiagnosticsLog.AGENT, "a conversation went into the terminal (${if (remote) "typed" else "process"})")
        }, project.disposed)
    }

    /** Bring the terminal holding [sessionId] to the front - ours only: somebody else's is not ours to raise. */
    fun show(sessionId: String) {
        val tab = holds[sessionId]?.tab ?: return
        ApplicationManager.getApplication().invokeLater({ tab.show() }, project.disposed)
    }

    /**
     * Take the conversation back from our terminal: its tab is closed, and the process ending gives the
     * conversation back (see [release]). Somebody else's process is not ended from here - it is their work.
     */
    fun takeBack(sessionId: String) {
        val tab = holds[sessionId]?.tab ?: return
        ApplicationManager.getApplication().invokeLater({ tab.close() }, project.disposed)
    }

    /**
     * Drop the hold without giving anything back - the tab is gone, or holds another conversation now. The
     * terminal itself is left running: the person may well be working in it.
     */
    fun forget(sessionId: String) {
        holds.remove(sessionId)
    }

    /** Held by a process somebody else started - until it ends. */
    private fun holdElsewhere(sessionId: String, conversationId: String, pid: Long) {
        val hold = Hold(conversationId, pid)
        if (holds.putIfAbsent(sessionId, hold) != null) return

        DiagnosticsLog.note(DiagnosticsLog.AGENT, "a conversation is held by a process the panel did not start")
        hub.terminalChanged(sessionId)

        val process = ProcessHandle.of(pid).orElse(null)
        if (process == null) {
            release(sessionId, hold)
        } else {
            // The JVM watches a process it did not start by polling; nothing here has to.
            process.onExit().thenRun { release(sessionId, hold) }
        }
    }

    /** The terminal's process has ended - the conversation is the tab's again. */
    private fun release(sessionId: String, hold: Hold) {
        if (!holds.remove(sessionId, hold)) return
        thisLogger().info("A conversation came back from the terminal")
        hub.terminalReleased(sessionId, hold.conversationId)
    }

    /** The idle sweep's rule, asked at the moment the process is taken (see [handOver]). */
    private fun idleNow(sessionId: String): Boolean {
        val snapshot = hub.snapshotOf(sessionId)
        return snapshot.status != SessionSnapshot.STATUS_RUNNING &&
            !snapshot.awaitsYou &&
            snapshot.pendingAgents.isEmpty() &&
            snapshot.pendingCommands.isEmpty()
    }

    private fun refuse(sessionId: String, refusal: Refusal) {
        DiagnosticsLog.note(DiagnosticsLog.AGENT, "a conversation did not go into the terminal: ${refusal.code}")
        hub.terminalRefused(sessionId, refusal.code)
    }

    companion object {
        /** In a terminal this panel opened. */
        const val HERE = "here"

        /** In a process somebody else started. */
        const val ELSEWHERE = "elsewhere"

        /**
         * The CLI as the terminal's process. On Windows npm installs it as a batch file, and a batch file is not a
         * program: it is run through `cmd.exe /c`, as the platform does for the panel's own processes. Nothing in
         * the arguments can trouble cmd - see ClaudeLaunch.terminalArguments.
         */
        internal fun launcher(executable: File, windows: Boolean = HostOs.isWindows): List<String> {
            val path = executable.absolutePath
            val batch = path.endsWith(".cmd", ignoreCase = true) || path.endsWith(".bat", ignoreCase = true)
            return if (windows && batch) listOf("cmd.exe", "/c", path) else listOf(path)
        }
    }
}

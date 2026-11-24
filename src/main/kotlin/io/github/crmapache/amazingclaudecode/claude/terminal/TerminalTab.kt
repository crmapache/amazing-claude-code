package io.github.crmapache.amazingclaudecode.claude.terminal

import com.intellij.openapi.Disposable
import com.intellij.openapi.diagnostic.thisLogger
import com.intellij.openapi.project.Project
import com.intellij.openapi.wm.ToolWindow
import com.intellij.openapi.wm.ToolWindowManager
import com.intellij.terminal.ui.TerminalWidget
import com.intellij.ui.content.Content
import org.jetbrains.plugins.terminal.LocalTerminalDirectRunner
import org.jetbrains.plugins.terminal.ShellStartupOptions
import org.jetbrains.plugins.terminal.TerminalToolWindowFactory
import org.jetbrains.plugins.terminal.TerminalToolWindowManager

/**
 * A tab of the IDE's terminal holding one conversation in the CLI's own interface (see TerminalDesk).
 *
 * **The CLI is the tab's process, not a command typed into a shell.** The sign-in terminal types its command
 * (see AccountTerminal), and there that is right: nobody waits for it to end. Here the end is the whole point -
 * the conversation belongs to the terminal for exactly as long as that process lives, and its end is what gives
 * the conversation back to the panel. A shell would outlive it: `/exit` would leave a prompt behind, and the tab
 * in the panel would go on waiting for a terminal that no longer holds anything. Run as the process, the CLI
 * ending ends the tab, and the platform says so (`addTerminationCallback`).
 *
 * The exception is a project inside WSL. Its terminal is the distribution's shell, and the executable this side
 * found is a Windows one that means nothing there; what does is `claude` on the distribution's own PATH, which
 * only its login shell reads. So there the command is typed, and the conversation comes back when the tab is
 * closed rather than when the CLI ends.
 */
internal class TerminalTab private constructor(
    private val project: Project,
    private val content: Content,
) {

    /** Bring the tab to the front, with the terminal window. */
    fun show() {
        val window = terminalWindow(project) ?: return
        window.activate({ window.contentManager.setSelectedContent(content, true) }, true)
    }

    /**
     * Close the tab, ending the process in it. What the CLI was doing at that moment ends with it - the caller
     * has asked the person first when there is anything to lose (see the panel's Return to chat).
     */
    fun close() {
        val manager = runCatching { TerminalToolWindowManager.getInstance(project) }.getOrNull() ?: return
        if (content.manager == null) return
        manager.closeTab(content)
    }

    companion object {

        /**
         * A terminal tab named [title], with [command] as its process - or with [typed] typed into the
         * project's own shell when [command] is null (see the class note). [onExit] is called once, when the
         * process ends, for whatever reason.
         *
         * On the interface thread. Null when this IDE has no terminal to open, or it would not start.
         */
        fun open(
            project: Project,
            parentDisposable: Disposable,
            title: String,
            command: List<String>?,
            typed: String?,
            variables: Map<String, String>,
            workingDirectory: String?,
            onExit: () -> Unit,
        ): TerminalTab? = runCatching {
            val window = terminalWindow(project) ?: return null
            val manager = TerminalToolWindowManager.getInstance(project)

            val options = ShellStartupOptions.Builder()
                .workingDirectory(workingDirectory)
                .envVariables(variables)
                .apply { if (command != null) shellCommand(command) }
                .build()

            val widget: TerminalWidget = LocalTerminalDirectRunner(project)
                .startShellTerminalWidget(parentDisposable, options, true)

            // The name the person would give it. The terminal names its tab after its own title and puts that over
            // the content's name - set only there, the tab read "Unnamed" (seen in WebStorm 2026.2) - so the title
            // is where it goes: one the person defined, which the process does not overwrite.
            widget.terminalTitle.change { userDefinedTitle = title }
            val content = manager.newTab(window, widget)
            widget.addTerminationCallback(onExit, parentDisposable)

            window.activate({ window.contentManager.setSelectedContent(content, true) }, true)
            if (command == null && typed != null) widget.sendCommandToExecute(typed)

            TerminalTab(project, content)
        }.onFailure { thisLogger().warn("A conversation could not be opened in the terminal", it) }
            .getOrNull()

        /** The terminal window - asked of the platform, not of the terminal manager (see AccountTerminal.open). */
        private fun terminalWindow(project: Project): ToolWindow? =
            ToolWindowManager.getInstance(project).getToolWindow(TerminalToolWindowFactory.TOOL_WINDOW_ID)
    }
}

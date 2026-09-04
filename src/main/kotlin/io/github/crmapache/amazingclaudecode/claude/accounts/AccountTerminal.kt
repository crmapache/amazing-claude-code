package io.github.crmapache.amazingclaudecode.claude.accounts

import com.intellij.openapi.Disposable
import com.intellij.openapi.diagnostic.thisLogger
import com.intellij.openapi.project.Project
import com.intellij.openapi.wm.ToolWindowManager
import org.jetbrains.plugins.terminal.LocalTerminalDirectRunner
import org.jetbrains.plugins.terminal.ShellStartupOptions
import org.jetbrains.plugins.terminal.TerminalToolWindowFactory
import org.jetbrains.plugins.terminal.TerminalToolWindowManager

/**
 * A terminal of this project, opened with a credential drawer of our choosing.
 *
 * Two things in the panel need one and need it for the same reason: signing in to another account
 * ([AccountSignIn]) and authorizing Claude Design ([DesignLogin]). Both are a full dialogue with a
 * process - a browser round trip, a code coming back, an SSO detour - which is why the panel has never
 * had a sign-in form of its own, and both must land in the drawer the panel is actually working on
 * rather than in whichever one the CLI would have opened by itself.
 *
 * **The environment is typed, never a shell prefix.** Writing `VAR=... claude …` into the shell would
 * mean guessing which shell it is - three quoting dialects - and a wrong guess runs the sign-in against
 * the DEFAULT drawer, that is, against the account the person is working on. The platform hands a typed
 * map straight to the process; the shell never sees it as text.
 */
internal object AccountTerminal {

    /**
     * A terminal whose process is handed [variables] as a map, with [command] already typed into it.
     *
     * `LocalTerminalDirectRunner` rather than `createShellWidget`, for one reason: the latter takes no
     * environment. The platform merges the map into the process environment after the parent's and
     * before its own `TERM`, so nothing here has to reach into the shell.
     *
     * **The window comes from the platform, not from the terminal manager.** The manager's own
     * `toolWindow` is a raw field, filled only when the window has actually BUILT its contents - that is,
     * when somebody opened the terminal at least once in this IDE session. Asked before that, it answers
     * null, and a person who had not touched the terminal today was told the terminal would not open. It
     * is not even needed to open one: `newTab` ignores the window it is handed except for a null check
     * and finds its own (`getOrInitToolWindow` inside the manager, which is what `createShellWidget` uses
     * as well). The window is asked for here only to bring it to the front afterwards.
     *
     * Called on the interface thread, and answers whether there is a terminal to have looked at.
     */
    fun open(
        project: Project,
        parentDisposable: Disposable,
        variables: Map<String, String>,
        command: String,
    ): Boolean {
        val manager = TerminalToolWindowManager.getInstance(project)
        val toolWindow = ToolWindowManager.getInstance(project)
            .getToolWindow(TerminalToolWindowFactory.TOOL_WINDOW_ID)

        if (toolWindow == null) {
            thisLogger().warn("This IDE has no terminal tool window, so nothing could be signed in to")
            return false
        }

        val options = ShellStartupOptions.Builder()
            .workingDirectory(project.basePath)
            .envVariables(variables)
            .build()

        val widget = LocalTerminalDirectRunner(project)
            .startShellTerminalWidget(parentDisposable, options, true)

        manager.newTab(toolWindow, widget)
        toolWindow.activate(null)

        widget.sendCommandToExecute(command)

        return true
    }

    /**
     * The executable as a shell will still read it: the full path rather than a bare name, because the
     * terminal takes PATH from its own profile and an install in `~/.local/bin` may not be on it.
     *
     * Quoted only when it needs to be, on one line and with nothing in it a person wrote - the discipline
     * ClaudeLaunch explains at length.
     */
    fun quoted(executable: String): String = if (executable.contains(' ')) "\"$executable\"" else executable
}

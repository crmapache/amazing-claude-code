package io.github.crmapache.amazingclaudecode.claude

import com.intellij.openapi.application.ApplicationManager
import com.intellij.openapi.diagnostic.thisLogger
import com.intellij.openapi.project.Project
import org.jetbrains.plugins.terminal.TerminalToolWindowManager

/**
 * Signing in happens in the IDE's built-in terminal.
 *
 * The panel cannot have a sign-in screen of its own: `claude auth login` opens a browser and waits for
 * a code to come back, that is, it is a full dialogue with a process. The IDE's terminal already exists
 * for that - no reason to build a second one.
 */
internal object ClaudeLogin {

    fun login(project: Project) = openTerminal(project, "login")

    /**
     * Signing out goes into the terminal too. The panel should not wipe the authorization with its own
     * hands: there are several ways to sign in, and only the CLI knows about them.
     */
    fun logout(project: Project) = openTerminal(project, "logout")

    private fun openTerminal(project: Project, verb: String) {
        ApplicationManager.getApplication().invokeLater {
            runCatching {
                // The way to open a terminal is marked deprecated, but the platform offers no
                // replacement: everything else in this manager is either deprecated as well or closed
                // to plugins. What we need is a shell we can then write into - a sign-in launched by
                // the terminal directly would close the tab along with itself and everything it had
                // managed to say.
                @Suppress("DEPRECATION")
                val widget = TerminalToolWindowManager.getInstance(project)
                    .createShellWidget(project.basePath, "claude $verb", true, true)

                widget.sendCommandToExecute(command(verb))
            }.onFailure {
                thisLogger().warn("Failed to open a terminal for claude auth $verb", it)
            }
        }
    }

    /**
     * The full path rather than a bare name: the terminal takes PATH from its own shell, and if claude
     * was put into ~/.local/bin by the installer, the name alone may not be enough.
     */
    private fun command(verb: String): String {
        val executable = ClaudeExecutable.find()?.absolutePath ?: "claude"
        val quoted = if (executable.contains(' ')) "\"$executable\"" else executable

        return "$quoted auth $verb"
    }
}

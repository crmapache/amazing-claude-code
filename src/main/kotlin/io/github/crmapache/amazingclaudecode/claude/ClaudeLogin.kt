package io.github.crmapache.amazingclaudecode.claude

import com.intellij.openapi.application.ApplicationManager
import com.intellij.openapi.diagnostic.thisLogger
import com.intellij.openapi.project.Project
import org.jetbrains.plugins.terminal.TerminalToolWindowManager

/**
 * Вход выполняется во встроенном терминале IDE.
 *
 * Своего экрана входа у панели быть не может: `claude auth login` открывает браузер
 * и ждёт возврата кода, то есть это полноценный диалог с процессом. Терминал IDE
 * для этого уже есть — незачем городить второй.
 */
internal object ClaudeLogin {

    fun login(project: Project) = openTerminal(project, "login")

    /**
     * Выход тоже уводим в терминал. Своими руками стирать авторизацию панель не
     * должна: способов входа несколько, и знает о них только сам CLI.
     */
    fun logout(project: Project) = openTerminal(project, "logout")

    private fun openTerminal(project: Project, verb: String) {
        ApplicationManager.getApplication().invokeLater {
            runCatching {
                val widget = TerminalToolWindowManager.getInstance(project)
                    .createShellWidget(project.basePath, "claude $verb", true, true)

                widget.sendCommandToExecute(command(verb))
            }.onFailure {
                thisLogger().warn("Failed to open a terminal for claude auth $verb", it)
            }
        }
    }

    /**
     * Полный путь, а не голое имя: терминал берёт PATH из своей оболочки, и если
     * claude поставлен установщиком в ~/.local/bin, имени может не хватить.
     */
    private fun command(verb: String): String {
        val executable = ClaudeExecutable.find()?.absolutePath ?: "claude"
        val quoted = if (executable.contains(' ')) "\"$executable\"" else executable

        return "$quoted auth $verb"
    }
}

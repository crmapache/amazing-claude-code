package io.github.crmapache.amazingclaudecode.claude

import com.intellij.util.EnvironmentUtil
import java.io.File

/**
 * Поиск исполняемого файла Claude Code.
 *
 * Просто взять PATH из окружения процесса на macOS нельзя: приложение, запущенное
 * из Dock или Toolbox, получает урезанный PATH без пользовательских папок. Поэтому
 * берём окружение так, как его видит login shell, — это же делает встроенный
 * терминал IDE.
 */
internal object ClaudeExecutable {

    /** Пути, куда кладут себя официальные установщики, если в PATH ничего нет. */
    private val fallbackPaths = listOf(
        "~/.local/bin/claude",
        "/opt/homebrew/bin/claude",
        "/usr/local/bin/claude",
    )

    fun find(): File? = fromPath() ?: fromFallbacks()

    fun environment(): Map<String, String> = EnvironmentUtil.getEnvironmentMap()

    private fun fromPath(): File? {
        val path = EnvironmentUtil.getValue("PATH") ?: return null

        return path.split(File.pathSeparatorChar)
            .asSequence()
            .filter { it.isNotBlank() }
            .map { File(it, executableName()) }
            .firstOrNull { it.isFile && it.canExecute() }
    }

    private fun fromFallbacks(): File? = fallbackPaths
        .asSequence()
        .map { File(expandHome(it)) }
        .firstOrNull { it.isFile && it.canExecute() }

    private fun executableName(): String =
        if (System.getProperty("os.name").startsWith("Windows")) "claude.exe" else "claude"

    private fun expandHome(path: String): String =
        if (path.startsWith("~/")) System.getProperty("user.home") + path.removePrefix("~") else path
}

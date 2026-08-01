package io.github.crmapache.amazingclaudecode.claude

import com.intellij.openapi.diagnostic.thisLogger
import com.intellij.util.EnvironmentUtil
import java.io.File
import java.util.concurrent.ConcurrentHashMap
import java.util.concurrent.TimeUnit

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

    /**
     * Знает ли найденный CLI такой ключ запуска.
     *
     * Спрашиваем у самого файла, а не сверяемся с номером версии: у людей стоят
     * разные сборки, а неизвестный ключ CLI не игнорирует — он падает на разборе
     * аргументов, и вместо панели человек получил бы мёртвую вкладку.
     *
     * Ответ держим в памяти: `--help` стоит десятые доли секунды, но спрашивать
     * его на каждый запуск разговора незачем. Ключ кеша учитывает и время правки
     * файла — обновление CLI на месте не должно оставлять нас со старым ответом.
     */
    fun supportsFlag(executable: File, flag: String): Boolean =
        supportedFlags.getOrPut("${executable.absolutePath}|${executable.lastModified()}|$flag") {
            runCatching {
                val process = ProcessBuilder(executable.absolutePath, "--help")
                    .redirectErrorStream(true)
                    .start()

                val help = process.inputStream.bufferedReader().use { it.readText() }
                process.waitFor(HELP_TIMEOUT_SECONDS, TimeUnit.SECONDS)
                help.contains(flag)
            }.getOrElse {
                thisLogger().warn("Failed to ask claude about $flag", it)
                false
            }
        }

    private val supportedFlags = ConcurrentHashMap<String, Boolean>()

    private const val HELP_TIMEOUT_SECONDS = 10L

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

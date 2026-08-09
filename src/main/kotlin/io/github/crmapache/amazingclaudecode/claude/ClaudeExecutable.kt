package io.github.crmapache.amazingclaudecode.claude

import com.intellij.execution.configurations.GeneralCommandLine
import com.intellij.execution.process.CapturingProcessHandler
import com.intellij.openapi.diagnostic.thisLogger
import com.intellij.util.EnvironmentUtil
import java.io.File
import java.util.concurrent.ConcurrentHashMap

/**
 * Поиск исполняемого файла Claude Code.
 *
 * Просто взять PATH из окружения процесса на macOS нельзя: приложение, запущенное
 * из Dock или Toolbox, получает урезанный PATH без пользовательских папок. Поэтому
 * берём окружение так, как его видит login shell, — это же делает встроенный
 * терминал IDE.
 *
 * Но и этого не всегда хватает: CLI ставят по-разному (нативный установщик, npm,
 * bun, volta, scoop), имя файла на Windows тоже разное, а PATH у оболочки IDE
 * может не совпадать с PATH терминала. Поэтому порядок такой: указанный руками
 * путь, PATH, типовые места установки — а если и там пусто, спрашиваем саму
 * систему (`where` / `command -v` в пользовательской оболочке), которая знает
 * про установки, о которых мы не догадались.
 *
 * Сам перебор путей живёт в [ClaudeLookup] — там его видно тестом, без чужой
 * машины под рукой.
 */
internal object ClaudeExecutable {

    private val windows: Boolean get() = System.getProperty("os.name").startsWith("Windows", ignoreCase = true)

    fun find(): File? = fromCandidates() ?: fromSystem()

    /** Где искали — для экрана «Claude Code не найден»: по списку сразу видно, почему промахнулись. */
    fun searchedPlaces(): List<String> = candidates()

    /** Что ответила сама система на вопрос «где claude» — вторая половина того же экрана. */
    fun systemAnswer(): String = askSystem() ?: "${lookupCommand().joinToString(" ")}: не нашла"

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
            capture(listOf(executable.absolutePath, "--help"), HELP_TIMEOUT_MS)?.contains(flag) ?: false
        }

    private val supportedFlags = ConcurrentHashMap<String, Boolean>()

    private const val HELP_TIMEOUT_MS = 10_000
    private const val LOOKUP_TIMEOUT_MS = 5_000

    /**
     * Разовый запуск с настоящим пределом ожидания.
     *
     * Читать вывод в своём же потоке нельзя: чтение до конца ждёт, пока дочерний
     * процесс закроет поток, и предел, поставленный после чтения, не наступает
     * никогда. Достаточно login-профиля, который ждёт ввода или медленного
     * сетевого диска, — и поток, спросивший «где claude», не возвращается вовсе,
     * а панель навсегда остаётся в состоянии загрузки. Поэтому вывод собирает
     * платформенный обработчик: он читает потоки отдельно от нас и по истечении
     * срока сам убивает процесс.
     */
    private fun capture(command: List<String>, timeoutMs: Int): String? = runCatching {
        val commandLine = GeneralCommandLine(command)
            .withCharset(Charsets.UTF_8)
            .withRedirectErrorStream(true)

        val output = CapturingProcessHandler(commandLine).runProcess(timeoutMs)

        if (output.isTimeout) {
            thisLogger().warn("${command.joinToString(" ")} timed out after ${timeoutMs}ms")
            null
        } else {
            output.stdout
        }
    }.getOrElse {
        thisLogger().info("${command.joinToString(" ")} failed: ${it.message}")
        null
    }

    private fun candidates(): List<String> = ClaudeLookup.candidates(
        windows = windows,
        home = System.getProperty("user.home").orEmpty(),
        env = environment(),
        configured = ClaudePreferences.executablePath,
        separator = File.pathSeparatorChar,
    )

    private fun fromCandidates(): File? = candidates()
        .asSequence()
        .map(::File)
        .firstOrNull { it.isFile && it.canExecute() }

    /**
     * Последнее слово — за системой: у неё спрашивают то же самое, что человек
     * набрал бы в терминале. Так находятся установки в местах, которых нет в
     * нашем списке: nvm, scoop, winget, чужой корпоративный образ.
     *
     * На Unix — через login-оболочку: IDE, запущенная из Dock, видит PATH без
     * пользовательских папок, а оболочка читает профиль и видит настоящий.
     */
    private fun fromSystem(): File? {
        val path = askSystem() ?: return null
        val file = File(path)
        return if (file.isFile && file.canExecute()) file else null
    }

    private fun lookupCommand(): List<String> =
        if (windows) listOf("cmd.exe", "/c", "where claude") else listOf("/bin/sh", "-lc", "command -v claude")

    /** Ответ кешируем: это запуск процесса, а спрашивают об этом на каждом экране входа. */
    @Volatile
    private var systemPath: String? = null

    private fun askSystem(): String? {
        systemPath?.let { return it }

        // `where` печатает все совпадения — берём первое рабочее.
        val answer = capture(lookupCommand(), LOOKUP_TIMEOUT_MS)
            ?.lineSequence()
            ?.map { it.trim() }
            ?.firstOrNull { it.isNotEmpty() && File(it).isFile }

        systemPath = answer
        return answer
    }
}

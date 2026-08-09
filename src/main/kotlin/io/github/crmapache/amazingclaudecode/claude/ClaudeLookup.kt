package io.github.crmapache.amazingclaudecode.claude

/**
 * Где искать исполняемый файл Claude Code — вся логика поиска, но без единого
 * обращения к настоящей файловой системе, окружению и текущей ОС.
 *
 * Вынесено отдельно ровно за этим: поиск ломается там, куда разработчику не
 * дотянуться — чужая Windows, необычное место установки, PATH, который у IDE не
 * такой, как в терминале. Проверить догадку «а найдётся ли claude.cmd из npm»,
 * не имея этой машины, можно только так: подставить её окружение сюда и
 * посмотреть глазами теста.
 */
internal object ClaudeLookup {

    /** Имена файла: на Windows их несколько, и какое из них лежит — зависит от установщика. */
    fun executableNames(windows: Boolean): List<String> =
        if (windows) listOf("claude.exe", "claude.cmd", "claude.bat", "claude") else listOf("claude")

    /**
     * Типовые места установки — на случай, когда в PATH пусто.
     *
     * Список не выдуман: нативный установщик кладёт файл в `~/.local/bin`,
     * прежний «локальный» способ — прямо в `~/.claude/local`, npm на Windows
     * пишет обёртку в `%APPDATA%\npm`, а bun и volta держат свои bin-каталоги.
     */
    fun fallbackPaths(windows: Boolean, home: String, env: Map<String, String>): List<String> {
        if (windows) {
            val appData = env["APPDATA"].orEmpty()
            val localAppData = env["LOCALAPPDATA"].orEmpty()

            return listOfNotNull(
                "$home\\.local\\bin\\claude.exe",
                "$home\\.claude\\local\\claude.exe",
                appData.takeIf { it.isNotBlank() }?.let { "$it\\npm\\claude.cmd" },
                localAppData.takeIf { it.isNotBlank() }?.let { "$it\\Programs\\claude\\claude.exe" },
                localAppData.takeIf { it.isNotBlank() }?.let { "$it\\claude\\claude.exe" },
                "$home\\AppData\\Roaming\\npm\\claude.cmd",
                "$home\\.bun\\bin\\claude.exe",
                "$home\\scoop\\shims\\claude.exe",
            )
        }

        return listOf(
            "$home/.local/bin/claude",
            "$home/.claude/local/claude",
            "/opt/homebrew/bin/claude",
            "/usr/local/bin/claude",
            "/usr/bin/claude",
            "$home/.bun/bin/claude",
            "$home/.volta/bin/claude",
            "$home/.npm-global/bin/claude",
        )
    }

    /**
     * Значение PATH. На Windows переменная зовётся `Path`, а карта окружения
     * там регистронезависима не всегда — спрашиваем оба написания.
     */
    fun pathValue(env: Map<String, String>): String? =
        env["PATH"] ?: env["Path"] ?: env["path"]

    /**
     * Куда смотреть по порядку: сначала указанное человеком, затем PATH, затем
     * типовые места. Возвращает пути-кандидаты — существуют они или нет,
     * решает тот, кто вызывает (см. [ClaudeExecutable]).
     */
    fun candidates(
        windows: Boolean,
        home: String,
        env: Map<String, String>,
        configured: String,
        separator: Char,
    ): List<String> {
        val names = executableNames(windows)
        val slash = if (windows) '\\' else '/'
        val result = mutableListOf<String>()

        val manual = expandHome(configured.trim(), home)
        if (manual.isNotEmpty()) {
            // Принимаем и сам файл, и папку с ним: человек с равной вероятностью
            // скопирует и то, и другое.
            result += manual
            result += names.map { "$manual$slash$it" }
        }

        pathValue(env)
            ?.split(separator)
            ?.filter { it.isNotBlank() }
            ?.forEach { directory -> names.forEach { result += "${directory.trimEnd(slash)}$slash$it" } }

        result += fallbackPaths(windows, home, env)

        return result.distinct()
    }

    fun expandHome(path: String, home: String): String =
        if (path.startsWith("~/") || path.startsWith("~\\")) home + path.drop(1) else path
}

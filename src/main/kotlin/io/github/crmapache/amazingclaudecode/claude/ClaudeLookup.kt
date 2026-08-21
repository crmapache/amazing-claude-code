package io.github.crmapache.amazingclaudecode.claude

/**
 * Where to look for the Claude Code executable - the whole search, with not a single touch of the real
 * file system, environment or current OS.
 *
 * Kept apart for exactly that reason: the search breaks where a developer cannot reach - someone
 * else's Windows, an unusual install location, a PATH the IDE sees differently from the terminal.
 * Checking a hunch like "would claude.cmd from npm be found" without owning that machine is only
 * possible this way: feed its environment in here and look at it through a test.
 */
internal object ClaudeLookup {

    /** File names: on Windows there are several, and which one is there depends on the installer. */
    fun executableNames(windows: Boolean): List<String> =
        if (windows) listOf("claude.exe", "claude.cmd", "claude.bat", "claude") else listOf("claude")

    /**
     * The usual install locations - for when PATH holds nothing.
     *
     * The list is not invented: the native installer puts the file into `~/.local/bin`, the former
     * "local" method straight into `~/.claude/local`, npm on Windows writes a wrapper into
     * `%APPDATA%\npm`, and bun and volta keep bin directories of their own.
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
     * The value of PATH. On Windows the variable is called `Path`, and the environment map there is not
     * always case-insensitive - so we ask for both spellings.
     */
    fun pathValue(env: Map<String, String>): String? =
        env["PATH"] ?: env["Path"] ?: env["path"]

    /**
     * Where to look, in order: first what the person pointed at, then PATH, then the usual locations.
     * Returns candidate paths - whether they exist is for the caller to decide (see
     * [ClaudeExecutable]).
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
            // Both the file itself and the folder holding it are accepted: a person is just as likely
            // to copy one as the other.
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

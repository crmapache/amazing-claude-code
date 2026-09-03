package io.github.crmapache.amazingclaudecode.claude

import java.io.File

/**
 * Which machine the plugin is running on, and where Claude Code keeps its own files there.
 *
 * Both questions are asked from several places at once - the executable lookup, the shell behind the
 * "!" mode, the settings layers, the conversation history - and every one of them used to answer it
 * for itself. Three copies of the same `os.name` test and two copies of the config directory rule are
 * three and two chances to drift: a config directory read one way here and another way there points
 * the panel at a folder the CLI never writes to, and the history looks empty next to a terminal full
 * of conversations.
 *
 * "There" means this machine. A project's CLI does not always run on it - a project opened out of WSL
 * has its CLI inside the distribution - so whoever reads the CLI's files for a project asks
 * [ClaudeHome], which answers with these two directories for a project on this machine and with the
 * distribution's for one inside WSL.
 */
internal object HostOs {

    private val name: String get() = System.getProperty("os.name").orEmpty()

    val isWindows: Boolean get() = name.startsWith("Windows", ignoreCase = true)

    val isMac: Boolean get() = name.startsWith("Mac")

    /**
     * The user's own Claude Code directory on this machine - the one a CLI running here reads its
     * settings from and writes its conversations into. For a project's CLI, wherever it runs, ask
     * [ClaudeHome].
     *
     * Moves with an environment variable, exactly as it does for the CLI: a person who pointed their
     * CLI elsewhere expects the panel to look there too, not into an empty `~/.claude`.
     */
    fun configDirectory(): File =
        System.getenv("CLAUDE_CONFIG_DIR")?.takeIf { it.isNotBlank() }?.let(::File)
            ?: File(System.getProperty("user.home"), ".claude")

    /**
     * Where an organization's policy settings live. Fixed per system and not movable: that is the
     * point of them - a rule an administrator sets is not something a user's environment can redirect.
     */
    fun managedSettingsDirectory(): File = when {
        isMac -> File("/Library/Application Support/ClaudeCode")
        isWindows -> File("C:\\Program Files\\ClaudeCode")
        else -> File("/etc/claude-code")
    }
}

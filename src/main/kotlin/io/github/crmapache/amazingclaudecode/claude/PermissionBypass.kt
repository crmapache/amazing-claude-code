package io.github.crmapache.amazingclaudecode.claude

import java.io.File

/**
 * Whether this computer has the "no questions" mode available at all.
 *
 * The CLI decides it by exactly two things: whether the switch is allowed by a launch flag, and
 * whether the mode is forbidden by settings (`permissions.disableBypassPermissionsMode`). The panel
 * has to know the answer up front, because the Shift+Tab cycle depends on it: a forbidden mode the
 * cycle must step over silently, rather than walk the person into a refusal from the agent.
 *
 * The third reason - the mode being switched off on Anthropic's side - cannot be learned from outside
 * at all. It arrives as a refusal of the mode change, and the panel remembers that itself (see
 * refusedModes in the feed's state).
 */
internal object PermissionBypass {

    fun isAvailable(projectDirectory: String?): Boolean {
        val executable = ClaudeExecutable.find() ?: return false

        return isAvailable(
            cliKnowsFlag = ClaudeExecutable.supportsFlag(executable, ClaudeLaunch.ALLOW_BYPASS_FLAG),
            settings = settingsFiles(projectDirectory),
        )
    }

    fun isAvailable(cliKnowsFlag: Boolean, settings: List<File>): Boolean =
        cliKnowsFlag && settings.none(::disables)

    /**
     * Whether the mode is forbidden by settings - without questioning the CLI itself.
     *
     * Apart from [isAvailable] because that one starts a process (`--help`), while the question about
     * the ban has to be asked where there is no right to do so: settings are parsed on the interface
     * thread, while the panel is still opening (see [PermissionDefaultMode]).
     */
    fun allowedBySettings(projectDirectory: String?): Boolean =
        settingsFiles(projectDirectory).none(::disables)

    /**
     * The same files the CLI itself reads: the organization's policy, the person's own settings and
     * the project's. The value `disable` cannot be undone - the field has no opposite value at all -
     * so the order of the layers changes nothing here, and finding the ban in any one of them is
     * enough.
     */
    fun settingsFiles(projectDirectory: String?): List<File> =
        ClaudeSettings.sources(projectDirectory).map { it.file }

    private fun disables(file: File): Boolean =
        ClaudeSettings.permission(file, DISABLE_BYPASS) == "disable"

    private const val DISABLE_BYPASS = "disableBypassPermissionsMode"
}

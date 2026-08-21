package io.github.crmapache.amazingclaudecode.claude

/**
 * The permission mode a freshly opened panel starts a conversation in.
 *
 * Taken from where the terminal Claude Code takes it - `permissions.defaultMode` in the settings (see
 * [ClaudeSettings]). Otherwise the panel and the terminal on one machine begin differently: a person
 * once chose their default, the terminal obeys it, and the panel silently opened in "Ask".
 *
 * The rules repeat the CLI's, and neither is nitpicking:
 *
 * - `auto` is accepted only from an organization's policy and from personal settings. A project's
 *   settings live inside the repository, and the mode where a classifier decides the questions could
 *   have been put there by anyone with write access.
 * - `bypassPermissions` is not accepted when the mode is forbidden by settings: the CLI would throw
 *   such a default away anyway, and the panel would be left showing a mode the conversation does not
 *   have.
 *
 * An unfamiliar name (a foreign build, a typo) is thrown away too: the CLI would simply not start.
 */
internal object PermissionDefaultMode {

    fun of(projectDirectory: String?): String = of(
        sources = ClaudeSettings.sources(projectDirectory),
        // Settings only: asking the CLI here is out of the question - that is starting a process, and
        // the default is needed for the panel's very first frame.
        bypassAllowed = PermissionBypass.allowedBySettings(projectDirectory),
    )

    fun of(sources: List<ClaudeSettings.Source>, bypassAllowed: Boolean): String {
        val (layer, mode) = sources
            .firstNotNullOfOrNull { source ->
                ClaudeSettings.permission(source.file, DEFAULT_MODE)
                    .takeIf { it.isNotEmpty() }
                    ?.let { source.layer to PermissionModes.normalize(it) }
            }
            ?: return PermissionModes.ASK

        return when {
            mode !in PermissionModes.KNOWN -> PermissionModes.ASK
            mode == PermissionModes.AUTO && layer !in TRUSTED_WITH_AUTO -> PermissionModes.ASK
            mode == PermissionModes.BYPASS && !bypassAllowed -> PermissionModes.ASK
            else -> mode
        }
    }

    /** Who the CLI trusts about `auto` - everything that does not live in the repository. */
    private val TRUSTED_WITH_AUTO = setOf(ClaudeSettings.Layer.POLICY, ClaudeSettings.Layer.USER)

    private const val DEFAULT_MODE = "defaultMode"
}

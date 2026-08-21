package io.github.crmapache.amazingclaudecode.claude

/**
 * The names of the permission modes.
 *
 * The panel used to call the "ask before every action" mode `default` - that is what the CLI called it
 * too. The current launch flag knows it as `manual`, and has no value `default` at all.
 *
 * On that basis the flag simply was not passed for it: if the "normal" mode is the default anyway, why
 * bother. But the CLI's default is its own - `permissions.defaultMode` from the user's personal
 * config. Anyone who had `bypassPermissions` there silently got the loosest mode after picking the
 * strictest one in the panel: the panel showed "Ask", the process came up without a single question,
 * and after the first turn the selector fell back to "Bypass". So the mode is now always passed, under
 * the name the CLI understands.
 */
internal object PermissionModes {

    /** What this mode is called in the launch flag and in control requests. */
    const val ASK = "manual"

    const val ACCEPT_EDITS = "acceptEdits"
    const val PLAN = "plan"
    const val AUTO = "auto"
    const val DONT_ASK = "dontAsk"
    const val BYPASS = "bypassPermissions"

    /** What the panel used to call it - it still turns up in saved settings. */
    private const val LEGACY_ASK = "default"

    /**
     * Every mode of the current CLI. A name it does not know (from someone else's settings or from an
     * old conversation) the panel neither shows nor passes on: the CLI would simply refuse to start.
     */
    val KNOWN = setOf(ASK, ACCEPT_EDITS, PLAN, AUTO, DONT_ASK, BYPASS)

    /** Brings any name arriving from outside to the one we use. */
    fun normalize(mode: String): String = if (mode == LEGACY_ASK) ASK else mode

    /**
     * The mode for a conversation: the one picked in the panel, or [fallback] if nothing was ever
     * picked there.
     *
     * Empty used to mean "the strictest": the panel raised conversations in "Ask" whatever stood in
     * the Claude Code settings. That guarded against the opposite - a silent `bypassPermissions` from
     * a personal config - but it also parted ways with the terminal for everyone who had configured a
     * different default: in the terminal a conversation began in it, in the panel in "Ask".
     *
     * Now empty settings mean "however Claude Code is configured", and the default is read by
     * [PermissionDefaultMode] - by the same rules the CLI applies it. That still leaves the selector
     * no room to lie: the panel shows exactly the value the process will come up with.
     */
    fun resolve(stored: String, fallback: String = ASK): String =
        if (stored.isEmpty()) fallback else normalize(stored)
}

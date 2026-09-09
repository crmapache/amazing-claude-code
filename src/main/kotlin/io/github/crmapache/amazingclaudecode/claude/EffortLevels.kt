package io.github.crmapache.amazingclaudecode.claude

/**
 * The names of the reasoning effort, as the CLI spells them.
 *
 * Two of the seven are not levels at all: `auto` asks for the model's own default, and `ultracode` is
 * the CLI's own name for "xhigh plus standing orchestration" (see ClaudeSession.effortSettings). Both
 * travel through this list like the rest - what the panel offers and what the flag accepts are the same
 * set of words.
 *
 * A list rather than trust, because the value leaves as a launch argument (`--effort`), and an argument
 * holding a space, a quote or a line feed is cut short by a shell nobody asked for - silently, taking
 * the rest of the command line with it (see ClaudeLaunch).
 */
internal object EffortLevels {

    val KNOWN = setOf("auto", "low", "medium", "high", "xhigh", "max", "ultracode")

    /** The name if it is one of ours, and an empty string - "nothing chosen" - if it is not. */
    fun normalize(effort: String): String = effort.trim().takeIf { it in KNOWN }.orEmpty()
}

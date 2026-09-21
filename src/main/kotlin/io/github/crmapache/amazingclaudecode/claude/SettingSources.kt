package io.github.crmapache.amazingclaudecode.claude

import com.intellij.ide.util.PropertiesComponent
import com.intellij.openapi.project.Project

/**
 * Which of Claude Code's settings layers a conversation in this project is started with.
 *
 * Claude Code merges four layers and the repository's two outrank the person's own: an organization's
 * policy, then `.claude/settings.local.json`, then `.claude/settings.json`, and only then
 * `~/.claude/settings.json`. That order is right for permissions and hooks - a repository knows better
 * what may be run inside it - and wrong for one thing in particular: `env`. A checked-in
 * `ANTHROPIC_BASE_URL` or `ANTHROPIC_API_KEY` replaces the sign-in the person made on this machine,
 * and there is nothing on this side to say so.
 *
 * Measured rather than reasoned about, in a directory holding nothing but a project settings file with
 * a dead address in `env`: the CLI took the address, and `claude -p` sat silent for a minute with no
 * answer and no error until it was killed. From the panel that is indistinguishable from thinking -
 * which is exactly how the feedback this was built for described it.
 *
 * So the choice is offered here, in the CLI's own terms: [FLAG] takes the layers to load, and what is
 * left out is not read at all. The stored value IS the flag's argument, so there is one vocabulary
 * rather than ours and the CLI's side by side.
 *
 * Two things this deliberately does NOT do:
 *
 *  - **It does not single out `env`.** Leaving a layer out drops the repository's permissions, hooks
 *    and MCP servers with it, and the screen says so. Reading a layer for some of its fields and not
 *    for others would be a fourth merge order that only this panel knows - and a conversation behaving
 *    unlike the same project in a terminal is worse than one behaving unlike the person expected.
 *  - **It does not touch the policy layer.** An organization's managed settings apply whatever is
 *    chosen here, exactly as they do in the CLI, which accepts no `policy` in this flag at all.
 *
 * Per project rather than per machine, unlike everything in [ClaudePreferences]: "this repository
 * configures a gateway I do not want" is a fact about the repository. Machine-wide it would silence
 * the project settings of every other checkout on the machine, none of which asked for it.
 */
internal object SettingSources {

    /** The CLI's own name for "load exactly these layers". */
    const val FLAG = "--setting-sources"

    /**
     * Everything, which is what the CLI does when the flag is absent - and then it IS absent: a panel
     * that has never been asked must launch the CLI byte-identically to how it launched before this
     * setting existed.
     */
    const val ALL = ""

    /** The repository's shared settings, but not the untracked local ones beside them. */
    const val WITHOUT_LOCAL = "user,project"

    /** Only what this machine's owner wrote. The answer for a checked-in gateway. */
    const val USER_ONLY = "user"

    /** In the order the screen offers them: from the CLI's own behaviour to the narrowest. */
    val CHOICES = listOf(ALL, WITHOUT_LOCAL, USER_ONLY)

    /**
     * The value as it may be stored - anything else means [ALL].
     *
     * A closed list rather than a filter over the three words, because the value travels to the CLI as
     * a launch argument. A stored string is written by a message from the panel, and a message can say
     * anything; an argument the CLI does not understand is not waved through - it refuses to start, and
     * the conversation is dead with no panel of its own to explain why.
     */
    fun normalize(value: String): String = value.trim().takeIf { it in CHOICES } ?: ALL

    /** What the flag is given, or null when the CLI is to be left alone. */
    fun flagValue(value: String): String? = normalize(value).takeIf { it.isNotEmpty() }

    /**
     * Which layers the panel itself may read, for the questions it answers out of the settings before
     * any process exists (the permission mode a tab starts in, and whether the "no questions" mode is
     * forbidden - see [PermissionDefaultMode]).
     *
     * This half is not tidiness: those answers are shown in the selector under the input field, and the
     * conversation is started with the flag. Read one way and launched another, the panel would name a
     * mode the process does not come up in - the one thing the selector exists not to do.
     */
    fun layers(value: String): Set<ClaudeSettings.Layer> = when (normalize(value)) {
        USER_ONLY -> setOf(ClaudeSettings.Layer.POLICY, ClaudeSettings.Layer.USER)
        WITHOUT_LOCAL -> setOf(ClaudeSettings.Layer.POLICY, ClaudeSettings.Layer.USER, ClaudeSettings.Layer.PROJECT)
        else -> ClaudeSettings.Layer.entries.toSet()
    }

    /** Whether the repository's own layers are read at all - what the clash warning hangs on. */
    fun readsRepository(value: String): Boolean =
        layers(value).any { it == ClaudeSettings.Layer.PROJECT || it == ClaudeSettings.Layer.LOCAL }

    fun of(project: Project): String = normalize(PropertiesComponent.getInstance(project).getValue(KEY).orEmpty())

    fun remember(project: Project, value: String) {
        // Empty clears the key rather than writing an empty string into it: "as Claude Code does it" and
        // "nobody has ever opened this screen" are the same answer, and they should look the same on disk.
        PropertiesComponent.getInstance(project).setValue(KEY, normalize(value).ifEmpty { null })
    }

    private const val KEY = "acc.settingSources"
}

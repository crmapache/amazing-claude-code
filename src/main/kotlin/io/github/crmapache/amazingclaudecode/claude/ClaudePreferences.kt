package io.github.crmapache.amazingclaudecode.claude

import com.intellij.ide.util.PropertiesComponent

/**
 * The chosen model, effort and permission mode.
 *
 * They live in the IDE's settings rather than in the panel's memory: the choice is made once, and
 * repeating it in every new tab - let alone after an editor restart - serves nothing. The storage is
 * shared across projects: a model is chosen to suit oneself, not the repository.
 */
internal object ClaudePreferences {

    data class Snapshot(
        val model: String,
        val effort: String,
        val mode: String,
        val composerLayout: String,
        val improveInstructions: String,
    )

    fun snapshot(): Snapshot = Snapshot(
        model = model,
        effort = effort,
        mode = mode,
        composerLayout = composerLayout,
        improveInstructions = improveInstructions,
    )

    var model: String
        get() = read(MODEL_KEY)
        set(value) = write(MODEL_KEY, value)

    var effort: String
        get() = read(EFFORT_KEY)
        set(value) = write(EFFORT_KEY, value)

    var mode: String
        get() = read(MODE_KEY)
        set(value) = write(MODE_KEY, value)

    /**
     * Where the input field sits: 'left' | 'bottom' | 'right' | 'compact'. Empty means a panel opened
     * for the first time, which behaves as it used to.
     */
    var composerLayout: String
        get() = read(COMPOSER_LAYOUT_KEY)
        set(value) = write(COMPOSER_LAYOUT_KEY, value)

    /**
     * What the improve button asks for, in the person's own words. Empty means the built-in text (see
     * PromptImprover.BUILT_IN_INSTRUCTIONS), which is also what the screen shows while it is empty - a
     * setting whose default is invisible is a setting nobody edits.
     *
     * Machine-wide like the model and the mode above it: what a good prompt looks like is a habit of the
     * person, not a property of the repository.
     */
    var improveInstructions: String
        get() = read(IMPROVE_INSTRUCTIONS_KEY)
        set(value) = write(IMPROVE_INSTRUCTIONS_KEY, value.trim())

    /**
     * The path to the executable, given by hand. Empty means we look for it ourselves (see
     * [ClaudeExecutable]). Needed where the automatic search misses: an unusual install location, an
     * IDE shell whose PATH is not the terminal's.
     */
    var executablePath: String
        get() = read(EXECUTABLE_KEY)
        set(value) = write(EXECUTABLE_KEY, value)

    /**
     * Sounds switched off by hand. What is stored is what is off rather than what is on: by default
     * everything sounds, and an empty setting means "as intended" rather than "the person cleared every
     * checkbox". Otherwise a sound added in the next version would arrive switched off for everyone who
     * had ever opened this list.
     */
    var mutedSounds: Set<String>
        get() = read(MUTED_SOUNDS_KEY).split(',').map { it.trim() }.filter { it.isNotEmpty() }.toSet()
        set(value) = write(MUTED_SOUNDS_KEY, value.joinToString(","))

    /**
     * Each sound's volume in per cent. Only those differing from full are written down: a sound not
     * named here plays as it is.
     *
     * Kept apart from [mutedSounds] on purpose - clearing a checkbox must not wipe a configured volume:
     * turning the sound back on, a person expects their previous per cent rather than a hundred.
     */
    var soundVolumes: Map<String, Int>
        get() = read(SOUND_VOLUMES_KEY)
            .split(',')
            .mapNotNull { entry ->
                val (id, value) = entry.split('=', limit = 2).takeIf { it.size == 2 } ?: return@mapNotNull null
                val volume = value.trim().toIntOrNull()?.coerceIn(0, 100) ?: return@mapNotNull null
                id.trim().takeIf { it.isNotEmpty() }?.let { it to volume }
            }
            .toMap()
        set(value) = write(SOUND_VOLUMES_KEY, value.entries.joinToString(",") { "${it.key}=${it.value}" })

    /**
     * Whether this IDE may be reached from outside at all.
     *
     * Off unless it has been turned on, and it stays that way: a channel that can send a message to the
     * agent is a channel that can run commands on this machine, and nobody should acquire one by
     * installing a plugin. It is a scalar, so it lives here beside the model and the mode rather than
     * in a component of its own; what is not a scalar - the paired devices - is in RemoteState.
     */
    var remoteEnabled: Boolean
        get() = read(REMOTE_ENABLED_KEY) == "true"
        set(value) = write(REMOTE_ENABLED_KEY, if (value) "true" else "")

    /**
     * Which relay to use. Empty means the public one. Being able to change it is the other half of
     * publishing the relay's source: reading the code of a server you are obliged to use is only half
     * an answer.
     */
    var remoteRelayUrl: String
        get() = read(REMOTE_RELAY_KEY)
        set(value) = write(REMOTE_RELAY_KEY, value.trim())

    /**
     * The address a person left on the feedback screen last time, so they need not type it again.
     *
     * Kept in the ordinary settings rather than in the password safe: it is what somebody chose to give
     * out in order to be answered, not a secret. It is theirs alone - nothing is ever sent to it from
     * here, and it travels only inside a message they pressed Send on.
     */
    var feedbackEmail: String
        get() = read(FEEDBACK_EMAIL_KEY)
        set(value) = write(FEEDBACK_EMAIL_KEY, value.trim())

    private fun read(key: String): String = PropertiesComponent.getInstance().getValue(key).orEmpty()

    private fun write(key: String, value: String) {
        // An empty value means "as Claude Code has it by default": then the flag is not passed at
        // launch at all.
        PropertiesComponent.getInstance().setValue(key, value.ifEmpty { null })
    }

    private const val MODEL_KEY = "acc.model"
    private const val EFFORT_KEY = "acc.effort"
    private const val MODE_KEY = "acc.mode"
    private const val COMPOSER_LAYOUT_KEY = "acc.composerLayout"
    private const val IMPROVE_INSTRUCTIONS_KEY = "acc.improve.instructions"
    private const val EXECUTABLE_KEY = "acc.executable"
    private const val MUTED_SOUNDS_KEY = "acc.sounds.muted"
    private const val SOUND_VOLUMES_KEY = "acc.sounds.volumes"
    private const val REMOTE_ENABLED_KEY = "acc.remote.enabled"
    private const val REMOTE_RELAY_KEY = "acc.remote.relayUrl"
    private const val FEEDBACK_EMAIL_KEY = "acc.feedback.email"
}

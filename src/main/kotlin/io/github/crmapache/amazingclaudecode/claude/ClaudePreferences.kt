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
    )

    fun snapshot(): Snapshot = Snapshot(
        model = model,
        effort = effort,
        mode = mode,
        composerLayout = composerLayout,
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
    private const val EXECUTABLE_KEY = "acc.executable"
    private const val MUTED_SOUNDS_KEY = "acc.sounds.muted"
    private const val SOUND_VOLUMES_KEY = "acc.sounds.volumes"
}

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
        val pasteCollapse: String,
        val sendKey: String,
        val improveInstructions: String,
        val language: String,
    )

    fun snapshot(): Snapshot = Snapshot(
        model = model,
        effort = effort,
        mode = mode,
        composerLayout = composerLayout,
        pasteCollapse = pasteCollapse,
        sendKey = sendKey,
        improveInstructions = improveInstructions,
        language = language,
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
     * From how many lines a pasted text folds into a chip in the input field: "0" never folds it, a
     * number folds a paste of that many lines and longer. Empty means the panel's own default (see
     * pasteCollapseLines in feed/reference.ts) - the same shape as composerLayout above, and for the same
     * reason: the panel has to behave sensibly before the IDE has said anything at all, the harness
     * included.
     *
     * Machine-wide, beside the rest: whether one wants to see a pasted log whole is a habit of the
     * person rather than a property of the repository.
     */
    var pasteCollapse: String
        get() = read(PASTE_COLLAPSE_KEY)
        set(value) = write(PASTE_COLLAPSE_KEY, value.trim())

    /**
     * Which key sends a message out of the input field: "modEnter" for Cmd/Ctrl+Enter, anything else -
     * an empty value included - for Enter, which is what the panel did before the setting existed (see
     * normalizeSendKey in sendKey.ts).
     *
     * Machine-wide beside the layout and the paste above, and for the same reason: which key sends is a
     * habit of the person's hands, not a property of the repository.
     */
    var sendKey: String
        get() = read(SEND_KEY_KEY)
        set(value) = write(SEND_KEY_KEY, value.trim())

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
     * The language the panel speaks. Empty means "whatever the IDE speaks" (see [IdeLanguage]).
     *
     * Empty rather than "en" as the default, and that is the whole point of the setting: somebody
     * working in a Chinese IDE should be spoken to in Chinese without first having to discover that a
     * switch exists. An explicit choice always wins over the IDE's, including an explicit English.
     *
     * Machine-wide beside the model and the mode above: a language is a property of the person, not of
     * the repository, and choosing it once per project would be choosing it forever.
     */
    var language: String
        get() = read(LANGUAGE_KEY)
        set(value) = write(LANGUAGE_KEY, value.trim())

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

    /**
     * Whether the microphone button and its hotkeys exist at all.
     *
     * Off until it is turned on, like remote access above and for a smaller version of the same reason:
     * it needs a key of somebody's own, it listens to a microphone, and neither should arrive with an
     * installed plugin. Off also means no listener on the IDE's event queue - see VoiceHotkeys.
     */
    var voiceEnabled: Boolean
        get() = read(VOICE_ENABLED_KEY) == "true"
        set(value) = write(VOICE_ENABLED_KEY, if (value) "true" else "")

    /** Which language dictation listens in - a nova-3 code, or `multi`. See VoiceLanguages. */
    var voiceLanguage: String
        get() = read(VOICE_LANGUAGE_KEY)
        set(value) = write(VOICE_LANGUAGE_KEY, value.trim())

    /**
     * The input device by its mixer name. Empty means whatever the system calls the default, which is
     * what almost everybody wants and what follows a headset being plugged in.
     */
    var voiceDevice: String
        get() = read(VOICE_DEVICE_KEY)
        set(value) = write(VOICE_DEVICE_KEY, value.trim())

    /**
     * The four bindings, written the way HotkeyBinding writes them.
     *
     * Four rather than two because the keyboard and the mouse are independent triggers of the same two
     * modes: somebody with a side button on their mouse wants it for push-to-talk without giving up the
     * chord, and a release from one device must not stop what the other started.
     */
    var voicePushHotkey: String
        get() = read(VOICE_PUSH_KEY)
        set(value) = write(VOICE_PUSH_KEY, value.trim())

    var voiceHoldHotkey: String
        get() = read(VOICE_HOLD_KEY)
        set(value) = write(VOICE_HOLD_KEY, value.trim())

    var voicePushMouse: String
        get() = read(VOICE_PUSH_MOUSE_KEY)
        set(value) = write(VOICE_PUSH_MOUSE_KEY, value.trim())

    var voiceHoldMouse: String
        get() = read(VOICE_HOLD_MOUSE_KEY)
        set(value) = write(VOICE_HOLD_MOUSE_KEY, value.trim())

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
    private const val PASTE_COLLAPSE_KEY = "acc.pasteCollapse"
    private const val SEND_KEY_KEY = "acc.sendKey"
    private const val IMPROVE_INSTRUCTIONS_KEY = "acc.improve.instructions"
    private const val LANGUAGE_KEY = "acc.language"
    private const val EXECUTABLE_KEY = "acc.executable"
    private const val MUTED_SOUNDS_KEY = "acc.sounds.muted"
    private const val SOUND_VOLUMES_KEY = "acc.sounds.volumes"
    private const val REMOTE_ENABLED_KEY = "acc.remote.enabled"
    private const val REMOTE_RELAY_KEY = "acc.remote.relayUrl"
    private const val FEEDBACK_EMAIL_KEY = "acc.feedback.email"
    private const val VOICE_ENABLED_KEY = "acc.voice.enabled"
    private const val VOICE_LANGUAGE_KEY = "acc.voice.language"
    private const val VOICE_DEVICE_KEY = "acc.voice.device"
    private const val VOICE_PUSH_KEY = "acc.voice.push"
    private const val VOICE_HOLD_KEY = "acc.voice.hold"
    private const val VOICE_PUSH_MOUSE_KEY = "acc.voice.pushMouse"
    private const val VOICE_HOLD_MOUSE_KEY = "acc.voice.holdMouse"
}

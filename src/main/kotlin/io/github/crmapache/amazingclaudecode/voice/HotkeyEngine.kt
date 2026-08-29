package io.github.crmapache.amazingclaudecode.voice

import java.awt.event.KeyEvent

/**
 * The state machine behind the dictation hotkeys: which presses start it, which end it, and which are
 * neither.
 *
 * Deliberately free of AWT and of the panel - it is handed plain numbers and answers with three verbs.
 * That separation is the point: this is the piece that goes subtly wrong (a chord half let go, an
 * auto-repeat read as a second press, a keyboard release stopping what the mouse started) and the only
 * way to be sure of it is a test that presses a hundred keys in a row. [VoiceHotkeys] is the thin adapter
 * that feeds it real events.
 *
 * Two modes, and the difference is what a press means the second time:
 *
 * - [Mode.PUSH_TO_TALK] - held. It records while the chord is down and stops the moment any part of it
 *   is let go, like a walkie-talkie.
 * - [Mode.HOLD_TALK] - toggled. One press starts it, the next press stops it, and the hands are free in
 *   between. This is the one for a long thought.
 *
 * Each mode takes two bindings, a chord and a mouse button, and they are independent triggers of the
 * same thing: a release from the keyboard must not stop what a mouse button started, or the record
 * would end on an unrelated key going up.
 */
internal class HotkeyEngine(private val handlers: Handlers) {

    enum class Mode { PUSH_TO_TALK, HOLD_TALK }

    /** Which device is holding the current push - only the one that began it may end it. */
    private enum class Source { KEYBOARD, MOUSE }

    interface Handlers {
        fun start(mode: Mode)
        fun stop(mode: Mode)
        /** Escape while recording: throw the dictation away rather than put it in the field. */
        fun cancel()

        /**
         * Whether a dictation is running this instant.
         *
         * Asked rather than remembered, because this engine only ever hears about beginnings. A dictation
         * can refuse to start - no key pasted yet - and it can end on its own, on the two-minute ceiling
         * or on a network that gave way, and none of that is a key event. A toggle that believed itself
         * to be recording when it was not swallowed every Escape in the IDE from then on, and there was
         * no way back but restarting.
         */
        fun running(): Boolean
    }

    data class Bindings(
        val push: HotkeyBinding.Keys? = null,
        val hold: HotkeyBinding.Keys? = null,
        val pushMouse: HotkeyBinding.Mouse? = null,
        val holdMouse: HotkeyBinding.Mouse? = null,
    )

    private var bindings = Bindings()

    /**
     * Every key physically down right now, by code and side.
     *
     * Kept as a set rather than derived from each event's own flags because auto-repeat is only
     * detectable against it: a second press of a key already in here is the keyboard repeating itself,
     * not a person pressing twice.
     */
    private val down = mutableSetOf<Int>()
    private val mouseDown = mutableSetOf<Int>()

    private var pushVia: Source? = null
    private var holdVia: Source? = null

    fun bind(next: Bindings) {
        // Only a real change. A binding changed under a running dictation would leave it with no way to
        // be stopped - the chord it is waiting for no longer exists - but the settings are re-read on
        // every panel that opens and after every setting anybody touches, and cutting a sentence in half
        // because a second project's window came up is not what that protection was for.
        if (next == bindings) return

        bindings = next
        releaseEverything()
    }

    /** Whether anything is bound at all - a listener with nothing to listen for need not run. */
    fun idle(): Boolean = bindings == Bindings()

    /**
     * A key went down. Returns true when the event was ours and must go no further: the chord that
     * starts dictation must not also fire whatever the IDE's keymap has on it.
     */
    fun keyDown(code: Int, location: Int, ctrl: Boolean, alt: Boolean, shift: Boolean, meta: Boolean): Boolean {
        val slot = slotOf(code, location)
        // Auto-repeat. The keyboard says the same thing thirty times a second while a key is held, and
        // for a toggle that would be start, stop, start, stop for as long as the finger is down.
        val repeat = !down.add(slot)

        // Thrown away rather than stopped: the two mean opposite things to whoever is waiting for the
        // words, and saying both would put the dictation into the field and then take it back.
        //
        // What is held stays held. The keys are physically down and Escape does not lift them, so
        // forgetting them here made the very next auto-repeat look like a fresh press and started the
        // dictation that had just been thrown away all over again. There is nothing to forget anyway:
        // [recording] asks whether one is running rather than trusting what is written down here.
        if (code == KeyEvent.VK_ESCAPE && recording()) {
            handlers.cancel()
            return true
        }

        if (repeat) return holdsAnything(code)

        // The flags describe the keyboard including this very key, so a bare-modifier binding would
        // never match itself: pressing the right Option arrives as "Option, with Option held".
        val wanted = Chord(code, location, ctrl, alt, shift, meta).withoutSelf()

        if (pushVia == null && bindings.push?.let { wanted.matches(it) } == true) return press(Source.KEYBOARD)

        if (bindings.hold?.let { wanted.matches(it) } == true) {
            toggle(Source.KEYBOARD)
            return true
        }

        return false
    }

    /** A key came up. Only push-to-talk cares: a toggle is ended by the next press, not by this one. */
    fun keyUp(code: Int, location: Int): Boolean {
        down.remove(slotOf(code, location))

        if (pushVia == Source.KEYBOARD && bindings.push?.let { partOf(code, it) } == true) return release()

        return holdsAnything(code)
    }

    fun mouseDown(button: Int): Boolean {
        if (!mouseDown.add(button)) return false

        if (pushVia == null && bindings.pushMouse?.button == button) return press(Source.MOUSE)

        if (bindings.holdMouse?.button == button) {
            toggle(Source.MOUSE)
            return true
        }

        return false
    }

    fun mouseUp(button: Int): Boolean {
        mouseDown.remove(button)

        if (pushVia == Source.MOUSE && bindings.pushMouse?.button == button) return release()

        return false
    }

    /**
     * The window stopped receiving events - the person switched to another application mid-chord.
     *
     * Push-to-talk ends here, and it has to: the release will happen in somebody else's window and we
     * will never hear it, so a dictation left running would run until the ceiling in [VoiceDictation].
     * A toggle is deliberately left alone - hands free is what it is for, and walking to another window
     * while still talking is a thing people do on purpose.
     */
    fun windowLostFocus() {
        down.clear()
        mouseDown.clear()

        if (pushVia != null) {
            pushVia = null
            handlers.stop(Mode.PUSH_TO_TALK)
        }
    }

    /**
     * The two halves of push-to-talk, and the toggle below them.
     *
     * Written once rather than once for the keyboard and once for the mouse. What differs between the two
     * is only how a press is recognised - a chord matched against its binding, or a button number - and
     * everything after that is the same three lines. This is the part of the engine its own documentation
     * calls the one that goes subtly wrong, and four near-copies of three lines is how that happens.
     */
    private fun press(via: Source): Boolean {
        pushVia = via
        handlers.start(Mode.PUSH_TO_TALK)
        return true
    }

    private fun release(): Boolean {
        pushVia = null
        handlers.stop(Mode.PUSH_TO_TALK)
        return true
    }

    /**
     * One press of the toggle: the second one ends what the first began.
     *
     * Which of the two this is comes from the dictation itself and not only from [holdVia]. A press that
     * started nothing - the key was never pasted, the feature is off - used to leave the toggle believing
     * it was recording, and from then on the next press stopped a dictation that had never existed while
     * every Escape in the editor disappeared into it.
     */
    private fun toggle(via: Source) {
        if (holdVia != null && handlers.running()) {
            holdVia = null
            handlers.stop(Mode.HOLD_TALK)
            return
        }

        // Written down straight away rather than after checking that it took: starting is not immediate -
        // the key comes out of the keychain and the device takes its time - so there is nothing true to
        // read back yet. What makes the note safe is that it is never believed on its own.
        holdVia = via
        handlers.start(Mode.HOLD_TALK)
    }

    private fun recording(): Boolean = (pushVia != null || holdVia != null) && handlers.running()

    /**
     * Whether this key is part of a chord that is holding a dictation right now.
     *
     * Asked to decide whether to swallow an auto-repeat or a release: while the chord is doing its job,
     * its keys belong to us and have no business reaching the editor underneath.
     */
    private fun holdsAnything(code: Int): Boolean {
        if (pushVia == Source.KEYBOARD && bindings.push?.let { partOf(code, it) } == true) return true

        // The toggle counts as much as the push does. Looking only at the latter meant a hold chord held
        // for a second fired whatever the keymap has on it dozens of times over the dictation it had
        // just started - the exact thing this is here to prevent.
        return holdVia == Source.KEYBOARD && bindings.hold?.let { partOf(code, it) } == true
    }

    private fun releaseEverything() {
        down.clear()
        mouseDown.clear()

        val mode = when {
            pushVia != null -> Mode.PUSH_TO_TALK
            holdVia != null -> Mode.HOLD_TALK
            else -> null
        }

        pushVia = null
        holdVia = null
        mode?.let { handlers.stop(it) }
    }

    /** The key and the side as one number, so that the left Option and the right one are two entries. */
    private fun slotOf(code: Int, location: Int): Int = code * LOCATIONS + location

    /**
     * Whether letting this key go breaks the chord.
     *
     * Its own key or any of its modifiers: releasing Shift out of Ctrl+Shift+D ends the chord as surely
     * as releasing D does, and going on recording after it would leave the person holding what they
     * think is nothing.
     */
    private fun partOf(code: Int, binding: HotkeyBinding.Keys): Boolean = when (code) {
        binding.code -> true
        KeyEvent.VK_CONTROL -> binding.ctrl
        KeyEvent.VK_ALT -> binding.alt
        KeyEvent.VK_SHIFT -> binding.shift
        KeyEvent.VK_META -> binding.meta
        else -> false
    }

    private data class Chord(
        val code: Int,
        val location: Int,
        val ctrl: Boolean,
        val alt: Boolean,
        val shift: Boolean,
        val meta: Boolean,
    ) {

        /** The event's flags minus the key itself - see [keyDown]. */
        fun withoutSelf(): Chord = when (code) {
            KeyEvent.VK_CONTROL -> copy(ctrl = false)
            KeyEvent.VK_ALT -> copy(alt = false)
            KeyEvent.VK_SHIFT -> copy(shift = false)
            KeyEvent.VK_META -> copy(meta = false)
            else -> this
        }

        /**
         * The side counts only when the binding names one. A modifier is bound as left or right and has
         * to match exactly; a letter arrives as "standard" from every keyboard and would never match a
         * side if we asked it to.
         */
        fun matches(binding: HotkeyBinding.Keys): Boolean {
            if (code != binding.code) return false
            if (ctrl != binding.ctrl || alt != binding.alt || shift != binding.shift || meta != binding.meta) {
                return false
            }

            val sided =
                binding.location == KeyEvent.KEY_LOCATION_LEFT || binding.location == KeyEvent.KEY_LOCATION_RIGHT

            return !sided || location == binding.location
        }
    }

    private companion object {
        /** How many key locations AWT has - enough to make [slotOf] collision-free. */
        const val LOCATIONS = 8
    }
}

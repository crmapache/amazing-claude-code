package io.github.crmapache.amazingclaudecode.voice

import java.awt.event.KeyEvent
import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertFalse
import kotlin.test.assertTrue

/**
 * The hotkeys, pressed a hundred ways.
 *
 * This is the part of voice input that cannot be checked by hand: a chord half let go, an auto-repeat
 * arriving thirty times a second, a mouse button released while the keyboard holds the same dictation.
 * Every one of them is a bug that shows up as "it stopped recording for no reason" weeks later, so they
 * are pinned here instead.
 */
class HotkeyEngineTest {

    private val calls = mutableListOf<String>()

    /** Whether a dictation is running, as the real one would answer - see Handlers.running. */
    private var live = false

    /** The dictation refuses to start: no key pasted yet, or the feature switched off. */
    private var refuses = false

    private val engine = HotkeyEngine(object : HotkeyEngine.Handlers {
        override fun start(mode: HotkeyEngine.Mode) {
            calls.add("start:${short(mode)}")
            if (!refuses) live = true
        }

        override fun stop(mode: HotkeyEngine.Mode) {
            calls.add("stop:${short(mode)}")
            live = false
        }

        override fun cancel() {
            calls.add("cancel")
            live = false
        }

        override fun running(): Boolean = live
    })

    private fun short(mode: HotkeyEngine.Mode) = if (mode == HotkeyEngine.Mode.PUSH_TO_TALK) "push" else "hold"

    /** Ctrl+Shift+D, the ordinary kind of chord. */
    private val chord = HotkeyBinding.Keys(
        code = KeyEvent.VK_D,
        location = KeyEvent.KEY_LOCATION_STANDARD,
        ctrl = true,
        shift = true,
    )

    /** The right Option held down - a binding that collides with nothing in the keymap. */
    private val rightAlt = HotkeyBinding.Keys(code = KeyEvent.VK_ALT, location = KeyEvent.KEY_LOCATION_RIGHT)

    private fun pressChord() = engine.keyDown(KeyEvent.VK_D, KeyEvent.KEY_LOCATION_STANDARD, ctrl = true, alt = false, shift = true, meta = false)

    private fun releaseChord() = engine.keyUp(KeyEvent.VK_D, KeyEvent.KEY_LOCATION_STANDARD)

    private fun pressRightAlt() = engine.keyDown(KeyEvent.VK_ALT, KeyEvent.KEY_LOCATION_RIGHT, ctrl = false, alt = true, shift = false, meta = false)

    private fun releaseRightAlt() = engine.keyUp(KeyEvent.VK_ALT, KeyEvent.KEY_LOCATION_RIGHT)

    @Test
    fun `push to talk records while the chord is held`() {
        engine.bind(HotkeyEngine.Bindings(push = chord))

        pressChord()
        releaseChord()

        assertEquals(listOf("start:push", "stop:push"), calls)
    }

    /**
     * The keyboard repeats a held key thirty times a second. Read as presses, that is fifteen dictations
     * a second - and for the toggle below, start and stop until the finger comes up.
     */
    @Test
    fun `a held key repeating itself is still one press`() {
        engine.bind(HotkeyEngine.Bindings(push = chord))

        pressChord()
        repeat(20) { pressChord() }
        releaseChord()

        assertEquals(listOf("start:push", "stop:push"), calls)
    }

    /**
     * Letting go of Shift out of Ctrl+Shift+D is letting go of the chord: what is left in the hand is
     * not the hotkey, and going on recording would leave somebody holding what they think is nothing.
     */
    @Test
    fun `releasing a modifier ends the chord as surely as the key does`() {
        engine.bind(HotkeyEngine.Bindings(push = chord))

        pressChord()
        engine.keyUp(KeyEvent.VK_SHIFT, KeyEvent.KEY_LOCATION_LEFT)

        assertEquals(listOf("start:push", "stop:push"), calls)
    }

    /**
     * A bare modifier has to match itself, and the event says the modifier is down while reporting the
     * modifier being pressed - so without discounting the key from its own flags this would never fire.
     */
    @Test
    fun `a bare modifier is a binding of its own`() {
        engine.bind(HotkeyEngine.Bindings(push = rightAlt))

        pressRightAlt()
        releaseRightAlt()

        assertEquals(listOf("start:push", "stop:push"), calls)
    }

    /** The side is the whole point of binding a modifier: the left one is a different key. */
    @Test
    fun `the other side of the keyboard is not the binding`() {
        engine.bind(HotkeyEngine.Bindings(push = rightAlt))

        engine.keyDown(KeyEvent.VK_ALT, KeyEvent.KEY_LOCATION_LEFT, ctrl = false, alt = true, shift = false, meta = false)

        assertEquals(emptyList(), calls)
    }

    @Test
    fun `hold talk is a toggle - one press starts it and the next stops it`() {
        engine.bind(HotkeyEngine.Bindings(hold = chord))

        pressChord()
        releaseChord()

        assertEquals(listOf("start:hold"), calls)

        pressChord()
        releaseChord()

        assertEquals(listOf("start:hold", "stop:hold"), calls)
    }

    @Test
    fun `a mouse button drives push to talk on its own`() {
        engine.bind(HotkeyEngine.Bindings(pushMouse = HotkeyBinding.Mouse(4)))

        engine.mouseDown(4)
        engine.mouseUp(4)

        assertEquals(listOf("start:push", "stop:push"), calls)
    }

    /**
     * The keyboard and the mouse are independent triggers of the same mode: only whoever began a
     * dictation may end it, or an unrelated key going up would cut off what a thumb is holding.
     */
    @Test
    fun `a keyboard release does not stop what the mouse started`() {
        engine.bind(HotkeyEngine.Bindings(push = chord, pushMouse = HotkeyBinding.Mouse(4)))

        engine.mouseDown(4)
        releaseChord()

        assertEquals(listOf("start:push"), calls)

        engine.mouseUp(4)

        assertEquals(listOf("start:push", "stop:push"), calls)
    }

    @Test
    fun `escape throws a running dictation away`() {
        engine.bind(HotkeyEngine.Bindings(push = chord))

        pressChord()
        engine.keyDown(KeyEvent.VK_ESCAPE, KeyEvent.KEY_LOCATION_STANDARD, ctrl = false, alt = false, shift = false, meta = false)

        assertEquals(listOf("start:push", "cancel"), calls)
    }

    /** With nothing recording, Escape belongs to whatever else is on screen. */
    @Test
    fun `escape while idle is not ours`() {
        engine.bind(HotkeyEngine.Bindings(push = chord))

        assertFalse(engine.keyDown(KeyEvent.VK_ESCAPE, KeyEvent.KEY_LOCATION_STANDARD, ctrl = false, alt = false, shift = false, meta = false))
        assertEquals(emptyList(), calls)
    }

    /**
     * The release will happen in somebody else's window and never reach us, so push-to-talk ends here.
     * A toggle is deliberately left running - hands free is what it is for.
     */
    @Test
    fun `leaving the IDE ends a held dictation and leaves a toggled one`() {
        engine.bind(HotkeyEngine.Bindings(push = chord))
        pressChord()
        engine.windowLostFocus()

        assertEquals(listOf("start:push", "stop:push"), calls)

        calls.clear()
        engine.bind(HotkeyEngine.Bindings(hold = rightAlt))
        pressRightAlt()
        releaseRightAlt()
        calls.clear()

        engine.windowLostFocus()

        assertEquals(emptyList(), calls)
    }

    /**
     * The chord that starts a dictation must not also fire whatever the keymap has on it - five seconds
     * of holding Ctrl+Shift+D would otherwise be five seconds of dictation and somebody's action too.
     */
    @Test
    fun `a press that starts a dictation is swallowed`() {
        engine.bind(HotkeyEngine.Bindings(push = chord))

        assertTrue(pressChord())
        assertTrue(releaseChord())
    }

    @Test
    fun `a key that is nobody's hotkey travels on`() {
        engine.bind(HotkeyEngine.Bindings(push = chord))

        assertFalse(engine.keyDown(KeyEvent.VK_K, KeyEvent.KEY_LOCATION_STANDARD, ctrl = true, alt = false, shift = false, meta = false))
        assertFalse(engine.keyUp(KeyEvent.VK_K, KeyEvent.KEY_LOCATION_STANDARD))
    }

    /** Rebinding under a running dictation would leave it with no chord left to stop it. */
    @Test
    fun `changing the bindings stops what is running`() {
        engine.bind(HotkeyEngine.Bindings(push = chord))
        pressChord()

        engine.bind(HotkeyEngine.Bindings(push = rightAlt))

        assertEquals(listOf("start:push", "stop:push"), calls)
    }

    /**
     * The keys are still physically down when Escape arrives, and the keyboard goes on repeating them.
     * Read as a fresh press, the very next repeat started the dictation that had just been thrown away.
     */
    @Test
    fun `escape does not let the held chord start over`() {
        engine.bind(HotkeyEngine.Bindings(push = chord))

        pressChord()
        engine.keyDown(KeyEvent.VK_ESCAPE, KeyEvent.KEY_LOCATION_STANDARD, ctrl = false, alt = false, shift = false, meta = false)
        calls.clear()

        repeat(10) { assertTrue(pressChord()) }

        assertEquals(emptyList(), calls)
    }

    /** Once it has been thrown away there is nothing left to throw away: Escape belongs to the editor. */
    @Test
    fun `a second escape after a cancelled dictation is not ours`() {
        engine.bind(HotkeyEngine.Bindings(push = chord))

        pressChord()
        engine.keyDown(KeyEvent.VK_ESCAPE, KeyEvent.KEY_LOCATION_STANDARD, ctrl = false, alt = false, shift = false, meta = false)

        assertFalse(engine.keyDown(KeyEvent.VK_ESCAPE, KeyEvent.KEY_LOCATION_STANDARD, ctrl = false, alt = false, shift = false, meta = false))
    }

    /**
     * A toggle that never started is the trap: it used to leave the engine believing it was recording,
     * and from then on every Escape in the IDE disappeared into a dictation that did not exist.
     */
    @Test
    fun `a toggle that refused to start does not swallow escape`() {
        engine.bind(HotkeyEngine.Bindings(hold = chord))
        refuses = true

        pressChord()
        releaseChord()

        assertEquals(listOf("start:hold"), calls)
        assertFalse(engine.keyDown(KeyEvent.VK_ESCAPE, KeyEvent.KEY_LOCATION_STANDARD, ctrl = false, alt = false, shift = false, meta = false))
    }

    /** And the next press is another attempt at starting, not a stop of something imaginary. */
    @Test
    fun `a toggle that refused to start tries again on the next press`() {
        engine.bind(HotkeyEngine.Bindings(hold = chord))
        refuses = true

        pressChord()
        releaseChord()
        pressChord()

        assertEquals(listOf("start:hold", "start:hold"), calls)
    }

    /** A dictation that ended on its own - the ceiling, a network that gave way - is over for us too. */
    @Test
    fun `a toggle that ended by itself starts again rather than stopping`() {
        engine.bind(HotkeyEngine.Bindings(hold = chord))

        pressChord()
        releaseChord()
        calls.clear()

        live = false
        pressChord()

        assertEquals(listOf("start:hold"), calls)
    }

    /**
     * Held for a second, a toggle's chord repeats thirty times. Every one of those used to travel on and
     * fire whatever the keymap has on it, on top of the dictation it had just started.
     */
    @Test
    fun `the repeats of a toggle's chord are swallowed too`() {
        engine.bind(HotkeyEngine.Bindings(hold = chord))

        assertTrue(pressChord())
        repeat(10) { assertTrue(pressChord()) }
        assertTrue(releaseChord())

        assertEquals(listOf("start:hold"), calls)
    }

    /** The settings are re-read whenever anything at all changes, and most times nothing has. */
    @Test
    fun `binding the same thing again leaves a running dictation alone`() {
        engine.bind(HotkeyEngine.Bindings(push = chord))
        pressChord()
        calls.clear()

        engine.bind(HotkeyEngine.Bindings(push = chord))

        assertEquals(emptyList(), calls)
    }

    @Test
    fun `nothing bound means nothing to listen for`() {
        assertTrue(engine.idle())

        engine.bind(HotkeyEngine.Bindings(hold = chord))

        assertFalse(engine.idle())
    }
}

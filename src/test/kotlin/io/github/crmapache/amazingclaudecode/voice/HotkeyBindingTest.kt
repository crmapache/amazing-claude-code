package io.github.crmapache.amazingclaudecode.voice

import java.awt.event.KeyEvent
import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertNull

/**
 * A binding survives the round trip through the settings file, and a settings file edited by hand
 * cannot turn into a hotkey nobody can press.
 */
class HotkeyBindingTest {

    @Test
    fun `a chord comes back as it went in`() {
        val chord = HotkeyBinding.Keys(
            code = KeyEvent.VK_D,
            location = KeyEvent.KEY_LOCATION_STANDARD,
            ctrl = true,
            shift = true,
        )

        assertEquals(chord, HotkeyBinding.parse(HotkeyBinding.write(chord)))
    }

    /** The side is what makes a bare modifier a binding at all - losing it would bind both of them. */
    @Test
    fun `the side of the keyboard survives`() {
        val right = HotkeyBinding.Keys(KeyEvent.VK_ALT, KeyEvent.KEY_LOCATION_RIGHT)

        assertEquals(right, HotkeyBinding.parse(HotkeyBinding.write(right)))
    }

    @Test
    fun `a mouse button comes back as it went in`() {
        val button = HotkeyBinding.Mouse(4)

        assertEquals(button, HotkeyBinding.parse(HotkeyBinding.write(button)))
    }

    @Test
    fun `nothing bound is written as nothing`() {
        assertEquals("", HotkeyBinding.write(null))
        assertNull(HotkeyBinding.parse(""))
    }

    /**
     * The panel draws a binding key by key, so the keys have to come out in the order a hand takes them
     * and none of them may go missing: a chord short of a modifier is a chord nobody can press.
     */
    @Test
    fun `a chord comes apart into the keys it is pressed with`() {
        val caps = HotkeyBinding.Keys(
            code = KeyEvent.VK_D,
            location = KeyEvent.KEY_LOCATION_STANDARD,
            ctrl = true,
            shift = true,
        ).caps()

        assertEquals(listOf("Ctrl", "Shift", "D"), caps.map { it.text })
        // A letter exists once on a keyboard - saying "left D" would be noise.
        assertEquals(listOf("", "", ""), caps.map { it.side })
    }

    /** A bare modifier is one key, and which one of the pair it is is the whole of the binding. */
    @Test
    fun `a bare modifier is one key with a side to it`() {
        val caps = HotkeyBinding.Keys(KeyEvent.VK_ALT, KeyEvent.KEY_LOCATION_RIGHT).caps()

        assertEquals(1, caps.size)
        assertEquals("right", caps.single().side)
    }

    /** The number alone: the row it is drawn in already says MOUSE, and the drawing says it again. */
    @Test
    fun `a mouse button is one key with its number on it`() {
        assertEquals(
            listOf(HotkeyCap(glyph = HotkeyCap.MOUSE, text = "4")),
            HotkeyBinding.Mouse(4).caps(),
        )
    }

    /**
     * Anything unreadable counts as "nothing is bound" rather than as some other key: a hotkey invented
     * out of a typo would fire on a press nobody could guess at.
     */
    @Test
    fun `a line that makes no sense binds nothing`() {
        assertNull(HotkeyBinding.parse("k:not-a-number:0:0:0:0:0"))
        assertNull(HotkeyBinding.parse("k:68:0"))
        assertNull(HotkeyBinding.parse("mouse-4"))
        assertNull(HotkeyBinding.parse("m:0"))
        assertNull(HotkeyBinding.parse("m:99"))
    }
}

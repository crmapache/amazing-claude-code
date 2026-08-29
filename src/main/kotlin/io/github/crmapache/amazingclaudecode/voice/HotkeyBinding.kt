package io.github.crmapache.amazingclaudecode.voice

import com.intellij.openapi.util.SystemInfo
import java.awt.event.KeyEvent

/**
 * What a person presses to start dictating: a chord on the keyboard, or a button on the mouse.
 *
 * Two shapes rather than one, and the difference is not cosmetic. A chord is assembled - it is held
 * down in pieces and let go in pieces, which is the whole of push-to-talk - while a mouse button is
 * whole from the first instant. Folding them together would mean one of them pretending to have
 * modifiers it can never carry.
 *
 * The side of the keyboard is part of a chord ([Keys.location]) because of what it makes possible: a
 * binding of one bare modifier. "Hold the right Option" collides with nothing in the IDE's keymap - a
 * modifier on its own activates no action anywhere - which makes it the only kind of chord that is
 * safe to hold down for ten seconds in the middle of an editor. It is also what Wispr Flow and
 * Superwhisper bind by default, so it is what a hand already knows.
 */
internal sealed interface HotkeyBinding {

    /**
     * A key with its modifiers. [code] is `KeyEvent.VK_*`; for a bare-modifier binding it is that
     * modifier's own code and every flag below is false - a modifier does not modify itself.
     */
    data class Keys(
        val code: Int,
        /** `KeyEvent.KEY_LOCATION_*`: what tells the right Option from the left one. */
        val location: Int,
        val ctrl: Boolean = false,
        val alt: Boolean = false,
        val shift: Boolean = false,
        val meta: Boolean = false,
    ) : HotkeyBinding

    /** A mouse button by its AWT number: 1 left, 2 middle, 3 right, 4 and 5 the side buttons. */
    data class Mouse(val button: Int) : HotkeyBinding

    companion object {

        /**
         * The binding as one line of settings.
         *
         * Written by hand rather than serialized, because the other end is `PropertiesComponent` - a
         * flat string map - and because a format that can be read in a settings file is one that can be
         * fixed there when something goes wrong with it.
         */
        fun write(binding: HotkeyBinding?): String = when (binding) {
            null -> ""
            is Mouse -> "m:${binding.button}"
            is Keys -> listOf(
                "k",
                binding.code,
                binding.location,
                flag(binding.ctrl),
                flag(binding.alt),
                flag(binding.shift),
                flag(binding.meta),
            ).joinToString(":")
        }

        /** The other direction. Anything unreadable counts as "nothing is bound", never as a wrong key. */
        fun parse(stored: String): HotkeyBinding? {
            val parts = stored.trim().split(':')

            return when {
                parts.size == 2 && parts[0] == "m" -> parts[1].toIntOrNull()
                    ?.takeIf { it in 1..MAX_MOUSE_BUTTON }
                    ?.let { Mouse(it) }

                parts.size == 7 && parts[0] == "k" -> {
                    val code = parts[1].toIntOrNull() ?: return null
                    val location = parts[2].toIntOrNull() ?: return null
                    Keys(
                        code = code,
                        location = location,
                        ctrl = parts[3] == "1",
                        alt = parts[4] == "1",
                        shift = parts[5] == "1",
                        meta = parts[6] == "1",
                    )
                }

                else -> null
            }
        }

        /**
         * The highest mouse button we will take.
         *
         * AWT counts as high as the driver reports, but a binding on button nine is a binding nobody can
         * check by pressing it, and a stray number in the settings would become a hotkey that fires on a
         * press that does not exist.
         */
        const val MAX_MOUSE_BUTTON: Int = 9

        private fun flag(value: Boolean) = if (value) "1" else "0"
    }
}

/**
 * One key of a binding, as the panel draws it: a sign, or a word.
 *
 * A binding used to travel as one string - "⌥F" - and that string is what the panel had to draw. It read
 * badly for a reason no styling could reach: ⌥ and ⌘ are not in the font the panel sets, so every sign
 * fell through to whatever the system had, in a size and weight of its own, in the middle of a line of
 * text. Split into keys, each of them is a cap the panel draws itself - the two signs as little drawings
 * of their own, everything else as the word printed on the key.
 *
 * Which of the two a modifier is stays here, because it is this machine's knowledge: a Mac prints ⌥ and
 * ⌘ on its keys and spells Ctrl and Shift out, Windows spells all three out and prints its own key, and
 * a Linux keyboard has Super. The panel is told what to draw, not which system it is on.
 */
internal data class HotkeyCap(
    /** A sign the panel has a drawing for: [OPTION], [COMMAND], [WINDOWS], [MOUSE]. Empty means [text]. */
    val glyph: String = "",
    /** The word on the key, in this platform's own spelling. Empty when the sign says everything. */
    val text: String = "",
    /**
     * Which side of the keyboard, and only for a binding that is one bare modifier - there the side *is*
     * the binding. A word rather than a sign, so the panel says it in its own language.
     */
    val side: String = "",
) {

    companion object {
        const val OPTION = "option"
        const val COMMAND = "command"
        const val WINDOWS = "win"
        const val MOUSE = "mouse"
    }
}

/**
 * The binding split into the keys it is pressed with, in the order a hand takes them.
 *
 * Assembled from the binding rather than parsed back out of a label: the label is one string with the
 * signs already chosen, and picking it apart again would mean agreeing twice on where one key ends and
 * the next begins - once here and once in a regular expression on the other side.
 */
internal fun HotkeyBinding.caps(): List<HotkeyCap> = when (this) {
    // The number alone, under the drawing of a mouse: the row it stands in is already labelled MOUSE.
    is HotkeyBinding.Mouse -> listOf(HotkeyCap(glyph = HotkeyCap.MOUSE, text = button.toString()))

    is HotkeyBinding.Keys -> buildList {
        if (ctrl) add(capOf(KeyEvent.VK_CONTROL))
        if (alt) add(capOf(KeyEvent.VK_ALT))
        if (shift) add(capOf(KeyEvent.VK_SHIFT))
        if (meta) add(capOf(KeyEvent.VK_META))
        add(capOf(code).copy(side = sideOf(code, location)))
    }
}

/**
 * One key, as a cap.
 *
 * The four modifiers are named here rather than left to `KeyEvent.getKeyText`, which answers in the IDE's
 * own language - a hotkey is not read, it is recognised, and "Alt" beside a drawing of ⌥ is two keyboards
 * at once. Everything else keeps the platform's own name, which is what is printed on the key itself.
 */
private fun capOf(code: Int): HotkeyCap = when (code) {
    KeyEvent.VK_CONTROL -> HotkeyCap(text = "Ctrl")
    KeyEvent.VK_SHIFT -> HotkeyCap(text = "Shift")

    // The two a Mac prints as signs and nothing else does. Elsewhere Alt is a word on the key itself.
    KeyEvent.VK_ALT -> if (SystemInfo.isMac) HotkeyCap(glyph = HotkeyCap.OPTION) else HotkeyCap(text = "Alt")

    KeyEvent.VK_META -> when {
        SystemInfo.isMac -> HotkeyCap(glyph = HotkeyCap.COMMAND)
        SystemInfo.isWindows -> HotkeyCap(glyph = HotkeyCap.WINDOWS)
        else -> HotkeyCap(text = "Super")
    }

    KeyEvent.VK_SPACE -> HotkeyCap(text = "Space")
    else -> HotkeyCap(text = KeyEvent.getKeyText(code))
}

/**
 * Which side of the keyboard, when that is part of the binding - the panel turns this into a word.
 *
 * Empty for everything else: a letter key exists once, and saying "left D" would be noise.
 */
private fun sideOf(code: Int, location: Int): String = when {
    !isModifierKey(code) -> ""
    location == KeyEvent.KEY_LOCATION_LEFT -> "left"
    location == KeyEvent.KEY_LOCATION_RIGHT -> "right"
    else -> ""
}

/** A key that only ever modifies another one - the four that can stand as a binding all by themselves. */
internal fun isModifierKey(code: Int): Boolean =
    code == KeyEvent.VK_CONTROL || code == KeyEvent.VK_ALT || code == KeyEvent.VK_SHIFT || code == KeyEvent.VK_META

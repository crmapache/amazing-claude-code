package io.github.crmapache.amazingclaudecode.toolwindow

import com.intellij.openapi.actionSystem.KeyboardShortcut
import com.intellij.openapi.actionSystem.Shortcut
import io.github.crmapache.amazingclaudecode.voice.HotkeyCap
import io.github.crmapache.amazingclaudecode.voice.caps
import java.io.File
import javax.swing.KeyStroke
import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertNull
import kotlin.test.assertTrue

/**
 * The panel's keys live in three places that nothing but this test holds together: the enum, the actions
 * in plugin.xml, and the commands the page understands (protocol.ts). An id in the enum with no action
 * behind it is a key that never fires; a command the page does not know is a key that fires into nothing.
 * The platform test cannot load plugin.xml at all (see ide-menus.md), so the file is read as text.
 */
class PanelKeysTest {

    private val pluginXml = File("src/main/resources/META-INF/plugin.xml").readText()

    /** The class plugin.xml names for an action id, or null when the id is not there. */
    private fun classOf(actionId: String): String? =
        Regex("""<action\s+id="${Regex.escape(actionId)}"\s+class="([^"]+)"""").find(pluginXml)?.groupValues?.get(1)

    @Test
    fun `every command is an action in plugin xml, of the class that sends that command`() {
        val expected = mapOf(
            PanelKeys.Command.NEXT_TAB to NextTabAction::class,
            PanelKeys.Command.PREVIOUS_TAB to PreviousTabAction::class,
            PanelKeys.Command.NEW_TAB to NewTabAction::class,
            PanelKeys.Command.CLOSE_TAB to CloseTabAction::class,
            PanelKeys.Command.REOPEN_TAB to ReopenTabAction::class,
            PanelKeys.Command.QUEUE to QueueMessageAction::class,
            PanelKeys.Command.TERMINAL to ContinueInTerminalAction::class,
        )

        assertEquals(PanelKeys.Command.entries.toSet(), expected.keys)
        for ((command, action) in expected) {
            assertEquals(action.qualifiedName, classOf(command.actionId), "plugin.xml for ${command.actionId}")
        }
    }

    /**
     * The tab keys are the IDE's own, by reference - that is the whole promise of "the keys that move between
     * editor tabs move between the panel's". A default of our own there would stop following the keymap.
     */
    @Test
    fun `the tab keys take the shortcuts of the IDE's own tab actions`() {
        val borrowed = mapOf(
            PanelKeys.Command.NEXT_TAB to "NextTab",
            PanelKeys.Command.PREVIOUS_TAB to "PreviousTab",
            PanelKeys.Command.CLOSE_TAB to "CloseContent",
        )

        for ((command, platform) in borrowed) {
            val declaration = pluginXml.substringAfter("""id="${command.actionId}"""").substringBefore("/>")
            assertTrue("""use-shortcut-of="$platform"""" in declaration, "${command.actionId} should use $platform's keys")
        }
    }

    @Test
    fun `the page knows every command by the same name`() {
        val protocol = File("webview/src/protocol.ts")
        assertTrue(protocol.exists(), "protocol.ts not found at ${protocol.absolutePath}")

        val union = protocol.readText().substringAfter("export type PanelKeyCommand =").substringBefore("\n")
        val named = Regex("'([a-zA-Z]+)'").findAll(union).map { it.groupValues[1] }.toSet()

        assertEquals(named, PanelKeys.Command.entries.map { it.wire }.toSet())
    }

    /** One key is drawn per command, and the one a person reads first in Keymap is the one to draw. */
    @Test
    fun `the shortcut shown is the first single keystroke`() {
        val chord = KeyboardShortcut(KeyStroke.getKeyStroke("control K"), KeyStroke.getKeyStroke("control W"))
        val single = KeyboardShortcut(KeyStroke.getKeyStroke("control F4"), null)
        val other = KeyboardShortcut(KeyStroke.getKeyStroke("alt W"), null)

        assertEquals(single, PanelKeys.shownShortcut(arrayOf<Shortcut>(chord, single, other)))
        // Only a chord of two strokes: better that than "Not set".
        assertEquals(chord, PanelKeys.shownShortcut(arrayOf<Shortcut>(chord)))
        assertNull(PanelKeys.shownShortcut(Shortcut.EMPTY_ARRAY))
    }

    /**
     * What is printed on the key rather than what AWT calls it: the previous tab on a Mac is Cmd+Shift+[, and
     * "Open Bracket" in a cap is a word where the eye looks for a bracket. The arrows are drawn.
     */
    @Test
    fun `a keystroke comes apart into the keys printed on the keyboard`() {
        assertEquals("[", KeyStroke.getKeyStroke("meta shift OPEN_BRACKET").caps().last().text)
        assertEquals(listOf("Ctrl", "F4"), KeyStroke.getKeyStroke("control F4").caps().map { it.text })
        assertEquals(HotkeyCap.RIGHT, KeyStroke.getKeyStroke("alt RIGHT").caps().last().glyph)
        assertEquals(3, KeyStroke.getKeyStroke("control shift T").caps().size)
    }
}

package io.github.crmapache.amazingclaudecode.editor

import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertFalse
import kotlin.test.assertTrue
import kotlinx.serialization.json.int
import kotlinx.serialization.json.jsonPrimitive

/**
 * The words the agent reads about the editor, and the shape the panel draws them in.
 *
 * The wording is held to exactly: the panel reads it back out of a past conversation's transcript
 * (see webview/src/feed/editorContext.ts), so a changed word here is a line under every old message gone.
 */
class EditorContextTest {

    private val selected = EditorContext.Snapshot(
        path = "src/app/Foo.kt",
        name = "Foo.kt",
        selection = EditorContext.Selection(startLine = 12, endLine = 14, text = "val a = 1\nval b = 2\nval c = 3"),
    )

    @Test
    fun `a selection is handed over with its lines and its text`() {
        assertEquals(
            "<system-reminder>\n" +
                "The user selected the lines 12 to 14 from src/app/Foo.kt:\n" +
                "val a = 1\nval b = 2\nval c = 3\n\n" +
                "This may or may not be related to the current task.\n" +
                "</system-reminder>",
            EditorContext.reminder(selected),
        )
    }

    @Test
    fun `a file with nothing selected is named and nothing more`() {
        assertEquals(
            "<system-reminder>\n" +
                "The user opened the file README.md in the IDE. This may or may not be related to the current task.\n" +
                "</system-reminder>",
            EditorContext.reminder(EditorContext.Snapshot("README.md", "README.md", selection = null)),
        )
    }

    /** Ctrl+A over a big file is a request to look at the file, not to paste it into every message. */
    @Test
    fun `a selection too long to carry is named by its lines for the agent to read`() {
        val reminder = EditorContext.reminder(
            selected.copy(selection = EditorContext.Selection(startLine = 1, endLine = 4000, text = null)),
        )

        assertTrue(reminder.contains("The user selected the lines 1 to 4000 from src/app/Foo.kt in the IDE - too long"))
        assertFalse(reminder.contains("val a"))
    }

    /** The panel's chip and card line: no selected text - the screen has no use for it. */
    @Test
    fun `the panel is told the file and the lines and not the text`() {
        val descriptor = EditorContext.descriptor(selected)

        assertEquals("src/app/Foo.kt", descriptor["path"]?.jsonPrimitive?.content)
        assertEquals("Foo.kt", descriptor["name"]?.jsonPrimitive?.content)
        assertEquals(12, descriptor["from"]?.jsonPrimitive?.int)
        assertEquals(14, descriptor["to"]?.jsonPrimitive?.int)
        assertEquals(setOf("path", "name", "from", "to"), descriptor.keys)
    }

    @Test
    fun `a file with nothing selected has no lines to show`() {
        val descriptor = EditorContext.descriptor(EditorContext.Snapshot("README.md", "README.md", selection = null))

        assertEquals(setOf("path", "name"), descriptor.keys)
    }
}

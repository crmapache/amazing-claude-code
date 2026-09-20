package io.github.crmapache.amazingclaudecode.scenario

import java.io.File
import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertTrue

/**
 * The book of conversations a run raised, which the history is drawn without.
 *
 * Everything here fails in the same quiet way: nothing on any screen says a conversation was left out,
 * so a book that hides too much looks exactly like a list of conversations somebody never had, and one
 * that hides too little looks exactly like the clutter this exists to remove.
 */
class ScenarioConversationsTest {

    private fun bookOn(file: File, past: List<String> = emptyList()) =
        ScenarioConversations(ScenarioFile(file)) { past }

    private fun tempFile(): File =
        File.createTempFile("conversations", ".json").also { it.delete() }

    /**
     * The book is new and the nights are not. Without this the change would hide tomorrow's runs and
     * leave every past one in the list - which is the complaint it was asked for, still on the screen.
     */
    @Test
    fun `a book that has never been written is filled from the runs`() {
        val file = tempFile()

        val book = bookOn(file, past = listOf("head-1", "card-1", "card-2"))

        assertEquals(setOf("head-1", "card-1", "card-2"), book.all())
        // And written down, so the runs are read once rather than on every look at the history.
        assertTrue(file.isFile)
        assertEquals(setOf("head-1", "card-1", "card-2"), bookOn(file, past = emptyList()).all())
    }

    /**
     * The history and the search ask this of every project they are opened over, and most of them have
     * never run a scenario at all: a file apiece for those is litter in a folder somebody may one day
     * have to look through.
     */
    @Test
    fun `a project that has never run a scenario is left without a file`() {
        val file = tempFile()

        assertEquals(emptySet(), bookOn(file).all())

        assertTrue(!file.exists())
    }

    @Test
    fun `a conversation learned while a run goes joins the book`() {
        val file = tempFile()
        val book = bookOn(file, past = listOf("head-1"))

        book.note("card-1")
        book.note("card-1")

        assertEquals(setOf("head-1", "card-1"), bookOn(file).all())
    }

    /**
     * The other door: the person carried the main thread on in a tab of their own and wrote into it. What
     * they write next is theirs, and theirs belongs in the list they look for their own work in.
     */
    @Test
    fun `a conversation the person took over leaves the book`() {
        val file = tempFile()
        val book = bookOn(file, past = listOf("head-1", "card-1"))

        book.release("head-1")

        assertEquals(setOf("card-1"), bookOn(file).all())
    }

    /**
     * A file that could not be read is not an empty book, and here the safe answer is the opposite of the
     * queue's: hide nothing. A row drawn by mistake is a line in a list; a person's conversation hidden by
     * mistake is their own work gone from the only place they look for it.
     */
    @Test
    fun `an unreadable book hides nothing and is not written over`() {
        val file = tempFile()
        file.writeText("")

        val book = bookOn(file, past = listOf("head-1"))

        assertEquals(emptySet(), book.all())
        book.note("card-1")
        assertEquals("", file.readText())
    }
}

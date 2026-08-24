package io.github.crmapache.amazingclaudecode.claude

import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertFalse
import kotlin.test.assertTrue

class SessionJournalTest {

    @Test
    fun `numbers run from one and never repeat`() {
        val journal = SessionJournal()

        val first = journal.append("""{"a":1}""", at = 10)
        val second = journal.append("""{"a":2}""", at = 20)

        assertEquals(1, first.seq)
        assertEquals(2, second.seq)
        assertEquals(2, journal.lastSeq())
    }

    @Test
    fun `the time of the entry is kept, not the time of reading`() {
        val journal = SessionJournal()

        assertEquals(1_700_000_000_000, journal.append("""{"a":1}""", at = 1_700_000_000_000).at)
    }

    @Test
    fun `a client is given only what it has not seen`() {
        val journal = SessionJournal()
        repeat(5) { journal.append("""{"n":$it}""", at = 0) }

        val tail = journal.since(3)

        assertEquals(listOf(4L, 5L), tail.map { it.seq })
    }

    /**
     * What goes to a phone has to fit through a bounded queue on the way (see RemoteOutbox), and a
     * working day's journal did not: a long conversation opened from a phone came up blank. The end of
     * it is what a person opening a conversation is reading, so that is the half that is kept.
     */
    @Test
    fun `a budget hands over the end of the journal rather than the beginning`() {
        val journal = SessionJournal()
        repeat(10) { journal.append("""{"n":$it}""", at = 0) }

        val tail = journal.since(0, maxEntries = 3)

        assertEquals(listOf(8L, 9L, 10L), tail.map { it.seq })
        assertTrue(journal.truncatedFrom(0, tail))
    }

    @Test
    fun `the budget counts characters too - a few large entries outweigh many small ones`() {
        val journal = SessionJournal()
        repeat(5) { journal.append("\"${"x".repeat(100)}\"", at = 0) }

        val tail = journal.since(0, maxChars = 250)

        assertEquals(listOf(4L, 5L), tail.map { it.seq })
    }

    /** One entry always, however large: an empty answer reads as "nothing happened here". */
    @Test
    fun `an entry over the whole budget is still handed over`() {
        val journal = SessionJournal()
        journal.append("\"${"x".repeat(1000)}\"", at = 0)

        assertEquals(1, journal.since(0, maxChars = 10).size)
    }

    /** Nothing left out means nothing to say about it - the mark is drawn in the feed and must be true. */
    @Test
    fun `a journal that fits inside the budget is not called truncated`() {
        val journal = SessionJournal()
        repeat(3) { journal.append("""{"n":$it}""", at = 0) }

        val tail = journal.since(0, maxEntries = 10)

        assertEquals(3, tail.size)
        assertFalse(journal.truncatedFrom(0, tail))
    }

    @Test
    fun `a client that has seen nothing is given everything`() {
        val journal = SessionJournal()
        repeat(3) { journal.append("""{"n":$it}""", at = 0) }

        assertEquals(3, journal.since(0).size)
    }

    @Test
    fun `the oldest go when there are too many entries`() {
        val journal = SessionJournal(maxEntries = 3)
        repeat(5) { journal.append("""{"n":$it}""", at = 0) }

        assertEquals(3, journal.size())
        assertEquals(2, journal.droppedCount())
        assertEquals(3, journal.firstSeq())
    }

    // The count alone is not enough: one tool result can outweigh a hundred ordinary events, and a
    // journal bounded only by entries would hold a hundred megabytes without noticing.
    @Test
    fun `the oldest go when the entries weigh too much`() {
        val journal = SessionJournal(maxEntries = 1000, maxChars = 30)
        repeat(5) { journal.append("0123456789", at = 0) }

        assertEquals(3, journal.size())
        assertEquals(2, journal.droppedCount())
    }

    // Otherwise a single entry above the whole budget would empty the journal and then be thrown out
    // itself - the feed would come back from a reconnect completely blank.
    @Test
    fun `one entry over the whole budget still survives`() {
        val journal = SessionJournal(maxEntries = 1000, maxChars = 10)

        journal.append("x".repeat(500), at = 0)

        assertEquals(1, journal.size())
    }

    @Test
    fun `a client resuming from before the head is told the beginning is missing`() {
        val journal = SessionJournal(maxEntries = 2)
        repeat(5) { journal.append("""{"n":$it}""", at = 0) }

        assertTrue(journal.truncatedSince(0))
        // And one that is up to date is not: it has missed nothing.
        assertTrue(journal.truncatedSince(2))
        assertFalse(journal.truncatedSince(3))
        assertFalse(journal.truncatedSince(5))
    }

    @Test
    fun `an untouched journal has nothing to warn about`() {
        assertFalse(SessionJournal().truncatedSince(0))
    }

    // /clear and opening a past conversation both leave the tab describing a conversation that no
    // longer exists: keeping the old feed would show every other client something that is gone.
    @Test
    fun `a reset empties the feed`() {
        val journal = SessionJournal()
        repeat(3) { journal.append("""{"n":$it}""", at = 0) }

        journal.reset()

        assertEquals(0, journal.size())
        assertEquals(0, journal.droppedCount())
        assertFalse(journal.truncatedSince(0))
    }

    // A client that reconnects with an old number after a reset must not be handed new entries under
    // numbers it recognises - it would skip them as already seen.
    @Test
    fun `numbering carries on across a reset`() {
        val journal = SessionJournal()
        repeat(3) { journal.append("""{"n":$it}""", at = 0) }

        journal.reset()

        assertEquals(4, journal.append("""{"n":"after"}""", at = 0).seq)
    }
}

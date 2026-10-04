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

        val tail = journal.tail(0, SessionJournal.Budget(maxEntries = 3))

        assertEquals(listOf(8L, 9L, 10L), tail.entries.map { it.seq })
        assertTrue(tail.truncated)
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

        val tail = journal.tail(0, SessionJournal.Budget(maxEntries = 10))

        assertEquals(3, tail.entries.size)
        assertFalse(tail.truncated)
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

    // --- Strands -------------------------------------------------------------------

    private val report = SessionJournal.Strand("task:wf", SessionJournal.Strand.Kind.REPORT)
    private val progress = SessionJournal.Strand("task:wf", SessionJournal.Strand.Kind.DETAIL)
    private fun agent(id: String) = SessionJournal.Strand("agent:$id", SessionJournal.Strand.Kind.DETAIL)

    /**
     * A workflow re-sends its whole report on every change, with hundreds of bare progress events between
     * two of them. Kept as they came, an afternoon of that was the whole journal: the conversation fell
     * out of its head, and a phone opening the tab was handed copies of one report and nothing else.
     */
    @Test
    fun `a report lets go of everything its task said before it`() {
        val journal = SessionJournal()
        journal.append("""{"prompt":1}""", at = 0)
        repeat(3) { round ->
            journal.append("""{"report":$round}""", at = 0, strand = report)
            repeat(5) { journal.append("""{"progress":$it}""", at = 0, strand = progress) }
        }
        journal.append("""{"report":"last"}""", at = 0, strand = report)

        assertEquals(listOf("""{"prompt":1}""", """{"report":"last"}"""), journal.since(0).map { it.json })
    }

    /** Only its own task's: another workflow beside it, and the conversation, are untouched. */
    @Test
    fun `a report lets go of nothing that is not its own`() {
        val journal = SessionJournal()
        journal.append("""{"other":1}""", at = 0, strand = SessionJournal.Strand("task:other", SessionJournal.Strand.Kind.REPORT))
        journal.append("""{"step":1}""", at = 0, strand = agent("a"))
        journal.append("""{"report":1}""", at = 0, strand = report)

        assertEquals(3, journal.size())
    }

    /**
     * The holes a report leaves in the numbering are not losses, and when one of them is the journal's
     * oldest entry the first number jumps with nothing missing at all - which is how the gap used to be
     * told, and a phone would have been told the beginning is not shown over a complete conversation.
     */
    @Test
    fun `a report replacing the oldest entry is not a beginning that went missing`() {
        val journal = SessionJournal()
        journal.append("""{"report":1}""", at = 0, strand = report)
        journal.append("""{"said":1}""", at = 0)
        journal.append("""{"report":2}""", at = 0, strand = report)

        assertFalse(journal.truncatedSince(0))
        assertFalse(journal.tail(0).truncated)
    }

    /**
     * A phone is handed the end of a conversation within a budget, and a subagent at work for an hour
     * spent all of it on its own calls: the card that launched it fell off the front, and the phone opened
     * on steps belonging to nothing on its screen. The steps are thinned on a budget of their own instead,
     * newest first, and the conversation around them is what the budget is spent on.
     */
    @Test
    fun `a phone is handed the conversation, with a subagent's steps thinned beside it`() {
        val journal = SessionJournal()
        journal.append("""{"said":"first"}""", at = 0)
        journal.append("""{"launched":"a"}""", at = 0)
        repeat(100) { journal.append("""{"step":$it}""", at = 0, strand = agent("a")) }
        journal.append("""{"said":"last"}""", at = 0)

        val thinning = SessionJournal.Thinning(perStrand = 3, maxEntries = 10, maxChars = 10_000)
        val tail = journal.tail(0, SessionJournal.Budget(maxEntries = 5, thinning = thinning))

        assertEquals(
            listOf("""{"said":"first"}""", """{"launched":"a"}""", """{"step":97}""", """{"step":98}""", """{"step":99}""", """{"said":"last"}"""),
            tail.entries.map { it.json },
        )
        // Nothing of the conversation was left out - the steps not handed over are no missing beginning.
        assertFalse(tail.truncated)
    }

    /** And the steps of several strands together stay under their own ceiling. */
    @Test
    fun `the thinned steps have a ceiling of their own across strands`() {
        val journal = SessionJournal()
        repeat(4) { strand -> repeat(10) { journal.append("""{"s":$strand,"n":$it}""", at = 0, strand = agent("$strand")) } }
        journal.append("""{"said":1}""", at = 0)

        val thinning = SessionJournal.Thinning(perStrand = 5, maxEntries = 7, maxChars = 10_000)
        val tail = journal.tail(0, SessionJournal.Budget(maxEntries = 10, thinning = thinning))

        assertEquals(8, tail.entries.size)
        assertEquals("""{"said":1}""", tail.entries.last().json)
    }

    /** The conversation's own budget still cuts, and says so. */
    @Test
    fun `a conversation longer than the budget is still called truncated when thinned`() {
        val journal = SessionJournal()
        repeat(10) { journal.append("""{"said":$it}""", at = 0) }

        val thinning = SessionJournal.Thinning(perStrand = 3, maxEntries = 10, maxChars = 10_000)
        val tail = journal.tail(0, SessionJournal.Budget(maxEntries = 4, thinning = thinning))

        assertEquals(listOf(7L, 8L, 9L, 10L), tail.entries.map { it.seq })
        assertTrue(tail.truncated)
    }

    /** At the desk nothing is thinned: the panel draws a card's log out of every step. */
    @Test
    fun `without thinning every step is handed over`() {
        val journal = SessionJournal()
        repeat(50) { journal.append("""{"step":$it}""", at = 0, strand = agent("a")) }

        assertEquals(50, journal.tail(0).entries.size)
    }

    // A rewind cuts the journal from the message on (see ClaudeSessionHub.rewind): a window rebuilt from it
    // later must not be handed the turns the conversation no longer has, and the numbering carries on.
    @Test
    fun `a cut takes the message and everything after it, and the numbers carry on`() {
        val journal = SessionJournal()
        journal.append("""{"type":"promptEcho","uuid":"u-1"}""", at = 1)
        journal.append("""{"type":"agent","event":{"text":"one"}}""", at = 2)
        journal.append("""{"type":"promptEcho","uuid":"u-2"}""", at = 3)
        journal.append("""{"type":"agent","event":{"text":"two"}}""", at = 4)

        // The cut says where it began, so a client can tell whether everything it holds came after it.
        assertEquals(3L, journal.cutFrom(""""uuid":"u-2""""))
        assertEquals(listOf(1L, 2L), journal.since(0).map { it.seq })

        val next = journal.append("""{"type":"rewound","uuid":"u-2"}""", at = 5)
        assertEquals(5, next.seq)
        // A window that had the dropped part comes back with its number and is handed what took it away.
        assertEquals(listOf(5L), journal.since(4).map { it.seq })
    }

    // The CLI cut at that message, so it was in the conversation; not in the journal, it is older than all
    // of it - a page of the history read past the journal, or a head the journal let go of. Everything kept
    // here came after it. Kept, it came back to every window opened later, under the mark of the rewind.
    @Test
    fun `a cut at a message older than the whole journal takes all of it`() {
        val journal = SessionJournal()
        journal.append("""{"type":"promptEcho","uuid":"u-5"}""", at = 1)
        journal.append("""{"type":"agent","event":{"text":"five"}}""", at = 2)

        assertEquals(1L, journal.cutFrom(""""uuid":"u-1""""))
        assertEquals(0, journal.size())
        assertEquals(3, journal.append("""{"type":"rewound","uuid":"u-1"}""", at = 3).seq)
    }
}

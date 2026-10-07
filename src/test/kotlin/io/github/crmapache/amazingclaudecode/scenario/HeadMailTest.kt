package io.github.crmapache.amazingclaudecode.scenario

import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertFalse
import kotlin.test.assertTrue
import kotlinx.serialization.json.Json
import kotlinx.serialization.json.JsonArray
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.contentOrNull
import kotlinx.serialization.json.jsonPrimitive

/**
 * What the person writes to the head while the run goes, and when the head reads it (see HeadMail).
 *
 * Worth a test because the wrong answer is quiet in both directions: words written into a turn the run is
 * waiting on for an object come back as no object, and the run stops for a misunderstanding; words held when
 * the head was free sit unread while the person waits for a reply that is not coming.
 */
class HeadMailTest {

    private fun way(
        headUp: Boolean = true,
        turnOpen: Boolean = false,
        answeringPerson: Boolean = false,
        doingCardWork: Boolean = false,
        waitingOnOthers: Boolean = true,
    ) = HeadMail.way(headUp, turnOpen, answeringPerson, doingCardWork, waitingOnOthers)

    @Test
    fun `a head waiting on a card or on the person reads the words at once`() {
        assertEquals(HeadMail.Way.NOW, way())
    }

    /** Its turn has to end with the object the run moves on, and a conversation broken into it ends without one. */
    @Test
    fun `a head answering a question of the run's is not interrupted`() {
        assertEquals(HeadMail.Way.LATER, way(turnOpen = true, waitingOnOthers = false))
        assertEquals(HeadMail.Way.LATER, way(turnOpen = false, waitingOnOthers = false))
    }

    /** A pause interrupts the head, and the turn closes a little later: written over it, the words would be part of it. */
    @Test
    fun `a turn still closing after an interrupt is waited out`() {
        assertEquals(HeadMail.Way.LATER, way(turnOpen = true, waitingOnOthers = true))
    }

    @Test
    fun `one conversation at a time`() {
        assertEquals(HeadMail.Way.LATER, way(answeringPerson = true, turnOpen = true))
    }

    /** An hour of a card's work is not waited out - and the words are most often about that very work. */
    @Test
    fun `a head doing a card's work has the words written into its turn`() {
        assertEquals(HeadMail.Way.INTO_WORK, way(doingCardWork = true, turnOpen = true, waitingOnOthers = false))
    }

    @Test
    fun `nothing goes to a head that is not up`() {
        assertEquals(HeadMail.Way.LATER, way(headUp = false))
    }

    @Test
    fun `only the person's words that have not reached the head are waiting, oldest first`() {
        val notes = listOf(
            RunNote(at = 30, text = "second", who = RunNote.PERSON),
            RunNote(at = 10, text = "the head said this"),
            RunNote(at = 20, text = "first", who = RunNote.PERSON),
            RunNote(at = 5, text = "read already", who = RunNote.PERSON, deliveredAt = 6),
        )

        assertEquals(listOf("first", "second"), HeadMail.waiting(notes).map { it.text })
    }

    @Test
    fun `delivered words are stamped, and a turn that died gives them back`() {
        val notes = listOf(
            RunNote(at = 10, text = "first", who = RunNote.PERSON),
            RunNote(at = 20, text = "second", who = RunNote.PERSON),
        )

        val read = HeadMail.delivered(notes, notes.take(1), now = 15)
        assertEquals(listOf(15L, 0L), read.map { it.deliveredAt })

        val back = HeadMail.undelivered(read, listOf(10L))
        assertEquals(listOf("first", "second"), HeadMail.waiting(back).map { it.text })
    }

    /** A reply stamped in the millisecond of the words it answers would be the same note twice on the screen. */
    @Test
    fun `a new note is never stamped at or before the last one`() {
        val notes = listOf(RunNote(at = 100, text = "said"))

        assertEquals(101, HeadMail.stamp(notes, now = 100))
        assertEquals(101, HeadMail.stamp(notes, now = 90))
        assertEquals(500, HeadMail.stamp(notes, now = 500))
        assertEquals(7, HeadMail.stamp(emptyList(), now = 7))
    }

    @Test
    fun `the head is told the words and what it may do with them`() {
        val asked = HeadTalk.toldRequest(listOf("Commit it as one."), "The run is going.", toCard = true)

        assertTrue("Commit it as one." in asked)
        assertTrue("toCard" in asked)
        assertTrue("stands for the rest of the run" in asked)

        assertFalse("toCard" in HeadTalk.toldRequest(listOf("How far along are we?"), "The run is going.", toCard = false))
    }

    /** Folded in front of a question of the run's, the question still comes last - it names the object wanted. */
    @Test
    fun `words that waited go before the question, and the question is still the last thing said`() {
        val question = HeadTalk.anotherPassRequest(Stage(id = "s", title = "Review"), pass = 1, passes = 3)
        val asked = HeadTalk.withTold(listOf("Stop after two passes."), question)

        assertTrue(asked.indexOf("Stop after two passes.") < asked.indexOf(question))
        assertTrue(asked.endsWith(question))
    }

    /** The record goes to every screen on every change: a pasted screenshot's bytes would ride along each time. */
    @Test
    fun `the person's field is kept for the eye without the bytes of pasted pictures`() {
        val tokens = Json.parseToJsonElement(
            """
            [
              {"kind": "text", "value": "Look at this: "},
              {"kind": "chip", "chip": {"kind": "img", "value": "Image #1", "data": "data:image/png;base64,AAAA", "path": "/tmp/a.png"}},
              {"kind": "chip", "chip": {"kind": "file", "value": "src/app.ts"}},
              "not a token"
            ]
            """.trimIndent(),
        )

        val shown = HeadMail.shown(tokens) as JsonArray
        assertEquals(3, shown.size)
        val image = (shown[1] as JsonObject)["chip"] as JsonObject
        assertFalse("data" in image)
        assertEquals("/tmp/a.png", image["path"]?.jsonPrimitive?.contentOrNull)
        assertEquals("src/app.ts", ((shown[2] as JsonObject)["chip"] as JsonObject)["value"]?.jsonPrimitive?.contentOrNull)
        assertEquals(null, HeadMail.shown(null))
    }

    @Test
    fun `what the head passes on to a card is read off its answer to the person`() {
        val reply = HeadTalk.read(
            """
            I'll tell the reviewer to run the migration tests too, and I'll hold the verdict to that.

            ```json
            {"toCard": "Run the migration tests as well before you report."}
            ```
            """.trimIndent(),
        )

        assertEquals("I'll tell the reviewer to run the migration tests too, and I'll hold the verdict to that.", reply.words)
        assertEquals("Run the migration tests as well before you report.", reply.body?.get("toCard")?.jsonPrimitive?.contentOrNull)
        assertTrue(HeadTalk.relayed("Run the tests.").endsWith("Run the tests."))
    }
}

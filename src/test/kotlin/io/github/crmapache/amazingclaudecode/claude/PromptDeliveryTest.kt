package io.github.crmapache.amazingclaudecode.claude

import java.time.Instant
import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertFalse
import kotlin.test.assertTrue

class PromptDeliveryTest {

    private val sentAt = Instant.parse("2026-08-21T01:47:20.000Z").toEpochMilli()

    private fun at(offsetSeconds: Long): String =
        Instant.ofEpochMilli(sentAt).plusSeconds(offsetSeconds).toString()

    /** One send as the check sees it: the text and the time it went into the process. */
    private fun sent(text: String, offsetSeconds: Long = 0) =
        PromptDelivery.Sent(text, Instant.ofEpochMilli(sentAt).plusSeconds(offsetSeconds).toEpochMilli())

    /** Whether the single sent message arrived. */
    private fun arrived(lines: Sequence<String>, text: String): Boolean =
        PromptDelivery.match(lines, listOf(sent(text))).isNotEmpty()

    // The message became a new turn - that is what the CLI does with a mid-turn message when the agent
    // was already finishing its answer at that moment.
    @Test
    fun `a person's message in the conversation counts as delivery`() {
        val lines = sequenceOf(
            """{"type":"user","message":{"role":"user","content":[{"type":"text","text":"fix the tests"}]},"timestamp":"${at(1)}"}""",
        )

        assertTrue(arrived(lines, "fix the tests"))
    }

    // The mid-turn message went to the running turn: it has a record of its own, and its shape is what
    // the verdict turns on - the agent saw ordinary text, while a command in that shape did nothing.
    @Test
    fun `a message written into a running turn is found as an absorbed one`() {
        val lines = sequenceOf(
            """{"type":"attachment","attachment":{"type":"queued_command","prompt":[{"type":"text","text":"fix the tests"}],"commandMode":"prompt"},"timestamp":"${at(1)}"}""",
        )

        assertEquals(
            mapOf(0 to PromptDelivery.Landing.ABSORBED),
            PromptDelivery.match(lines, listOf(sent("fix the tests"))),
        )
    }

    // A bare string instead of blocks - that is how the CLI writes a message without attachments.
    @Test
    fun `a message as a string counts as delivery too`() {
        val lines = sequenceOf(
            """{"type":"user","message":{"role":"user","content":"fix the tests"},"timestamp":"${at(1)}"}""",
        )

        assertTrue(arrived(lines, "fix the tests"))
    }

    // Exactly the case this whole thing exists for: the message went into the process, and it is not in
    // the conversation - the CLI swallowed it.
    @Test
    fun `without a record in the conversation there is no delivery`() {
        val lines = sequenceOf(
            """{"type":"user","message":{"role":"user","content":[{"type":"text","text":"something else entirely"}]},"timestamp":"${at(1)}"}""",
            """{"type":"assistant","message":{"role":"assistant","content":[{"type":"text","text":"fix the tests"}]},"timestamp":"${at(2)}"}""",
        )

        assertFalse(arrived(lines, "fix the tests"))
    }

    // The person could have sent the same request earlier too: an old record must not pass itself off as
    // the present one, or a lost message would stay lost.
    @Test
    fun `a past message with the same text does not count as delivery`() {
        val lines = sequenceOf(
            """{"type":"user","message":{"role":"user","content":[{"type":"text","text":"fix the tests"}]},"timestamp":"${at(-60)}"}""",
        )

        assertFalse(arrived(lines, "fix the tests"))
    }

    // A record without a time can say nothing about itself - crediting it means silently burying the
    // message.
    @Test
    fun `a record without a time does not count as delivery`() {
        val lines = sequenceOf(
            """{"type":"user","message":{"role":"user","content":[{"type":"text","text":"fix the tests"}]}}""",
        )

        assertFalse(arrived(lines, "fix the tests"))
    }

    // The agent's answer word for word is no proof that the request was received at all.
    @Test
    fun `the agent's answer does not count as delivery`() {
        val lines = sequenceOf(
            """{"type":"assistant","message":{"role":"assistant","content":[{"type":"text","text":"fix the tests"}]},"timestamp":"${at(1)}"}""",
        )

        assertFalse(arrived(lines, "fix the tests"))
    }

    // A command is told from ordinary text by the slash it starts with, and by nothing else.
    @Test
    fun `a slash command is told apart from ordinary text`() {
        assertTrue(PromptDelivery.isCommand("/compact"))
        assertTrue(PromptDelivery.isCommand("  /clear"))
        assertFalse(PromptDelivery.isCommand("fix the tests"))
        // A path in the middle of a message is not a command - only the very first character decides.
        assertFalse(PromptDelivery.isCommand("look at src/main and fix it"))
    }

    // Send means "reach the agent now" for ordinary text, and the CLI delivers it: the agent is asked to
    // take it up as it carries on. For a command that same place is a dead end, so it waits instead.
    @Test
    fun `only a command waits for the running turn`() {
        assertTrue(PromptDelivery.waitsForTheTurn("/compact", turnRunning = true))
        assertFalse(PromptDelivery.waitsForTheTurn("/compact", turnRunning = false))
        assertFalse(PromptDelivery.waitsForTheTurn("fix the tests", turnRunning = true))
    }

    // The whole point of telling the two records apart: a command absorbed into a running turn reached
    // the agent as bare text and carried out nothing, so it has to go again.
    @Test
    fun `a command absorbed into a running turn is lost`() {
        assertEquals(
            PromptDelivery.Verdict.LOST,
            PromptDelivery.verdict("/compact", PromptDelivery.Landing.ABSORBED, lastLook = false),
        )
    }

    // Ordinary text in that same place is delivered: the CLI shows it to the agent at its next step, and
    // sending it again means carrying the same request out twice.
    @Test
    fun `ordinary text absorbed into a running turn is delivered`() {
        assertEquals(
            PromptDelivery.Verdict.DELIVERED,
            PromptDelivery.verdict("fix the tests", PromptDelivery.Landing.ABSORBED, lastLook = false),
        )
    }

    // A command that ran leaves no verbatim record at all - the CLI rewrites a known one with tags and
    // does not write an unknown one down. Silence is therefore no evidence, and a repeat on a guess is a
    // second compaction of the context.
    @Test
    fun `a command without a record is left alone`() {
        assertEquals(
            PromptDelivery.Verdict.DELIVERED,
            PromptDelivery.verdict("/compact", landing = null, lastLook = true),
        )
    }

    // Ordinary text always leaves a record, so its absence after the last look is the loss this whole
    // check exists for.
    @Test
    fun `ordinary text without a record is lost`() {
        assertEquals(
            PromptDelivery.Verdict.LOST,
            PromptDelivery.verdict("fix the tests", landing = null, lastLook = true),
        )
    }

    // Before the last look nothing is decided: the record may simply not have been written yet - a
    // message taken into a running turn is written when the CLI shows it to the agent, a tool call later.
    @Test
    fun `without a record and with looks left nothing is decided`() {
        assertEquals(
            PromptDelivery.Verdict.WAIT,
            PromptDelivery.verdict("fix the tests", landing = null, lastLook = false),
        )
        assertEquals(
            PromptDelivery.Verdict.WAIT,
            PromptDelivery.verdict("/compact", landing = null, lastLook = false),
        )
    }

    // A message that became a turn of its own is delivered whatever it was - a command in that shape is
    // a command the CLI expanded and carried out.
    @Test
    fun `a message that became a turn is delivered`() {
        assertEquals(
            PromptDelivery.Verdict.DELIVERED,
            PromptDelivery.verdict("/compact", PromptDelivery.Landing.NEW_TURN, lastLook = false),
        )
    }

    // A tool result arrives as the same `user` record, but is not a person's message.
    @Test
    fun `a tool result does not count as delivery`() {
        val lines = sequenceOf(
            """{"type":"user","message":{"role":"user","content":[{"type":"tool_result","tool_use_id":"t1","content":"fix the tests"}]},"timestamp":"${at(1)}"}""",
        )

        assertFalse(arrived(lines, "fix the tests"))
    }

    // Two identical "go on" in a row and one record in the conversation: closing both sends by it means
    // silently losing the second - exactly what this check exists for.
    @Test
    fun `one record closes only one of two identical sends`() {
        val lines = sequenceOf(
            """{"type":"user","message":{"role":"user","content":[{"type":"text","text":"go on"}]},"timestamp":"${at(1)}"}""",
        )

        val matched = PromptDelivery.match(lines, listOf(sent("go on"), sent("go on", 1)))

        assertEquals(mapOf(0 to PromptDelivery.Landing.NEW_TURN), matched)
    }

    // Both arrived - both sends are closed, and there is nothing to resend.
    @Test
    fun `two records close both identical sends`() {
        val lines = sequenceOf(
            """{"type":"user","message":{"role":"user","content":[{"type":"text","text":"go on"}]},"timestamp":"${at(1)}"}""",
            """{"type":"attachment","attachment":{"type":"queued_command","prompt":[{"type":"text","text":"go on"}],"commandMode":"prompt"},"timestamp":"${at(2)}"}""",
        )

        val matched = PromptDelivery.match(lines, listOf(sent("go on"), sent("go on", 1)))

        assertEquals(
            mapOf(0 to PromptDelivery.Landing.NEW_TURN, 1 to PromptDelivery.Landing.ABSORBED),
            matched,
        )
    }

    // Different messages are checked in one pass over the file: each has its own record, and what is not
    // found stays waiting.
    @Test
    fun `different messages are found in one pass`() {
        val lines = sequenceOf(
            """{"type":"user","message":{"role":"user","content":[{"type":"text","text":"fix the tests"}]},"timestamp":"${at(1)}"}""",
            """{"type":"user","message":{"role":"user","content":[{"type":"text","text":"and build it"}]},"timestamp":"${at(2)}"}""",
        )

        val matched = PromptDelivery.match(
            lines,
            listOf(sent("fix the tests"), sent("vanished entirely"), sent("and build it", 1)),
        )

        assertEquals(
            mapOf(0 to PromptDelivery.Landing.NEW_TURN, 2 to PromptDelivery.Landing.NEW_TURN),
            matched,
        )
    }

    // The one thing a resend must never confuse: "the record is not in the conversation" and "the
    // conversation itself could not be read". Read as the first, a locked or not-yet-written file sends
    // a `deploy` to the agent a second time, and that cannot be taken back.
    @Test
    fun `a conversation that cannot be looked into is not an empty one`() {
        val outcome = PromptDelivery.arrived(
            workingDirectory = null,
            conversationId = "no-such-conversation",
            sent = listOf(sent("deploy it")),
        )

        assertEquals(PromptDelivery.Lookup.Unreadable, outcome)
    }

    // The same for a conversation that has no name yet: the process is up, but its identifier has not
    // arrived from the stream, so there is nowhere to look.
    @Test
    fun `a conversation without an identifier cannot be looked into either`() {
        val outcome = PromptDelivery.arrived(null, conversationId = null, sent = listOf(sent("deploy it")))

        assertEquals(PromptDelivery.Lookup.Unreadable, outcome)
    }

    // Nothing was asked about, so nothing is missing - that is an answer rather than a failure to look.
    @Test
    fun `an empty list of sends is answered rather than refused`() {
        assertEquals(PromptDelivery.Lookup.Read(emptyMap()), PromptDelivery.arrived(null, null, emptyList()))
    }
}

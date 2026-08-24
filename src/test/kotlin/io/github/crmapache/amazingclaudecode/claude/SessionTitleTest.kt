package io.github.crmapache.amazingclaudecode.claude

import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertNull

/**
 * A tab's name is asked for by the first message of a conversation (see ClaudeSession.requestTitle),
 * and the question is asked once. So it matters which message is allowed to be that one: named after
 * "/compact", a conversation carries the name of what was done to it rather than of what it is about.
 */
class SessionTitleTest {

    @Test
    fun `a message is what the name is asked for`() {
        assertEquals("Fix the parser on empty input", SessionTitle.describe("Fix the parser on empty input"))
    }

    @Test
    fun `the message is trimmed first`() {
        assertEquals("Fix the parser", SessionTitle.describe("  Fix the parser\n\n"))
    }

    @Test
    fun `too short to name anything by`() {
        assertNull(SessionTitle.describe("да"))
        assertNull(SessionTitle.describe("  ok  "))
    }

    // "/compact" says what was done to the conversation, not what it is about - and the question may
    // only be asked once, so it goes to the next message instead.
    @Test
    fun `a bare command names nothing`() {
        assertNull(SessionTitle.describe("/compact"))
        assertNull(SessionTitle.describe("  /clear  "))
    }

    // A command with arguments does say what is going on, and waiting for a further message would leave
    // the tab a stand-in for the whole conversation.
    @Test
    fun `a command with arguments does name something`() {
        assertEquals("/fix REVIEW-v1.md", SessionTitle.describe("/fix REVIEW-v1.md"))
    }

    // A pasted log or a specification: what the conversation is about stands in its opening lines, and
    // the rest is tokens paid for nothing.
    @Test
    fun `only the beginning of a long message is sent`() {
        val description = SessionTitle.describe("Review this: " + "x".repeat(5000))

        assertEquals(SessionTitle.SAMPLE_LENGTH, description?.length)
    }
}

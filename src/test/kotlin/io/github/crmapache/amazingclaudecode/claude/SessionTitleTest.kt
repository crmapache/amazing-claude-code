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
    // only be asked once, so it goes to the next message instead. With arguments too: "/compact keep the
    // API decisions" is still housekeeping, however much it says.
    @Test
    fun `a housekeeping command names nothing`() {
        assertNull(SessionTitle.describe("/compact"))
        assertNull(SessionTitle.describe("  /clear  "))
        assertNull(SessionTitle.describe("/compact keep the API decisions"))
    }

    // A skill or a command is what the person came to do - and a tab opened on one used to stay "new
    // session" for the whole run, because it carries no arguments to be recognised by.
    @Test
    fun `a command of its own names the conversation`() {
        assertEquals("the /code-review command", SessionTitle.describe("/code-review"))
        assertEquals("the /cp command", SessionTitle.describe("  /cp  "))
    }

    // A plugin's own command is that plugin's work, whatever the CLI calls its own command of the same
    // name.
    @Test
    fun `a plugin command is not the CLI command it shares a name with`() {
        assertEquals("the /acme:status command", SessionTitle.describe("/acme:status"))
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

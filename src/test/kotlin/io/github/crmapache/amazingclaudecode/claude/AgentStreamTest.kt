package io.github.crmapache.amazingclaudecode.claude

import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertFalse
import kotlin.test.assertNull
import kotlin.test.assertTrue

/**
 * By a turn's result the shell clears the panel's work (see ClaudeSession.onTurnEnded). A mistake in
 * either direction is visible to the user at once: a missed result leaves "Claude is thinking" with a
 * running counter forever, while a spurious one clears the work mid-turn.
 */
class AgentStreamTest {

    @Test
    fun `a turn's result is recognised`() {
        val line = """{"is_error":false,"num_turns":2,"subtype":"success","result":"done","type":"result"}"""
        assertTrue(AgentStream.isTurnResult(line))
    }

    @Test
    fun `ordinary events do not count as a result`() {
        assertFalse(AgentStream.isTurnResult("""{"type":"assistant","message":{"content":[]}}"""))
        assertFalse(AgentStream.isTurnResult("""{"type":"system","subtype":"init"}"""))
    }

    /**
     * Talking about the protocol itself is an everyday thing in this panel: the agent shows an example
     * of a stream event right inside its answer. Taking it for the end of a turn means clearing the work
     * mid-sentence.
     */
    @Test
    fun `an event example inside the agent's answer is not a result`() {
        val line = """{"type":"assistant","message":{"content":[{"type":"text","text":"the CLI sends {\"type\":\"result\"} at the end"}]}}"""
        assertFalse(AgentStream.isTurnResult(line))
    }

    /** The same text, but arriving as a tool result: a cat of a transcript, a grep over a log. */
    @Test
    fun `a tool result carrying an event's text is not a result`() {
        val line = """{"type":"user","message":{"content":[{"type":"tool_result","content":"{\"type\":\"result\",\"subtype\":\"success\"}"}]}}"""
        assertFalse(AgentStream.isTurnResult(line))
    }

    /** A truncated line must neither count as a result nor bring the stream's parsing down. */
    @Test
    fun `a broken line is survived silently`() {
        assertFalse(AgentStream.isTurnResult("""{"type":"result","result":"cut off"""))
    }

    /**
     * By the first sign of work the panel lights up a turn that began without its knowledge - that is
     * how the CLI takes up a message written into the previous turn (see
     * ClaudeSession.noteTurnActivity).
     */
    @Test
    fun `the agent's answer and its stream count as work`() {
        assertTrue(AgentStream.isTurnActivity("""{"type":"assistant","message":{"content":[]}}"""))
        assertTrue(AgentStream.isTurnActivity("""{"type":"stream_event","event":{"type":"content_block_delta"}}"""))
    }

    /**
     * System events the process sends just for being woken up: by them the panel would light up work
     * over nothing.
     */
    @Test
    fun `system events and a result do not count as work`() {
        assertFalse(AgentStream.isTurnActivity("""{"type":"system","subtype":"init"}"""))
        assertFalse(AgentStream.isTurnActivity("""{"type":"result","subtype":"success"}"""))
    }

    /** The same event example inside an answer's text - what counts as work is the answer, not it. */
    @Test
    fun `an event example inside a tool result does not count as work`() {
        val line = """{"type":"user","message":{"content":[{"type":"tool_result","content":"{\"type\":\"assistant\"}"}]}}"""
        assertFalse(AgentStream.isTurnActivity(line))
    }

    /**
     * A helper the agent launched in the background sends its events after the main turn's result too,
     * and they have no result of their own. Lighting up work by them means lighting it up forever (see
     * AgentStream.isTurnActivity).
     */
    @Test
    fun `a background helper's events do not count as work`() {
        val answer = """{"type":"assistant","message":{"content":[]},"parent_tool_use_id":"toolu_01"}"""
        val stream = """{"type":"stream_event","event":{"type":"content_block_delta"},"parent_tool_use_id":"toolu_01"}"""

        assertFalse(AgentStream.isTurnActivity(answer))
        assertFalse(AgentStream.isTurnActivity(stream))
    }

    /** An empty mark is the agent itself rather than a helper: such a turn does have to be lit up. */
    @Test
    fun `the agent's own answer counts as work even with an empty mark`() {
        assertTrue(AgentStream.isTurnActivity("""{"type":"assistant","message":{"content":[]},"parent_tool_use_id":null}"""))
    }

    /**
     * The conversation's name is read out of the same event by both the live stream and the history
     * list - the panel must not name one and the same conversation differently in the two places.
     */
    @Test
    fun `the conversation's own name is read out of its event`() {
        assertEquals(
            "Fixing the delivery check",
            AgentStream.aiTitle("""{"type":"ai-title","aiTitle":"Fixing the delivery check"}"""),
        )
    }

    @Test
    fun `other events carry no name`() {
        assertNull(AgentStream.aiTitle("""{"type":"system","subtype":"init"}"""))
        // A blank name is the same as none: a tab must not be renamed into emptiness.
        assertNull(AgentStream.aiTitle("""{"type":"ai-title","aiTitle":"  "}"""))
    }
}

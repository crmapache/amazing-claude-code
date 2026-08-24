package io.github.crmapache.amazingclaudecode.remote

import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertFalse
import kotlin.test.assertTrue

/**
 * What a phone is sent out of a project's feed.
 *
 * Three string comparisons decide whether a screen on the other side of the city shows a conversation,
 * shows the wrong one, or shows nothing - and each of them has been wrong once. Tested here rather than
 * with an IDE and a phone in hand, which is how the wrong ones were found.
 */
class RemoteFeedTest {

    private fun agentLine(sessionId: String, replay: Boolean = false): String {
        val flag = if (replay) ""","replay":true""" else ""
        return """{"seq":7,"at":1,"type":"agent","sessionId":"$sessionId"$flag,"event":{"type":"assistant"}}"""
    }

    @Test
    fun `a message about the watched conversation is wanted`() {
        assertTrue(RemoteFeed.wantedBy(agentLine("main"), "main"))
    }

    /**
     * Every project's first tab is called "main" by the IDE itself, so the match has to be exact: a
     * sessionId that merely starts the same is another conversation entirely.
     */
    @Test
    fun `another conversation is not`() {
        assertFalse(RemoteFeed.wantedBy(agentLine("main"), "phone-17"))
        assertFalse(RemoteFeed.wantedBy(agentLine("main-2"), "main"))
    }

    /**
     * An answer that belongs to the project rather than to a conversation - the list of past ones - has
     * no conversation to match, and travels by its own road instead (see SessionClient.answer).
     */
    @Test
    fun `an answer about the project is not part of any conversation feed`() {
        assertFalse(RemoteFeed.wantedBy("""{"type":"history","conversations":[]}""", "main"))
    }

    @Test
    fun `a replayed line is recognised, a live one is not`() {
        assertTrue(RemoteFeed.isReplayLine(agentLine("main", replay = true)))
        assertFalse(RemoteFeed.isReplayLine(agentLine("main")))
    }

    /**
     * The moment there is something to hand over: a transcript has finished being read into a tab
     * somebody is watching from a phone.
     */
    @Test
    fun `the end of a replay is reported for the watched conversation alone`() {
        val messages = listOf(
            """{"type":"replayFinished","sessionId":"phone-17"}""",
            """{"type":"replayFinished","sessionId":"main"}""",
        )

        assertEquals(listOf("main"), RemoteFeed.replayed(messages, listOf("main")))
    }

    @Test
    fun `a batch without a finished replay hands nothing over`() {
        assertEquals(emptyList(), RemoteFeed.replayed(listOf(agentLine("main")), listOf("main")))
    }

    /** Two devices on one conversation are one hand-over, not two. */
    @Test
    fun `the same conversation is handed over once`() {
        val messages = listOf("""{"type":"replayFinished","sessionId":"main"}""")

        assertEquals(listOf("main"), RemoteFeed.replayed(messages, listOf("main", "main")))
    }
}

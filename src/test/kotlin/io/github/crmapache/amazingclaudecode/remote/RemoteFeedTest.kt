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

    /**
     * The composer on the phone draws the branch, the limits, the commands and the file list, and every
     * one of them belongs to the project rather than to a conversation. Without this they were dropped
     * for having no sessionId to match, and the phone had a feed and nothing around it.
     */
    @Test
    fun `the project's own facts a phone draws its composer from are forwarded`() {
        assertEquals("project", RemoteFeed.projectFact("""{"type":"project","gitBranch":"main"}"""))
        assertEquals("usage", RemoteFeed.projectFact("""{"type":"usage","session":{"percent":12}}"""))
        assertEquals("commandHints", RemoteFeed.projectFact("""{"type":"commandHints","hints":{}}"""))
        assertEquals("commands", RemoteFeed.projectFact("""{"type":"commands","commands":["mcp__snakein__analyze"]}"""))
        assertEquals("files", RemoteFeed.projectFact("""{"type":"files","files":["src/main.kt"]}"""))
    }

    /**
     * `init` carries this machine's working directory, and the path is the one thing that never leaves
     * it. The list is of what may go rather than of what may not, precisely so that a message nobody
     * thought about stays where it is.
     */
    @Test
    fun `everything else stays on this machine`() {
        assertEquals(null, RemoteFeed.projectFact("""{"type":"init","workingDirectory":"/Users/max/work"}"""))
        assertEquals(null, RemoteFeed.projectFact("""{"type":"clients","clients":[]}"""))
        assertEquals(null, RemoteFeed.projectFact("""{"type":"remoteState","enabled":true}"""))
    }

    /**
     * By the message's beginning rather than by a search inside it: a tool call that mentions the word
     * is a line of somebody's conversation, not a fact about the project.
     */
    @Test
    fun `a conversation line that merely mentions one is not a fact`() {
        assertEquals(null, RemoteFeed.projectFact(agentLine("main").replace("assistant", "files")))
    }
}

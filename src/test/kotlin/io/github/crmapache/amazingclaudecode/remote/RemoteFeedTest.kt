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

    // --- The scenarios: what a phone is sent of a round of work ------------------------

    /** One go at one card, as the IDE writes it down. */
    private fun stepJson(
        said: String = "reading the working tree",
        prompt: String = "Do the task",
        state: String = "running",
    ): String =
        """{"key":"g1:c1:1","cardId":"c1","stageId":"g1","pass":1,"title":"Do it","state":"$state",""" +
            """"conversationId":"c1","startedAt":5,"finishedAt":0,"slots":{},"prompt":"$prompt",""" +
            """"said":"$said","summary":"","nudges":[],"verdict":"","verdictReason":"","handoff":"$LONG",""" +
            """"failure":"","error":"","cost":0.0,"tokens":10}"""

    /**
     * One run as the IDE broadcasts it: a step in the middle of speaking, and the scenario it came from
     * with every word its cards were given.
     */
    private fun runMessage(steps: String = stepJson()): String =
        """{"type":"scenarioRun","run":{""" +
            """"id":"r1","scenarioId":"s1","scenarioName":"Task to PR","scope":"project",""" +
            """"startedAt":1,"finishedAt":0,"state":"running","total":2,"headConversationId":"c0",""" +
            """"snapshot":{"version":1,"id":"s1","name":"Task to PR","createdAt":1,"updatedAt":2,""" +
            """"inputs":[],"head":{"briefing":"$LONG","model":"","effort":"","permissionMode":"",""" +
            """"onQuestion":"head","retries":2},""" +
            """"stages":[{"id":"g1","title":"Work","repeat":3,"untilDone":true,"cards":[""" +
            """{"id":"c1","title":"Do it","prompt":"$LONG","slots":[],"dod":"$LONG","after":"$LONG",""" +
            """"model":"","effort":"","permissionMode":""}]}],"scope":"project"},""" +
            """"inputs":{},"steps":[$steps],""" +
            """"notes":[],"question":null,"failure":"","error":"","cost":0.0,"tokens":10}}"""

    private fun sent(message: String): String = RemoteFeed.forPhone(RemoteFeed.SCENARIO_RUN, message)

    @Test
    fun `the scenarios and the run of a project are forwarded`() {
        assertEquals("scenarios", RemoteFeed.projectFact("""{"type":"scenarios","scenarios":[],"runs":[]}"""))
        assertEquals("scenarioRun", RemoteFeed.projectFact("""{"type":"scenarioRun","run":{"id":"r1"}}"""))
    }

    /**
     * The field that changes four times a second, and the reason a run can be a fact at all.
     *
     * Two beats of the same step differ only in what its agent is saying, so the trimmed message has to
     * come out identical - that is what lets the fingerprint in RemoteAgent stop it from being sent.
     */
    @Test
    fun `what an agent is saying this second does not travel, so two beats look the same`() {
        val first = sent(runMessage(stepJson(said = "reading the working tree")))
        val second = sent(runMessage(stepJson(said = "reading the working tree and a good deal more")))

        assertFalse(first.contains("reading the working tree"))
        assertEquals(first, second)
    }

    /** And what does travel: every state, every clock, and what the card was asked to do. */
    @Test
    fun `the shape of a run survives the trimming`() {
        val out = sent(runMessage())

        assertTrue(out.contains(""""state":"running""""))
        assertTrue(out.contains(""""startedAt":5"""))
        assertTrue(out.contains(""""title":"Do it""""))
        assertTrue(out.contains(""""prompt":"Do the task""""))
        // The prose of the scenario itself is the weight of the message, and it is read where it is written.
        assertFalse(out.contains(LONG))
        // The skeleton the timeline is drawn from stays: the stage, its passes and the cards' names.
        assertTrue(out.contains(""""repeat":3"""))
        assertTrue(out.contains(""""untilDone":true"""))
    }

    /** A line long enough to be a page is shortened rather than carried whole. */
    @Test
    fun `a step's line is cut to what a small screen shows`() {
        val out = sent(runMessage(stepJson(prompt = "x".repeat(4000))))

        assertTrue(out.contains("x".repeat(200)))
        assertFalse(out.contains("x".repeat(300)))
    }

    /**
     * A frame over the relay's cap is thrown away whole rather than shortened, so a run of a hundred
     * cards has to lose its words rather than lose the screen.
     */
    @Test
    fun `a run too big even trimmed keeps its shape and drops its words`() {
        val heavy = stepJson(said = "", prompt = "y".repeat(240), state = "done")
        val out = sent(runMessage((1..120).joinToString(",") { heavy }))

        assertTrue(out.length < 48 * 1024)
        assertFalse(out.contains("y".repeat(240)))
        assertTrue(out.contains(""""title":"Do it""""))
        assertTrue(out.contains(""""state":"done""""))
    }

    /** The shelves: the names and the shapes stay, and every word a card says to an agent goes. */
    @Test
    fun `the shelves keep their names and lose their prose`() {
        val message = """{"type":"scenarios","live":"","canShare":true,"schedules":[],"runs":[],""" +
            """"scenarios":[{"version":1,"id":"s1","name":"Task to PR","createdAt":1,"updatedAt":2,""" +
            """"inputs":[],"head":{"briefing":"$LONG","model":"","effort":"","permissionMode":"",""" +
            """"onQuestion":"head","retries":2},""" +
            """"stages":[{"id":"g1","title":"Work","repeat":3,"untilDone":true,"cards":[""" +
            """{"id":"c1","title":"Do it","prompt":"$LONG","slots":[],"dod":"$LONG","after":"$LONG",""" +
            """"model":"","effort":"","permissionMode":""}]}],"scope":"project"}]}"""

        val out = RemoteFeed.forPhone(RemoteFeed.SCENARIOS, message)

        assertFalse(out.contains(LONG))
        assertTrue(out.contains(""""name":"Task to PR""""))
        assertTrue(out.contains(""""title":"Do it""""))
        assertTrue(out.contains(""""repeat":3"""))
    }

    /** A year of a morning routine is three hundred summaries; the row anybody wants is near the top. */
    @Test
    fun `only a screenful and a bit of the past runs travels`() {
        val summaries = (1..120).joinToString(",") { """{"id":"r$it","scenarioName":"Nightly"}""" }
        val out = RemoteFeed.forPhone(
            RemoteFeed.SCENARIOS,
            """{"type":"scenarios","scenarios":[],"runs":[$summaries],"live":"","schedules":[],"canShare":true}""",
        )

        assertTrue(out.contains(""""id":"r40""""))
        assertFalse(out.contains(""""id":"r41""""))
    }

    /** Long enough to be recognisable in the output, and to be the weight the trimming is about. */
    private val LONG = "the whole of what this card says to its agent, at length"
}

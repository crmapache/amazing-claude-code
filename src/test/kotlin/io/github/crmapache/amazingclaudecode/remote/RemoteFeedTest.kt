package io.github.crmapache.amazingclaudecode.remote

import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertFalse
import kotlin.test.assertNotEquals
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

    private fun sent(message: String): String = RemoteFeed.forPhone(RemoteFeed.SCENARIO_RUN, message).message

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
        val message = """{"type":"scenarios","canShare":true,"schedules":[],"runs":[],""" +
            """"scenarios":[{"version":1,"id":"s1","name":"Task to PR","createdAt":1,"updatedAt":2,""" +
            """"inputs":[],"head":{"briefing":"$LONG","model":"","effort":"","permissionMode":"",""" +
            """"onQuestion":"head","retries":2},""" +
            """"stages":[{"id":"g1","title":"Work","repeat":3,"untilDone":true,"cards":[""" +
            """{"id":"c1","title":"Do it","prompt":"$LONG","slots":[],"dod":"$LONG","after":"$LONG",""" +
            """"model":"","effort":"","permissionMode":""}]}],"scope":"project"}]}"""

        val out = RemoteFeed.forPhone(RemoteFeed.SCENARIOS, message).message

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
            """{"type":"scenarios","scenarios":[],"runs":[$summaries],"schedules":[],"canShare":true}""",
        ).message

        assertTrue(out.contains(""""id":"r40""""))
        assertFalse(out.contains(""""id":"r41""""))
    }

    /**
     * Two runs going side by side have to be remembered apart, and the name they are remembered under
     * cannot depend on which field a record happens to be written with first.
     *
     * Pulled out of the text by a search for `"run":{"id":"`, it did: one field added above it and every
     * run fell into one slot, so no beat was ever recognised as unchanged and an hours-long round of work
     * went into somebody's pocket four times a second. Nothing failed while that was true - which is why
     * this is a test rather than a comment.
     */
    @Test
    fun `two runs are told apart whatever order their record is written in`() {
        val ordinary = RemoteFeed.forPhone(RemoteFeed.SCENARIO_RUN, runMessage())
        val moved = RemoteFeed.forPhone(
            RemoteFeed.SCENARIO_RUN,
            """{"type":"scenarioRun","run":{"scenarioName":"Task to PR","id":"r2","steps":[]}}""",
        )
        val same = RemoteFeed.forPhone(
            RemoteFeed.SCENARIO_RUN,
            """{"type":"scenarioRun","run":{"scenarioName":"Task to PR","id":"r1","steps":[]}}""",
        )

        assertNotEquals(ordinary.slot, moved.slot)
        assertEquals(ordinary.slot, same.slot)
        assertEquals(RemoteFeed.SCENARIOS, RemoteFeed.forPhone(RemoteFeed.SCENARIOS, "{}").slot)
    }

    /**
     * The live list is a fact like any other and gets the same ceiling.
     *
     * Every summary on it carries the answers somebody typed at the start form - free text with no length
     * to it - and this is the one message that is rebuilt every second for the hours a round of work
     * takes. Over the relay's cap a frame is not shortened but thrown away whole, so the phone goes back
     * to saying "nothing is going here" while three runs are going.
     */
    @Test
    fun `the answers a live run carries are cut down like everything else`() {
        val runs = (1..60).joinToString(",") {
            """{"id":"r$it","scenarioName":"Nightly","inputs":{"ticket":"$PASTED"}}"""
        }
        val out = RemoteFeed.forPhone(RemoteFeed.SCENARIO_LIVE, """{"type":"scenarioLive","runs":[$runs]}""").message

        assertFalse(out.contains(PASTED))
        assertTrue(out.contains(""""id":"r40""""))
        assertFalse(out.contains(""""id":"r41""""))
    }

    /** The same answers, on the summaries of runs that are over. */
    @Test
    fun `the answers a past run carries are cut down too`() {
        val out = RemoteFeed.forPhone(
            RemoteFeed.SCENARIOS,
            """{"type":"scenarios","scenarios":[],"schedules":[],"canShare":true,""" +
                """"runs":[{"id":"r1","scenarioName":"Nightly","inputs":{"ticket":"$PASTED"}}]}""",
        ).message

        assertFalse(out.contains(PASTED))
        assertTrue(out.contains(""""id":"r1""""))
    }

    /*
     * One scenario, whole - and the one place on this road where shortening is forbidden.
     *
     * What an editor is shown is what it saves back, so a prompt cut to fit a frame would take a
     * paragraph out of somebody's repository the moment Save was pressed.
     */
    @Test
    fun `one scenario asked for by name keeps every word`() {
        val body = """{"type":"scenarioFetched","id":"s1","scope":"user",""" +
            """"scenario":{"id":"s1","name":"Nightly","head":{"briefing":"$LONG"},""" +
            """"stages":[{"id":"st","cards":[{"id":"c","prompt":"$LONG","dod":"$LONG"}]}]}}"""

        val out = RemoteFeed.forPhone(RemoteFeed.SCENARIO_FETCHED, body).message

        assertTrue(out.contains(LONG))
        assertFalse(out.contains("tooBig"))
    }

    /** And one over the budget travels without its body, saying so - rather than travelling short. */
    @Test
    fun `a scenario too big to carry is refused rather than shortened`() {
        val huge = "x".repeat(60 * 1024)
        val body = """{"type":"scenarioFetched","id":"s1","scope":"user",""" +
            """"scenario":{"id":"s1","name":"Nightly","head":{"briefing":"$huge"},"stages":[]}}"""

        val out = RemoteFeed.forPhone(RemoteFeed.SCENARIO_FETCHED, body).message

        assertFalse(out.contains(huge))
        assertTrue(out.contains(""""tooBig":true"""))
        // What it was asked about survives, so the screen knows which one it could not open.
        assertTrue(out.contains(""""id":"s1""""))
    }

    /** What a model just wrote goes the same way: it opens in the same editor and is saved from it. */
    @Test
    fun `a drafted scenario is held to the same rule`() {
        val huge = "x".repeat(60 * 1024)
        val out = RemoteFeed.forPhone(
            RemoteFeed.SCENARIO_DRAFTED,
            """{"type":"scenarioDrafted","id":"d1","scenario":{"name":"$huge"}}""",
        ).message

        assertFalse(out.contains(huge))
        assertTrue(out.contains(""""tooBig":true"""))
    }

    /*
     * A step's conversation, cut from the END.
     *
     * This used to be refused outright, because a card that walked a repository leaves megabytes and an
     * oversized frame is thrown away whole. Refusing was the wrong answer to a real problem: what
     * somebody wants off a step at three in the morning is how it finished, which is the part that fits.
     */
    @Test
    fun `a step's log is cut from the beginning and says so`() {
        val event = """{"type":"assistant","text":"${"y".repeat(4000)}"}"""
        val events = (1..40).joinToString(",") { event }
        val body = """{"type":"scenarioLog","runId":"r1","key":"k","found":true,"truncated":false,"events":[$events]}"""

        val out = RemoteFeed.forPhone(RemoteFeed.SCENARIO_LOG, body).message

        assertTrue(out.length < body.length)
        assertTrue(out.contains(""""truncated":true"""))
        assertTrue(out.contains(""""runId":"r1""""))
    }

    /** A log that fits is left exactly as it was - including its own word about the beginning. */
    @Test
    fun `a short log travels whole`() {
        val body = """{"type":"scenarioLog","runId":"r1","key":"k","found":true,"truncated":false,"events":[{"a":1}]}"""

        assertEquals(body, RemoteFeed.forPhone(RemoteFeed.SCENARIO_LOG, body).message)
    }

    /** Long enough to be recognisable in the output, and to be the weight the trimming is about. */
    private val LONG = "the whole of what this card says to its agent, at length"

    /** A paragraph pasted into an answer field, which is what these have no ceiling on. */
    private val PASTED = "the whole description of the ticket, pasted into the answer field, ".repeat(4)
}

package io.github.crmapache.amazingclaudecode.claude

import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertFalse
import kotlin.test.assertSame
import kotlin.test.assertTrue

class SessionSnapshotTest {

    private fun apply(vararg messages: String): SessionSnapshot =
        messages.fold(SessionSnapshot()) { snapshot, message -> SessionSnapshots.apply(snapshot, message) }

    @Test
    fun `the status follows the shell's own message`() {
        assertEquals(
            SessionSnapshot.STATUS_RUNNING,
            apply("""{"type":"status","sessionId":"main","state":"running"}""").status,
        )
    }

    @Test
    fun `a title from the model is remembered along with where it came from`() {
        val snapshot = apply("""{"type":"sessionTitle","sessionId":"main","title":"fix the parser"}""")

        assertEquals("fix the parser", snapshot.title)
        assertEquals(SessionSnapshot.TITLE_LLM, snapshot.titleSource)
    }

    // The interface is told about a refusal and stays in the mode it was in - the snapshot has to agree,
    // or a phone would show a mode the conversation is not in.
    @Test
    fun `a refused mode change does not move the snapshot`() {
        val snapshot = apply(
            """{"type":"mode","sessionId":"main","mode":"plan","applied":true}""",
            """{"type":"mode","sessionId":"main","mode":"auto","applied":false,"error":"not available"}""",
        )

        assertEquals("plan", snapshot.permissionMode)
    }

    @Test
    fun `a refused model change does not move the snapshot either`() {
        val snapshot = apply(
            """{"type":"model","sessionId":"main","model":"opus","applied":true}""",
            """{"type":"model","sessionId":"main","model":"forbidden","applied":false}""",
        )

        assertEquals("opus", snapshot.model)
    }

    @Test
    fun `the context window is kept as both figures or not at all`() {
        val snapshot = apply("""{"type":"context","sessionId":"main","used":1200,"max":200000}""")

        assertEquals(1200, snapshot.contextUsed)
        assertEquals(200000, snapshot.contextMax)
    }

    // The one state a client cannot work out for itself: "nothing is happening here" and "the work is
    // done" are both idle, and only this tells them apart (see SessionSnapshot.worked).
    @Test
    fun `a turn that ran and ended counts as work done`() {
        val running = apply("""{"type":"status","sessionId":"main","state":"running"}""")
        assertFalse(running.worked)

        val ended = SessionSnapshots.apply(running, """{"type":"status","sessionId":"main","state":"idle"}""")
        assertTrue(ended.worked)
    }

    @Test
    fun `a conversation that has never run has no work behind it`() {
        assertFalse(apply("""{"type":"status","sessionId":"main","state":"idle"}""").worked)
    }

    // A crash is not work done, and it arrives as its own message rather than as a status - so the two
    // cannot be confused for one another.
    @Test
    fun `a process dying mid-turn is not work done`() {
        val snapshot = apply(
            """{"type":"status","sessionId":"main","state":"running"}""",
            """{"type":"processExited","sessionId":"main","exitCode":1}""",
        )

        assertFalse(snapshot.worked)
    }

    // What was finished stays finished: a new turn on top of it does not erase the fact.
    @Test
    fun `work done survives the turns that follow it`() {
        val snapshot = apply(
            """{"type":"status","sessionId":"main","state":"running"}""",
            """{"type":"status","sessionId":"main","state":"idle"}""",
            """{"type":"status","sessionId":"main","state":"running"}""",
        )

        assertTrue(snapshot.worked)
    }

    @Test
    fun `a permission puts the conversation into waiting and an answer takes it out`() {
        val asked = apply("""{"type":"permission","id":"req-1","sessionId":"main","toolName":"Write"}""")
        assertTrue(asked.awaitsYou)

        val answered = SessionSnapshots.apply(
            asked,
            """{"type":"permissionResolved","id":"req-1","sessionId":"main","decision":"once"}""",
        )
        assertFalse(answered.awaitsYou)
    }

    @Test
    fun `two permissions both have to be answered`() {
        val snapshot = apply(
            """{"type":"permission","id":"req-1","sessionId":"main"}""",
            """{"type":"permission","id":"req-2","sessionId":"main"}""",
            """{"type":"permissionResolved","id":"req-1","sessionId":"main"}""",
        )

        assertTrue(snapshot.awaitsYou)
        assertEquals(setOf("req-2"), snapshot.pendingPermissions)
    }

    @Test
    fun `a dead process leaves nothing running`() {
        val snapshot = apply(
            """{"type":"status","sessionId":"main","state":"running"}""",
            """{"type":"processExited","sessionId":"main","exitCode":1}""",
        )

        assertTrue(snapshot.crashed)
        assertEquals(SessionSnapshot.STATUS_IDLE, snapshot.status)
    }

    // The only moment the model and the mode can be learned without anyone choosing them: after a
    // restart, after /clear, on a tab opened from the history.
    @Test
    fun `a process reporting its own start fills in the model and the mode`() {
        val snapshot = apply(
            """{"type":"agent","sessionId":"main","event":{"type":"system","subtype":"init",""" +
                """"model":"claude-opus-5","permissionMode":"acceptEdits"}}""",
        )

        assertEquals("claude-opus-5", snapshot.model)
        assertEquals("acceptEdits", snapshot.permissionMode)
    }

    @Test
    fun `a live process again means the crash is over`() {
        val snapshot = apply(
            """{"type":"processExited","sessionId":"main","exitCode":1}""",
            """{"type":"agent","sessionId":"main","event":{"type":"system","subtype":"init"}}""",
        )

        assertFalse(snapshot.crashed)
    }

    // Almost all the traffic is feed content, and walking it through a JSON parse would put one on the
    // stream's hot path for nothing.
    @Test
    fun `feed content leaves the snapshot exactly as it was`() {
        val snapshot = SessionSnapshot(status = SessionSnapshot.STATUS_RUNNING)
        val message = """{"type":"agent","sessionId":"main","event":{"type":"assistant",""" +
            """"message":{"content":[{"type":"text","text":"hello"}]}}}"""

        assertSame(snapshot, SessionSnapshots.apply(snapshot, message))
    }

    // --- Background agents ---------------------------------------------------
    //
    // The one thing that tells "this turn ended" from "the work ended": a request that raised background
    // agents ends in as many turns as there were agents, and the phone was told the work was done after
    // each of them (see NotificationReasons).

    private fun taskStarted(id: String, type: String = "local_agent"): String =
        """{"type":"agent","sessionId":"main","event":{"type":"system","subtype":"task_started",""" +
            """"task_id":"$id","task_type":"$type"}}"""

    private fun taskDone(id: String): String =
        """{"type":"agent","sessionId":"main","event":{"type":"system","subtype":"task_notification",""" +
            """"task_id":"$id","status":"completed"}}"""

    @Test
    fun `an agent is counted from its launch until it reports back`() {
        assertEquals(setOf("a1"), apply(taskStarted("a1")).pendingAgents)
        assertEquals(setOf("a2"), apply(taskStarted("a1"), taskStarted("a2"), taskDone("a1")).pendingAgents)
        assertTrue(apply(taskStarted("a1"), taskDone("a1")).pendingAgents.isEmpty())
    }

    // A dev server raised through "!" travels the same channel and never reports back at all - counted as
    // work, it would silence the notification for the rest of the day.
    @Test
    fun `a terminal command on the same channel is not an agent`() {
        assertTrue(apply(taskStarted("b1", type = "local_bash")).pendingAgents.isEmpty())
    }

    // An old CLI sent only subagents this way and named no type at all.
    @Test
    fun `a launch with no type at all still counts as an agent`() {
        val message = """{"type":"agent","sessionId":"main","event":{"type":"system",""" +
            """"subtype":"task_started","task_id":"a1"}}"""

        assertEquals(setOf("a1"), apply(message).pendingAgents)
    }

    @Test
    fun `agents of a past conversation being replayed are not running now`() {
        val message = """{"type":"agent","sessionId":"main","replay":true,"event":{"type":"system",""" +
            """"subtype":"task_started","task_id":"old","task_type":"local_agent"}}"""

        assertTrue(apply(message).pendingAgents.isEmpty())
    }

    // They have no closing event of their own, so without this the count would stand for as long as the
    // conversation lives - and the notification with it.
    @Test
    fun `a process taking its agents down clears the count`() {
        val died = apply(taskStarted("a1"), """{"type":"processExited","sessionId":"main","exitCode":1}""")
        assertTrue(died.pendingAgents.isEmpty())

        val swapped = apply(taskStarted("a1"), """{"type":"processReplaced","sessionId":"main"}""")
        assertTrue(swapped.pendingAgents.isEmpty())
    }

    @Test
    fun `a malformed message changes nothing`() {
        val snapshot = SessionSnapshot(status = SessionSnapshot.STATUS_RUNNING)

        assertSame(snapshot, SessionSnapshots.apply(snapshot, """{"type":"status" broken"""))
    }
}

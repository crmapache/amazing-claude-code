package io.github.crmapache.amazingclaudecode.scenario

import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertFalse
import kotlin.test.assertTrue

/**
 * Whether a card still has helpers at work in the background when its turn ends (see BackgroundWork).
 *
 * Written from a live run: a roas-radar /rr-plan card sent its plan to three reviewers in the background,
 * ended its turn on "waiting for them", and the head sent it back for the report it was about to write.
 */
class BackgroundWorkTest {

    /*
     * Recorded off CLI 2.1.280 in the panel's own launch mode (stream-json both ways), trimmed of ids and
     * bulk. The agent was asked to sleep, and backgrounded its own sleep, so its first report came early;
     * the command finishing woke it again. The card's own words are the three results.
     *
     * At the second result the agent has reported, but too early: its own command is still running, and
     * its end wakes the agent for the real report. That command is a helper's, so it is still waited for,
     * and the card is judged on the third result.
     */
    @Test
    fun `a recorded stream is busy until the helper's own command is done`() {
        val recorded = listOf(
            """{"type":"system","subtype":"init"}""",
            """{"type":"system","subtype":"background_tasks_changed","tasks":[{"task_id":"a828eb007e693a62f","task_type":"local_agent","description":"Sleep for 25 seconds then report"}]}""",
            """{"type":"system","subtype":"task_started","task_id":"a828eb007e693a62f","tool_use_id":"toolu_01Qm2TjyN6iVYFWdwg93mvzu","description":"Sleep for 25 seconds then report","subagent_type":"general-purpose","is_backgrounded":true,"spawn_depth":1,"task_type":"local_agent"}""",
            """{"type":"result","subtype":"success","result":"WAITING"}""",
            """{"type":"system","subtype":"background_tasks_changed","tasks":[{"task_id":"a828eb007e693a62f","task_type":"local_agent","description":"Sleep for 25 seconds then report"},{"task_id":"bo1e6m8rv","task_type":"local_bash","description":"Sleep for 25 seconds"}]}""",
            """{"type":"system","subtype":"task_started","task_id":"bo1e6m8rv","owned_by_subagent":true,"tool_use_id":"toolu_01Cvp4P4qpHEPRAQNF4aT9jg","description":"Sleep for 25 seconds","is_backgrounded":true,"task_type":"local_bash"}""",
            """{"type":"system","subtype":"background_tasks_changed","tasks":[{"task_id":"bo1e6m8rv","task_type":"local_bash","description":"Sleep for 25 seconds"}]}""",
            """{"type":"system","subtype":"task_notification","task_id":"a828eb007e693a62f","tool_use_id":"toolu_01Qm2TjyN6iVYFWdwg93mvzu","status":"completed","summary":"The sleep command is running in the background. I'll reply once it completes."}""",
            """{"type":"system","subtype":"init"}""",
            """{"type":"result","subtype":"success","result":"FINAL"}""",
            """{"type":"system","subtype":"background_tasks_changed","tasks":[]}""",
            """{"type":"system","subtype":"task_notification","task_id":"bo1e6m8rv","tool_use_id":"toolu_01Cvp4P4qpHEPRAQNF4aT9jg","status":"completed","summary":"Background command \"Sleep for 25 seconds\" completed (exit code 0)"}""",
            """{"type":"system","subtype":"background_tasks_changed","tasks":[{"task_id":"a828eb007e693a62f","task_type":"local_agent","description":"Sleep for 25 seconds then report"}]}""",
            """{"type":"system","subtype":"task_started","task_id":"a828eb007e693a62f","tool_use_id":"toolu_01Qm2TjyN6iVYFWdwg93mvzu","description":"Sleep for 25 seconds then report","subagent_type":"general-purpose","is_backgrounded":true,"spawn_depth":1,"task_type":"local_agent"}""",
            """{"type":"system","subtype":"background_tasks_changed","tasks":[]}""",
            """{"type":"system","subtype":"task_notification","task_id":"a828eb007e693a62f","tool_use_id":"toolu_01Qm2TjyN6iVYFWdwg93mvzu","status":"completed","summary":"done"}""",
            """{"type":"system","subtype":"init"}""",
            """{"type":"result","subtype":"success","result":"FINAL"}""",
        )

        assertEquals(listOf(true, true, false), busyAtEveryResult(recorded))
    }

    @Test
    fun `an agent is waited for until it reports`() {
        val work = BackgroundWork()

        work.read(level(task("a1", "local_agent")))
        assertTrue(work.busy())

        work.read(level())
        assertFalse(work.busy())
    }

    @Test
    fun `a workflow and a backgrounded tool call are waited for too`() {
        val work = BackgroundWork()

        work.read(level(task("w1", "local_workflow")))
        assertTrue(work.busy())

        work.read(level(task("m1", "mcp_task")))
        assertTrue(work.busy())
    }

    /*
     * A dev server never reports anything: waited for, it would hold the card until its three-hour
     * ceiling took the run down.
     */
    @Test
    fun `a command the card left running is not waited for`() {
        val work = BackgroundWork()

        work.read(level(task("b1", "local_bash")))
        work.read(started("b1", "local_bash"))

        assertFalse(work.busy())
    }

    /*
     * Who started a command is said only by its start, and the set comes before it (measured on
     * 2.1.280) - the two are joined by id.
     */
    @Test
    fun `a command a helper started is waited for, for a while`() {
        val work = BackgroundWork()

        work.read(level(task("b1", "local_bash")), now = 0)
        work.read(helpersCommand("b1"), now = 0)

        assertTrue(work.busy(now = 0))
        assertTrue(work.busy(now = BackgroundWork.HELPERS_COMMAND_MS - 1))
        assertFalse(work.overdue(now = BackgroundWork.HELPERS_COMMAND_MS - 1))
        assertFalse(work.busy(now = BackgroundWork.HELPERS_COMMAND_MS), "a dev server a helper left behind is not waited for all night")
        assertTrue(work.overdue(now = BackgroundWork.HELPERS_COMMAND_MS), "and the head is told it was given up on")
    }

    @Test
    fun `a helper's command that ended is not waited for`() {
        val work = BackgroundWork()
        work.read(level(task("b1", "local_bash")), now = 0)
        work.read(helpersCommand("b1"), now = 0)

        work.read(level(), now = 1)
        work.read(notified("b1"), now = 1)
        assertFalse(work.busy(now = 1))

        // The same id seen again later is a set without its start: nothing says whose it is now.
        work.read(level(task("b1", "local_bash")), now = 2)
        assertFalse(work.busy(now = 2))
    }

    /*
     * Caught in the sandbox, two helpers: the second one's command ran into the Bash timeout and the CLI
     * moved it to the background; the helper reported "moved to the background, waiting for it" and
     * counted as done. Its start came in the foreground, outside any set (recorded on 2.1.280: started with
     * is_backgrounded false, joined the set only when moved), and the set sent when the first helper
     * finished took the mark off - so the card was judged three times on "still waiting" and failed.
     */
    @Test
    fun `a helper's command moved to the background after its timeout is waited for`() {
        val work = BackgroundWork()

        work.read(level(task("h1", "local_agent"), task("h2", "local_agent")), now = 0)
        work.read(
            """{"type":"system","subtype":"task_started","task_id":"bm0zyz70l","owned_by_subagent":true,"description":"python3 -c sleep","is_backgrounded":false,"task_type":"local_bash"}""",
            now = 1,
        )
        work.read(level(task("h2", "local_agent")), now = 2)
        work.read(notified("h1"), now = 2)
        work.read(level(task("h2", "local_agent"), task("bm0zyz70l", "local_bash")), now = 3)
        work.read("""{"type":"system","subtype":"task_updated","task_id":"bm0zyz70l","patch":{"is_backgrounded":true}}""", now = 3)
        work.read(level(task("bm0zyz70l", "local_bash")), now = 4)
        work.read(notified("h2"), now = 4)

        assertTrue(work.busy(now = 5), "the helper's report came early: its command is still running")

        work.read(level(), now = 6)
        work.read(notified("bm0zyz70l"), now = 6)
        assertFalse(work.busy(now = 6))
    }

    @Test
    fun `a helper's command is waited for by the bookends too`() {
        val work = BackgroundWork()

        work.read(helpersCommand("b1"), now = 0)
        assertTrue(work.busy(now = 0))

        work.read(notified("b1"), now = 1)
        assertFalse(work.busy(now = 1))
    }

    @Test
    fun `what never reports back is not waited for`() {
        val work = BackgroundWork()

        work.read(
            level(
                task("r1", "remote_agent"),
                task("t1", "in_process_teammate"),
                task("m1", "monitor_mcp"),
                task("d1", "dream"),
                task("x1", "a_kind_nobody_has_heard_of"),
            ),
        )

        assertFalse(work.busy())
    }

    @Test
    fun `housekeeping is not waited for whatever its type`() {
        val work = BackgroundWork()

        work.read(level("""{"task_id":"a1","task_type":"local_agent","description":"tidy up","ambient":true}"""))

        assertFalse(work.busy())
    }

    @Test
    fun `without the whole set the bookends are paired`() {
        val work = BackgroundWork()

        work.read(started("a1", "local_agent"))
        work.read(started("b1", "local_bash"))
        assertTrue(work.busy())

        work.read(notified("a1"))
        assertFalse(work.busy())
    }

    // An older CLI sent only subagents down this channel, and sent no type with them.
    @Test
    fun `a task with no type is an agent`() {
        val work = BackgroundWork()

        work.read("""{"type":"system","subtype":"task_started","task_id":"a1","description":"review"}""")

        assertTrue(work.busy())
    }

    // The CLI's schema says as much: a missed bookend must not hold the set for ever.
    @Test
    fun `once the whole set has come, it alone decides`() {
        val work = BackgroundWork()

        work.read(started("a1", "local_agent"))
        work.read(level(task("a1", "local_agent")))
        work.read(level())
        assertFalse(work.busy(), "no notification came, and the set says nothing is running")

        work.read(started("a2", "local_agent"))
        assertFalse(work.busy(), "a bookend after the set is not read")
    }

    @Test
    fun `nothing else moves it`() {
        val work = BackgroundWork()
        work.read(level(task("a1", "local_agent")))

        for (line in listOf(
            """{"type":"system","subtype":"task_progress","task_id":"a1"}""",
            """{"type":"result","subtype":"success","result":"background_tasks_changed"}""",
            """{"type":"system","subtype":"background_tasks_changed","tasks":"not a list"}""",
            """{"type":"system","subtype":"task_notification","task_id":{"not":"a string"}}""",
            "not json at all, \"type\":\"system\" \"subtype\":\"task_notification\"",
        )) {
            work.read(line)
        }

        assertTrue(work.busy())
    }

    private fun busyAtEveryResult(lines: List<String>): List<Boolean> {
        val work = BackgroundWork()
        val busy = mutableListOf<Boolean>()
        for (line in lines) {
            work.read(line)
            if (line.startsWith("""{"type":"result"""")) busy += work.busy()
        }
        return busy
    }

    private fun task(id: String, type: String): String =
        """{"task_id":"$id","task_type":"$type","description":"$type $id"}"""

    private fun level(vararg tasks: String): String =
        """{"type":"system","subtype":"background_tasks_changed","tasks":[${tasks.joinToString(",")}]}"""

    private fun started(id: String, type: String): String =
        """{"type":"system","subtype":"task_started","task_id":"$id","description":"$type $id","task_type":"$type"}"""

    private fun helpersCommand(id: String): String =
        """{"type":"system","subtype":"task_started","task_id":"$id","owned_by_subagent":true,"description":"tests","is_backgrounded":true,"task_type":"local_bash"}"""

    private fun notified(id: String): String =
        """{"type":"system","subtype":"task_notification","task_id":"$id","status":"completed","summary":"done"}"""
}

package io.github.crmapache.amazingclaudecode.scenario

import kotlinx.serialization.json.Json
import kotlinx.serialization.json.JsonArray
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.JsonPrimitive
import kotlinx.serialization.json.booleanOrNull
import kotlinx.serialization.json.contentOrNull
import kotlinx.serialization.json.jsonObject

/**
 * The helpers a card started in the background and has not heard back from - what tells "this turn
 * ended" from "the card's work ended".
 *
 * A card that hands work to background agents ends its turn the moment it has raised them, with the work
 * only beginning, and every report from one of them starts a turn of the CLI's own accord. Judged on the
 * first ending, such a card reached the head as "sent the plan to three reviewers, waiting for them", and
 * the head spent one of its goes sending it back for the report it was about to write (recorded live on a
 * roas-radar /rr-plan card). Measured on CLI 2.1.280: the agent's `task_started` comes before the turn's
 * `result`, its `task_notification` after it, and then `system:init` and a new turn with the real answer.
 *
 * Two signals, and the newer one wins. `background_tasks_changed` carries the whole set of live background
 * tasks each time it changes, and the CLI's own schema tells hosts to replace their set with it rather
 * than pair the bookends, so that a bookend gone missing cannot hold the set for ever. A CLI that does not
 * send it still sends `task_started` and `task_notification`, which are paired here until the first set
 * arrives. A set belongs to one process: the engine reads each card's process with an object of its own.
 *
 * Waited for is only what reports back, which is a narrower rule than the panel's for its sounds (see
 * SessionSnapshot.pendingAgents). Waiting wrongly costs a card its three-hour ceiling and, most nights,
 * the run; not waiting costs one more go from the head, which is what happened before this. So:
 * - an agent and a workflow are waited for, and so is a backgrounded MCP call, which ends in a result;
 * - a terminal command the card started is not: a dev server never reports anything, the card may leave
 *   one running on purpose, and it is told to wait itself for a command it needs (see HeadTalk.CARD_BRIEFING);
 * - a command one of its helpers started is, for [HELPERS_COMMAND_MS] at most (see [helpersCommands]);
 * - a remote agent is not: the CLI says such a launch never reports an outcome;
 * - nor teammates, monitors or housekeeping (`ambient`), which stay up as long as the process does;
 * - a task with no type at all is an agent - an older CLI sent only subagents down this channel - while a
 *   type this code has never heard of is not waited for, for the reason the whole list is short.
 */
internal class BackgroundWork {

    private val json = Json { ignoreUnknownKeys = true; isLenient = true }

    /** The live tasks that report back to the card. */
    private val going = mutableSetOf<String>()

    /** The live terminal commands, whoever started them. */
    private val commands = mutableSetOf<String>()

    /**
     * The commands one of the card's helpers started, and when.
     *
     * A helper that sends its own tests to the background can report "the tests are running, I will
     * answer when they finish" and count as done; the command's end wakes it again, and its real report
     * comes after (recorded on 2.1.280, see the test). Judged in between, the card can be called done on
     * half a review and taken down with the helper still in it. Such a command is waited for - but only
     * for a while, because it may as well be a dev server, and that one never ends.
     *
     * Who started a command is said only by its `task_started`, not by the set, so the two are joined by
     * id: a command counts while it is in the set AND known to be a helper's. Which comes first depends on
     * the command. One started in the background is in the set before its start arrives; one the CLI moved
     * there after the Bash timeout starts in the foreground, outside the set, and joins it minutes later
     * (both measured on 2.1.280). So a helper's mark is never taken off for being missing from a set - a
     * set sent in between, when another helper finished, took it off, and the card was judged on "the
     * command was moved to the background, waiting for it" (caught in the sandbox). It goes with the
     * command's own end, which every task reports, set or no set.
     */
    private val helpersCommands = mutableMapOf<String, Long>()

    /** Whether the CLI has sent a whole set yet: from then on the bookends are not read (see the class). */
    private var levels = false

    /**
     * Whether a helper the card is waiting on is still at work.
     *
     * Asked by the engine from whichever thread it was entered on, while the card's own reader thread keeps
     * changing the sets - so both ends hold the same lock.
     */
    @Synchronized
    fun busy(now: Long = System.currentTimeMillis()): Boolean =
        going.isNotEmpty() ||
            commands.any { id -> helpersCommands[id]?.let { now - it < HELPERS_COMMAND_MS } == true }

    /** Whether a helper's command is still running past its allowance - what [busy] stopped waiting for. */
    @Synchronized
    fun overdue(now: Long = System.currentTimeMillis()): Boolean =
        commands.any { id -> helpersCommands[id]?.let { now - it >= HELPERS_COMMAND_MS } == true }

    @Synchronized
    fun read(line: String, now: Long = System.currentTimeMillis()) {
        if (!line.contains(SYSTEM) || MARKERS.none { line.contains(it) }) return
        val event = runCatching { json.parseToJsonElement(line).jsonObject }.getOrNull() ?: return
        if (event.str("type") != "system") return

        when (event.str("subtype")) {
            "background_tasks_changed" -> {
                val tasks = (event["tasks"] as? JsonArray ?: return).mapNotNull { it as? JsonObject }
                levels = true
                going.clear()
                going += tasks.filter(::waitedFor).map { it.str("task_id") }
                commands.clear()
                commands += tasks.filter(::command).map { it.str("task_id") }
            }

            "task_started" -> {
                // Read whatever the set says: this is the only place that names who started a command.
                if (command(event) && event.flag("owned_by_subagent")) helpersCommands[event.str("task_id")] = now
                if (levels) return
                if (waitedFor(event)) going += event.str("task_id")
                if (command(event)) commands += event.str("task_id")
            }

            "task_notification" -> {
                // The end of any task: what marks a helper's command goes with it, set or no set.
                helpersCommands -= event.str("task_id")
                if (levels) return
                going -= event.str("task_id")
                commands -= event.str("task_id")
            }
        }
    }

    private fun waitedFor(task: JsonObject): Boolean = live(task) && task.str("task_type") in REPORTING

    private fun command(task: JsonObject): Boolean = live(task) && task.str("task_type") == COMMAND

    private fun live(task: JsonObject): Boolean =
        task.str("task_id").isNotEmpty() && !task.flag("ambient") && !task.flag("skip_transcript")

    // Asked the forgiving way: a field of an unexpected shape is a field nobody said, not a throw on the
    // thread that reads the CLI's output (see HeadAnswer).
    private fun JsonObject.str(name: String): String = (this[name] as? JsonPrimitive)?.contentOrNull.orEmpty()

    private fun JsonObject.flag(name: String): Boolean = (this[name] as? JsonPrimitive)?.booleanOrNull == true

    companion object {
        /**
         * How long a command a helper started is waited for. Long enough for a test run or a build, short
         * enough that a dev server a helper left behind costs the card half an hour rather than the night.
         */
        const val HELPERS_COMMAND_MS = 30L * 60 * 1000

        private const val SYSTEM = "\"type\":\"system\""
        private val MARKERS = listOf(
            "\"subtype\":\"background_tasks_changed\"",
            "\"subtype\":\"task_started\"",
            "\"subtype\":\"task_notification\"",
        )

        /** The kinds of task that end by reporting to the card - see the class for the ones left out. */
        private val REPORTING = setOf("", "local_agent", "local_workflow", "mcp_task")

        private const val COMMAND = "local_bash"
    }
}

package io.github.crmapache.amazingclaudecode.claude

import kotlinx.serialization.json.Json
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.JsonPrimitive
import kotlinx.serialization.json.contentOrNull
import kotlinx.serialization.json.jsonObject
import kotlinx.serialization.json.jsonPrimitive

/**
 * Reading the agent's stream as far as the shell itself needs it.
 *
 * Parsing events in full has no place here - that is the interface's work. The shell cares about two
 * boundaries only: where a turn ended and where one began. It lights and clears the panel's "working"
 * state by them, and knows whether the conversation is free (see [ClaudeSession]).
 */
internal object AgentStream {

    /** Whether this line is a turn's result. */
    fun isTurnResult(line: String): Boolean = topLevel(line, "result") != null

    /**
     * Whether this line is the agent working right now.
     *
     * Needed for a turn that started on its own: that is how the CLI picks up a message written into
     * the previous turn. Such a turn does announce itself first (see [isTurnAnnouncement]), but the
     * announcement is the CLI's and can be missed, while work cannot be anything else (see
     * ClaudeSession.noteTurnActivity).
     *
     * The agent's reply and its own stream are the only events that cannot be anything else. System
     * events will not do: the process sends those just for being woken up, and the panel would light
     * up work over nothing.
     *
     * Work by a helper the agent launched in the background does not count as a turn start. Such
     * events carry the tool call that spawned them - the same mark the feed tells them apart by - and
     * they arrive even after the main turn's result, with no result of their own. Lighting up work by
     * them means lighting it up forever: there would be nothing left to clear it, and while the panel
     * thinks itself busy, the delivery check stands still.
     */
    fun isTurnActivity(line: String): Boolean {
        val payload = topLevel(line, "assistant", "stream_event") ?: return false
        return (payload["parent_tool_use_id"] as? JsonPrimitive)?.contentOrNull == null
    }

    /**
     * Whether this line is the CLI announcing a turn - the `system:init` it puts at the head of one.
     *
     * A turn we did not send anything for is a real thing rather than a curiosity: a background task
     * finishing is enough for the CLI to start one by itself, and it does so at once, before the agent
     * has said a word (measured on a recorded stream: `task_notification`, then `init`, then the
     * agent). Until this was read, the panel stood free for those seconds - so a message sent into that
     * gap went into a turn nobody knew was running, and a slash command sent there did nothing at all
     * (see ClaudeSessionHub.prompt).
     *
     * Announcing is not the same as starting: the very first `init` of a process is the process coming
     * up, which happens for a wake-up as much as for a send. Telling the two apart is the session's
     * business - it knows which init this is and whether a turn of ours is already running (see
     * ClaudeSession.noteTurnActivity).
     *
     * A subagent's own start-up carries a `task_id` and is not the conversation's turn - the same mark
     * the command list is read by (see ClaudeCommandNames).
     */
    fun isTurnAnnouncement(line: String): Boolean {
        val payload = topLevel(line, "system") ?: return false
        if (payload["subtype"]?.jsonPrimitive?.contentOrNull != "init") return false
        return payload["task_id"] == null
    }

    /**
     * The conversation's own name, the one the CLI picked for it by the first message - or nothing, if
     * this line is not about a name.
     *
     * Read here rather than in each of the two places that need it. Both the live stream and the saved
     * conversation carry the same event, and a panel that read it one way while the history list read
     * it another would name one and the same conversation differently in the tab and in the list.
     *
     * By pattern rather than by parsing the whole line: this is one field out of an event that arrives
     * many times over, and the transcript it is looked for in weighs megabytes.
     */
    fun aiTitle(line: String): String? {
        if (!line.contains("\"type\":\"ai-title\"")) return null
        return AI_TITLE.find(line)?.groupValues?.get(1)?.takeIf { it.isNotBlank() }
    }

    private val AI_TITLE = Regex("\"aiTitle\"\\s*:\\s*\"([^\"]+)\"")

    /**
     * The whole event - if the top-level type is one of the expected ones at all.
     *
     * A quick substring check settles almost everything, but on its own it is not enough: the very
     * same `"type":"result"` shows up inside the conversation too, as soon as the agent prints a tool
     * result carrying that text. Taking such text for a turn boundary means clearing (or lighting up)
     * the panel's work out of step, so in the doubtful case - a rare one - the line is parsed in full.
     */
    private fun topLevel(line: String, vararg expected: String): JsonObject? {
        if (expected.none { line.contains("\"type\":\"$it\"") }) return null

        return runCatching {
            val payload = Json.parseToJsonElement(line).jsonObject
            payload.takeIf { payload["type"]?.jsonPrimitive?.contentOrNull in expected }
        }.getOrNull()
    }
}

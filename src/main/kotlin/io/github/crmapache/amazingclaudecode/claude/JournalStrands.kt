package io.github.crmapache.amazingclaudecode.claude

import kotlinx.serialization.json.Json
import kotlinx.serialization.json.JsonArray
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.contentOrNull
import kotlinx.serialization.json.jsonObject
import kotlinx.serialization.json.jsonPrimitive

/**
 * Which strand a line of the agent's stream belongs to, if any - see SessionJournal.Strand.
 *
 * Two kinds of traffic run beside the conversation and are told apart here, on the line as the CLI wrote
 * it: a subagent's own stream (every event carries the call that launched it in `parent_tool_use_id`),
 * and a background task's progress (`task_progress`, with the fleet's whole report in
 * `workflow_progress` when the task is a workflow). Everything else is the conversation itself.
 *
 * A line is parsed only when a cheap look says it may be one of the two. Both marks are JSON structure
 * rather than text - inside a string the quotes would be escaped - so a line without them cannot be
 * either, and the conversation's own lines, the great majority, cost a substring search.
 */
internal object JournalStrands {

    fun of(line: String): SessionJournal.Strand? {
        val progress = line.contains(TASK_PROGRESS)
        if (!progress && !line.contains(SUBAGENT)) return null

        val event = runCatching { Json.parseToJsonElement(line).jsonObject }.getOrNull() ?: return null

        if (progress && event.text("type") == "system" && event.text("subtype") == "task_progress") {
            val taskId = event.text("task_id") ?: return null
            // A report is the fleet whole, and the card is drawn from the last one alone; the bare events
            // between two reports carry a label and nothing else (see applyTaskProgress in feed/tasks.ts).
            val report = (event["workflow_progress"] as? JsonArray)?.isNotEmpty() == true
            val kind = if (report) SessionJournal.Strand.Kind.REPORT else SessionJournal.Strand.Kind.DETAIL

            return SessionJournal.Strand("task:$taskId", kind)
        }

        val parent = event.text("parent_tool_use_id") ?: return null
        return SessionJournal.Strand("agent:$parent", SessionJournal.Strand.Kind.DETAIL)
    }

    private fun JsonObject.text(name: String): String? =
        runCatching { this[name]?.jsonPrimitive?.contentOrNull }.getOrNull()

    private const val TASK_PROGRESS = "\"subtype\":\"task_progress\""

    private const val SUBAGENT = "\"parent_tool_use_id\":\""
}

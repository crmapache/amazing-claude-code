package io.github.crmapache.amazingclaudecode.claude

import kotlinx.serialization.json.Json
import kotlinx.serialization.json.JsonArray
import kotlinx.serialization.json.contentOrNull
import kotlinx.serialization.json.jsonObject
import kotlinx.serialization.json.jsonPrimitive

/**
 * The names of the slash commands the agent itself knows - read out of the `system:init` event it sends
 * when a conversation's process comes up.
 *
 * This is the only place they can be learned from. The commands that live in files on disk the panel
 * finds by itself (see ClaudeCommandHints), but the MCP servers' ones - `/mcp__server__prompt` - exist
 * nowhere on disk: the CLI asks every connected server for its prompts and puts the answers into this
 * list. Neither `claude mcp list` nor the conversation's own transcript carries them (checked directly:
 * the transcript holds no init event at all), so a list once heard is worth remembering - see
 * ProjectCatalog.noteCommands.
 */
internal object ClaudeCommandNames {

    /**
     * The list out of one line of the stream, or null when the line is not a process's start-up or does
     * not carry a list at all.
     *
     * A subagent's own start-up is passed over: it carries a `task_id` and a catalogue of its own, which
     * may be narrower than the conversation's (a subagent is launched with the tools its definition
     * allows), and the field the panel hints from is the conversation's.
     */
    fun of(line: String): List<String>? {
        if (!line.contains(FIELD)) return null

        val event = runCatching { Json.parseToJsonElement(line).jsonObject }.getOrNull() ?: return null
        val text = { name: String -> event[name]?.jsonPrimitive?.contentOrNull }

        if (text("type") != "system" || text("subtype") != "init") return null
        if (event["task_id"] != null) return null

        val names = event["slash_commands"] as? JsonArray ?: return null

        return names.mapNotNull { it.jsonPrimitive.contentOrNull }.filter { it.isNotEmpty() }
    }

    /** A cheap look before parsing: this runs on every line of every conversation's stream. */
    private const val FIELD = "\"slash_commands\""
}

package io.github.crmapache.amazingclaudecode.claude

import kotlinx.serialization.json.Json
import kotlinx.serialization.json.JsonArray
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.booleanOrNull
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

    /** A command as the CLI's later catalogue describes it - see [changed]. */
    data class Described(
        val name: String,
        val description: String,
        val argumentHint: String,
        val builtin: Boolean,
        /**
         * Could be a mod's (`$.command.register`) - not a mark on its own, and read only together with "not in the
         * process's first catalogue" (see AddedCommands). The person's own skills look the same here (no `aliases`,
         * a plain name), and what keeps them out is that the first catalogue always has them. The mark is for the
         * two other kinds that arrive late in conversations without a mod, both measured on 2.1.293: the skills
         * synced from claude.ai carry an `aliases` field, and an MCP server's prompts are named for show -
         * `snakein:analyze (MCP)` - while a mod's command name is letters, digits, `_` and `-` up to 64 characters
         * (the documented limit on a mod's names). Should either ever change, a mod's command merely waits for
         * the next turn's catalogue again, as it always had.
         */
        val fromMod: Boolean,
    )

    /**
     * The catalogue out of a `system:commands_changed` line, or null when the line is not one.
     *
     * Newer CLIs (measured on 2.1.293) send the whole catalogue again whenever it changes, this time with each
     * command's description and argument hint and whether it is the CLI's own. It is the only place a
     * command a mod registers at start-up can be learned from before the next turn: the mod registers it
     * AFTER the process has reported its catalogue in `system:init`, so the first list a conversation
     * gives never has it (see ProjectCatalog.noteCommands).
     */
    fun changed(line: String): List<Described>? {
        if (!line.contains(CHANGED)) return null

        val event = runCatching { Json.parseToJsonElement(line).jsonObject }.getOrNull() ?: return null
        val text = { name: String -> event[name]?.jsonPrimitive?.contentOrNull }
        if (text("type") != "system" || text("subtype") != "commands_changed") return null
        if (event["task_id"] != null) return null

        val commands = event["commands"] as? JsonArray ?: return null
        return commands.mapNotNull { entry ->
            val command = entry as? JsonObject ?: return@mapNotNull null
            val field = { name: String -> runCatching { command[name]?.jsonPrimitive?.contentOrNull }.getOrNull() }
            val name = field("name")?.takeIf { it.isNotEmpty() } ?: return@mapNotNull null
            val builtin = runCatching { command["builtin"]?.jsonPrimitive?.booleanOrNull }.getOrNull() == true
            Described(
                name = name,
                description = field("description").orEmpty(),
                argumentHint = field("argumentHint").orEmpty(),
                builtin = builtin,
                fromMod = !builtin && !command.containsKey("aliases") && isModCommandName(name),
            )
        }
    }

    /** A name a mod may register - and not an MCP prompt's, should one ever be listed by its own name. */
    private fun isModCommandName(name: String): Boolean = MOD_COMMAND_NAME.matches(name) && !name.startsWith("mcp__")

    private val MOD_COMMAND_NAME = Regex("[A-Za-z0-9_-]{1,64}")

    /** A cheap look before parsing: this runs on every line of every conversation's stream. */
    private const val FIELD = "\"slash_commands\""

    private const val CHANGED = "\"subtype\":\"commands_changed\""
}

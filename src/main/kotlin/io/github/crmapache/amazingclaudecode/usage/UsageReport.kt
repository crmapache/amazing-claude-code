package io.github.crmapache.amazingclaudecode.usage

import io.github.crmapache.amazingclaudecode.stats.DayRecord
import io.github.crmapache.amazingclaudecode.stats.MinuteSet
import java.nio.charset.StandardCharsets
import java.security.MessageDigest
import java.util.Base64
import java.util.SortedMap
import kotlinx.serialization.json.JsonElement
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.JsonPrimitive
import kotlinx.serialization.json.add
import kotlinx.serialization.json.buildJsonArray
import kotlinx.serialization.json.buildJsonObject
import kotlinx.serialization.json.put

/**
 * The anonymous usage report: what a machine's days in the panel come to, in counts.
 *
 * Built out of the statistics book (see DayRecord) by picking figures by name - never by copying a record
 * and taking things out. That is the whole of the promise and it is kept by the shape of this file: a new
 * field added to the book does not travel until somebody writes it in here, and every name that does
 * travel is held to a list first.
 *
 * - The day's counts: minutes, messages, answers, edits and the like. Numbers only.
 * - The stretches of work that day - how long each sitting lasted, in minutes, never when it began.
 * - Tools by their built-in name (every MCP tool is "MCP", so no server's name leaves), models by family
 *   (a custom model's own name is "Other"), built-in commands by name (a command of one's own is
 *   "custom"), and the panel's features by the ids in UsageFeatures.
 * - The environment on one line: versions, the operating system's family, the processor's.
 * - The settings, as words the plugin itself chose ("bottom", "dark") and counts - never a model's name,
 *   a key, a path or a relay's address.
 *
 * What never travels, because nothing here reads it: the project's name or key, the hashes of the files
 * edited (only how many), the hours of the day, the tokens and the cost, the account, the text of
 * anything.
 */
internal object UsageReport {

    data class Environment(
        val plugin: String,
        val ide: String,
        val ideVersion: String,
        val os: String,
        val arch: String,
        val cli: String,
        val lang: String,
    )

    /** One day as it travels, with a digest of it - what tells a day that changed from one already sent. */
    data class Day(val day: String, val json: JsonObject, val digest: String)

    const val SCHEMA = 1

    /** A gap longer than this ends a sitting: half an hour away from the panel is a break, not a pause. */
    const val SITTING_GAP_MINUTES = 30

    /** How far back a report reaches. A day not sent within a fortnight is let go rather than sent late. */
    const val DAYS_BACK = 14L

    /**
     * The days worth sending: from [from] on (the day the person said yes, or two weeks back, whichever is
     * later), and only those that saw anything at all.
     */
    fun days(together: SortedMap<String, DayRecord>, from: String): List<Day> =
        together.tailMap(from).mapNotNull { (day, record) ->
            if (!record.isActive() && record.features.isEmpty()) return@mapNotNull null
            val json = dayJson(day, record)
            Day(day, json, digest(json))
        }

    fun report(id: String, environment: Environment, settings: Map<String, Any>, days: List<Day>): JsonObject =
        buildJsonObject {
            put("schema", SCHEMA)
            put("install", id)
            put(
                "env",
                buildJsonObject {
                    put("plugin", environment.plugin)
                    put("ide", environment.ide)
                    put("ideVersion", environment.ideVersion)
                    put("os", environment.os)
                    put("arch", environment.arch)
                    put("cli", environment.cli)
                    put("lang", environment.lang)
                },
            )
            put("settings", buildJsonObject { for ((name, value) in settings) put(name, primitive(value)) })
            put("days", buildJsonArray { days.forEach { add(it.json) } })
        }

    fun dayJson(day: String, record: DayRecord): JsonObject = buildJsonObject {
        put("day", day)
        put("minutes", record.minutes.count())
        put("conversations", record.sessions)
        put("prompts", record.prompts)
        put("turns", record.turns)
        put("turnSeconds", record.turnMillis / 1000)
        put("phonePrompts", record.phonePrompts)
        put("phoneActions", record.phoneActions)
        put("forks", record.forks)
        put("edits", record.edits)
        put("linesAdded", record.linesAdded)
        put("linesRemoved", record.linesRemoved)
        put("filesEdited", record.files.size)
        put("permissionsAsked", record.permissionsAsked)
        put("permissionsDenied", record.permissionsDenied)
        put("plansApproved", record.plansApproved)
        put("todosDone", record.todosDone)
        put("attachments", record.attachments)
        put("quotes", record.quotes)
        put("ranOutFiveHour", record.ranOutFiveHour)
        put("watched", record.watched)
        put("mcpConnected", record.mcpConnected)
        put("plugins", record.plugins)
        put("longestConversation", record.longestSession)
        put("sittings", buildJsonArray { sittings(record.minutes).forEach { add(it) } })
        put("tools", counts(record.tools, ::toolName))
        put("models", counts(record.models, ::modelName))
        put("slash", counts(record.slash.associateWith { 1 }, ::commandName))
        put("features", counts(record.features.filterKeys { UsageFeatures.isKnown(it) }) { it })
    }

    /**
     * How long each stretch of work lasted, in minutes, in the order they came - the lengths and nothing
     * of when. A stretch ends at a gap of more than [SITTING_GAP_MINUTES]; a minute on its own is a
     * stretch of one.
     */
    fun sittings(minutes: MinuteSet): List<Int> {
        val marked = minutes.minutes()
        if (marked.isEmpty()) return emptyList()

        val out = mutableListOf<Int>()
        var start = marked[0]
        var end = marked[0]
        for (index in 1 until marked.size) {
            val minute = marked[index]
            if (minute - end > SITTING_GAP_MINUTES) {
                out += end - start + 1
                start = minute
            }
            end = minute
        }
        out += end - start + 1
        return out
    }

    /** A tool by its built-in name. The book already folds MCP tools into one name; anything odd is "other". */
    fun toolName(name: String): String = if (TOOL.matches(name)) name else "other"

    /** A model by family. The book names families already (see StatsCollector.familyOf) - except the unknown. */
    fun modelName(name: String): String = if (name in MODEL_FAMILIES) name else "Other"

    /** A built-in command by its name; a command of one's own - a skill, a file in .claude/commands - is "custom". */
    fun commandName(name: String): String = if (name in BUILT_IN_COMMANDS) name else "custom"

    private fun counts(map: Map<String, Int>, rename: (String) -> String): JsonObject {
        val folded = LinkedHashMap<String, Int>()
        for ((name, count) in map) {
            if (count <= 0) continue
            val key = rename(name)
            folded[key] = (folded[key] ?: 0) + count
        }
        return buildJsonObject { for ((name, count) in folded) put(name, count) }
    }

    private fun primitive(value: Any): JsonElement = when (value) {
        is Boolean -> JsonPrimitive(value)
        is Number -> JsonPrimitive(value)
        else -> JsonPrimitive(value.toString())
    }

    fun digest(json: JsonObject): String {
        val bytes = MessageDigest.getInstance("SHA-256").digest(json.toString().toByteArray(StandardCharsets.UTF_8))
        return Base64.getUrlEncoder().withoutPadding().encodeToString(bytes).take(16)
    }

    /** The CLI's own tool names: Read, Edit, WebFetch, TodoWrite. MCP arrives as "MCP" already. */
    private val TOOL = Regex("^[A-Z][A-Za-z]{1,39}$")

    private val MODEL_FAMILIES = setOf("Opus", "Sonnet", "Haiku", "Fable", "Mythos")

    /** Claude Code's own commands. A name not on this list is somebody's own and travels as "custom". */
    val BUILT_IN_COMMANDS: Set<String> = setOf(
        "add-dir", "agents", "bashes", "bug", "clear", "code-review", "compact", "config", "context", "cost",
        "design-login", "doctor", "exit", "export", "fast", "feedback", "help", "hooks", "ide", "init",
        "install-github-app", "login", "logout", "loop", "mcp", "memory", "model", "output-style",
        "permissions", "plugin", "plugins", "pr-comments", "privacy-settings", "release-notes", "resume",
        "review", "rewind", "schedule", "security-review", "simplify", "status", "statusline",
        "terminal-setup", "todos", "ultrareview", "upgrade", "usage", "vim",
    )
}

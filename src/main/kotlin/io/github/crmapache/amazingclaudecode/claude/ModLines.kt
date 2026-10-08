package io.github.crmapache.amazingclaudecode.claude

import kotlinx.serialization.json.Json
import kotlinx.serialization.json.JsonArray
import kotlinx.serialization.json.JsonNull
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.buildJsonObject
import kotlinx.serialization.json.contentOrNull
import kotlinx.serialization.json.jsonObject
import kotlinx.serialization.json.jsonPrimitive
import kotlinx.serialization.json.put
import kotlinx.serialization.json.putJsonArray
import kotlinx.serialization.json.putJsonObject

/**
 * What the stream says on behalf of a mod, and what this side does with each kind of it.
 *
 * A mod (Claude Code 2.1.287 and later) is a plugin whose code runs inside the CLI and may draw its own
 * interface. A host that has not attached a surface of its own - this one - still hears about it: the CLI
 * writes `system` lines with a `ui_` subtype into the stream (measured on 2.1.293). No such line exists
 * without a mod, so nothing here is reached by a conversation that has none.
 *
 * Three of them are words for the person - a toast, a status line, a line in the transcript - and two are
 * the mod's drawing: the panes it has open and the request to draw them again. The last one is the reason
 * this is decided before the journal rather than in the feed: the CLI repeats it up to ten times a second
 * for a mod that animates or keeps a clock, and every line the journal keeps pushes an older one out of a
 * budget of two thousand. Kept like the rest, a clock mod emptied the conversation out of its own journal in
 * minutes - a phone, a second window or a reloaded panel then came up on a feed of redraw requests.
 */
internal object ModLines {

    enum class Kind {
        /** Nothing anybody here can use: thrown away before it is kept or sent. */
        DROP,

        /** A state the latest line replaces - kept once per [slotOf] and handed to whoever joins. */
        STATE,

        /** True only now: sent to whoever is watching and not kept. */
        LIVE,

        /** A line of the conversation, kept like the rest of it - on a strand of its own, see [strandOf]. */
        FEED,
    }

    /** Null for every line that is not a mod's - which is every line of a conversation without one. */
    fun kindOf(line: String): Kind? = subtypeOf(line)?.let(::kindOfSubtype)

    /**
     * The one place a state line is kept under: a status line per mod - each mod owns one row - and one
     * list of open panes for the whole conversation, which is what the CLI sends every time.
     */
    fun slotOf(line: String): String? {
        val event = parse(line) ?: return null
        return when (event.text("subtype")) {
            STATUS -> "$STATUS_SLOT${event.text("plugin").orEmpty()}"
            PANES -> PANES
            else -> null
        }
    }

    /** Whether a state line takes its slot back to nothing: a status cleared, or no pane left open. */
    fun isNothing(line: String): Boolean {
        val event = parse(line) ?: return true
        return when (event.text("subtype")) {
            STATUS -> event.text("text").isNullOrEmpty()
            PANES -> (event["panes"] as? JsonArray)?.isEmpty() ?: true
            else -> false
        }
    }

    /**
     * A mod's lines in the transcript are kept apart from the conversation's own, so the phone's catch-up
     * thins them the way it thins a subagent's steps (see SessionJournal.Thinning): a mod that logs every
     * minute must not take a phone's whole budget for a conversation.
     */
    fun strandOf(line: String): SessionJournal.Strand =
        SessionJournal.Strand("mod:${parse(line)?.text("plugin").orEmpty()}", SessionJournal.Strand.Kind.DETAIL)

    /**
     * The lines that take a kept state off the screens: the CLI's own words for "nothing", so the screens
     * read them exactly as they read the CLI. Needed when the process is gone - its mods went with it, and
     * a status line or a pane notice left standing would speak for code that no longer runs.
     */
    fun cleared(slot: String): String? = when {
        slot == PANES -> buildJsonObject {
            put("type", "system")
            put("subtype", PANES)
            putJsonArray("panes") {}
        }.toString()
        slot.startsWith(STATUS_SLOT) -> buildJsonObject {
            put("type", "system")
            put("subtype", STATUS)
            put("plugin", slot.removePrefix(STATUS_SLOT))
            put("text", JsonNull)
        }.toString()
        else -> null
    }

    /**
     * Whether a question's call is a mod's. A mod asks through the CLI (`$.ui.ask`), and the CLI gives the
     * question an identifier of its own making - never one the API gave a tool call, which always begins
     * `toolu_01`, `toolu_vrtx_` or `toolu_bdrk_` - and no call in the conversation carries it (measured on
     * 2.1.293).
     */
    fun isModQuestion(toolUseId: String): Boolean = toolUseId.startsWith(MOD_QUESTION_PREFIX)

    /**
     * The card for a mod's question, as an event of the conversation's: kept in the journal like the call a
     * question of the model's would have been, so a phone, a second window and a reloaded panel all draw it
     * (see the `acc_mod_question` case in feed/build.ts). A subtype of this side's own making, which the CLI
     * never sends.
     */
    fun questionCard(sessionId: String, toolUseId: String, input: JsonObject): String =
        buildJsonObject {
            put("type", "agent")
            put("sessionId", sessionId)
            putJsonObject("event") {
                put("type", "system")
                put("subtype", MOD_QUESTION)
                put("tool_use_id", toolUseId)
                put("input", input)
            }
        }.toString()

    private fun kindOfSubtype(subtype: String): Kind = when (subtype) {
        STATUS, PANES -> Kind.STATE
        TOAST -> Kind.LIVE
        LOG -> Kind.FEED
        // The redraw request, and whatever else the CLI says to a surface this side never attached: there is
        // nothing here to draw it on, and the feed already passes over every subtype it does not know.
        else -> Kind.DROP
    }

    private fun subtypeOf(line: String): String? {
        // A cheap look first: this runs on every line of every conversation, and the mark is JSON structure
        // rather than text - inside a string its quotes would be escaped.
        if (!line.contains(MARK)) return null
        val event = parse(line) ?: return null
        if (event.text("type") != "system") return null
        return event.text("subtype")?.takeIf { it.startsWith(PREFIX) }
    }

    private fun parse(line: String): JsonObject? = runCatching { Json.parseToJsonElement(line).jsonObject }.getOrNull()

    private fun JsonObject.text(name: String): String? =
        runCatching { this[name]?.jsonPrimitive?.contentOrNull }.getOrNull()

    private const val PREFIX = "ui_"
    private const val STATUS_SLOT = "status:"
    private const val MARK = "\"subtype\":\"$PREFIX"

    private const val MOD_QUESTION_PREFIX = "toolu_plugin_"
    const val MOD_QUESTION = "acc_mod_question"

    const val STATUS = "ui_status"
    const val PANES = "ui_panes"
    const val TOAST = "ui_toast"
    const val LOG = "ui_log"
}

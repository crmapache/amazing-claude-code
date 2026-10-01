package io.github.crmapache.amazingclaudecode.scenario

import io.github.crmapache.amazingclaudecode.claude.AgentStream
import kotlinx.serialization.json.Json
import kotlinx.serialization.json.JsonArray
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.JsonPrimitive
import kotlinx.serialization.json.contentOrNull
import kotlinx.serialization.json.jsonObject

/**
 * What a session said each time it meant to end its turn - not only the last time.
 *
 * The CLI's own account of a turn, the `result` it closes with, is the text of the turn's LAST message,
 * and a turn can end more than once. A project's Stop hook refuses the ending and sends the agent back to
 * work - a style pass over the code it touched, a type check - and the agent's last words are then about
 * that, not about the work. Read from `result` alone, a card that finished a two-hour task with a full
 * report reached the head as "went over the style once more, fixed two comments", and the head sent it
 * back for the report it had already written (recorded live on a roas-radar run: the report and the
 * style note forty seconds apart, the card re-ran every check on the strength of it). Nearly every build
 * card in that project ends that way, because its style hook fires once per session, right after the
 * final report.
 *
 * An ending is a message the model closed with `end_turn`: the one stop reason that means "I am done"
 * rather than "run this tool". The stop reason travels only in the stream's `message_delta` - the
 * `assistant` events carry the text but leave the reason empty - so the text is gathered from those
 * events by message and committed when its delta says it ended the turn. A subagent's messages carry
 * the call that spawned them and are not the session's own (the same mark as AgentStream.isTurnActivity).
 *
 * The `result` stays the safety net. A stream without the deltas - another launch, a CLI that stops
 * sending them - still leaves the last words as they always were, and a result that adds something the
 * endings do not hold is kept beside them.
 */
internal class TurnEndings {

    private val json = Json { ignoreUnknownKeys = true; isLenient = true }

    /** The message being read and its words so far. */
    private var message = ""
    private val words = StringBuilder()

    /** The endings of the turn still going. */
    private val going = mutableListOf<String>()

    /**
     * The endings of the last turn that finished, oldest first.
     *
     * Replaced whole on every `result` rather than added to: a turn cut short by our own interrupt closes
     * with a result of its own, and its words must not lead the answer of the turn after it.
     */
    var last: List<String> = emptyList()
        private set

    fun read(line: String) {
        when {
            AgentStream.isTurnResult(line) -> finish(line)
            line.contains(ASSISTANT) -> parse(line)?.let(::gather)
            line.contains(MESSAGE_DELTA) -> parse(line)?.let(::close)
        }
    }

    /** Forget everything: a fresh turn of a fresh question. */
    fun clear() {
        message = ""
        words.setLength(0)
        going.clear()
        last = emptyList()
    }

    private fun gather(event: JsonObject) {
        if (event.str("type") != "assistant" || !ownMessage(event)) return
        val body = event["message"] as? JsonObject ?: return

        val id = body.str("id")
        if (id != message) {
            message = id
            words.setLength(0)
        }

        val blocks = body["content"] as? JsonArray ?: return
        for (block in blocks) {
            val text = (block as? JsonObject)?.takeIf { it.str("type") == "text" }?.str("text").orEmpty()
            if (text.isBlank()) continue
            if (words.isNotEmpty()) words.append("\n\n")
            words.append(text.trim())
        }
    }

    private fun close(event: JsonObject) {
        if (event.str("type") != "stream_event" || !ownMessage(event)) return
        val delta = (event["event"] as? JsonObject)?.takeIf { it.str("type") == "message_delta" }
            ?.get("delta") as? JsonObject ?: return
        if (delta.str("stop_reason") != "end_turn") return

        if (words.isNotBlank()) going += words.toString()
        message = ""
        words.setLength(0)
    }

    private fun finish(line: String) {
        val said = parse(line)?.str("result").orEmpty().trim()
        val endings = going.toMutableList()
        // The last ending is the result itself on every ordinary turn; anything else it says is kept.
        if (said.isNotEmpty() && endings.lastOrNull()?.contains(said) != true) endings += said

        last = endings
        going.clear()
        message = ""
        words.setLength(0)
    }

    private fun ownMessage(event: JsonObject): Boolean = event.str("parent_tool_use_id").isEmpty()

    private fun parse(line: String): JsonObject? = runCatching { json.parseToJsonElement(line).jsonObject }.getOrNull()

    // Asked the forgiving way: a field of an unexpected shape is a field nobody said, not a throw on the
    // thread that reads the CLI's output (see HeadAnswer).
    private fun JsonObject.str(name: String): String = (this[name] as? JsonPrimitive)?.contentOrNull.orEmpty()

    private companion object {
        const val ASSISTANT = "\"type\":\"assistant\""
        const val MESSAGE_DELTA = "\"message_delta\""
    }
}

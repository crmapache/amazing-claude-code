package io.github.crmapache.amazingclaudecode.claude

import kotlinx.serialization.json.Json
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.contentOrNull
import kotlinx.serialization.json.jsonObject
import kotlinx.serialization.json.jsonPrimitive

/**
 * The answer being printed right now - the part of it that has arrived so far.
 *
 * The deltas it is made of are the one thing that does not go into the journal. They arrive dozens a
 * second, and every one of them is superseded a moment later by the finished block that carries the
 * same words whole: keeping them would spend the journal's whole budget on text that is about to be
 * repeated.
 *
 * But a client joining in the middle of a turn cannot be shown nothing either - the conversation would
 * look frozen for as long as the answer takes. So the deltas are folded up here as they pass, and a
 * new client is handed the fold in one piece and then carries on from the live ones.
 *
 * The rules for what counts are the interface's rules (see the stream_event case in feed/build.ts), and
 * they have to stay the same rules: a fold assembled differently from the feed it joins would show a
 * paragraph twice or lose one.
 */
internal class SessionStream(private val maxChars: Int = MAX_CHARS) {

    private val text = StringBuilder()
    private val thinking = StringBuilder()

    /**
     * Take a line of the agent's stream.
     *
     * True means it was a delta - something the journal should not keep. Everything else the caller
     * goes on to handle as usual; this only watches for the moment the fold stops being needed.
     */
    @Synchronized
    fun accept(line: String): Boolean {
        if (line.contains(STREAM_MARKER)) {
            append(line)
            return true
        }

        // The finished message carries the same words whole, and from here on it is the feed that holds
        // them. A fold left standing would be drawn a second time under the answer.
        if (line.contains(ASSISTANT_MARKER) && isMainStream(line)) clear()

        return false
    }

    @Synchronized
    fun text(): String = text.toString()

    @Synchronized
    fun thinking(): String = thinking.toString()

    @Synchronized
    fun isEmpty(): Boolean = text.isEmpty() && thinking.isEmpty()

    @Synchronized
    fun clear() {
        text.setLength(0)
        thinking.setLength(0)
    }

    private fun append(line: String) {
        val event = runCatching { Json.parseToJsonElement(line).jsonObject }.getOrNull() ?: return
        if (event.field("type") != "stream_event") return

        // A subagent prints into a card of its own rather than into the conversation - see the same
        // condition in build.ts.
        if (event["parent_tool_use_id"]?.jsonPrimitive?.contentOrNull != null) return

        val inner = event["event"] as? JsonObject ?: return
        if (inner.field("type") != "content_block_delta") return

        val delta = inner["delta"] as? JsonObject ?: return
        when (delta.field("type")) {
            "text_delta" -> text.appendCapped(delta.field("text"))
            "thinking_delta" -> thinking.appendCapped(delta.field("thinking"))
        }
    }

    /**
     * Whether this is the conversation's own message rather than a subagent's. A subagent's has the
     * call that spawned it named in it.
     */
    private fun isMainStream(line: String): Boolean {
        val event = runCatching { Json.parseToJsonElement(line).jsonObject }.getOrNull() ?: return false
        if (event.field("type") != "assistant") return false

        return event["parent_tool_use_id"]?.jsonPrimitive?.contentOrNull == null
    }

    /**
     * A single answer can run to hundreds of kilobytes, and the fold exists to show that work is
     * happening rather than to be the record of it. Past the ceiling the beginning goes: what someone
     * joining now wants to see is the words appearing at this moment.
     */
    private fun StringBuilder.appendCapped(part: String) {
        if (part.isEmpty()) return

        append(part)
        if (length > maxChars) delete(0, length - maxChars)
    }

    private fun JsonObject.field(name: String): String =
        this[name]?.jsonPrimitive?.contentOrNull.orEmpty()

    private companion object {
        const val MAX_CHARS = 256 * 1024

        const val STREAM_MARKER = "\"type\":\"stream_event\""
        const val ASSISTANT_MARKER = "\"type\":\"assistant\""
    }
}

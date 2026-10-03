package io.github.crmapache.amazingclaudecode.claude

import kotlinx.serialization.json.Json
import kotlinx.serialization.json.JsonArray
import kotlinx.serialization.json.JsonElement
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.JsonPrimitive
import kotlinx.serialization.json.booleanOrNull
import kotlinx.serialization.json.contentOrNull

/**
 * Cutting one outsized message down before it goes into the journal.
 *
 * A single tool result can weigh megabytes - a file read whole, a build log, a database dump. Left
 * alone, one such entry pushes a hundred ordinary ones out of the journal and the feed comes back from
 * a reconnect as a stump: the huge output survives while everything around it - the request that asked
 * for it, the answer that followed - is gone.
 *
 * So the long text inside is shortened rather than the entry thrown away. What is cut is said out loud
 * in the text itself: a feed that quietly shows two thirds of a file is worse than one that says how
 * much is missing.
 *
 * What the person and the model wrote is spared, and only what the tools brought back is cut (see
 * [spareMessage]). The monster this exists for is a tool's output, which nothing bounds; an answer is
 * bounded by the model's own limit on what it says at once. Cut by length alone, a long answer came back
 * from the history as its first eight kilobytes and a line about the rest - the very text the person had
 * opened the conversation to read again, and the one place in the feed where a preview is no use at all.
 *
 * Only strings are touched, and the JSON's shape is left exactly as it was: the interface parses this
 * by the same route as a live message, and a message trimmed into invalid JSON would take the whole
 * feed down with it rather than one card.
 */
internal object JournalTrim {

    /**
     * [json] shortened if it is over [maxChars], and untouched otherwise.
     *
     * [spareWords] leaves the conversation's own text whole - see [spareMessage]. Turned off only where
     * the size is a hard ceiling rather than a budget, and even there as the last resort, after the tools'
     * output has been cut as far as it goes (see RemoteAgent's fitted). [reason] is what the note left in
     * place of the cut says about it.
     *
     * Below the threshold nothing is parsed at all: this runs on every message of every conversation,
     * and almost all of them are small.
     */
    fun trim(
        json: String,
        maxChars: Int = MAX_ENTRY_CHARS,
        maxStringChars: Int = MAX_STRING_CHARS,
        spareWords: Boolean = true,
        reason: Reason = Reason.HISTORY,
    ): String {
        if (json.length <= maxChars) return json

        val parsed = runCatching { Json.parseToJsonElement(json) }.getOrNull() ?: return json

        return runCatching { shorten(parsed, Limit(maxStringChars, reason), spareWords).toString() }.getOrDefault(json)
    }

    private fun shorten(element: JsonElement, limit: Limit, spare: Boolean): JsonElement = when (element) {
        is JsonObject -> shortenObject(element, limit, spare)
        is JsonArray -> JsonArray(element.map { shorten(it, limit, spare) })
        is JsonPrimitive -> shortenPrimitive(element, limit)
        else -> element
    }

    private fun shortenObject(entry: JsonObject, limit: Limit, spare: Boolean): JsonObject {
        val message = entry["message"] as? JsonObject
        if (!spare || message == null || !isConversation(entry)) {
            return JsonObject(entry.mapValues { (_, value) -> shorten(value, limit, spare) })
        }

        return JsonObject(
            entry.mapValues { (key, value) -> if (key == "message") spareMessage(message, limit) else shorten(value, limit, spare = false) },
        )
    }

    /**
     * A message of the conversation itself - something the person or the model said - wherever it sits:
     * a line of the transcript, the CLI's event, or that event wrapped into the panel's own message.
     *
     * The CLI's own marks are not that, even though they are filed as the person's messages: a skill's
     * body, a caveat before a command. They draw nothing in the feed (see ClaudeHistory.drawsOwnRow), and
     * kept whole they would only spend a page's budget on text nobody sees.
     */
    private fun isConversation(entry: JsonObject): Boolean {
        val type = (entry["type"] as? JsonPrimitive)?.contentOrNull
        if (type != "user" && type != "assistant") return false

        return (entry["isMeta"] as? JsonPrimitive)?.booleanOrNull != true
    }

    /**
     * The message with what was written in it left whole and everything else shortened as usual.
     *
     * Written means: the text of a message (a string or a text block), the model's thinking, and the
     * arguments of a call it made, a plan or a file it wrote among them. A tool's result is what gets cut,
     * and with it its copy beside the message (`toolUseResult`), which [shortenObject] hands on unspared.
     * An image travels as kilobytes of base64 and is no writing either. A result on screen is a folded
     * preview of sixty lines at most (see detailFor in feed/tools.ts), live or replayed: a few kilobytes
     * of it are all a card had to show anyway.
     */
    private fun spareMessage(message: JsonObject, limit: Limit): JsonObject = JsonObject(
        message.mapValues { (key, value) ->
            when {
                key != "content" -> shorten(value, limit, spare = false)
                value is JsonPrimitive && value.isString -> value
                value is JsonArray -> JsonArray(value.map { block -> spareBlock(block, limit) })
                else -> shorten(value, limit, spare = false)
            }
        },
    )

    private fun spareBlock(block: JsonElement, limit: Limit): JsonElement {
        if (block !is JsonObject) return shorten(block, limit, spare = false)

        val written = when ((block["type"] as? JsonPrimitive)?.contentOrNull) {
            "text" -> "text"
            "thinking" -> "thinking"
            "tool_use" -> "input"
            else -> null
        }

        return JsonObject(block.mapValues { (key, value) -> if (key == written) value else shorten(value, limit, spare = false) })
    }

    private fun shortenPrimitive(primitive: JsonPrimitive, limit: Limit): JsonPrimitive {
        // Numbers and booleans are never the problem, and turning one into a string would change the
        // meaning of the field for whoever reads it.
        if (!primitive.isString) return primitive

        val text = primitive.content
        if (text.length <= limit.chars) return primitive

        val cut = text.length - limit.chars
        return JsonPrimitive(text.take(limit.chars) + "\n\n… $cut more characters ${limit.reason.words}")
    }

    /** How much of one string survives, and what the note in place of the rest says. */
    private class Limit(val chars: Int, val reason: Reason)

    /**
     * Why a text was cut, in the words of the note left in its place.
     *
     * One note used to serve every cut, and it named the history even where the history had nothing to do
     * with it: an answer too heavy for a relay frame reached the phone saying its rest was "not kept in the
     * panel's history", while the history kept it whole and the panel at the desk showed every word of it.
     * A note that names the wrong cause sends the reader looking for the text in the wrong place.
     */
    enum class Reason(internal val words: String) {
        /** The journal and a page of history: the full text stays on disk, the panel holds less of it. */
        HISTORY("are not kept in the panel's history."),

        /**
         * A relay frame (see RemoteAgent's fitted): the ceiling is the phone's road, not the panel's
         * memory, so the note sends the reader to the IDE, where the same message stands whole.
         */
        PHONE("are not shown on the phone: the message is too large to send whole. The full text is in the IDE."),
    }

    /**
     * Above this an entry is looked into. Deliberately well above an ordinary message: parsing and
     * rebuilding costs something, and the point is to catch the rare monster, not to police everything.
     */
    const val MAX_ENTRY_CHARS = 128 * 1024

    /** And this is how much of one string survives inside such an entry. */
    const val MAX_STRING_CHARS = 32 * 1024
}

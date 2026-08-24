package io.github.crmapache.amazingclaudecode.claude

import kotlinx.serialization.json.Json
import kotlinx.serialization.json.JsonArray
import kotlinx.serialization.json.JsonElement
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.JsonPrimitive

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
 * Only strings are touched, and the JSON's shape is left exactly as it was: the interface parses this
 * by the same route as a live message, and a message trimmed into invalid JSON would take the whole
 * feed down with it rather than one card.
 */
internal object JournalTrim {

    /**
     * [json] shortened if it is over [maxChars], and untouched otherwise.
     *
     * Below the threshold nothing is parsed at all: this runs on every message of every conversation,
     * and almost all of them are small.
     */
    fun trim(json: String, maxChars: Int = MAX_ENTRY_CHARS, maxStringChars: Int = MAX_STRING_CHARS): String {
        if (json.length <= maxChars) return json

        val parsed = runCatching { Json.parseToJsonElement(json) }.getOrNull() ?: return json

        return runCatching { shorten(parsed, maxStringChars).toString() }.getOrDefault(json)
    }

    private fun shorten(element: JsonElement, limit: Int): JsonElement = when (element) {
        is JsonObject -> JsonObject(element.mapValues { (_, value) -> shorten(value, limit) })
        is JsonArray -> JsonArray(element.map { shorten(it, limit) })
        is JsonPrimitive -> shortenPrimitive(element, limit)
        else -> element
    }

    private fun shortenPrimitive(primitive: JsonPrimitive, limit: Int): JsonPrimitive {
        // Numbers and booleans are never the problem, and turning one into a string would change the
        // meaning of the field for whoever reads it.
        if (!primitive.isString) return primitive

        val text = primitive.content
        if (text.length <= limit) return primitive

        val cut = text.length - limit
        return JsonPrimitive(text.take(limit) + "\n\n… $cut more characters are not kept in the panel's history.")
    }

    /**
     * Above this an entry is looked into. Deliberately well above an ordinary message: parsing and
     * rebuilding costs something, and the point is to catch the rare monster, not to police everything.
     */
    const val MAX_ENTRY_CHARS = 128 * 1024

    /** And this is how much of one string survives inside such an entry. */
    const val MAX_STRING_CHARS = 32 * 1024
}

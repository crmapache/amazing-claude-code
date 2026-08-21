package io.github.crmapache.amazingclaudecode.claude

import kotlinx.serialization.json.JsonArray
import kotlinx.serialization.json.JsonObject

/**
 * Forgiving reads of the CLI's answers.
 *
 * An empty spot there is not only a missing field: an honest null gets written into the answer too.
 * That is how subscription limits arrive from a freshly started process, and the session summary, and
 * an MCP server's configuration. The familiar `jsonObject` and `jsonArray` throw on such a spot, and
 * the exception has nowhere to fly: parsing runs on the same thread as the conversation's events - so
 * along with a figure in the corner the panel loses the rest of the output it had not parsed yet.
 */
internal fun JsonObject.child(name: String): JsonObject? = this[name] as? JsonObject

/** The same for a list - see [child]. */
internal fun JsonObject.items(name: String): JsonArray? = this[name] as? JsonArray

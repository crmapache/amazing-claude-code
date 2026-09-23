package io.github.crmapache.amazingclaudecode.webview

import kotlinx.serialization.json.JsonArray
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.JsonPrimitive
import kotlinx.serialization.json.contentOrNull
import kotlinx.serialization.json.jsonPrimitive

/**
 * A draft coming back after a restart, with its pasted pictures given their bytes again.
 *
 * The page keeps a pasted picture as bytes in the chip and as a file on disk beside it (see PastedFiles).
 * The draft is remembered without the bytes - megabytes of base64 rewritten on every keystroke would be
 * the whole cost of the feature - so the picture comes back from its file. Brought back that way it is
 * the attachment it was, handed to the agent as an image, rather than a path the agent has to open.
 */
internal object DraftImages {

    fun rehydrate(draft: JsonObject, read: (String) -> String? = PastedFiles::dataUrlOf): JsonObject {
        val tokens = draft["tokens"] as? JsonArray ?: return draft

        return JsonObject(
            draft + ("tokens" to JsonArray(tokens.map { token -> withBytes(token as? JsonObject, read) ?: token })),
        )
    }

    private fun withBytes(token: JsonObject?, read: (String) -> String?): JsonObject? {
        val chip = token?.get("chip") as? JsonObject ?: return null
        if (chip["kind"]?.jsonPrimitive?.contentOrNull != "img" || chip["data"] != null) return null

        val path = chip["path"]?.jsonPrimitive?.contentOrNull ?: return null
        val data = read(path) ?: return null

        return JsonObject(token + ("chip" to JsonObject(chip + ("data" to JsonPrimitive(data)))))
    }
}

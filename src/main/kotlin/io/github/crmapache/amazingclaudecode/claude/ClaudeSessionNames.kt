package io.github.crmapache.amazingclaudecode.claude

import java.io.File
import java.io.IOException
import kotlinx.serialization.SerializationException
import kotlinx.serialization.json.Json
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.JsonPrimitive
import kotlinx.serialization.json.contentOrNull
import kotlinx.serialization.json.longOrNull

/**
 * The name other Claude Code sessions send messages to: the address their agent lists and writes to.
 *
 * The CLI files every running process in `sessions/<pid>.json` of its config directory, with the id of the
 * conversation it runs and that name (the project folder and a short tail, `amazing-claude-code-81`). The CLI
 * picks the name and may change it while the process runs, so it is read when asked rather than kept.
 */
internal object ClaudeSessionNames {

    /**
     * The name of the process running [conversationId], or null when no process runs it: a conversation that
     * has not started yet or has gone to sleep (see IdleSleep) has nobody to send to.
     */
    fun nameOf(configDirectory: File, conversationId: String): String? {
        val files = File(configDirectory, "sessions").listFiles { file -> file.extension == "json" } ?: return null
        return files.asSequence()
            .mapNotNull(::read)
            .filter { it.text("sessionId") == conversationId }
            // Should a process end without removing its file, the conversation it ran is named twice: the
            // file written last belongs to the process that runs it now.
            .maxByOrNull { (it["updatedAt"] as? JsonPrimitive)?.longOrNull ?: 0L }
            ?.text("name")
    }

    /** One process's file, or null when it went away between the listing and the read or is half written. */
    private fun read(file: File): JsonObject? = try {
        Json.parseToJsonElement(file.readText()) as? JsonObject
    } catch (_: IOException) {
        null
    } catch (_: SerializationException) {
        null
    }

    private fun JsonObject.text(field: String): String? =
        (this[field] as? JsonPrimitive)?.contentOrNull?.takeIf { it.isNotBlank() }
}

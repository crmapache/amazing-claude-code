package io.github.crmapache.amazingclaudecode.editor

import kotlinx.serialization.json.Json
import kotlinx.serialization.json.JsonArray
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.booleanOrNull
import kotlinx.serialization.json.contentOrNull
import kotlinx.serialization.json.jsonPrimitive

/**
 * What the agent has just changed on disk, read off its own stream.
 *
 * The IDE keeps its own picture of the disk and refreshes it when the application regains focus or
 * when its file watcher gets round to the change. Neither promises a moment: a person answering the
 * agent from the panel never leaves the application at all, and a watcher is exactly as reliable as
 * the file system under it - a network share, a symlink, a hundred edits in one turn, and it is late
 * or silent. Meanwhile the editor on screen still shows the text the agent has already rewritten.
 *
 * So the stream is read for the same facts twice: the statistics count what was changed, this says
 * what to re-read (see DiskRefresh, which does the re-reading).
 *
 * The work is split in two on purpose - what a line means can be checked in a test, what the IDE does
 * about it cannot.
 */
internal class AgentEdits {

    /** What a line turned out to ask for. */
    sealed interface Refresh {
        /** This file, and nothing else - the agent named it. */
        data class One(val path: String) : Refresh

        /**
         * Whatever it touched. A shell command names no files: `git checkout`, a formatter, a script of
         * its own may have rewritten anything, and the end of a turn is the last chance to notice.
         */
        data object Everything : Refresh
    }

    /**
     * The file each running tool call is about, by the call's own id.
     *
     * Waiting for the result rather than acting on the request is the whole point: a tool call is a
     * request, and between the request and the file changing stands the person who has to allow it.
     * Refreshing when the agent asks would re-read the file before the edit, and by the time the edit
     * landed - a minute later, when the permission was granted - nothing would ask again.
     *
     * Bounded, because a call whose result never arrives (an interrupted turn, a killed process) would
     * otherwise sit here for as long as the IDE runs.
     */
    private val running = object : LinkedHashMap<String, String>(0, 0.75f, false) {
        override fun removeEldestEntry(eldest: MutableMap.MutableEntry<String, String>?): Boolean = size > KEPT
    }

    /** What this line of the stream asks to be re-read - usually nothing. */
    fun note(line: String): List<Refresh> {
        // Most of the stream is an answer being typed, and none of it is about files.
        if (!line.contains(TOOL_USE) && !line.contains(TOOL_RESULT) && !line.contains(RESULT)) return emptyList()

        val event = runCatching { Json.parseToJsonElement(line) as? JsonObject }.getOrNull() ?: return emptyList()

        return when (event.string("type")) {
            "assistant" -> {
                remember(event)
                emptyList()
            }

            "user" -> finished(event)

            // The turn is over: from here on nothing else will report, and a shell command that changed
            // files without saying so has no other moment to be noticed in.
            "result" -> {
                synchronized(running) { running.clear() }
                listOf(Refresh.Everything)
            }

            else -> emptyList()
        }
    }

    /** The agent is about to use a tool - keep the ones whose work shows up on disk. */
    private fun remember(event: JsonObject) {
        val message = event["message"] as? JsonObject ?: return
        val blocks = message["content"] as? JsonArray ?: return

        for (element in blocks) {
            val block = element as? JsonObject ?: continue
            if (block.string("type") != TOOL_USE) continue

            val id = block.string("id").ifEmpty { continue }
            val name = block.string("name")
            val input = block["input"] as? JsonObject ?: JsonObject(emptyMap())

            val target = when {
                name in EDIT_TOOLS -> input.string("file_path").ifEmpty { input.string("notebook_path") }
                // A shell command is kept under an empty path: it changed something, and which something
                // is not in the stream.
                name == SHELL_TOOL -> ""
                else -> continue
            }

            synchronized(running) { running[id] = target }
        }
    }

    /** A tool has reported back - now the disk holds whatever it did. */
    private fun finished(event: JsonObject): List<Refresh> {
        val message = event["message"] as? JsonObject ?: return emptyList()
        val blocks = message["content"] as? JsonArray ?: return emptyList()

        val wanted = mutableListOf<Refresh>()
        for (element in blocks) {
            val block = element as? JsonObject ?: continue
            if (block.string("type") != TOOL_RESULT) continue

            val id = block.string("tool_use_id").ifEmpty { continue }
            val target = synchronized(running) { running.remove(id) } ?: continue
            val failed = block["is_error"]?.jsonPrimitive?.booleanOrNull == true

            when {
                // An edit that failed changed nothing: the file is untouched, and asking the IDE to
                // re-read it would only be work.
                target.isNotEmpty() && !failed -> wanted += Refresh.One(target)

                // A shell command is the other way round. It fails halfway as easily as it succeeds, and
                // half a script is exactly the case where the files on disk are no longer what the IDE
                // thinks.
                target.isEmpty() -> wanted += Refresh.Everything

                else -> Unit
            }
        }

        return wanted
    }

    private fun JsonObject.string(field: String): String = this[field]?.jsonPrimitive?.contentOrNull.orEmpty()

    private companion object {
        const val TOOL_USE = "tool_use"
        const val TOOL_RESULT = "tool_result"

        /** The end of a turn, as it is spelled in the stream. */
        const val RESULT = "\"type\":\"result\""

        /** The tools that write a named file - the same set the statistics count as edits. */
        val EDIT_TOOLS = setOf("Edit", "MultiEdit", "Write", "NotebookEdit")

        const val SHELL_TOOL = "Bash"

        /** How many unfinished tool calls are remembered - see [running]. */
        const val KEPT = 500
    }
}

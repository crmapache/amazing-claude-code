package io.github.crmapache.amazingclaudecode.feedback

import java.nio.file.Files
import java.nio.file.Path

/**
 * The files a person picked for a piece of feedback.
 *
 * The list lives here, in the IDE, and the panel is told only an id, a name and a size for each. It never
 * learns a path. Two things follow, and both are the reason it is built this way:
 *
 * - a screen whose whole purpose is to send things to somebody else's server cannot leak a path it was
 *   never given, not by a bug and not by a message crafted to look like one;
 * - and the panel cannot name a file the person did not pick. Sending is "the file behind id 3", not "the
 *   file at this path" - so there is no path for anything to put its own value into. The same shape the
 *   list of recent projects already uses for the phone (see RemoteAgent.recents).
 *
 * Sizes are read from the disk rather than taken from whoever offered the file, and read again when the
 * thing is actually sent: a log file being appended to right now is the likeliest attachment there is.
 */
internal class FeedbackAttachments {

    /** What the IDE knows about a picked file. */
    data class Picked(val id: String, val name: String, val bytes: Long, val path: Path)

    private val picked = mutableListOf<Picked>()

    private var nextId = 1

    /**
     * Add what a dialog handed back, and answer with what has to be said about it - or null when there is
     * nothing to say.
     *
     * Refusals are per file rather than for the whole pick: choosing five files of which one is enormous
     * should attach four, not fail. Which is also why the note says how many were left out rather than
     * naming them - by the time it is read, the list itself shows what got in.
     */
    @Synchronized
    fun add(paths: List<Path>): String? {
        var tooBig = 0
        var noRoom = 0
        var unreadable = 0
        var already = 0

        for (path in paths) {
            val size = runCatching { Files.size(path) }.getOrNull()

            when {
                size == null || !runCatching { Files.isRegularFile(path) }.getOrDefault(false) -> unreadable += 1
                picked.any { it.path == path } -> already += 1
                size > MAX_FILE_BYTES -> tooBig += 1
                picked.size >= MAX_FILES -> noRoom += 1
                total() + size > MAX_TOTAL_BYTES -> noRoom += 1
                else -> {
                    picked.add(
                        Picked(
                            id = "a${nextId++}",
                            name = path.fileName?.toString().orEmpty().ifEmpty { "file" },
                            bytes = size,
                            path = path,
                        ),
                    )
                }
            }
        }

        return noteOf(tooBig = tooBig, noRoom = noRoom, unreadable = unreadable, already = already)
    }

    @Synchronized
    fun remove(id: String) {
        picked.removeAll { it.id == id }
    }

    @Synchronized
    fun list(): List<Picked> = picked.toList()

    @Synchronized
    fun clear() {
        picked.clear()
    }

    /** What is actually going, and what is not - see [readyToSend]. */
    data class Outgoing(val files: List<Picked>, val left: List<String>)

    /**
     * The files as they are on the disk right now, ready to be sent - with whatever had to be left behind
     * named rather than dropped in silence.
     *
     * The sizes are read again here, and that is not belt-and-braces: the attachment this whole screen was
     * built for is a log file being written to right now, so the one that was fine when it was picked is
     * exactly the one likely to be over the limit by the time Send is pressed. Saying "sent, thank you"
     * while quietly leaving out the file the report was about would be the worst thing this screen could
     * do.
     */
    @Synchronized
    fun readyToSend(): Outgoing {
        var running = 0L
        val going = mutableListOf<Picked>()
        val left = mutableListOf<String>()

        for (file in picked) {
            val size = runCatching { Files.size(file.path) }.getOrNull()

            when {
                size == null -> left.add("${file.name} is no longer there")
                size > MAX_FILE_BYTES -> left.add("${file.name} grew past ${MAX_FILE_BYTES / MEGABYTE} MB")
                running + size > MAX_TOTAL_BYTES ->
                    left.add("${file.name} did not fit in the ${MAX_TOTAL_BYTES / MEGABYTE} MB total")
                else -> {
                    running += size
                    going.add(file.copy(bytes = size))
                }
            }
        }

        return Outgoing(files = going, left = left)
    }

    @Synchronized
    fun total(): Long = picked.sumOf { it.bytes }

    /** How full the list is, for the caller that has to decide whether to open a dialog at all. */
    @Synchronized
    fun full(): Boolean = picked.size >= MAX_FILES

    private fun noteOf(tooBig: Int, noRoom: Int, unreadable: Int, already: Int): String? {
        val parts = buildList {
            if (tooBig > 0) add("${count(tooBig)} bigger than ${MAX_FILE_BYTES / (1024 * 1024)} MB")
            if (noRoom > 0) add("${count(noRoom)} over the $MAX_FILES file or ${MAX_TOTAL_BYTES / (1024 * 1024)} MB limit")
            if (unreadable > 0) add("${count(unreadable)} that could not be read")
            if (already > 0) add("${count(already)} already on the list")
        }

        return if (parts.isEmpty()) null else "Left out: " + parts.joinToString(", ") + "."
    }

    private fun count(n: Int): String = if (n == 1) "one file" else "$n files"

    companion object {
        private const val MEGABYTE = 1024 * 1024

        const val MAX_FILES = 10
        const val MAX_FILE_BYTES = 10L * 1024 * 1024
        const val MAX_TOTAL_BYTES = 20L * 1024 * 1024
    }
}

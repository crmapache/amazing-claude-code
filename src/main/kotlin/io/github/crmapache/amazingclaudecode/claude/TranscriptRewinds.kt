package io.github.crmapache.amazingclaudecode.claude

import java.io.File
import java.util.BitSet

/**
 * Which lines of a transcript a rewind took out of the conversation.
 *
 * The CLI cuts a conversation without rewriting its file (see [Rewind]): the dropped messages stay where
 * they were, a `last-prompt` line marked `"rewound":true` is appended, and the next message hangs off the
 * line before the one that was dropped. The CLI itself reads the file by that chain and never sees the cut
 * part again. Everything here reads transcripts line by line instead - the history pages a conversation
 * from its end, the search indexes its words - and without being told, a conversation reopened from the
 * history would bring back exactly the turns the person rewound to get rid of.
 *
 * Why not read the file by the chain the way the CLI does: the chain is not the whole conversation as a
 * reader of it sees it. Parallel tool calls answer on branches of their own, and on this machine one
 * transcript in ten has messages off the main chain that the panel draws and should keep drawing. So only
 * what a rewind marked is taken out, and a file without a mark reads exactly as before.
 *
 * What a mark takes out is a stretch of lines: everything after the point the conversation went on from,
 * up to the mark itself - the lines of the conversation's chain, that is. A line off the chain (a name the
 * person gave it, the CLI's own title, a note of the queue) is not a message of the dropped turns, and the
 * CLI goes on reading it whatever it cut: taken with them, the history named the conversation by its old
 * name after the rewind. That point is the parent of the first line after the mark that hangs off
 * something before it - the next message, a background agent's report - and while nothing has been said
 * since, it is the mark's own `leafUuid`, the last message the CLI kept (which is also where the CLI
 * would resume). The first is never earlier than the second, and it is never past the first message
 * after it: a line from the cut-off turn written late hangs off that turn, which comes later, so it cannot
 * be mistaken for the conversation going on.
 */
internal object TranscriptRewinds {

    /** The cheap test a reader runs on every line - the rest is paid for only by files that have one. */
    fun marks(line: String): Boolean = line.contains(REWOUND) && line.contains(LAST_PROMPT)

    /**
     * The positions of the cut lines in [lines], counted over every line of the file - or null when nothing
     * in it was ever rewound, which is nearly every file.
     */
    fun cutLines(lines: Sequence<String>): BitSet? = Parsed().apply { lines.forEach(::add) }.cut()

    /** [lines] without the ones [cut] names - by position, the way [cutLines] counted them. */
    fun alive(lines: Sequence<String>, cut: BitSet?): Sequence<String> =
        if (cut == null) lines else lines.filterIndexed { index, _ -> !cut.get(index) }

    /**
     * What placing the cuts needs to know of each line, kept as the file is read - by position, the way the
     * readers count the lines.
     *
     * A parent is kept as the position of the line it names rather than as the name: a line's parent is always
     * written before it, so the position is known by then, and a file of a working day keeps one map of names
     * instead of two lists of them.
     */
    private class Parsed {
        var count = 0
        val position = HashMap<String, Int>()
        val parents = ArrayList<Int>()
        val messages = BitSet()
        val chain = BitSet()
        val markers = ArrayList<Marker>()

        fun add(line: String) {
            val index = count++
            uuidOf(line)?.let { position.putIfAbsent(it, index) }
            parents += parentOf(line)?.let { position[it] } ?: NO_PARENT
            if (line.contains(MESSAGE) || line.contains(REPLY)) messages.set(index)
            if (line.startsWith(PARENT_KEY)) chain.set(index)
            if (marks(line)) markers += Marker(index, leafOf(line))
        }

        fun cut(): BitSet? {
            if (markers.isEmpty()) return null

            val cut = BitSet()
            for ((at, marker) in markers.withIndex()) {
                // What the mark itself says the conversation was cut back to. Absent (null) when the very first
                // message was the one dropped - then everything before the mark goes.
                val leaf = when (val named = marker.leaf) {
                    null -> -1
                    else -> position[named] ?: continue
                }

                // How far past the leaf the conversation may legitimately go on from: the trailing lines of the
                // kept turn (its closing note, an attachment) sit between the leaf and the first message after
                // it, and the next message hangs off the last of them.
                val ceiling = messages.nextSetBit(leaf + 1).let { if (it < 0 || it > marker.index) marker.index else it }

                val next = markers.getOrNull(at + 1)?.index ?: count
                var resumed = leaf
                for (line in marker.index + 1 until next) {
                    val from = parents[line].takeIf { it != NO_PARENT } ?: continue
                    if (from in leaf until ceiling) {
                        resumed = from
                        break
                    }
                }

                if (resumed + 1 < marker.index) cut.set(resumed + 1, marker.index)
            }

            // Only the chain's own lines - see the class's note.
            cut.and(chain)

            // And whatever hangs off a cut line is cut with it, wherever it was written: a step of the stopped
            // turn that landed after the mark belongs to that turn. One pass in file order is enough - a line's
            // parent is always written before it.
            for (index in 0 until count) {
                if (cut.get(index)) continue
                val from = parents[index].takeIf { it != NO_PARENT } ?: continue
                if (from < index && cut.get(from)) cut.set(index)
            }

            return cut.takeIf { !it.isEmpty }
        }
    }

    /**
     * The cut lines of [file], read once and then only from where the last reading stopped.
     *
     * The history asks for a live conversation's pages one after another, and its file grows by a line at a
     * time: an answer kept against the file's length and time was thrown away on every new line, and every
     * page of a rewound conversation read the whole file over and over. A transcript is only ever appended
     * to, so what was read stays true and only the new part is read; a file that got shorter, or changed
     * without growing, is read again from the start. Only a file with a mark is kept (see [known]), and only
     * the last few of them - the history asks after the conversation on screen.
     */
    fun cutLines(file: File): BitSet? = synchronized(reads) {
        val length = file.length()
        val modified = file.lastModified()
        val kept = reads[file.path]
        val read = kept?.takeIf { it.offset < length || (it.offset == length && it.modified == modified) } ?: Read()

        if (read.offset < length || read.modified != modified) {
            runCatching { readOn(file, read) }.onFailure { return@synchronized null }
            read.modified = modified
            read.cut = read.parsed.cut()
        }

        if (read.cut != null || read.parsed.markers.isNotEmpty()) reads[file.path] = read else reads.remove(file.path)
        read.cut
    }

    /**
     * Whether [file] is known to have been rewound - then a reader can ask for its cuts first and read it
     * once, rather than finding the mark on a pass of its own (see ClaudeHistory.page).
     */
    fun known(file: File): Boolean = synchronized(reads) { reads.containsKey(file.path) }

    /** What has been read of one file: up to [offset], the bytes of its complete lines. */
    private class Read {
        var offset = 0L
        var modified = 0L
        val parsed = Parsed()
        var cut: BitSet? = null
    }

    /**
     * The lines of [file] past [Read.offset], added to what was read. A last line with no line break yet is
     * being written and is left for next time - the readers still see it, and as a line nothing hangs off yet.
     */
    private fun readOn(file: File, read: Read) {
        java.io.FileInputStream(file).use { input ->
            input.channel.position(read.offset)
            val line = java.io.ByteArrayOutputStream()
            val chunk = ByteArray(64 * 1024)

            while (true) {
                val got = input.read(chunk)
                if (got < 0) break

                var start = 0
                for (at in 0 until got) {
                    if (chunk[at] != NEWLINE) continue
                    line.write(chunk, start, at - start)
                    read.parsed.add(line.toString(Charsets.UTF_8).removeSuffix("\r"))
                    read.offset += line.size() + 1
                    line.reset()
                    start = at + 1
                }
                line.write(chunk, start, got - start)
            }
        }
    }

    private val reads = object : LinkedHashMap<String, Read>(16, 0.75f, true) {
        override fun removeEldestEntry(eldest: MutableMap.MutableEntry<String, Read>): Boolean = size > KEPT_FILES
    }

    /**
     * The uuids of the cut lines of [file] - for a reader that keeps messages by their uuid rather than by
     * their place in the file (see SearchIndex). Empty when nothing was ever rewound.
     */
    fun cutUuids(file: File): Set<String> {
        val cut = cutLines(file) ?: return emptySet()
        return runCatching {
            file.useLines { lines ->
                lines.withIndex()
                    .filter { (index, _) -> cut.get(index) }
                    .mapNotNull { (_, line) -> uuidOf(line) }
                    .toHashSet()
            }
        }.getOrDefault(emptySet())
    }

    /**
     * The line a fork has to end on to carry everything before [message] and nothing from it on - what
     * `--resume-session-at` is given (see ClaudeLaunch.arguments).
     *
     * The message's own parent: for a message sent as a turn of its own, that is the last line of the turn
     * before it; for one written into a running turn, which the CLI files as a `queued_command` attachment
     * under the message's uuid (`source_uuid`), it is the step the agent had reached when it took it.
     * [Anchor.Start] when the message was the first thing said - the fork then has nothing to carry.
     */
    fun anchorBefore(lines: Sequence<String>, message: String): Anchor {
        val own = "\"uuid\":\"$message\""
        val queued = "\"source_uuid\":\"$message\""

        for (line in lines) {
            if (!line.contains(own) && !line.contains(queued)) continue
            if (!line.startsWith(PARENT_KEY)) continue

            val parent = parentOf(line)
            return if (parent == null) Anchor.Start else Anchor.At(parent)
        }

        return Anchor.NotFound
    }

    sealed interface Anchor {
        data class At(val uuid: String) : Anchor

        data object Start : Anchor

        data object NotFound : Anchor
    }

    private data class Marker(val index: Int, val leaf: String?)

    /** The line's own uuid, read the way the history reads it (see ClaudeHistory.uuidOf). */
    private fun uuidOf(line: String): String? = UUID_FIELD.find(line)?.groupValues?.get(1)

    /** The CLI writes `parentUuid` as a line's first key - read from there and nowhere else in it. */
    private fun parentOf(line: String): String? {
        if (!line.startsWith(PARENT_KEY)) return null
        val match = PARENT.find(line) ?: return null
        return match.groupValues[1].ifEmpty { null }
    }

    private fun leafOf(line: String): String? = LEAF.find(line)?.groupValues?.get(1)

    private const val REWOUND = "\"rewound\":true"
    private const val LAST_PROMPT = "\"type\":\"last-prompt\""
    private const val MESSAGE = "\"type\":\"user\""
    private const val REPLY = "\"type\":\"assistant\""
    private const val PARENT_KEY = "{\"parentUuid\":"

    /** A line with no parent, or one naming a line this file does not have. */
    private const val NO_PARENT = -1

    private const val NEWLINE = '\n'.code.toByte()

    /** How many rewound files' readings are kept - see [cutLines]. */
    private const val KEPT_FILES = 8

    private val UUID_FIELD = Regex(""""uuid":"([^"]+)"""")
    private val PARENT = Regex("""^\{"parentUuid":(?:null|"([^"]*)")""")
    private val LEAF = Regex(""""leafUuid":"([^"]+)"""")
}

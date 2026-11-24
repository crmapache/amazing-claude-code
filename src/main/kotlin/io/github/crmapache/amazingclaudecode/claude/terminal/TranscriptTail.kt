package io.github.crmapache.amazingclaudecode.claude.terminal

import com.intellij.openapi.diagnostic.thisLogger
import io.github.crmapache.amazingclaudecode.claude.ClaudeHistory
import io.github.crmapache.amazingclaudecode.claude.TranscriptRewinds
import java.io.File

/**
 * What a terminal added to a conversation, in the shape the feed draws - the transcript after the last line the
 * feed already holds (see ClaudeSessionHub.terminalReleased).
 *
 * **Anchored on uuids, not on a position in the file.** The CLI stamps every line of a transcript with one, and
 * the same uuid travels in the stream the panel drew its feed from - the history's pages and the search's jumps
 * rest on that already. A position would have to be written down at the moment the terminal took over, and a
 * terminal somebody opened on their own took over at no moment this side saw.
 *
 * **Anything this cannot answer honestly is [Tail.Whole]**: draw the conversation again from its end, the way
 * the history opens it. No anchor found - the feed holds nothing of this transcript, or the terminal rewound the
 * conversation past everything it holds. A rewind anywhere in the tail - its cut may reach above the anchor, and
 * lines drawn after it would bring back exactly what the person rewound to be rid of (see TranscriptRewinds).
 * And more than a page's worth - the feed would take it in one batch, and a conversation that went on for hours
 * in the terminal is better opened from its end, with the rest a page away.
 */
internal object TranscriptTail {

    sealed interface Tail {
        /** The lines to play into the feed after what it holds - possibly none. */
        data class Lines(val lines: List<String>) : Tail

        /** Draw the conversation again from its end. */
        data object Whole : Tail
    }

    /** How many of the feed's own uuids are looked for - its last ones, newest first. */
    const val ANCHORS = 200

    /** At most this many lines go into the feed after the anchor - four of the pages a tab opens with. */
    internal const val MAX_LINES = ClaudeHistory.OPENING_PAGE_MESSAGES * 4

    /** And at most this many characters of them, shortened the way a page shortens them. */
    internal const val MAX_CHARS = ClaudeHistory.OPENING_PAGE_CHARS

    /** And at most this much of the raw file is held after an anchor while looking for a later one. */
    private const val MAX_RAW_CHARS = 16L * 1024 * 1024

    fun after(file: File, known: List<String>): Tail = runCatching {
        file.bufferedReader().useLines { lines -> after(lines, known) }
    }.onFailure { thisLogger().warn("The terminal's part of a conversation could not be read", it) }
        .getOrDefault(Tail.Whole)

    /** The same, apart from the disk so that a test can hand the lines in. */
    fun after(lines: Sequence<String>, known: Collection<String>): Tail {
        if (known.isEmpty()) return Tail.Whole

        val anchors = known.toHashSet()
        var anchored = false
        var overflow = false
        var raw = 0L
        val since = ArrayList<String>()

        for (line in lines) {
            val uuid = ClaudeHistory.uuidOf(line)
            if (uuid != null && uuid in anchors) {
                anchored = true
                overflow = false
                raw = 0L
                since.clear()
                continue
            }
            if (!anchored || overflow) continue

            raw += line.length
            if (raw > MAX_RAW_CHARS) {
                overflow = true
                since.clear()
                continue
            }
            since += line
        }

        if (!anchored || overflow) return Tail.Whole
        if (since.any(TranscriptRewinds::marks)) return Tail.Whole

        val drawn = ClaudeHistory.replayable(since.asSequence()).map(ClaudeHistory::shortened).toList()
        if (drawn.size > MAX_LINES || drawn.sumOf { it.length } > MAX_CHARS) return Tail.Whole

        return Tail.Lines(drawn)
    }
}

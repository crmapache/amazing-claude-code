package io.github.crmapache.amazingclaudecode.claude

import java.io.BufferedReader
import java.io.File
import java.util.BitSet

/**
 * The lines a conversation's history is read from: its own transcript, and before it whatever it inherited
 * that its own transcript does not hold - with the seam of every fork along the way standing where that fork's
 * own part begins.
 *
 * A fork's transcript does hold what it inherited, under the same uuids its source has (measured on 2.1.280) -
 * but only what the CLI resumed: of a conversation compacted before the fork, the fork's file begins at the
 * compaction, and the whole discussion above it lives in the source's transcript alone. So a history that
 * reaches the top of a fork's own file goes on in its source, just before the first line the fork's file has
 * (see ForkBook for how the source is known), and so on up through forks of forks.
 *
 * A fork not born yet has no file at all, and its history is its source's up to the line it ends on (see
 * ForkOrigin.at) - with the seam after it, where the fork's own part is about to begin.
 *
 * Only what a reader of the conversation would see is read: a stretch of a source stops where the fork's own
 * file takes over, so no line stands twice, and the rewinds inside a stretch are taken out by the marks inside
 * that stretch alone - a source rewound after the fork was made still lends the fork exactly what it lent.
 */
internal object ForkLineage {

    /** One transcript's share: its first [lines] lines (all of them when null), and the fork whose seam stands in it. */
    data class Stretch(val file: File, val lines: Int?, val seam: ForkOrigin?)

    data class Lineage(val stretches: List<Stretch>, val seamAtEnd: ForkOrigin? = null)

    /** Where a stretch ends - right before a line, or with it. */
    private sealed interface Stop {
        data class Before(val uuid: String) : Stop

        data class Through(val uuid: String) : Stop
    }

    /** A conversation's own transcript and everything above it - null when it has no transcript. */
    fun of(id: String, transcript: (String) -> File?, origins: (String) -> ForkOrigin?): Lineage? =
        stretches(id, stop = null, transcript, origins, HashSet())?.let { Lineage(it) }

    /**
     * The same conversation's own transcript alone - the history asks this first, because nearly every page is
     * cut out of it (see ClaudeHistory.page), and reaching into a source costs a pass over the source.
     */
    fun own(id: String, transcript: (String) -> File?, origins: (String) -> ForkOrigin?): Lineage? =
        transcript(id)?.let { Lineage(listOf(Stretch(it, lines = null, seam = origins(id)))) }

    /** Whether there is anything above [id]'s own transcript to reach into. */
    fun inherits(id: String, transcript: (String) -> File?, origins: (String) -> ForkOrigin?): Boolean =
        origins(id)?.let { transcript(it.source) } != null

    /** A fork not born yet: its source up to the line it ends on, and the seam after it. */
    fun unborn(origin: ForkOrigin, transcript: (String) -> File?, origins: (String) -> ForkOrigin?): Lineage =
        Lineage(
            origin.at?.let { stretches(origin.source, Stop.Through(it), transcript, origins, HashSet()) }.orEmpty(),
            seamAtEnd = origin,
        )

    /**
     * [id]'s stretch, and before it its source's, up to [stop] - null when [id] has no transcript. A conversation
     * met twice (a book gone wrong) or too far up stops the reading there rather than going round.
     */
    private fun stretches(
        id: String,
        stop: Stop?,
        transcript: (String) -> File?,
        origins: (String) -> ForkOrigin?,
        seen: MutableSet<String>,
    ): List<Stretch>? {
        val file = transcript(id) ?: return null
        if (!seen.add(id) || seen.size > MAX_DEPTH) return emptyList()

        val lines = when (stop) {
            null -> null
            is Stop.Before -> positionOf(file, stop.uuid) ?: return emptyList()
            is Stop.Through -> (positionOf(file, stop.uuid) ?: return emptyList()) + 1
        }
        val origin = origins(id)
        val own = Stretch(file, lines, origin)
        if (origin == null) return listOf(own)

        // The first line this transcript holds is where its source's share ends. A stretch with none of the
        // chain in it (its very first line is the one asked to stop before) hands the same boundary on.
        val first = firstChainLine(file, lines) ?: (stop as? Stop.Before)?.uuid ?: return listOf(own)
        val older = stretches(origin.source, Stop.Before(first), transcript, origins, seen).orEmpty()

        return older + own
    }

    /**
     * The lineage's lines in order, the seams in their places - with the rewinds taken out when [cuts] says so
     * (see ClaudeHistory.page for why that is a second pass rather than the only one).
     */
    fun <T> read(lineage: Lineage, cuts: Boolean, block: (Sequence<String>) -> T): T {
        val readers = ArrayList<BufferedReader>()
        // The lines read out of an earlier stretch, by their uuid - see [once].
        val seen = HashSet<String>()
        try {
            val parts = lineage.stretches.mapIndexed { index, stretch ->
                val reader = stretch.file.bufferedReader(Charsets.UTF_8).also(readers::add)
                val raw = reader.lineSequence().let { lines -> stretch.lines?.let(lines::take) ?: lines }
                val alive = if (cuts) TranscriptRewinds.alive(raw, cutsOf(stretch)) else raw
                withSeam(if (lineage.stretches.size > 1) once(alive, seen, first = index == 0) else alive, stretch.seam)
            }
            val end = lineage.seamAtEnd?.let { sequenceOf(it.seamLine()) } ?: emptySequence()

            return block(parts.asSequence().flatten() + end)
        } finally {
            readers.forEach { runCatching { it.close() } }
        }
    }

    /**
     * [lines] without the ones an earlier stretch already gave, remembering their own for the stretches after.
     *
     * A compaction keeps the end of what it summarised and writes it again under the summary, under the same
     * uuids (measured on 2.1.280: `preservedSegment` in the boundary's metadata, and a fork of the compacted
     * conversation holds those lines a second time, re-hung under the summary). The source gives them in their
     * place before the compaction, the fork's own file gives them again after it - read across both, the last
     * answer before a compaction stood twice. The first, older place is the one kept: it is where it was said.
     */
    private fun once(lines: Sequence<String>, seen: MutableSet<String>, first: Boolean): Sequence<String> =
        lines.filter { line ->
            if (!line.startsWith(PARENT_KEY)) return@filter true
            val uuid = TranscriptRewinds.uuidOf(line) ?: return@filter true
            if (!first && uuid in seen) return@filter false
            seen += uuid
            true
        }

    /**
     * What the rewinds took out of one stretch. A whole transcript is read through the shared memory of rewound
     * files; a share of one counts only the marks inside the share - a mark past it was made after the fork took
     * the share, and what it cut is still in the fork.
     */
    private fun cutsOf(stretch: Stretch): BitSet? =
        stretch.lines?.let { count -> stretch.file.useLines { TranscriptRewinds.cutLines(it.take(count)) } }
            ?: TranscriptRewinds.cutLines(stretch.file)

    /** [lines] with the fork's seam after the line it ends on - or before them all, when it carries nothing. */
    private fun withSeam(lines: Sequence<String>, seam: ForkOrigin?): Sequence<String> {
        if (seam == null) return lines
        val mark = seam.seamLine()
        val at = seam.at ?: return sequenceOf(mark) + lines

        return lines.flatMap { line ->
            if (line.contains(at) && TranscriptRewinds.uuidOf(line) == at) sequenceOf(line, mark) else sequenceOf(line)
        }
    }

    /** Where the line named [uuid] stands in [file], counted the way the readers count - null when it is not there. */
    private fun positionOf(file: File, uuid: String): Int? = runCatching {
        file.useLines { lines -> lines.indexOfFirst { it.contains(uuid) && TranscriptRewinds.uuidOf(it) == uuid } }
    }.getOrNull()?.takeIf { it >= 0 }

    /** The first line of the chain among the first [lines] lines of [file] - null when there is none. */
    private fun firstChainLine(file: File, lines: Int?): String? = runCatching {
        file.useLines { all ->
            (lines?.let(all::take) ?: all).firstOrNull { it.startsWith(PARENT_KEY) }?.let(TranscriptRewinds::uuidOf)
        }
    }.getOrNull()

    private const val PARENT_KEY = "{\"parentUuid\":"

    /** How many transcripts up a history reaches - forks of forks are a handful, a loop is a book gone wrong. */
    private const val MAX_DEPTH = 16
}

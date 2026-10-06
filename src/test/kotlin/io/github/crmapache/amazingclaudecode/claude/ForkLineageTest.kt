package io.github.crmapache.amazingclaudecode.claude

import io.github.crmapache.amazingclaudecode.scenario.ScenarioFile
import java.io.File
import kotlin.io.path.createTempDirectory
import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertFalse
import kotlin.test.assertNull
import kotlin.test.assertTrue

/**
 * A fork's history as the panel reads it: what it carries, where its own part begins, and how far back it
 * reaches - and where a fork made now is pinned.
 *
 * The transcripts here are written the way the CLI writes them (measured on 2.1.280): a fork's file holds the
 * lines it inherited under the same uuids its source has, from the source's start - or from its last
 * compaction - and nothing marks where the fork's own lines begin.
 */
class ForkLineageTest {

    private val folder = createTempDirectory("forks").toFile()

    private fun transcript(id: String, vararg lines: String): File =
        File(folder, "$id.jsonl").also { it.writeText(lines.joinToString("\n", postfix = "\n")) }

    private val transcripts = { id: String -> File(folder, "$id.jsonl").takeIf { it.isFile } }

    private fun asked(uuid: String, parent: String?, text: String) =
        """{"parentUuid":${parent?.let { "\"$it\"" } ?: "null"},"isSidechain":false,"type":"user","message":{"role":"user","content":"$text"},"uuid":"$uuid","sessionId":"x"}"""

    private fun replied(uuid: String, parent: String, text: String) =
        """{"parentUuid":"$parent","isSidechain":false,"message":{"role":"assistant","content":[{"type":"text","text":"$text"}]},"type":"assistant","uuid":"$uuid","sessionId":"x"}"""

    private fun hooks(uuid: String, parent: String) =
        """{"parentUuid":"$parent","isSidechain":false,"type":"system","subtype":"stop_hook_summary","uuid":"$uuid","sessionId":"x"}"""

    private fun apiError(uuid: String, parent: String) =
        """{"parentUuid":"$parent","isSidechain":false,"type":"system","subtype":"api_error","uuid":"$uuid","sessionId":"x"}"""

    private fun subagent(uuid: String, parent: String) =
        """{"parentUuid":"$parent","isSidechain":true,"message":{"role":"assistant","content":[{"type":"text","text":"side"}]},"type":"assistant","uuid":"$uuid","sessionId":"x"}"""

    private fun boundary(uuid: String) =
        """{"parentUuid":null,"logicalParentUuid":"c2","isSidechain":false,"type":"system","subtype":"compact_boundary","uuid":"$uuid","sessionId":"x"}"""

    private fun summary(uuid: String, parent: String) =
        """{"parentUuid":"$parent","isSidechain":false,"type":"user","isVisibleInTranscriptOnly":true,"isCompactSummary":true,"message":{"role":"user","content":"This session is being continued from a previous conversation."},"uuid":"$uuid","sessionId":"x"}"""

    private fun rewoundTo(leaf: String) = """{"type":"last-prompt","leafUuid":"$leaf","explicit":true,"rewound":true,"sessionId":"x"}"""

    private val title = """{"type":"ai-title","aiTitle":"Fork","sessionId":"x"}"""

    /** A source of three turns: APPLE, BANANA, CHERRY. */
    private fun source(vararg after: String) = transcript(
        SOURCE,
        asked("s1", null, "APPLE"),
        replied("s2", "s1", "ok apple"),
        asked("s3", "s2", "BANANA"),
        replied("s4", "s3", "ok banana"),
        asked("s5", "s4", "CHERRY"),
        replied("s6", "s5", "ok cherry"),
        *after,
    )

    private fun texts(page: ClaudeHistory.Page): List<String> = page.lines.map { line ->
        when {
            ForkOrigin.isSeam(line) -> "SEAM"
            line.contains("compact_boundary") -> "COMPACT"
            else -> Regex(""""text":"([^"]+)"""").find(line)?.groupValues?.get(1) ?: "?"
        }
    }

    private fun lineages(origins: Map<String, ForkOrigin>) = ClaudeHistory.Lineages(transcripts) { origins[it] }

    // --- What a fork made now is pinned at --------------------------------------------------------------

    // The whole conversation is pinned at the last line of its chain - where the next message would hang -
    // and not left to whatever the source holds when the fork's process first comes up.
    @Test
    fun `a fork of the whole conversation ends on the source's last line`() {
        source(hooks("s7", "s6"), subagent("side-1", "s7"))

        val fork = ForkOrigin.resolve(transcripts, { null }, SOURCE, "Source", before = null)

        assertEquals(ForkOrigin(SOURCE, "Source", cut = false, at = "s7"), fork.origin)
        assertFalse(fork.missed)
    }

    // The CLI refuses a line it does not hold among the messages it resumes, and the fork then never comes up.
    // Lines it was never measured on are stepped over to the nearest line above that it was.
    @Test
    fun `a fork never ends on a line the CLI was not measured to take`() {
        source(apiError("e1", "s6"))

        assertEquals("s6", ForkOrigin.resolve(transcripts, { null }, SOURCE, "Source", before = null).origin?.at)
    }

    @Test
    fun `a rewound source is forked where it goes on from, not where its file ends`() {
        source(rewoundTo("s2"))

        assertEquals("s2", ForkOrigin.resolve(transcripts, { null }, SOURCE, "Source", before = null).origin?.at)
    }

    @Test
    fun `a fork cut at a message ends right before it, and one cut at the first carries nothing`() {
        source()

        assertEquals(ForkOrigin(SOURCE, "Source", cut = true, at = "s4"), ForkOrigin.resolve(transcripts, { null }, SOURCE, "Source", "s5").origin)
        assertEquals(ForkOrigin(SOURCE, "Source", cut = true, at = null), ForkOrigin.resolve(transcripts, { null }, SOURCE, "Source", "s1").origin)
    }

    @Test
    fun `a message the source does not hold forks it whole, and says so`() {
        source()

        val fork = ForkOrigin.resolve(transcripts, { null }, SOURCE, "Source", before = "nowhere")

        assertEquals(ForkOrigin(SOURCE, "Source", cut = false, at = "s6"), fork.origin)
        assertTrue(fork.missed)
    }

    // A fork of a compacted conversation holds only what came after the compaction. A message picked above that
    // - in the history the fork's feed shows from its source - is its source's, and so is the fork made at it.
    @Test
    fun `a message above a fork's own transcript is forked from the transcript that holds it`() {
        compacted()
        forkOfCompacted()

        val fork = ForkOrigin.resolve(transcripts, mapOf(FORK to ForkOrigin(COMPACTED, "Long one", cut = false, at = "c6"))::get, FORK, "Fork", "c3")

        assertEquals(ForkOrigin(COMPACTED, "Long one", cut = true, at = "c2"), fork.origin)
        assertFalse(fork.missed)
    }

    // --- What a fork's feed shows ---------------------------------------------------------------------------

    // Before its first message a fork has no file: it shows its source up to the line it ends on, and the seam.
    @Test
    fun `a fork nobody has spoken in shows its source up to its line, then the seam`() {
        source()

        val page = ClaudeHistory.page(lineages(emptyMap()).unborn(ForkOrigin(SOURCE, "Source", cut = true, at = "s4")), before = null)

        assertEquals(listOf("APPLE", "ok apple", "BANANA", "ok banana", "SEAM"), texts(page))
        assertNull(page.cursor)
    }

    @Test
    fun `a fork that carries nothing shows the seam alone`() {
        source()

        val page = ClaudeHistory.page(lineages(emptyMap()).unborn(ForkOrigin(SOURCE, "Source", cut = true, at = null)), before = null)

        assertEquals(listOf("SEAM"), texts(page))
    }

    // A rewind in the source made after the fork took its share takes nothing out of what the fork carries.
    @Test
    fun `a source rewound after the fork still lends it what it lent`() {
        source(rewoundTo("s2"), asked("s9", "s2", "ELDERBERRY"))

        val page = ClaudeHistory.page(lineages(emptyMap()).unborn(ForkOrigin(SOURCE, "Source", cut = true, at = "s4")), before = null)

        assertEquals(listOf("APPLE", "ok apple", "BANANA", "ok banana", "SEAM"), texts(page))
    }

    // Born, the fork's file holds what it inherited and what was said in it, and nothing says where the one ends:
    // the seam goes after the line the fork was made at.
    @Test
    fun `a born fork's seam stands where its own part begins`() {
        source()
        transcript(
            FORK,
            title,
            asked("s1", null, "APPLE"),
            replied("s2", "s1", "ok apple"),
            asked("s3", "s2", "BANANA"),
            replied("s4", "s3", "ok banana"),
            asked("f1", "s4", "DATE"),
            replied("f2", "f1", "ok date"),
        )

        val page = lineages(mapOf(FORK to ForkOrigin(SOURCE, "Source", cut = true, at = "s4"))).page(FORK, before = null)

        assertEquals(listOf("APPLE", "ok apple", "BANANA", "ok banana", "SEAM", "DATE", "ok date"), texts(page))
        assertNull(page.cursor)
    }

    // A fork of a compacted conversation: its own file begins at the compaction, and everything said before it
    // lives in the source alone. The history goes on there, page by page, without a line twice.
    @Test
    fun `a fork's history reaches past its own transcript into its source`() {
        compacted()
        forkOfCompacted()
        val history = lineages(mapOf(FORK to ForkOrigin(COMPACTED, "Long one", cut = false, at = "c6")))

        val whole = history.page(FORK, before = null)
        // The end the compaction kept stands once, where it was said - not again under the summary.
        assertEquals(listOf("OLD", "ok old", "OLDER", "ok older", "COMPACT", "LATER", "ok later", "SEAM", "FORKED", "ok forked"), texts(whole))

        // A page never begins on the seam - it has no name to ask the next page by - so it takes the line above.
        val end = history.page(FORK, before = null, pageSize = 3)
        assertEquals(listOf("ok later", "SEAM", "FORKED", "ok forked"), texts(end))
        val above = history.page(FORK, before = end.cursor, pageSize = 3)
        assertEquals(listOf("ok older", "COMPACT", "LATER"), texts(above))
        val top = history.page(FORK, before = above.cursor, pageSize = 3)
        assertEquals(listOf("OLD", "ok old", "OLDER"), texts(top))
        assertNull(top.cursor)
    }

    // A conversation that is no fork reads exactly as it always did.
    @Test
    fun `a conversation that is no fork has no seam and no source`() {
        source()

        val page = lineages(emptyMap()).page(SOURCE, before = null)

        assertEquals(listOf("APPLE", "ok apple", "BANANA", "ok banana", "CHERRY", "ok cherry"), texts(page))
    }

    // --- Kept by the book --------------------------------------------------------------------------------

    @Test
    fun `a fork's origin is kept by its conversation and read back by another window`() {
        val store = ScenarioFile(File(folder, "forks.json"))
        val origin = ForkOrigin(SOURCE, "Source", cut = true, at = "0e7e1c5e-0000-4000-8000-000000000004")

        ForkBook(store).remember(FORK, origin)

        assertEquals(origin, ForkBook(ScenarioFile(File(folder, "forks.json"))).origin(FORK))
        assertNull(ForkBook(store).origin(SOURCE))
    }

    @Test
    fun `an unreadable book is left alone rather than written over`() {
        val file = File(folder, "forks.json").also { it.writeText("not json") }

        ForkBook(ScenarioFile(file)).remember(FORK, ForkOrigin(SOURCE, "Source", cut = false, at = null))

        assertEquals("not json", file.readText())
    }

    @Test
    fun `an origin goes to disk and back whole`() {
        val origin = ForkOrigin(SOURCE, "A \"quoted\" name", cut = true, at = "0e7e1c5e-0000-4000-8000-000000000004")

        assertEquals(origin, ForkOrigin.decode(origin.json()))
        assertTrue(ForkOrigin.isSeam(origin.seamLine()))
    }

    /** A conversation compacted after two turns, and one more after the compaction. */
    private fun compacted() = transcript(
        COMPACTED,
        asked("c1", null, "OLD"),
        replied("c2", "c1", "ok old"),
        asked("c3", "c2", "OLDER"),
        replied("c4", "c3", "ok older"),
        boundary("cb"),
        summary("sum", "cb"),
        asked("c5", "sum", "LATER"),
        replied("c6", "c5", "ok later"),
    )

    /**
     * A fork of it made at its end: its file begins at the compaction, as the CLI copies it - and holds the end
     * the compaction kept again, re-hung under the summary, under the same uuid (measured on 2.1.280).
     */
    private fun forkOfCompacted() = transcript(
        FORK,
        title,
        boundary("cb"),
        summary("sum", "cb"),
        replied("c4", "sum", "ok older"),
        asked("c5", "c4", "LATER"),
        replied("c6", "c5", "ok later"),
        asked("g1", "c6", "FORKED"),
        replied("g2", "g1", "ok forked"),
    )

    private companion object {
        const val SOURCE = "0e7e1c5e-0000-4000-8000-000000000001"
        const val FORK = "0e7e1c5e-0000-4000-8000-000000000002"
        const val COMPACTED = "0e7e1c5e-0000-4000-8000-000000000003"
    }
}

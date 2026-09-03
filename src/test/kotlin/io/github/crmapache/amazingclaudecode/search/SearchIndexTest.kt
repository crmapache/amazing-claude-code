package io.github.crmapache.amazingclaudecode.search

import java.io.File
import java.nio.file.Files
import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertNotNull
import kotlin.test.assertTrue

class SearchIndexTest {

    private val home = Files.createTempDirectory("acc-search").toFile()
    private val transcripts = File(home, "transcripts").apply { mkdirs() }
    private val store = File(home, "index").toPath()

    private fun line(kind: String, uuid: String, text: String, at: String = "2026-08-14T09:12:00.000Z") =
        """{"type":"$kind","uuid":"$uuid","timestamp":"$at","message":{"role":"$kind","content":[{"type":"text","text":"$text"}]}}""" + "\n"

    private fun transcript(id: String, vararg lines: String): File =
        File(transcripts, "$id.jsonl").apply { writeText(lines.joinToString("")) }

    private fun index() = SearchIndex(store, transcripts = { transcripts.listFiles { f -> f.extension == "jsonl" }!!.toList() })

    @Test
    fun `the words of every conversation are found`() {
        transcript("a", line("user", "u1", "the meters do not shrink"), line("assistant", "a1", "I will let them give way"))
        transcript("b", line("user", "u2", "почему баланс не показывается"))

        val index = index()
        assertTrue(index.refresh(force = true))
        assertEquals(3, index.size)

        val found = index.search("баланс", conversation = null, onlyThatChat = false, limit = 10)
        assertEquals(listOf("u2"), found.hits.map { it.message.uuid })
        assertEquals("b", found.hits.single().message.conversation)
    }

    @Test
    fun `a transcript that grew is read from where the reading stopped`() {
        val file = transcript("a", line("user", "u1", "first words"))
        val index = index()
        index.refresh(force = true)
        assertEquals(1, index.size)

        file.appendText(line("assistant", "a1", "second words"))
        // A half-written last line stays for the next reading.
        file.appendText("""{"type":"user","uuid":"u9","message":{"content":""")

        assertTrue(index.refresh(force = true))
        assertEquals(2, index.size)
        assertEquals(listOf("a1"), index.search("second", null, false, 10).hits.map { it.message.uuid })

        file.appendText(""""unfinished"}}""" + "\n")
        assertTrue(index.refresh(force = true))
        assertEquals(3, index.size)
        assertEquals(listOf("u9"), index.search("unfinished", null, false, 10).hits.map { it.message.uuid })
    }

    @Test
    fun `the copy on disk is what the next start reads`() {
        transcript("a", line("user", "u1", "kept on disk"), """{"type":"ai-title","aiTitle":"Disk talk","sessionId":"a"}""" + "\n")
        index().refresh(force = true)

        // A second instance over the same folder reads the copy rather than the transcript: the
        // transcript is gone, and the words are still there.
        File(transcripts, "a.jsonl").delete()
        val again = SearchIndex(store, transcripts = { emptyList() })
        assertEquals(1, again.size)
        assertEquals("Disk talk", again.titleOf("a"))

        // Until it refreshes and sees the transcript is gone.
        assertTrue(again.refresh(force = true))
        assertEquals(0, again.size)
    }

    /**
     * The copy on disk is a cache, and a cache that fails to write must not claim to have written. A
     * failed write used to move the mark of how far the copy reaches all the same, and the next start
     * read on from that mark: the messages of the failed write were out of the search for good.
     */
    @Test
    fun `a write of the copy that fails is not counted as written`() {
        val file = transcript("a", line("user", "u1", "first words"))
        val index = index()
        index.refresh(force = true)

        // The copy cannot be added to: the disk is full, an antivirus holds the file - here it is read-only.
        val copy = store.resolve("a.jsonl").toFile()
        assertTrue(copy.setWritable(false))
        file.appendText(line("assistant", "a1", "words that failed to reach the disk"))
        assertTrue(index.refresh(force = true))
        assertEquals(2, index.size, "the words are in memory whatever the disk did")

        // The next start reads the copy and the manifest: the copy stops short, and the manifest says so
        // rather than claiming the words that never reached it - so the rest is read out of the
        // transcript again, from where the copy really ends.
        assertTrue(copy.setWritable(true))
        val again = index()
        assertEquals(1, again.size, "the copy holds what reached it, and the manifest claims no more")
        assertTrue(again.refresh(force = true))
        assertEquals(2, again.size)
        assertEquals(listOf("a1"), again.search("failed", null, false, 10).hits.map { it.message.uuid })
    }

    /** And the same instance catches the copy up on its own, on the next refresh the disk lets it. */
    @Test
    fun `a copy behind the words is rewritten whole on the next refresh`() {
        val file = transcript("a", line("user", "u1", "first words"))
        val index = index()
        index.refresh(force = true)

        val copy = store.resolve("a.jsonl").toFile()
        assertTrue(copy.setWritable(false))
        file.appendText(line("assistant", "a1", "second words"))
        index.refresh(force = true)

        // The disk is fine again, the transcript has not moved - the refresh still owes it the copy.
        assertTrue(copy.setWritable(true))
        index.refresh(force = true)

        val again = SearchIndex(store, transcripts = { emptyList() })
        assertEquals(2, again.size)
        assertEquals(listOf("a1"), again.search("second", null, false, 10).hits.map { it.message.uuid })
    }

    @Test
    fun `a rewritten transcript is read afresh`() {
        val file = transcript("a", line("user", "u1", "old words that will go"), line("user", "u2", "and these"))
        val index = index()
        index.refresh(force = true)
        assertEquals(2, index.size)

        file.writeText(line("user", "u3", "brand new"))
        assertTrue(index.refresh(force = true))
        assertEquals(1, index.size)
        assertTrue(index.search("old", null, false, 10).hits.isEmpty())
    }

    @Test
    fun `the title is the model's name, else the first words`() {
        transcript("a", line("user", "u1", "Fix the search button in compact layout please"))
        transcript("b", line("user", "u2", "hi"), """{"type":"ai-title","aiTitle":"Named by the model","sessionId":"b"}""" + "\n")

        val index = index()
        index.refresh(force = true)

        assertEquals("Fix the search button in compact layout please", index.titleOf("a"))
        assertEquals("Named by the model", index.titleOf("b"))
    }

    @Test
    fun `the corpus is the conversations as text, one header per message`() {
        transcript("a", line("user", "u1", "Кнопка поиска", at = "2026-08-14T09:12:00.000Z"), line("assistant", "a1", "Looked at it", at = "2026-08-14T09:13:00.000Z"))
        val index = index()
        index.refresh(force = true)

        val corpus = index.corpus()
        val text = Files.readString(corpus.resolve("a.txt"))
        assertTrue(text.contains("## u1 2026-08-14T09:12:00Z you\nКнопка поиска\n"), text)
        assertTrue(text.contains("## a1 2026-08-14T09:13:00Z claude\nLooked at it\n"), text)

        val sessions = Files.readString(corpus.resolve(SearchIndex.SESSIONS_FILE))
        assertTrue(sessions.contains("a | "), sessions)
        assertTrue(sessions.contains("| 2 | Кнопка поиска"), sessions)

        assertNotNull(index.lookup("a", "a1"))
    }

    @Test
    fun `a refresh is not repeated within its interval unless forced`() {
        transcript("a", line("user", "u1", "words"))
        val index = index()
        assertTrue(index.refresh(now = 10_000))
        File(transcripts, "b.jsonl").writeText(line("user", "u2", "more"))
        assertTrue(!index.refresh(now = 10_500))
        assertTrue(index.refresh(now = 10_000 + SearchIndex.REFRESH_INTERVAL_MS))
        assertEquals(2, index.size)
    }
}

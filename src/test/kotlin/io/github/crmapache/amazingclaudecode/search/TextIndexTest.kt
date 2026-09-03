package io.github.crmapache.amazingclaudecode.search

import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertFalse
import kotlin.test.assertTrue

class TextIndexTest {

    private fun message(uuid: String, text: String, at: Long = 0, conversation: String = "c1", speaker: Speaker = Speaker.YOU) =
        IndexedMessage(conversation, uuid, at, speaker, text)

    private val messages = listOf(
        message("1", "Кнопка поиска в компактной раскладке налезает на Send", at = 10),
        message("2", "Looked at composer.module.css: the meters do not shrink, so the oldestEventUuid moved.", at = 20, speaker = Speaker.CLAUDE),
        message("3", "почему баланс Deepgram не показывается с ключом Member?", at = 30, conversation = "c2"),
        message("4", "Balance needs an Owner or Admin key; a Member key transcribes fine.", at = 40, conversation = "c2", speaker = Speaker.CLAUDE),
        message("5", "Ещё раз про баланс: с ключом Owner всё видно", at = 50, conversation = "c2"),
    )

    private val index = TextIndex(messages)

    @Test
    fun `words are cut the same way the panel cuts them`() {
        val terms = Words.of("oldestEventUuid utf8 HTTPServer snake_case Ёлка café").map { it.term }

        assertTrue("oldesteventuuid" in terms)
        assertTrue("oldest" in terms && "event" in terms && "uuid" in terms)
        assertTrue("utf" in terms && "8" in terms)
        assertTrue("http" in terms && "server" in terms)
        assertTrue("snake" in terms && "case" in terms)
        assertTrue("елка" in terms)
        assertTrue("cafe" in terms)
    }

    @Test
    fun `an exact word finds its messages, best first`() {
        val found = index.search("баланс")

        assertEquals(listOf("3", "5"), found.hits.map { it.message.uuid })
        assertEquals(listOf("баланс"), found.terms.map { it.term })
    }

    @Test
    fun `a half-typed word finds the word it begins`() {
        val found = index.search("deepgr")
        assertEquals(listOf("3"), found.hits.map { it.message.uuid })
        assertTrue("deepgram" in found.terms.map { it.term })
    }

    @Test
    fun `a typo finds the word it meant`() {
        assertEquals(listOf("3"), index.search("deepgarm").hits.map { it.message.uuid })
        assertEquals(listOf("4"), index.search("transcribs fine").hits.map { it.message.uuid })
    }

    @Test
    fun `an inflected word finds its other forms by the stem`() {
        val inflected = TextIndex(
            listOf(
                message("7", "fork стартовал с умолчаний, а не наследовал модель родительской вкладки", at = 70),
                message("8", "наследование модели решили отложить", at = 80),
                message("9", "про модели ни слова", at = 90),
            ),
        )

        assertEquals(listOf("7"), inflected.search("fork наследует модель").hits.map { it.message.uuid })
        assertEquals(listOf("7", "8"), inflected.search("наследует").hits.map { it.message.uuid }.sorted())
        // The stem is the faintest way in: the exact word outranks it.
        assertEquals("8", inflected.search("наследование").hits.first().message.uuid)
    }

    @Test
    fun `a short word is not fuzzy - an edit makes another word`() {
        assertTrue(index.search("cat").hits.isEmpty())
    }

    @Test
    fun `every word of the query has to be there`() {
        assertEquals(listOf("4"), index.search("member key admin").hits.map { it.message.uuid })
        assertTrue(index.search("member nonexistentword").hits.isEmpty())
    }

    @Test
    fun `a part of a code name is found`() {
        assertEquals(listOf("2"), index.search("event uuid").hits.map { it.message.uuid })
    }

    @Test
    fun `a phrase in quotation marks has to stand as written`() {
        assertEquals(listOf("4"), index.search("\"member key\"").hits.map { it.message.uuid })
        assertTrue(index.search("\"key member\"").hits.isEmpty())
        assertEquals(listOf("3"), index.search("«ключом Member»").hits.map { it.message.uuid })
    }

    @Test
    fun `a scope keeps the search to one conversation`() {
        val found = index.search("баланс", conversation = "c1", onlyThatChat = true)
        assertTrue(found.hits.isEmpty())
        assertEquals(listOf("3", "5"), index.search("баланс", conversation = "c2", onlyThatChat = true).hits.map { it.message.uuid })
    }

    @Test
    fun `both scopes are counted in one search`() {
        // The window's tabs carry a count each and the person picks a list by them, so the count of the
        // other scope has to come back whichever one was asked for.
        val everywhere = index.search("баланс", conversation = "c2", onlyThatChat = false)

        assertEquals(2, everywhere.total)
        assertEquals(2, everywhere.chatTotal)
        assertEquals(listOf("3", "5"), everywhere.hits.map { it.message.uuid })

        val inC1 = index.search("баланс", conversation = "c1", onlyThatChat = false)
        assertEquals(2, inC1.total)
        assertEquals(0, inC1.chatTotal)

        // And the total is counted before the list is cut to its limit - a badge over "50 of 214" that
        // says 50 lies about the one thing it says.
        val capped = index.search("баланс", conversation = null, onlyThatChat = false, limit = 1)
        assertEquals(1, capped.hits.size)
        assertEquals(2, capped.total)
    }

    @Test
    fun `nothing asked, nothing found`() {
        assertTrue(index.search("").hits.isEmpty())
        assertTrue(index.search("  -- ").hits.isEmpty())
    }

    @Test
    fun `the snippet paints the matched words where they stand`() {
        val hit = index.search("member").hits.first { it.message.uuid == "4" }

        assertEquals(hit.message.text, hit.snippet)
        assertEquals(listOf("Member"), hit.spans.map { hit.snippet.substring(it) })
    }

    @Test
    fun `a long message is cut around the first match, on a word`() {
        val long = "word ".repeat(80) + "needle in the middle " + "tail ".repeat(80)
        val found = TextIndex(listOf(message("9", long))).search("needle")
        val hit = found.hits.single()

        // Cut on a word at both ends: what follows the ellipsis is a whole word, and so is what precedes it.
        assertTrue(hit.snippet.startsWith("…word "), hit.snippet)
        assertTrue(hit.snippet.endsWith(" tail…"), hit.snippet)
        assertTrue(hit.snippet.length <= Snippets.WINDOW + 2)
        assertEquals(listOf("needle"), hit.spans.map { hit.snippet.substring(it) })
    }

    @Test
    fun `a word found by its beginning paints the typed part, a typo the whole word`() {
        val begun = index.search("deepgr")
        val hit = begun.hits.single()
        assertEquals(listOf("Deepgr"), hit.spans.map { hit.snippet.substring(it) })
        assertEquals(Painted("deepgram", 6), begun.terms.single())

        val typo = index.search("deepgarm").hits.single()
        assertEquals(listOf("Deepgram"), typo.spans.map { typo.snippet.substring(it) })
    }

    @Test
    fun `a part of a code name paints only as far as it was typed`() {
        val found = TextIndex(listOf(message("9", "the useSelection hook and the UserCard chip"))).search("use")
        val hit = found.hits.single()

        assertEquals(listOf("use", "Use"), hit.spans.map { hit.snippet.substring(it) })
    }

    @Test
    fun `match case wants the letters as typed`() {
        val cased = TextIndex(
            listOf(
                message("10", "a Member key transcribes fine"),
                message("11", "every member of the team has one"),
            ),
        )

        assertEquals(listOf("10", "11"), cased.search("member").hits.map { it.message.uuid }.sorted())
        assertEquals(listOf("11"), cased.search("member", matchCase = true).hits.map { it.message.uuid })
        assertEquals(listOf("10"), cased.search("Member", matchCase = true).hits.map { it.message.uuid })
        // A typo has no letters standing in the text as typed - under Match case it finds nothing.
        assertTrue(cased.search("Membre", matchCase = true).hits.isEmpty())
        // What the feed paints carries the letters to compare with.
        assertEquals(Painted("member", 6, text = "Member"), cased.search("Member", matchCase = true).terms.single())
    }

    @Test
    fun `whole words wants a word of its own`() {
        // Not a beginning, not a typo, not a stem - and not a camel-case part of a longer word.
        assertEquals(listOf("2"), index.search("event").hits.map { it.message.uuid })
        assertTrue(index.search("event", wholeWords = true).hits.isEmpty())
        assertTrue(index.search("deepgr", wholeWords = true).hits.isEmpty())
        assertTrue(index.search("deepgarm", wholeWords = true).hits.isEmpty())
        assertEquals(listOf("2"), index.search("moved", wholeWords = true).hits.map { it.message.uuid })
        assertEquals(Painted("moved", 5, whole = true), index.search("moved", wholeWords = true).terms.single())
    }

    @Test
    fun `edits are counted the way a typo is made`() {
        assertTrue(Edits.within("deepgram", "deepgarm", 1))
        assertTrue(Edits.within("balance", "balence", 1))
        assertFalse(Edits.within("balance", "ballance!", 1))
        assertTrue(Edits.within("kitten", "sitting", 3))
        assertFalse(Edits.within("kitten", "sitting", 2))
    }
}

package io.github.crmapache.amazingclaudecode.scenario

import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertNull
import kotlin.test.assertTrue

/**
 * What a card's row says while its turn is open (see LiveWords).
 *
 * Written from a roas-radar run whose live line read "Reading the migration.Writing the red tests" and
 * `**Context.****Finding 1**`, and which would have stopped moving altogether a few sentences later.
 */
class LiveWordsTest {

    @Test
    fun `two blocks of text are two paragraphs`() {
        val said = read(
            start(),
            delta("**Context.**"),
            start(),
            delta("**Finding 1:** the history of nights."),
            start(),
            delta("Reading the migration."),
            start(),
            delta("Writing the red tests."),
        )

        assertEquals(
            "**Context.**\n\n**Finding 1:** the history of nights.\n\nReading the migration.\n\nWriting the red tests.",
            said,
        )
    }

    @Test
    fun `the first block starts the line rather than an empty one`() {
        assertEquals("Reading.", read(start(), delta("Reading.")))
    }

    @Test
    fun `a block that is not text breaks nothing`() {
        val said = read(start(), delta("Reading"), start("tool_use"), start("thinking"), delta(" the files."))

        assertEquals("Reading the files.", said)
    }

    @Test
    fun `a subagent's words are not the card's`() {
        val said = read(
            start(),
            delta("Two reviewers are on it."),
            start(parent = "toolu_1"),
            delta("The diff touches", parent = "toolu_1"),
            delta(" three files.", parent = "toolu_2"),
        )

        assertEquals("Two reviewers are on it.", said)
    }

    @Test
    fun `lines that are not the agent's text add nothing`() {
        assertNull(LiveWords.piece("""{"type":"assistant","message":{"content":[{"type":"text","text":"Hi"}]}}"""))
        assertNull(LiveWords.piece("""{"type":"stream_event","event":{"type":"content_block_delta","delta":{"type":"thinking_delta","thinking":"hm"}}}"""))
        assertNull(LiveWords.piece("""{"type":"stream_event","event":{"type":"content_block_delta","delta":{"type":"text_delta","text":""}}}"""))
        assertNull(LiveWords.piece("not json with \"stream_event\" and \"text_delta\" in it"))
    }

    /** The bug the cap used to be: it kept the FIRST characters, so the line froze once they filled up. */
    @Test
    fun `the line keeps moving past its cap`() {
        val pieces = (1..40).flatMap { listOf(start(), delta("Step $it is done.")) }
        val said = read(*pieces.toTypedArray(), limit = 120)

        assertTrue(said.endsWith("Step 40 is done."), said)
        assertTrue(said.length <= 120, said)
    }

    @Test
    fun `the oldest words go at a paragraph's start`() {
        val text = "First paragraph that will go.\n\nSecond one, kept whole.\n\nThird."

        assertEquals("Second one, kept whole.\n\nThird.", LiveWords.newest(text, 40))
    }

    @Test
    fun `a cut never leaves less than half of what fits`() {
        // The only paragraph break is right before the end, and cutting there would leave one word.
        val text = "a long paragraph\nwith a line break in it and then some more words\n\nEnd."

        assertEquals("with a line break in it and then some more words\n\nEnd.", LiveWords.newest(text, 60))
    }

    @Test
    fun `a cut through the middle of a line says so`() {
        val text = "one long line without any breaks in it at all, going on and on"

        assertEquals("...at all, going on and on", LiveWords.newest(text, 25))
    }

    @Test
    fun `a cut through a list item keeps it a nested list item`() {
        val text = "Intro that is long enough to be cut away.\n- one\n  - nested\n- two"

        assertEquals("- one\n  - nested\n- two", LiveWords.newest(text, 25))
    }

    @Test
    fun `a cut inside a code block opens it again`() {
        val text = "Here is the change:\n\n```kotlin\nval a = 1\nval b = 2\nval c = 3\n```\n\nDone."

        val kept = LiveWords.newest(text, 34)

        assertEquals("```kotlin\nval b = 2\nval c = 3\n```\n\nDone.", kept)
    }

    @Test
    fun `a cut after a closed block opens nothing`() {
        val text = "```\nval a = 1\n```\n\nThen a long paragraph after it.\n\nDone."

        assertEquals("Then a long paragraph after it.\n\nDone.", LiveWords.newest(text, 40))
    }

    @Test
    fun `a shorter fence inside a block does not close it`() {
        val text = "````md\n```ts\nconst a = 1\n```\nline one\nline two\n````\n\nDone."

        assertEquals("````md\nline one\nline two\n````\n\nDone.", LiveWords.newest(text, 30))
    }

    private fun read(vararg lines: String, limit: Int = 1200): String =
        lines.fold("") { said, line -> LiveWords.piece(line)?.let { LiveWords.add(said, it, limit) } ?: said }

    private fun start(type: String = "text", parent: String? = null): String =
        """{"type":"stream_event","event":{"type":"content_block_start","index":0,"content_block":{"type":"$type","text":""}},"parent_tool_use_id":${parent.json()}}"""

    private fun delta(text: String, parent: String? = null): String =
        """{"type":"stream_event","event":{"type":"content_block_delta","index":0,"delta":{"type":"text_delta","text":"${text.replace("\"", "\\\"")}"}},"parent_tool_use_id":${parent.json()}}"""

    private fun String?.json(): String = if (this == null) "null" else "\"$this\""
}

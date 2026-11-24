package io.github.crmapache.amazingclaudecode.claude.terminal

import io.github.crmapache.amazingclaudecode.claude.TranscriptRewinds
import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertIs
import kotlin.test.assertTrue

class TranscriptTailTest {

    private fun message(uuid: String, text: String) =
        """{"parentUuid":null,"type":"user","message":{"role":"user","content":[{"type":"text","text":"$text"}]},"uuid":"$uuid"}"""

    private fun reply(uuid: String, text: String) =
        """{"parentUuid":null,"type":"assistant","message":{"role":"assistant","content":[{"type":"text","text":"$text"}]},"uuid":"$uuid"}"""

    /** A line the CLI writes that the feed never draws. */
    private fun snapshot(uuid: String) = """{"type":"file-history-snapshot","uuid":"$uuid"}"""

    private val panelPart = listOf(message("u1", "first"), reply("a1", "answer"), message("u2", "second"), reply("a2", "done"))

    @Test
    fun `what came after the last line the feed holds is played, and nothing before it`() {
        val terminal = listOf(snapshot("s1"), message("u3", "from the terminal"), reply("a3", "in the terminal"))

        val tail = TranscriptTail.after((panelPart + terminal).asSequence(), known = listOf("a2", "u2", "a1"))

        val lines = assertIs<TranscriptTail.Tail.Lines>(tail).lines
        assertEquals(2, lines.size)
        assertTrue("from the terminal" in lines[0])
        assertTrue("in the terminal" in lines[1])
    }

    // The feed's newest line may be one the transcript does not hold (a stream event of its own) - an older
    // known line anchors just as well, and whatever followed it that the feed already had is ITS line again.
    @Test
    fun `the anchor is the last known line in the file, whichever of them it is`() {
        val terminal = listOf(message("u3", "from the terminal"))

        val tail = TranscriptTail.after((panelPart + terminal).asSequence(), known = listOf("stream-only", "a2"))

        assertEquals(1, assertIs<TranscriptTail.Tail.Lines>(tail).lines.size)
    }

    @Test
    fun `nothing done in the terminal is nothing to play`() {
        val tail = TranscriptTail.after(panelPart.asSequence(), known = listOf("a2"))

        assertEquals(emptyList(), assertIs<TranscriptTail.Tail.Lines>(tail).lines)
    }

    // The feed holds nothing of this transcript - or the terminal rewound past all of it.
    @Test
    fun `no anchor in the file draws the conversation again`() {
        assertIs<TranscriptTail.Tail.Whole>(TranscriptTail.after(panelPart.asSequence(), known = listOf("elsewhere")))
        assertIs<TranscriptTail.Tail.Whole>(TranscriptTail.after(panelPart.asSequence(), known = emptyList()))
    }

    // A rewind's cut may reach above the anchor, and lines played after it would bring back what was rewound away.
    @Test
    fun `a rewind in the terminal draws the conversation again`() {
        // The CLI's mark, as TranscriptRewindsTest writes it: a `last-prompt` line marked rewound.
        val rewound = """{"type":"last-prompt","leafUuid":"u1","explicit":true,"rewound":true,"sessionId":"s"}"""
        assertTrue(TranscriptRewinds.marks(rewound))

        val withMark = panelPart + message("u3", "x") + rewound

        assertIs<TranscriptTail.Tail.Whole>(TranscriptTail.after(withMark.asSequence(), known = listOf("a2")))
    }

    // Hours in the terminal are opened from the end, the way the history opens a conversation.
    @Test
    fun `more than the feed takes in one go draws the conversation again`() {
        val terminal = (1..TranscriptTail.MAX_LINES + 1).map { reply("t$it", "line $it") }

        assertIs<TranscriptTail.Tail.Whole>(TranscriptTail.after((panelPart + terminal).asSequence(), known = listOf("a2")))
    }
}

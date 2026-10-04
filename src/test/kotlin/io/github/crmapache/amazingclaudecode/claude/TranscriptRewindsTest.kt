package io.github.crmapache.amazingclaudecode.claude

import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertNull
import kotlin.test.assertTrue

/**
 * The shapes below are the ones a live rewind wrote on 2.1.280 (see Rewind): every line starts with its
 * `parentUuid`, a message carries its own `uuid` after the `message`, a turn ends with a `system` line, and
 * the cut is one `last-prompt` line marked `"rewound":true` whose `leafUuid` is the last message kept.
 */
class TranscriptRewindsTest {

    private fun parent(uuid: String?) = uuid?.let { "\"$it\"" } ?: "null"

    private fun user(uuid: String, parent: String?, text: String) =
        """{"parentUuid":${parent(parent)},"isSidechain":false,"type":"user","message":{"role":"user","content":"$text"},"uuid":"$uuid"}"""

    private fun reply(uuid: String, parent: String, text: String) =
        """{"parentUuid":"$parent","isSidechain":false,"message":{"role":"assistant","content":[{"type":"text","text":"$text"}]},"type":"assistant","uuid":"$uuid"}"""

    private fun attachment(uuid: String, parent: String) =
        """{"parentUuid":"$parent","isSidechain":false,"attachment":{"type":"skill_listing"},"type":"attachment","uuid":"$uuid"}"""

    private fun closing(uuid: String, parent: String) =
        """{"parentUuid":"$parent","isSidechain":false,"type":"system","subtype":"turn_duration","uuid":"$uuid"}"""

    private fun mark(leaf: String?) =
        """{"type":"last-prompt","leafUuid":${parent(leaf)},"explicit":true,"rewound":true,"sessionId":"s"}"""

    private val queue = """{"type":"queue-operation","operation":"enqueue"}"""

    /** Three turns, the second rewound and a third said in its place - the probe's own transcript. */
    private val rewound = listOf(
        queue,
        user("a1", null, "APPLE"),
        attachment("a2", "a1"),
        reply("r1", "a2", "OK"),
        closing("s1", "r1"),
        user("b1", "s1", "BANANA"),
        attachment("b2", "b1"),
        reply("r2", "b2", "OK"),
        closing("s2", "r2"),
        mark("r1"),
        queue,
        user("c1", "s1", "which words"),
        reply("r3", "c1", "APPLE"),
    )

    private fun alive(lines: List<String>): List<String> =
        TranscriptRewinds.alive(lines.asSequence(), TranscriptRewinds.cutLines(lines.asSequence())).toList()

    @Test
    fun `a file nobody rewound reads exactly as it was`() {
        val plain = rewound.filterNot { it.contains("rewound") }

        assertNull(TranscriptRewinds.cutLines(plain.asSequence()))
        assertEquals(plain, alive(plain))
    }

    // The next message hangs off the turn's closing line, which comes after the mark's leaf: that line and
    // everything kept before it stay, the rewound turn goes.
    @Test
    fun `the rewound turn goes and the conversation it went on from stays`() {
        val kept = alive(rewound)

        assertTrue(kept.none { it.contains("BANANA") })
        assertTrue(kept.none { it.contains("\"uuid\":\"r2\"") || it.contains("\"uuid\":\"b2\"") })
        assertTrue(kept.any { it.contains("APPLE") && it.contains("\"uuid\":\"a1\"") })
        assertTrue(kept.any { it.contains("\"uuid\":\"s1\"") })
        assertTrue(kept.any { it.contains("which words") })
    }

    // Nothing said since: the conversation stands at the mark's leaf, which is also where the CLI would
    // resume - the kept turn's own closing line goes with the rest, as it does for the CLI.
    @Test
    fun `with nothing said since, everything after the leaf goes`() {
        val kept = alive(rewound.take(10))

        assertTrue(kept.none { it.contains("BANANA") })
        assertTrue(kept.any { it.contains("\"uuid\":\"r1\"") })
        assertTrue(kept.none { it.contains("\"uuid\":\"s1\"") })
    }

    // A late line of the stopped turn hangs off that turn - it must not be taken for the conversation going
    // on from there, or the dropped turn would come back.
    @Test
    fun `a late line of the stopped turn is not where the conversation went on from`() {
        val late = rewound.take(10) + reply("r2b", "r2", "late") + rewound.drop(10)
        val kept = alive(late)

        assertTrue(kept.none { it.contains("BANANA") || it.contains("late") })
        assertTrue(kept.any { it.contains("which words") })
        assertTrue(kept.any { it.contains("\"uuid\":\"s1\"") })
    }

    // The name the person gave the conversation while the dropped turns ran is not one of them: lines off
    // the chain (a name, the CLI's own title, the queue's notes) are not messages, and the CLI keeps reading
    // them whatever it cut. Cut with the turns, the history showed the old name after the rewind.
    @Test
    fun `lines that are not messages stay, the name given during the dropped turns among them`() {
        val named = rewound.take(7) +
            """{"type":"custom-title","customTitle":"Release notes","sessionId":"s"}""" +
            rewound.drop(7)
        val kept = alive(named)

        assertTrue(kept.none { it.contains("BANANA") })
        assertTrue(kept.any { it.contains("Release notes") })
        assertTrue(kept.any { it.contains("which words") })
    }

    // Rewound to the very first message: there is nothing to keep before it, and the next message has no
    // parent at all.
    @Test
    fun `rewound to the first message, everything before the mark goes`() {
        val lines = listOf(
            user("a1", null, "APPLE"),
            reply("r1", "a1", "OK"),
            closing("s1", "r1"),
            mark(null),
            user("c1", null, "fresh start"),
        )
        val kept = alive(lines)

        assertTrue(kept.none { it.contains("APPLE") || it.contains("\"uuid\":\"r1\"") })
        assertTrue(kept.any { it.contains("fresh start") })
    }

    // A second rewind further back takes the first one's survivors with it.
    @Test
    fun `two rewinds cut what each of them cut`() {
        val again = rewound + listOf(closing("s3", "r3"), mark("a1"), user("d1", "a1", "from the top"))
        val kept = alive(again)

        assertTrue(kept.none { it.contains("BANANA") || it.contains("which words") })
        assertTrue(kept.any { it.contains("APPLE") && it.contains("\"uuid\":\"a1\"") })
        assertTrue(kept.any { it.contains("from the top") })
    }

    // A mark naming a line the file does not have is not acted on: a reader that cuts by a guess would cut
    // the wrong turns, and showing too much is the failure the panel already had.
    @Test
    fun `a mark whose leaf is not in the file cuts nothing`() {
        val lines = rewound.map { if (it.contains("rewound")) mark("nowhere") else it }

        assertEquals(lines, alive(lines))
    }

    // A live conversation's file grows by a line at a time, and the history asks for its cuts on every page:
    // read once and then only from where the last reading stopped, the answer has to be the same as a
    // reading of the whole file - a half-written last line included.
    @Test
    fun `a growing file is read on from where it stopped and cut as if read whole`() {
        val file = kotlin.io.path.createTempFile("rewound", ".jsonl").toFile()
        try {
            file.writeText(rewound.take(10).joinToString("\n", postfix = "\n"))
            assertEquals(TranscriptRewinds.cutLines(rewound.take(10).asSequence()), TranscriptRewinds.cutLines(file))

            val rest = rewound.drop(10)
            file.appendText(rest.joinToString("\n") + "\n" + rest.last().take(20))
            val whole = file.readLines()

            assertEquals(TranscriptRewinds.cutLines(whole.asSequence()), TranscriptRewinds.cutLines(file))
            assertTrue(TranscriptRewinds.alive(whole.asSequence(), TranscriptRewinds.cutLines(file)).none { it.contains("BANANA") })
            assertTrue(TranscriptRewinds.known(file))
        } finally {
            file.delete()
        }
    }

    @Test
    fun `a fork stops at the parent of the message it was forked before`() {
        assertEquals(TranscriptRewinds.Anchor.At("s1"), TranscriptRewinds.anchorBefore(rewound.asSequence(), "b1"))
        assertEquals(TranscriptRewinds.Anchor.Start, TranscriptRewinds.anchorBefore(rewound.asSequence(), "a1"))
        assertEquals(TranscriptRewinds.Anchor.NotFound, TranscriptRewinds.anchorBefore(rewound.asSequence(), "zz"))
    }

    // A message written into a running turn is filed as an attachment under its own uuid (`source_uuid`),
    // as 2.1.280 does it: the fork stops at the step the agent had reached when it took it.
    @Test
    fun `a message written into a running turn is found by its source uuid`() {
        val lines = rewound + """{"parentUuid":"r3","isSidechain":false,"attachment":{"type":"queued_command","prompt":[{"type":"text","text":"KIWI"}],"source_uuid":"q1"},"type":"attachment","uuid":"x9"}"""

        assertEquals(TranscriptRewinds.Anchor.At("r3"), TranscriptRewinds.anchorBefore(lines.asSequence(), "q1"))
    }

    @Test
    fun `only a rewound last-prompt counts as a mark`() {
        assertTrue(TranscriptRewinds.marks(mark("r1")))
        assertTrue(!TranscriptRewinds.marks("""{"type":"last-prompt","leafUuid":"r1","sessionId":"s"}"""))
        assertTrue(!TranscriptRewinds.marks(user("u", null, "the word rewound:true in a message")))
    }
}

package io.github.crmapache.amazingclaudecode.claude

import kotlinx.serialization.json.Json
import kotlinx.serialization.json.contentOrNull
import kotlinx.serialization.json.jsonArray
import kotlinx.serialization.json.jsonObject
import kotlinx.serialization.json.jsonPrimitive
import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertFalse
import kotlin.test.assertNotNull
import kotlin.test.assertNull
import kotlin.test.assertTrue

class ClaudeHistoryTest {

    // A person's bare text message with no attachments - Claude Code keeps it in message.content as a
    // string rather than an array of blocks. The live stream hands the panel arrays only, so such a
    // string has to turn into a single text block, or the feed breaks on a .filter call (a real bug:
    // picking such a conversation out of the history killed the whole panel).
    @Test
    fun `a bare text message is wrapped into a text block`() {
        val line = """{"type":"user","message":{"role":"user","content":"hello"}}"""

        val normalized = Json.parseToJsonElement(ClaudeHistory.normalizeContent(line)).jsonObject
        val content = normalized["message"]!!.jsonObject["content"]!!.jsonArray

        assertEquals(1, content.size)
        assertEquals("text", content[0].jsonObject["type"]?.jsonPrimitive?.contentOrNull)
        assertEquals("hello", content[0].jsonObject["text"]?.jsonPrimitive?.contentOrNull)
    }

    // tool_result and similar records are already stored as an array of blocks - no need to touch them.
    @Test
    fun `content that is already an array is left unchanged`() {
        val line = """{"type":"user","message":{"role":"user","content":[{"type":"tool_result","tool_use_id":"t1","content":"ok"}]}}"""

        assertEquals(line, ClaudeHistory.normalizeContent(line))
    }

    // The API always hands over assistant answers as an array of blocks - we leave those alone too.
    @Test
    fun `an assistant's message is left unchanged`() {
        val line = """{"type":"assistant","message":{"role":"assistant","content":[{"type":"text","text":"hello"}]}}"""

        assertEquals(line, ClaudeHistory.normalizeContent(line))
    }

    // A line without valid JSON or without message.content is returned as it is - this guards against a
    // damaged history file rather than being a reason to break while reading.
    @Test
    fun `a broken or incomplete line is returned unchanged`() {
        assertEquals("not json", ClaudeHistory.normalizeContent("not json"))

        val withoutContent = """{"type":"user","message":{"role":"user"}}"""
        assertEquals(withoutContent, ClaudeHistory.normalizeContent(withoutContent))
    }

    @Test
    fun `null content is left alone`() {
        val line = """{"type":"user","message":{"role":"user","content":null}}"""

        assertEquals(line, ClaudeHistory.normalizeContent(line))
        assertTrue(ClaudeHistory.normalizeContent(line).contains("\"content\":null"))
    }

    // A slash command's wrapping is written with the tags in two orders: built-in commands put the name
    // first, skills and plugins the caption. The parsing expected only the first, and a conversation
    // started by a skill was listed as a raw tag - exactly what was visible in the panel
    // ("<command-message>task</command-message>").
    @Test
    fun `a conversation started by a skill is named by the command itself`() {
        val lines = sequenceOf(
            """{"type":"user","isMeta":true,"message":{"role":"user","content":"<local-command-caveat>Caveat: …</local-command-caveat>"}}""",
            """{"type":"user","message":{"role":"user","content":"<command-message>task</command-message>\n<command-name>/task</command-name>\n<command-args>fix the history</command-args>"}}""",
            """{"type":"user","isMeta":true,"message":{"role":"user","content":[{"type":"text","text":"Base directory for this skill: /Users/max/.claude/skills/task"}]}}""",
        )

        assertEquals("/task fix the history", ClaudeHistory.scan(lines).title)
    }

    // The CLI's built-in commands write the wrapping in the opposite order - those were parsed before
    // too, and this check keeps both orders together.
    @Test
    fun `a built-in command with the name first is recognised too`() {
        val lines = sequenceOf(
            """{"type":"user","message":{"role":"user","content":"<command-name>/compact</command-name>\n            <command-message>compact</command-message>\n            <command-args></command-args>"}}""",
        )

        assertEquals("/compact", ClaudeHistory.scan(lines).title)
    }

    // The title is what the person wrote rather than what the shell dressed their words in: a called
    // skill's body, a background task's notification and an image's caption ended up in the list instead
    // of the message itself.
    @Test
    fun `internal messages give the title up to a real one`() {
        val lines = sequenceOf(
            """{"type":"user","message":{"role":"user","content":"<task-notification> <task-id>bmkth5kqm</task-id> </task-notification>"}}""",
            """{"type":"user","isMeta":true,"message":{"role":"user","content":"[Image: original 2048x1536]"}}""",
            """{"type":"user","message":{"role":"user","content":[{"type":"text","text":"Work out what is wrong with the agent timer"}]}}""",
        )

        assertEquals("Work out what is wrong with the agent timer", ClaudeHistory.scan(lines).title)
    }

    // The CLI's own name (the ai-title event in the transcript) is read as a separate field - entryFor
    // prefers it to the heuristic when there is one.
    @Test
    fun `ai-title is read as a separate field of the scan`() {
        val lines = sequenceOf(
            """{"type":"user","message":{"role":"user","content":"Tell me what you see in the picture."}}""",
            """{"type":"ai-title","aiTitle":"Describing the image contents","sessionId":"abc"}""",
        )

        val scan = ClaudeHistory.scan(lines)

        assertEquals("Tell me what you see in the picture.", scan.title)
        assertEquals("Describing the image contents", scan.aiTitle)
    }

    // The event repeats through the file - if the topic has changed since, we keep the last value seen
    // rather than the one the CLI picked at the very beginning.
    @Test
    fun `with several ai-titles the last one stays`() {
        val lines = sequenceOf(
            """{"type":"user","message":{"role":"user","content":"go ahead"}}""",
            """{"type":"ai-title","aiTitle":"The first topic","sessionId":"abc"}""",
            """{"type":"ai-title","aiTitle":"The topic changed","sessionId":"abc"}""",
        )

        assertEquals("The topic changed", ClaudeHistory.scan(lines).aiTitle)
    }

    // A short first line must not become the whole title - it used to be taken exactly as it was
    // ("Right"), although the substance of the question was a line below.
    @Test
    fun `a short first line is joined with what follows`() {
        val lines = sequenceOf(
            """{"type":"user","message":{"role":"user","content":"Right\nlet us make a proper dialog with buttons"}}""",
        )

        assertEquals("Right let us make a proper dialog with buttons", ClaudeHistory.scan(lines).title)
    }

    // The composer inserts `[Image #N]` in the middle of a sentence rather than only on a line of its
    // own ("look [Image #1] here") - the tag has to be cut out rather than leak into the title along
    // with the words.
    @Test
    fun `an inline image tag in the middle of a sentence is cut out`() {
        val lines = sequenceOf(
            """{"type":"user","message":{"role":"user","content":[{"type":"text","text":"look [Image #1] here, what is wrong"}]}}""",
        )

        assertEquals("look here, what is wrong", ClaudeHistory.scan(lines).title)
    }

    // The panel puts bash-mode output at the start of the person's next message - it has no place in a
    // conversation's title: the list showed raw tags instead of the question the conversation was
    // started for.
    @Test
    fun `bash-mode output does not get into the title`() {
        val lines = sequenceOf(
            """{"type":"user","message":{"role":"user","content":[{"type":"text","text":"<bash-input>git pull</bash-input>\n<bash-stdout>Already up to date.\nfrom origin/main</bash-stdout>\n\nLet us move on to this task"}]}}""",
        )

        assertEquals("Let us move on to this task", ClaudeHistory.scan(lines).title)
    }

    // A message holding nothing but commands does not describe the conversation - the title has to go to
    // the next, real one.
    @Test
    fun `a message of commands alone gives the title up to a person's words`() {
        val lines = sequenceOf(
            """{"type":"user","message":{"role":"user","content":"<bash-input>git status</bash-input>\n<bash-stdout>clean</bash-stdout>"}}""",
            """{"type":"user","message":{"role":"user","content":"bring the sandbox up"}}""",
        )

        assertEquals("bring the sandbox up", ClaudeHistory.scan(lines).title)
    }

    // A real message from the person overrides a command even when the command came first: a /clear at
    // the start of a conversation must not become its name.
    @Test
    fun `a person's message outweighs the command it started with`() {
        val lines = sequenceOf(
            """{"type":"user","message":{"role":"user","content":"<command-name>/clear</command-name>"}}""",
            """{"type":"user","message":{"role":"user","content":"bring the sandbox up"}}""",
        )

        val scan = ClaudeHistory.scan(lines)

        assertEquals("bring the sandbox up", scan.title)
        assertEquals(2, scan.messages)
    }

    // A card holds as many messages as the person wrote - not as many entries as the file happens to
    // have. The transcript records every tool result and every command's wrapping as the person's
    // messages: counting by those parted ways with what was on screen tenfold.
    @Test
    fun `only the person's messages are counted`() {
        val lines = sequenceOf(
            """{"type":"user","message":{"role":"user","content":[{"type":"text","text":"bring the sandbox up"}]}}""",
            """{"type":"assistant","message":{"role":"assistant","content":[{"type":"text","text":"bringing it up"}]}}""",
            """{"type":"user","message":{"role":"user","content":[{"tool_use_id":"t1","type":"tool_result","content":"done"}]}}""",
            """{"type":"user","isMeta":true,"message":{"role":"user","content":"<local-command-caveat>Caveat: …</local-command-caveat>"}}""",
            """{"type":"user","message":{"role":"user","content":"<local-command-stdout>done</local-command-stdout>"}}""",
            """{"type":"user","message":{"role":"user","content":"<task-notification>\n<task-id>bmkth5kqm</task-id>\n</task-notification>"}}""",
            """{"type":"user","message":{"role":"user","content":[{"type":"text","text":"thanks"}]}}""",
        )

        assertEquals(2, ClaudeHistory.scan(lines).messages)
    }

    // A command is something the person said too, and a conversation made entirely of one has to stay in
    // the list: otherwise it disappears from the history entirely.
    @Test
    fun `a command counts as a message`() {
        val lines = sequenceOf(
            """{"type":"user","isMeta":true,"message":{"role":"user","content":"<local-command-caveat>Caveat: …</local-command-caveat>"}}""",
            """{"type":"user","message":{"role":"user","content":"<command-name>/compact</command-name>"}}""",
        )

        val scan = ClaudeHistory.scan(lines)

        assertEquals(1, scan.messages)
        assertEquals("/compact", scan.title)
    }

    // The conversations folder's name is not ours to invent - it has to match the one Claude Code makes
    // itself, or the panel and the terminal cannot see each other's conversations. The CLI's rule is one
    // for every character: not a letter and not a digit becomes a hyphen.
    @Test
    fun `the conversations folder is named exactly as the CLI names it`() {
        assertEquals(
            "-Users-max-Documents-Projects-amazing-claude-code",
            ClaudeHistory.slugFor("/Users/max/Documents/Projects/amazing-claude-code"),
        )
    }

    // Exactly the cases the history used to drift on: an underscore and a space in a folder's name - and
    // a Windows path, where the colon after the drive letter stayed where it was, because of which not a
    // single conversation was visible in the panel.
    @Test
    fun `an underscore, a space and a Windows path become hyphens too`() {
        assertEquals("-home-ivan-dev-my-project", ClaudeHistory.slugFor("/home/ivan/dev/my_project"))
        assertEquals("-home-ivan-my-app-v2", ClaudeHistory.slugFor("/home/ivan/my app.v2"))
        assertEquals("C--Users-Ivan-dev-proj", ClaudeHistory.slugFor("C:/Users/Ivan/dev/proj"))
        assertEquals("C--Users-Ivan-dev-proj", ClaudeHistory.slugFor("C:\\Users\\Ivan\\dev\\proj"))
    }

    // Only what the feed can draw: the transcript also holds summaries, service records and the file
    // snapshots the CLI keeps beside them, and none of those are a message.
    @Test
    fun `the replay keeps messages and replies and nothing else`() {
        val lines = sequenceOf(
            """{"type":"user","message":{"role":"user","content":"fix the tests"}}""",
            """{"type":"summary","summary":"a compacted conversation"}""",
            """{"type":"assistant","message":{"content":[{"type":"text","text":"done"}]}}""",
            "not json at all",
        )

        val replayed = ClaudeHistory.replayable(lines).toList()

        assertEquals(2, replayed.size)
        assertTrue(replayed[0].contains("fix the tests"))
        assertTrue(replayed[1].contains("done"))
    }

    // The lines come out in the shape the live stream hands them over, not the shape the disk keeps them
    // in - the feed parses one of the two and breaks on the other (see the bare-text-message test above).
    @Test
    fun `the replay normalizes what it hands over`() {
        val lines = sequenceOf("""{"type":"user","message":{"role":"user","content":"hello"}}""")

        val content = Json.parseToJsonElement(ClaudeHistory.replayable(lines).first())
            .jsonObject["message"]!!.jsonObject["content"]!!.jsonArray

        assertEquals("hello", content[0].jsonObject["text"]!!.jsonPrimitive.contentOrNull)
    }

    // A slash command the CLI carries out itself (`/code-review`, `/cost`) reaches the panel live as an
    // ordinary answer, while the transcript files the same output away as a system entry. Without turning
    // it back, a conversation opened from the history showed the command with nothing after it - the
    // review's findings above all (see ClaudeHistory.commandOutput).
    @Test
    fun `the output of a command the CLI ran itself comes back as an answer`() {
        val lines = sequenceOf(
            """{"type":"user","message":{"role":"user","content":"/code-review"}}""",
            """{"type":"system","subtype":"local_command","content":"<local-command-stdout>3 findings</local-command-stdout>"}""",
        )

        val replayed = ClaudeHistory.replayable(lines).toList()

        assertEquals(2, replayed.size)
        val answer = Json.parseToJsonElement(replayed[1]).jsonObject
        assertEquals("assistant", answer["type"]!!.jsonPrimitive.contentOrNull)
        assertEquals(
            "3 findings",
            answer["message"]!!.jsonObject["content"]!!.jsonArray[0].jsonObject["text"]!!.jsonPrimitive.contentOrNull,
        )
    }

    // Older CLIs filed that same output as the person's own message with the output in a tag - and the
    // feed, which cuts such tags out of a message, was left with an empty one.
    @Test
    fun `the same output filed as the person's message comes back as an answer too`() {
        val lines = sequenceOf(
            """{"type":"user","message":{"role":"user","content":"<local-command-stdout>done</local-command-stdout>"}}""",
        )

        val answer = Json.parseToJsonElement(ClaudeHistory.replayable(lines).first()).jsonObject

        assertEquals("assistant", answer["type"]!!.jsonPrimitive.contentOrNull)
    }

    // A command that printed nothing has nothing to show, and an entry that holds more than the output
    // is not merely output - reducing it to the part inside the wrapping would throw the rest away.
    @Test
    fun `only what a command actually printed is turned into an answer`() {
        assertNull(
            ClaudeHistory.commandOutput(
                """{"type":"system","subtype":"local_command","content":"<local-command-stdout></local-command-stdout>"}""",
            ),
        )
        assertNull(
            ClaudeHistory.commandOutput(
                """{"type":"user","message":{"role":"user","content":"and now <local-command-stdout>done</local-command-stdout>"}}""",
            ),
        )
        assertNull(ClaudeHistory.commandOutput("""{"type":"assistant","message":{"content":[]}}"""))
    }

    // With no boundary at all, a page is the file's own tail - the only case where that is the right
    // answer: a conversation whose live journal has never sent anything of it yet (see ClaudeHistory.page).
    @Test
    fun `a page with no boundary is the file's own last page`() {
        val all = (1..5).map { """{"type":"user","uuid":"u$it","message":{"role":"user","content":"m$it"}}""" }

        val page = ClaudeHistory.pageOf(all, before = null, pageSize = 3)

        assertEquals(listOf("u3", "u4", "u5"), page.lines.map { uuidIn(it) })
        assertEquals("u3", page.cursor)
    }

    // The ordinary case: asked for what came before a message already on screen, by its uuid.
    @Test
    fun `a page stops right before the message it was asked for`() {
        val all = (1..5).map { """{"type":"user","uuid":"u$it","message":{"role":"user","content":"m$it"}}""" }

        val page = ClaudeHistory.pageOf(all, before = "u4", pageSize = 2)

        assertEquals(listOf("u2", "u3"), page.lines.map { uuidIn(it) })
        assertEquals("u2", page.cursor)
    }

    // Two consecutive pages must tile the file exactly - no message repeated, none skipped, which is
    // what a phone scrolling up a page at a time relies on.
    @Test
    fun `consecutive pages do not repeat or skip a message`() {
        val all = (1..5).map { """{"type":"user","uuid":"u$it","message":{"role":"user","content":"m$it"}}""" }

        val first = ClaudeHistory.pageOf(all, before = "u4", pageSize = 2)
        val second = ClaudeHistory.pageOf(all, before = first.cursor, pageSize = 2)

        assertEquals(listOf("u2", "u3"), first.lines.map { uuidIn(it) })
        assertEquals(listOf("u1"), second.lines.map { uuidIn(it) })
        assertEquals(null, second.cursor)
    }

    // The file's very beginning has been reached - there is nothing further to ask for, and the caller
    // is told so by a null cursor rather than an empty page indistinguishable from "try again".
    @Test
    fun `reaching the start of the file clears the cursor`() {
        val all = (1..2).map { """{"type":"user","uuid":"u$it","message":{"role":"user","content":"m$it"}}""" }

        val page = ClaudeHistory.pageOf(all, before = "u2", pageSize = 10)

        assertEquals(listOf("u1"), page.lines.map { uuidIn(it) })
        assertEquals(null, page.cursor)
    }

    /**
     * The limit that decides whether a phone sees anything at all. A page travels in one frame capped at
     * 256 KB, and an oversized frame is dropped by the relay with a line in its log and nothing else - so
     * a working day's worth of file reads made "load more" a button that did nothing, every time.
     */
    @Test
    fun `a page stops at the size limit rather than at the message count`() {
        val heavy = (1..10).map {
            """{"type":"user","uuid":"u$it","message":{"role":"user","content":"${"x".repeat(400)}"}}"""
        }

        // Room for three of them exactly, out of ten.
        val budget = heavy.takeLast(3).sumOf { it.length }
        val page = ClaudeHistory.pageOf(heavy, before = null, pageSize = 10, maxChars = budget)

        // The end of the conversation is what survives a tight budget - it is the part standing right
        // above what is already on screen.
        assertEquals(listOf("u8", "u9", "u10"), page.lines.map { uuidIn(it) })
        // And there is more behind it, said out loud - otherwise the placeholder would disappear as
        // though the conversation began here.
        assertEquals("u8", page.cursor)
    }

    // One message on its own may be over any budget - a file read whole. Returning nothing at all in that
    // case would leave the cursor where it was and the button dead, which is the very thing the budget is
    // there to prevent.
    @Test
    fun `a single outsized message is still handed over`() {
        val lines = listOf(
            """{"type":"user","uuid":"u1","message":{"role":"user","content":"small"}}""",
            """{"type":"user","uuid":"u2","message":{"role":"user","content":"${"x".repeat(5000)}"}}""",
        )

        val page = ClaudeHistory.pageOf(lines, before = null, pageSize = 10, maxChars = 100)

        assertEquals(listOf("u2"), page.lines.map { uuidIn(it) })
        assertEquals("u2", page.cursor)
    }

    // Consecutive pages must still tile exactly when it is the budget rather than the count that ends
    // them: a phone scrolling up relies on the cursor picking up precisely where the page stopped.
    @Test
    fun `pages cut by the size limit tile without a gap`() {
        val heavy = (1..6).map {
            """{"type":"user","uuid":"u$it","message":{"role":"user","content":"${"x".repeat(400)}"}}"""
        }

        val budget = heavy.first().length * 3
        val first = ClaudeHistory.pageOf(heavy, before = null, pageSize = 10, maxChars = budget)
        val second = ClaudeHistory.pageOf(heavy, before = first.cursor, pageSize = 10, maxChars = budget)

        assertEquals(listOf("u4", "u5", "u6"), first.lines.map { uuidIn(it) })
        assertEquals(listOf("u1", "u2", "u3"), second.lines.map { uuidIn(it) })
        assertNull(second.cursor)
    }

    // A boundary that does not exist in this file - a stale uuid from before a resume, say - is treated
    // as "no boundary at all" rather than as an empty page: see the reasoning on ClaudeHistory.page.
    @Test
    fun `an unknown boundary falls back to the file's last page`() {
        val all = (1..3).map { """{"type":"user","uuid":"u$it","message":{"role":"user","content":"m$it"}}""" }

        val page = ClaudeHistory.pageOf(all, before = "does-not-exist", pageSize = 2)

        assertEquals(listOf("u2", "u3"), page.lines.map { uuidIn(it) })
    }

    /**
     * The rebuilt line has to keep the transcript's own name for it. A phone asks for the page above what
     * it already has by naming its topmost line, and an anchor that matches nothing in the file was
     * answered with the end of the conversation - what was on the screen already.
     */
    @Test
    fun `a command's output keeps the name the transcript gave the line`() {
        val lines = sequenceOf(
            """{"type":"system","subtype":"local_command","uuid":"sys-7","content":"<local-command-stdout>3 findings</local-command-stdout>"}""",
        )

        assertEquals("sys-7", uuidIn(ClaudeHistory.replayable(lines).first()))
    }

    /**
     * A page has to begin on a line the next request can name. One that could not be named was handed
     * over as "there is nothing further back": the button disappeared, and everything above it in a long
     * conversation became unreachable. The boundary falls where the budget puts it, so any line could be
     * the one.
     */
    @Test
    fun `a page reaches past a line that has no name of its own`() {
        val all = listOf(
            """{"type":"user","uuid":"u0","message":{"role":"user","content":"m0"}}""",
            """{"type":"user","uuid":"u1","message":{"role":"user","content":"m1"}}""",
            """{"type":"assistant","message":{"content":[{"type":"text","text":"nameless"}]}}""",
            """{"type":"user","uuid":"u3","message":{"role":"user","content":"m3"}}""",
            """{"type":"user","uuid":"u4","message":{"role":"user","content":"m4"}}""",
        )

        val page = ClaudeHistory.pageOf(all, before = "u4", pageSize = 2)

        // The nameless line comes along rather than standing at the head of the page, so the cursor is a
        // real one and there is still a page above this to ask for.
        assertEquals("u1", page.cursor)
        assertEquals(3, page.lines.size)
    }

    @Test
    fun `a page that reaches the beginning still says there is nothing further back`() {
        val all = listOf(
            """{"type":"assistant","message":{"content":[{"type":"text","text":"nameless"}]}}""",
            """{"type":"user","uuid":"u2","message":{"role":"user","content":"m2"}}""",
        )

        assertNull(ClaudeHistory.pageOf(all, before = "u2", pageSize = 5).cursor)
    }

    /**
     * The window a page is cut out of. Read in one pass and never wider than a page, because a tab
     * opening a conversation from the history goes through this: the whole file used to be gathered into
     * a list first, which is tens of megabytes for the sake of the forty messages at its end.
     */
    @Test
    fun `the window is the end of the conversation, and says the rest is above it`() {
        val all = (1..50).map { """{"type":"user","uuid":"u$it","message":{"role":"user","content":"m$it"}}""" }

        val window = ClaudeHistory.windowOf(all.asSequence(), before = null, pageSize = 5)

        assertTrue(window.moreAbove)
        assertEquals("u50", uuidIn(window.lines.last()))
        assertTrue(window.lines.size <= 5 + 8, "the window held ${window.lines.size} lines for a page of 5")
    }

    @Test
    fun `the window stops right before the message it was asked for`() {
        val all = (1..10).map { """{"type":"user","uuid":"u$it","message":{"role":"user","content":"m$it"}}""" }

        val window = ClaudeHistory.windowOf(all.asSequence(), before = "u7", pageSize = 3)

        assertEquals("u6", uuidIn(window.lines.last()))
    }

    /** A short conversation fits whole, and then there is genuinely nothing above it. */
    @Test
    fun `a conversation shorter than a page has nothing above it`() {
        val all = (1..3).map { """{"type":"user","uuid":"u$it","message":{"role":"user","content":"m$it"}}""" }

        val window = ClaudeHistory.windowOf(all.asSequence(), before = null, pageSize = 10)

        assertFalse(window.moreAbove)
        assertEquals(3, window.lines.size)
    }

    /**
     * A window that dropped lines has to begin on one the next request can name. A nameless line at its
     * head would come back as a page with no cursor - "the conversation begins here" - and everything
     * genuinely above it would become unreachable.
     */
    @Test
    fun `a window that dropped lines begins on a line with a name`() {
        // Long enough that the window genuinely has to drop its head, with a nameless line falling exactly
        // where the head ends up.
        val all = (1..15).map { number ->
            if (number == 6) {
                """{"type":"assistant","message":{"content":[{"type":"text","text":"nameless"}]}}"""
            } else {
                """{"type":"user","uuid":"u$number","message":{"role":"user","content":"m$number"}}"""
            }
        }

        val window = ClaudeHistory.windowOf(all.asSequence(), before = null, pageSize = 2)

        assertTrue(window.moreAbove)
        assertEquals("u7", uuidIn(window.lines.first()))
    }

    /**
     * The window is read line by line rather than gathered up first - the same claim as for [replayable]
     * below, and the reason this exists at all.
     */
    @Test
    fun `the window holds a page's worth of lines, not the file's`() {
        var read = 0
        val long = generateSequence(1) { if (it < 20_000) it + 1 else null }.map { number ->
            read += 1
            """{"type":"user","uuid":"u$number","message":{"role":"user","content":"${"x".repeat(200)}"}}"""
        }

        val window = ClaudeHistory.windowOf(long, before = null, pageSize = 10)

        assertEquals(20_000, read, "the file has to be walked to reach its end")
        assertTrue(window.lines.size <= 18, "the window kept ${window.lines.size} lines out of 20000")
    }

    /**
     * A page cut out of a window is not the conversation's beginning just because it reached the window's
     * first line: without this the mark over the feed would vanish on the very first page, and the rest of
     * the conversation with it.
     */
    @Test
    fun `a page out of a window keeps a cursor for what lies above the window`() {
        val all = (1..3).map { """{"type":"user","uuid":"u$it","message":{"role":"user","content":"m$it"}}""" }

        val page = ClaudeHistory.pageOf(all, before = null, pageSize = 10, moreAbove = true)

        assertEquals("u1", page.cursor)
    }

    // --- A page is counted in messages, not in lines ------------------------------

    /**
     * The whole point of counting in messages. One step of the agent is two lines on disk, and a burst of
     * them is a single folded row on screen - so a page of two hundred lines used to add one row to the
     * feed and the press looked like it had done nothing.
     */
    @Test
    fun `a burst of calls and their results counts as one message`() {
        val all = listOf(
            said("u1"),
            called("a1"),
            returned("r1"),
            called("a2"),
            returned("r2"),
            answered("t1"),
        )

        val page = ClaudeHistory.pageOf(all, before = null, pageSize = 2)

        // Two messages: the answer, and the whole burst standing above it.
        assertEquals(listOf("a1", "r1", "a2", "r2", "t1"), page.lines.map { uuidIn(it) })
        assertEquals("a1", page.cursor)
    }

    /**
     * The lines the feed drops on the floor - an empty thinking block (the CLI writes plenty, a signature
     * and nothing else), the shell's own mark, a reminder written to itself - draw no row and must not
     * break a burst into pieces either, or a page would be spent on them.
     */
    @Test
    fun `lines that draw nothing join the burst instead of ending it`() {
        val all = listOf(
            said("u1"),
            called("a1"),
            thoughtNothing("k1"),
            meta("m1"),
            reminder("s1"),
            returned("r1"),
            answered("t1"),
        )

        val page = ClaudeHistory.pageOf(all, before = null, pageSize = 2)

        assertEquals(listOf("a1", "k1", "m1", "s1", "r1", "t1"), page.lines.map { uuidIn(it) })
        assertEquals("a1", page.cursor)
    }

    /** A page asked for ten messages holds ten of them, however many lines that comes to. */
    @Test
    fun `a page holds the asked-for number of messages, whatever they weigh in lines`() {
        val all = (1..10).flatMap { number ->
            listOf(said("u$number"), called("a$number"), returned("r$number"))
        }

        val page = ClaudeHistory.pageOf(all, before = null, pageSize = 6, maxChars = 1024 * 1024)

        // Six messages: three of the person's, three bursts between them.
        assertEquals("u8", page.cursor)
        assertEquals(9, page.lines.size, "six messages came to ${page.lines.size} lines")
    }

    /** Counted in messages, consecutive pages must still tile the file exactly - see the same claim above. */
    @Test
    fun `consecutive pages counted in messages do not repeat or skip anything`() {
        val all = (1..6).flatMap { number -> listOf(said("u$number"), called("a$number"), returned("r$number")) }

        val first = ClaudeHistory.pageOf(all, before = null, pageSize = 4, maxChars = 1024 * 1024)
        val second = ClaudeHistory.pageOf(all, before = first.cursor, pageSize = 4, maxChars = 1024 * 1024)
        val third = ClaudeHistory.pageOf(all, before = second.cursor, pageSize = 4, maxChars = 1024 * 1024)

        // Four messages a page - a person's line, then the burst that answered it, twice over.
        assertEquals(6, first.lines.size, "a page of four messages came to ${first.lines.size} lines")
        assertEquals(
            all.map { uuidIn(it) },
            (third.lines + second.lines + first.lines).map { uuidIn(it) },
            "the pages have to tile the file exactly",
        )
        assertNull(third.cursor)
    }

    /** And the window that page is cut out of holds messages too, not lines. */
    @Test
    fun `the window keeps a page's worth of messages, not of lines`() {
        val all = (1..40).flatMap { number -> listOf(said("u$number"), called("a$number"), returned("r$number")) }

        val window = ClaudeHistory.windowOf(all.asSequence(), before = null, pageSize = 4)

        assertTrue(window.moreAbove)
        assertEquals("r40", uuidIn(window.lines.last()))
        // Four messages plus the slack, each of them up to two lines - and nowhere near the 120 lines a
        // window counted in lines would have kept.
        assertTrue(window.lines.size in 12..30, "the window held ${window.lines.size} lines for 4 messages")
    }

    /**
     * One message can be an unbroken run of hundreds of calls, and the window is held in memory whole. The
     * ceiling in lines is what keeps that from becoming tens of megabytes - the very thing reading a
     * transcript by lines exists to avoid.
     */
    @Test
    fun `a single endless burst does not grow the window past its ceiling`() {
        val burst = (1..5_000).map { called("a$it") }

        val window = ClaudeHistory.windowOf(burst.asSequence(), before = null, pageSize = 30, maxLines = 100)

        assertTrue(window.moreAbove)
        assertTrue(window.lines.size <= 100, "the window held ${window.lines.size} lines")
        // Cut down to the ceiling it may be, but it is still the end of the conversation and still usable.
        assertEquals("a5000", uuidIn(window.lines.last()))
        assertNotNull(uuidIn(window.lines.first()))
    }

    /**
     * A page of history is shortened harder than the live journal shortens the same entry. The journal is
     * catching the rare monster; a page is spending a budget in characters, and one file read whole used
     * to be the whole of it - especially on a phone, where the budget is a quarter of the desk's.
     */
    @Test
    fun `a page of history shortens a long result harder than the live journal does`() {
        val result = """{"type":"user","uuid":"r1","message":{"content":[{"type":"tool_result","content":"${"x".repeat(40_000)}"}]}}"""

        val journal = JournalTrim.trim(result)
        val history = JournalTrim.trim(result, ClaudeHistory.HISTORY_ENTRY_CHARS, ClaudeHistory.HISTORY_STRING_CHARS)

        assertEquals(result, journal, "the journal leaves an entry of this size alone")
        assertTrue(history.length < result.length / 4, "the page kept ${history.length} of ${result.length}")
        assertTrue(history.contains("more characters"), "what was left out has to be said out loud")
    }

    private fun said(uuid: String) =
        """{"type":"user","uuid":"$uuid","message":{"role":"user","content":"what about it?"}}"""

    private fun answered(uuid: String) =
        """{"type":"assistant","uuid":"$uuid","message":{"content":[{"type":"text","text":"here it is"}]}}"""

    private fun called(uuid: String) =
        """{"type":"assistant","uuid":"$uuid","message":{"content":[{"type":"tool_use","name":"Read","input":{}}]}}"""

    private fun returned(uuid: String) =
        """{"type":"user","uuid":"$uuid","message":{"content":[{"type":"tool_result","content":"done"}]}}"""

    private fun thoughtNothing(uuid: String) =
        """{"type":"assistant","uuid":"$uuid","message":{"content":[{"type":"thinking","thinking":"","signature":"s"}]}}"""

    private fun meta(uuid: String) =
        """{"type":"user","uuid":"$uuid","isMeta":true,"message":{"role":"user","content":"the shell wrote this"}}"""

    private fun reminder(uuid: String) =
        """{"type":"user","uuid":"$uuid","message":{"role":"user","content":"<system-reminder>never shown</system-reminder>"}}"""

    private fun uuidIn(line: String): String? =
        Json.parseToJsonElement(line).jsonObject["uuid"]?.jsonPrimitive?.contentOrNull

    // The point of the whole thing: a transcript is read as it is handed over rather than gathered up
    // first. A long conversation's file runs to tens of megabytes, and gathering it costs three copies of
    // it in memory for a tab that is merely being opened - so taking one line has to cost one line.
    //
    // Finite on purpose: a sequence with no end would prove the same thing by hanging, and a test that
    // hangs tells whoever broke it far less than one that fails.
    @Test
    fun `the conversation is read as it is handed over, not gathered up first`() {
        var read = 0
        val long = generateSequence(0) { if (it < 100_000) it + 1 else null }.map {
            read += 1
            """{"type":"user","message":{"role":"user","content":"go on"}}"""
        }

        val first = ClaudeHistory.replayable(long).first()

        assertTrue(first.contains("go on"))
        assertTrue(read <= 2, "read $read lines to hand over one")
    }
}

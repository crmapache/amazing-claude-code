package io.github.crmapache.amazingclaudecode.claude

import kotlinx.serialization.json.Json
import kotlinx.serialization.json.contentOrNull
import kotlinx.serialization.json.jsonArray
import kotlinx.serialization.json.jsonObject
import kotlinx.serialization.json.jsonPrimitive
import kotlin.test.Test
import kotlin.test.assertEquals
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
        assertTrue(replayed[0]!!.contains("fix the tests"))
        assertTrue(replayed[1]!!.contains("done"))
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

    // A boundary that does not exist in this file - a stale uuid from before a resume, say - is treated
    // as "no boundary at all" rather than as an empty page: see the reasoning on ClaudeHistory.page.
    @Test
    fun `an unknown boundary falls back to the file's last page`() {
        val all = (1..3).map { """{"type":"user","uuid":"u$it","message":{"role":"user","content":"m$it"}}""" }

        val page = ClaudeHistory.pageOf(all, before = "does-not-exist", pageSize = 2)

        assertEquals(listOf("u2", "u3"), page.lines.map { uuidIn(it) })
    }

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

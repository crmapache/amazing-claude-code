package io.github.crmapache.amazingclaudecode.search

import java.time.Instant
import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertNotNull
import kotlin.test.assertNull

class TranscriptTextTest {

    private fun user(text: String, uuid: String = "u1", extra: String = "") =
        """{"type":"user","uuid":"$uuid","timestamp":"2026-08-14T09:12:00.000Z"$extra,"message":{"role":"user","content":$text}}"""

    private fun assistant(blocks: String, uuid: String = "a1", model: String = "claude-opus-5") =
        """{"type":"assistant","uuid":"$uuid","timestamp":"2026-08-14T09:13:00.000Z","message":{"model":"$model","content":$blocks}}"""

    @Test
    fun `a person's bare message is a message`() {
        val message = TranscriptText.messageOf("c1", user("\"почему баланс не показывается?\""))

        assertNotNull(message)
        assertEquals(Speaker.YOU, message.speaker)
        assertEquals("почему баланс не показывается?", message.text)
        assertEquals("u1", message.uuid)
        assertEquals(Instant.parse("2026-08-14T09:12:00.000Z").toEpochMilli(), message.at)
        assertEquals("c1", message.conversation)
    }

    @Test
    fun `an answer keeps its text blocks and drops the calls`() {
        val line = assistant("""[{"type":"thinking","thinking":"hm"},{"type":"text","text":"Looked at the css."},{"type":"tool_use","id":"t","name":"Read","input":{}},{"type":"text","text":"Done."}]""")

        val message = TranscriptText.messageOf("c1", line)

        assertNotNull(message)
        assertEquals(Speaker.CLAUDE, message.speaker)
        assertEquals("Looked at the css.\nDone.", message.text)
    }

    @Test
    fun `a tool result is not a message`() {
        val line = user("""[{"type":"tool_result","tool_use_id":"t","content":"file contents"}]""")
        assertNull(TranscriptText.messageOf("c1", line))
    }

    @Test
    fun `the CLI's own marks are not messages`() {
        assertNull(TranscriptText.messageOf("c1", user("\"a skill body\"", extra = ",\"isMeta\":true")))
        assertNull(TranscriptText.messageOf("c1", user("\"side\"", extra = ",\"isSidechain\":true")))
        assertNull(TranscriptText.messageOf("c1", assistant("""[{"type":"text","text":"Interrupted"}]""", model = "<synthetic>")))
        assertNull(TranscriptText.messageOf("c1", assistant("""[{"type":"text","text":"(no content)"}]""")))
        assertNull(TranscriptText.messageOf("c1", user("\"<local-command-stdout>x</local-command-stdout>\"")))
        assertNull(TranscriptText.messageOf("c1", user("\"[Request interrupted by user]\"")))
        assertNull(TranscriptText.messageOf("c1", """{"type":"ai-title","aiTitle":"Name","sessionId":"c1"}"""))
        assertNull(TranscriptText.messageOf("c1", "not json"))
    }

    @Test
    fun `a slash command is kept as the command`() {
        val line = user("\"<command-message>deploy</command-message><command-name>/deploy</command-name><command-args>staging</command-args>\"")
        assertEquals("/deploy staging", TranscriptText.messageOf("c1", line)?.text)
    }

    @Test
    fun `a shell command keeps its command line and loses its output`() {
        val text = "<bash-input>git status</bash-input>\\n<bash-stdout>On branch main\\nnothing to commit</bash-stdout>\\n<bash-exit-code>0</bash-exit-code>\\nNow fix the test"
        assertEquals("! git status\n\nNow fix the test", TranscriptText.messageOf("c1", user("\"$text\""))?.text)
    }

    @Test
    fun `a reminder inside a message goes, the words stay`() {
        val text = "<system-reminder>be careful</system-reminder>look at this"
        assertEquals("look at this", TranscriptText.messageOf("c1", user("\"$text\""))?.text)
        assertNull(TranscriptText.messageOf("c1", user("\"<system-reminder>only this</system-reminder>\"")))
    }

    @Test
    fun `a line without a uuid cannot be jumped to and is left out`() {
        val line = """{"type":"user","message":{"role":"user","content":"hello"}}"""
        assertNull(TranscriptText.messageOf("c1", line))
    }
}

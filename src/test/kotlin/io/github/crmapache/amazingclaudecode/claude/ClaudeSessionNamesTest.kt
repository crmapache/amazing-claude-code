package io.github.crmapache.amazingclaudecode.claude

import java.io.File
import java.nio.file.Files
import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertNull

/** The session name of a conversation, read from the CLI's register of running processes (see ClaudeSessionNames). */
class ClaudeSessionNamesTest {

    private val configDirectory: File = Files.createTempDirectory("acc-session-names").toFile()

    /** A process's file as the CLI writes it, cut to the fields the lookup reads. */
    private fun process(pid: Int, conversationId: String, name: String, updatedAt: Long = 1L) {
        val sessions = File(configDirectory, "sessions").apply { mkdirs() }
        File(sessions, "$pid.json").writeText(
            """{"pid":$pid,"sessionId":"$conversationId","kind":"interactive","name":"$name","updatedAt":$updatedAt}""",
        )
    }

    @Test
    fun `the name of the process that runs the conversation, among other processes and their key files`() {
        process(101, "other-conversation", "other-a1")
        process(102, "c0ffee", "amazing-claude-code-81")
        File(configDirectory, "sessions/102.0123abcd.key").writeText("not json")

        assertEquals("amazing-claude-code-81", ClaudeSessionNames.nameOf(configDirectory, "c0ffee"))
    }

    @Test
    fun `a conversation named by two files takes the name written last`() {
        process(101, "c0ffee", "running-process-b2", updatedAt = 2_000)
        process(102, "c0ffee", "ended-process-a1", updatedAt = 1_000)

        assertEquals("running-process-b2", ClaudeSessionNames.nameOf(configDirectory, "c0ffee"))
    }

    @Test
    fun `a half-written file is passed over, and no running process means no name`() {
        assertNull(ClaudeSessionNames.nameOf(configDirectory, "c0ffee"), "no sessions folder at all")

        process(101, "other-conversation", "other-a1")
        File(configDirectory, "sessions/102.json").writeText("""{"pid":102,"sessionId":"c0f""")
        assertNull(ClaudeSessionNames.nameOf(configDirectory, "c0ffee"))

        process(103, "c0ffee", "amazing-claude-code-81")
        assertEquals("amazing-claude-code-81", ClaudeSessionNames.nameOf(configDirectory, "c0ffee"))
    }
}

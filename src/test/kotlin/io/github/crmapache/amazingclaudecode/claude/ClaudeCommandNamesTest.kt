package io.github.crmapache.amazingclaudecode.claude

import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertNull

class ClaudeCommandNamesTest {

    /**
     * The whole reason this exists: `/mcp__server__prompt` lives in no file, so the hint can learn it
     * from nowhere but the process's own start-up.
     */
    @Test
    fun `a process's start-up names every command it knows`() {
        val line = """
            {"type":"system","subtype":"init","session_id":"s1","model":"opus",
             "slash_commands":["clear","deploy","mcp__snakein__analyze"]}
        """.trimIndent().replace("\n", "")

        assertEquals(listOf("clear", "deploy", "mcp__snakein__analyze"), ClaudeCommandNames.of(line))
    }

    /**
     * A subagent comes up with a catalogue of its own, which may be narrower than the conversation's -
     * and the field hints from the conversation's.
     */
    @Test
    fun `a subagent's start-up is passed over`() {
        val line = """{"type":"system","subtype":"init","task_id":"t1","slash_commands":["clear"]}"""

        assertNull(ClaudeCommandNames.of(line))
    }

    @Test
    fun `everything else in the stream says nothing about the commands`() {
        assertNull(ClaudeCommandNames.of("""{"type":"assistant","message":{"role":"assistant"}}"""))
        assertNull(ClaudeCommandNames.of("""{"type":"system","subtype":"compact_boundary"}"""))
        // The word alone is not the field: a tool call is free to mention it.
        assertNull(ClaudeCommandNames.of("""{"type":"user","text":"what are the slash_commands here?"}"""))
    }

    /** A half-written line off a dying process must not take the catalogue down with it. */
    @Test
    fun `a broken line is no answer at all`() {
        assertNull(ClaudeCommandNames.of("""{"type":"system","subtype":"init","slash_commands":["cle"""))
    }
}

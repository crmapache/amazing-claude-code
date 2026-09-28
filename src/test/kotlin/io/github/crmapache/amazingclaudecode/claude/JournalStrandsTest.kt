package io.github.crmapache.amazingclaudecode.claude

import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertNull

/**
 * Which strand a line of the stream belongs to - read off lines shaped the way the CLI writes them.
 */
class JournalStrandsTest {

    @Test
    fun `a workflow's report is the whole state of its task`() {
        val line = """{"type":"system","subtype":"task_progress","task_id":"wf-1","description":"Review",""" +
            """"workflow_progress":[{"type":"workflow_agent","index":1,"label":"review:bugs","state":"start"}]}"""

        assertEquals(SessionJournal.Strand("task:wf-1", SessionJournal.Strand.Kind.REPORT), JournalStrands.of(line))
    }

    /** Between two reports the CLI sends bare progress on the same channel - a step, not the state. */
    @Test
    fun `bare progress is a step of the same task`() {
        val line = """{"type":"system","subtype":"task_progress","task_id":"wf-1","last_tool_name":"review:bugs"}"""

        assertEquals(SessionJournal.Strand("task:wf-1", SessionJournal.Strand.Kind.DETAIL), JournalStrands.of(line))
    }

    @Test
    fun `a subagent's event is a step of the call that launched it`() {
        val line = """{"type":"assistant","message":{"content":[{"type":"text","text":"reading"}]},""" +
            """"parent_tool_use_id":"toolu_42","session_id":"s","uuid":"u"}"""

        assertEquals(SessionJournal.Strand("agent:toolu_42", SessionJournal.Strand.Kind.DETAIL), JournalStrands.of(line))
    }

    @Test
    fun `the conversation's own lines belong to no strand`() {
        val line = """{"type":"assistant","message":{"content":[{"type":"text","text":"hi"}]},""" +
            """"parent_tool_use_id":null,"session_id":"s","uuid":"u"}"""

        assertNull(JournalStrands.of(line))
    }

    /**
     * The marks are looked for as JSON structure, and inside a string the quotes are escaped - a message
     * that merely talks about them is still the conversation.
     */
    @Test
    fun `a message quoting the marks is not taken for one`() {
        val line = """{"type":"assistant","message":{"content":[{"type":"text",""" +
            """"text":"the field \"parent_tool_use_id\":\"x\" and \"subtype\":\"task_progress\""}]},""" +
            """"parent_tool_use_id":null,"uuid":"u"}"""

        assertNull(JournalStrands.of(line))
    }

    @Test
    fun `a task's start and end are the conversation's own`() {
        val started = """{"type":"system","subtype":"task_started","task_id":"wf-1","tool_use_id":"toolu_1"}"""
        val ended = """{"type":"system","subtype":"task_notification","task_id":"wf-1","status":"completed"}"""

        assertNull(JournalStrands.of(started))
        assertNull(JournalStrands.of(ended))
    }
}

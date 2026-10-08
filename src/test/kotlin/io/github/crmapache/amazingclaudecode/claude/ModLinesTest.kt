package io.github.crmapache.amazingclaudecode.claude

import kotlinx.serialization.json.Json
import kotlinx.serialization.json.jsonObject
import kotlinx.serialization.json.jsonPrimitive
import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertFalse
import kotlin.test.assertNull
import kotlin.test.assertTrue

/**
 * What the stream says on behalf of a mod - read off lines the way CLI 2.1.293 wrote them in a recorded
 * session (ids shortened).
 */
class ModLinesTest {

    @Test
    fun `a redraw request is thrown away`() {
        val line = """{"type":"system","subtype":"ui_invalidate","event":"ui.render","uuid":"u","session_id":"s"}"""

        assertEquals(ModLines.Kind.DROP, ModLines.kindOf(line))
    }

    /** Whatever else the CLI tells a surface this side never attached has nowhere to be drawn either. */
    @Test
    fun `a surface message nobody here knows is thrown away too`() {
        val line = """{"type":"system","subtype":"ui_focus","id":"pane","uuid":"u","session_id":"s"}"""

        assertEquals(ModLines.Kind.DROP, ModLines.kindOf(line))
    }

    @Test
    fun `a status line and the open panes are states`() {
        val status = """{"type":"system","subtype":"ui_status","plugin":"probe","text":"3 passing","uuid":"u","session_id":"s"}"""
        val panes = """{"type":"system","subtype":"ui_panes","panes":[{"id":"blast-radius","title":"Blast Radius",""" +
            """"plugin":"blast-radius","rows":12}],"shown_id":"blast-radius","focused_id":null,""" +
            """"focus_requested_id":"blast-radius","uuid":"u","session_id":"s"}"""

        assertEquals(ModLines.Kind.STATE, ModLines.kindOf(status))
        assertEquals(ModLines.Kind.STATE, ModLines.kindOf(panes))
        assertEquals("status:probe", ModLines.slotOf(status))
        assertEquals("ui_panes", ModLines.slotOf(panes))
    }

    @Test
    fun `a toast is live and a log line is the conversation's`() {
        val toast = """{"type":"system","subtype":"ui_toast","plugin":"probe","text":"done","timeout_ms":4000,"uuid":"u","session_id":"s"}"""
        val log = """{"type":"system","subtype":"ui_log","plugin":"probe","text":"build finished","uuid":"u","session_id":"s"}"""

        assertEquals(ModLines.Kind.LIVE, ModLines.kindOf(toast))
        assertEquals(ModLines.Kind.FEED, ModLines.kindOf(log))
        assertEquals(SessionJournal.Strand("mod:probe", SessionJournal.Strand.Kind.DETAIL), ModLines.strandOf(log))
    }

    @Test
    fun `a cleared status and an empty list of panes say nothing is left`() {
        assertTrue(ModLines.isNothing("""{"type":"system","subtype":"ui_status","plugin":"probe","text":null}"""))
        assertTrue(ModLines.isNothing("""{"type":"system","subtype":"ui_status","plugin":"probe"}"""))
        assertTrue(ModLines.isNothing("""{"type":"system","subtype":"ui_panes","panes":[],"shown_id":null}"""))
        assertFalse(ModLines.isNothing("""{"type":"system","subtype":"ui_status","plugin":"probe","text":"x"}"""))
    }

    /** The lines that take a state off the screens are themselves read as the same states, saying nothing. */
    @Test
    fun `a cleared slot is said in the CLI's own words`() {
        val status = ModLines.cleared("status:probe")!!
        val panes = ModLines.cleared("ui_panes")!!

        assertEquals(ModLines.Kind.STATE, ModLines.kindOf(status))
        assertEquals("status:probe", ModLines.slotOf(status))
        assertTrue(ModLines.isNothing(status))
        assertEquals(ModLines.Kind.STATE, ModLines.kindOf(panes))
        assertTrue(ModLines.isNothing(panes))
    }

    /**
     * The lock on everyone else: every kind of line a conversation without a mod produces - taken from the
     * same recorded session - is none of this, and goes on exactly as it did.
     */
    @Test
    fun `no line of an ordinary conversation is taken for a mod's`() {
        val ordinary = listOf(
            """{"type":"system","subtype":"hook_started","hook_id":"h","hook_name":"SessionStart:startup","hook_event":"SessionStart","uuid":"u","session_id":"s"}""",
            """{"type":"system","subtype":"init","cwd":"/w","session_id":"s","slash_commands":["compact"],"plugins":[]}""",
            """{"type":"system","subtype":"status","status":"requesting","session_id":"s","uuid":"u"}""",
            """{"type":"system","subtype":"thinking_tokens","estimated_tokens":50,"estimated_tokens_delta":50,"session_id":"s","uuid":"u"}""",
            """{"type":"system","subtype":"commands_changed","commands":[{"name":"compact","description":"","argumentHint":"","builtin":true}]}""",
            """{"type":"system","subtype":"task_progress","task_id":"wf-1","last_tool_name":"review"}""",
            """{"type":"stream_event","event":{"type":"message_start","message":{"model":"m","id":"msg","type":"message","role":"assistant"}}}""",
            """{"type":"assistant","message":{"content":[{"type":"text","text":"hi"}]},"parent_tool_use_id":null,"session_id":"s","uuid":"u"}""",
            """{"type":"user","message":{"role":"user","content":[{"type":"tool_result","content":"ok","tool_use_id":"toolu_01"}]}}""",
            """{"type":"result","subtype":"success","is_error":false,"result":"pong","session_id":"s"}""",
            """{"type":"rate_limit_event","rate_limit_info":{"status":"allowed","rateLimitType":"five_hour"}}""",
            """{"type":"command_lifecycle","command_uuid":"c","state":"started","uuid":"u","session_id":"s"}""",
            """{"type":"control_response","response":{"subtype":"success","request_id":"r","response":{}}}""",
        )

        ordinary.forEach { line -> assertNull(ModLines.kindOf(line), line) }
    }

    /** The mark is JSON structure: a message that merely quotes it is still the conversation. */
    @Test
    fun `a message quoting the mark is not taken for one`() {
        val line = """{"type":"assistant","message":{"content":[{"type":"text",""" +
            """"text":"it sends \"subtype\":\"ui_toast\" lines"}]},"parent_tool_use_id":null,"uuid":"u"}"""

        assertNull(ModLines.kindOf(line))
    }

    /** The identifier the CLI gives a mod's question, and never one an API tool call carries. */
    @Test
    fun `a mod's question is told by its identifier`() {
        assertTrue(ModLines.isModQuestion("toolu_plugin_db08f9b6417f4de8a6f8d1c033266501"))
        assertFalse(ModLines.isModQuestion("toolu_01ABCDEFGHIJKLMNOPQRSTUV"))
        assertFalse(ModLines.isModQuestion("toolu_vrtx_01ABCDEFGHIJ"))
        assertFalse(ModLines.isModQuestion("toolu_bdrk_01ABCDEFGHIJ"))
    }

    @Test
    fun `a mod's question card carries the question as AskUserQuestion takes it`() {
        val input = Json.parseToJsonElement(
            """{"questions":[{"question":"Pick one","header":"Plugin","options":[{"label":"Red","description":""}],"multiSelect":false}]}""",
        ).jsonObject

        val card = Json.parseToJsonElement(ModLines.questionCard("main", "toolu_plugin_1", input)).jsonObject
        val event = card["event"]!!.jsonObject

        assertEquals("agent", card["type"]!!.jsonPrimitive.content)
        assertEquals("main", card["sessionId"]!!.jsonPrimitive.content)
        assertEquals("system", event["type"]!!.jsonPrimitive.content)
        assertEquals(ModLines.MOD_QUESTION, event["subtype"]!!.jsonPrimitive.content)
        assertEquals("toolu_plugin_1", event["tool_use_id"]!!.jsonPrimitive.content)
        assertEquals(input, event["input"])
        // Our own event is never taken for one of the CLI's surface lines.
        assertNull(ModLines.kindOf(event.toString()))
    }

    @Test
    fun `a ui subtype outside a system line is not a mod's`() {
        assertNull(ModLines.kindOf("""{"type":"result","subtype":"ui_status","result":"x"}"""))
    }
}

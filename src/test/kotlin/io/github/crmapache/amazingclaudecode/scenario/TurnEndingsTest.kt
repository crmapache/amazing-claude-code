package io.github.crmapache.amazingclaudecode.scenario

import kotlin.test.Test
import kotlin.test.assertEquals
import kotlinx.serialization.json.JsonPrimitive

/**
 * What a session said each time it meant to end its turn (see TurnEndings).
 *
 * Written from a live run: a roas-radar card finished with a full report, the project's style hook sent it
 * back for one more pass, and the head was shown only the note about that pass - so it sent the finished
 * card back for the report. The lines below keep the shape the CLI records: the text arrives in
 * `assistant` events with no stop reason, and the reason only in the stream's `message_delta`.
 */
class TurnEndingsTest {

    @Test
    fun `an ordinary turn is its last words`() {
        val endings = read(
            tool("m1"),
            stop("tool_use"),
            text("m2", "The project is called acc-test."),
            stop("end_turn"),
            result("The project is called acc-test."),
        )

        assertEquals(listOf("The project is called acc-test."), endings)
    }

    @Test
    fun `a turn a hook sent back keeps the report it gave before the hook`() {
        val endings = read(
            text("m1", "Built and committed. DOD: all met. How to check by hand: open the journal."),
            stop("end_turn"),
            hook(),
            tool("m2"),
            stop("tool_use"),
            text("m3", "Went over the style once more, fixed two comments."),
            stop("end_turn"),
            result("Went over the style once more, fixed two comments."),
        )

        assertEquals(
            listOf(
                "Built and committed. DOD: all met. How to check by hand: open the journal.",
                "Went over the style once more, fixed two comments.",
            ),
            endings,
        )
    }

    /*
     * Recorded off CLI 2.1.280 with a Stop hook that refuses the first ending, then trimmed of usage and
     * ids. The result names only the second ending - which is the whole reason this class exists.
     */
    @Test
    fun `a recorded stream with a stop hook gives both endings`() {
        val recorded = listOf(
            """{"type":"system","subtype":"status","status":"requesting"}""",
            """{"type":"stream_event","event":{"type":"message_start","message":{"id":"msg_011Cfbud69P3WMQTZNqaTbJW","type":"message","role":"assistant","content":[],"container":null,"stop_reason":null,"stop_sequence":null,"stop_details":null,"input_transformations":[],"context_management":null}},"parent_tool_use_id":null}""",
            """{"type":"assistant","message":{"id":"msg_011Cfbud69P3WMQTZNqaTbJW","type":"message","role":"assistant","content":[{"type":"thinking","thinking":"","signature":""}],"container":null,"stop_reason":null,"stop_sequence":null,"stop_details":null,"input_transformations":[]},"parent_tool_use_id":null}""",
            """{"type":"assistant","message":{"id":"msg_011Cfbud69P3WMQTZNqaTbJW","type":"message","role":"assistant","content":[{"type":"text","text":"REPORT: all done."}],"container":null,"stop_reason":null,"stop_sequence":null,"stop_details":null,"input_transformations":[]},"parent_tool_use_id":null}""",
            """{"type":"stream_event","event":{"type":"message_delta","delta":{"stop_reason":"end_turn","stop_sequence":null,"stop_details":null,"container":null}},"parent_tool_use_id":null}""",
            """{"type":"rate_limit_event"}""",
            """{"type":"user","message":{"role":"user","content":[{"type":"text","text":"Stop hook feedback:\n[/project/hook.sh]: Before you stop: say in one short sentence that you checked the style. Nothing else.\n"}]},"parent_tool_use_id":null,"isSynthetic":true}""",
            """{"type":"system","subtype":"notification","key":"stop-hook-error","text":"Stop hook error occurred · ctrl+o to see","priority":"immediate"}""",
            """{"type":"system","subtype":"status","status":"requesting"}""",
            """{"type":"stream_event","event":{"type":"message_start","message":{"id":"msg_011CfbudE86sa7Le5wLN1ig4","type":"message","role":"assistant","content":[],"container":null,"stop_reason":null,"stop_sequence":null,"stop_details":null,"input_transformations":[],"context_management":null}},"parent_tool_use_id":null}""",
            """{"type":"system","subtype":"thinking_tokens","estimated_tokens":271,"estimated_tokens_delta":171}""",
            """{"type":"assistant","message":{"id":"msg_011CfbudE86sa7Le5wLN1ig4","type":"message","role":"assistant","content":[{"type":"thinking","thinking":"","signature":""}],"container":null,"stop_reason":null,"stop_sequence":null,"stop_details":null,"input_transformations":[]},"parent_tool_use_id":null}""",
            """{"type":"assistant","message":{"id":"msg_011CfbudE86sa7Le5wLN1ig4","type":"message","role":"assistant","content":[{"type":"text","text":"Checked style: no dashes, formatting clean."}],"container":null,"stop_reason":null,"stop_sequence":null,"stop_details":null,"input_transformations":[]},"parent_tool_use_id":null}""",
            """{"type":"stream_event","event":{"type":"message_delta","delta":{"stop_reason":"end_turn","stop_sequence":null,"stop_details":null,"container":null}},"parent_tool_use_id":null}""",
            """{"stop_reason":"end_turn","is_error":false,"num_turns":2,"subtype":"success","result":"Checked style: no dashes, formatting clean.","type":"result","queued_turn_count":0,"result_index":0}""",
        )

        assertEquals(listOf("REPORT: all done.", "Checked style: no dashes, formatting clean."), read(*recorded.toTypedArray()))
    }

    @Test
    fun `words before a tool call are not an ending`() {
        val endings = read(
            text("m1", "Now the tests."),
            tool("m1"),
            stop("tool_use"),
            text("m2", "All green."),
            stop("end_turn"),
            result("All green."),
        )

        assertEquals(listOf("All green."), endings)
    }

    // A subagent finishing is its own turn ending, not the session's.
    @Test
    fun `a subagent's ending is not the session's`() {
        val endings = read(
            text("s1", "Found three files.", parent = "toolu_agent"),
            stop("end_turn", parent = "toolu_agent"),
            text("m1", "Read the agent's report; nothing to change."),
            stop("end_turn"),
            result("Read the agent's report; nothing to change."),
        )

        assertEquals(listOf("Read the agent's report; nothing to change."), endings)
    }

    @Test
    fun `a message in several blocks is one ending`() {
        val endings = read(
            text("m1", "First part."),
            text("m1", "Second part."),
            stop("end_turn"),
            result("Second part."),
        )

        assertEquals(listOf("First part.\n\nSecond part."), endings)
    }

    // A stream without the deltas still answers the way it always did.
    @Test
    fun `with no stop reasons in the stream the result is the answer`() {
        val endings = read(text("m1", "Done."), result("Done."))

        assertEquals(listOf("Done."), endings)
    }

    @Test
    fun `a result that says something the endings do not is kept beside them`() {
        val endings = read(text("m1", "Report."), stop("end_turn"), result("API Error: overloaded"))

        assertEquals(listOf("Report.", "API Error: overloaded"), endings)
    }

    // A turn cut short by our own interrupt closes with a result too, and must not lead the next answer.
    @Test
    fun `every turn replaces the one before`() {
        val turns = TurnEndings()
        listOf(text("m1", "Interrupted halfway."), stop("end_turn"), result("Interrupted halfway.")).forEach(turns::read)
        listOf(text("m2", "Carried on and finished."), stop("end_turn"), result("Carried on and finished.")).forEach(turns::read)

        assertEquals(listOf("Carried on and finished."), turns.last)
    }

    @Test
    fun `clearing forgets the turn that finished and the one going`() {
        val turns = TurnEndings()
        listOf(text("m1", "Old."), stop("end_turn"), result("Old."), text("m2", "Half")).forEach(turns::read)
        turns.clear()
        listOf(text("m3", "New."), stop("end_turn"), result("New.")).forEach(turns::read)

        assertEquals(listOf("New."), turns.last)
    }

    @Test
    fun `a turn that said nothing has no endings`() {
        assertEquals(emptyList<String>(), read(tool("m1"), stop("tool_use"), result("")))
    }

    private fun read(vararg lines: String): List<String> {
        val turns = TurnEndings()
        lines.forEach(turns::read)
        return turns.last
    }

    private fun quoted(text: String): String = JsonPrimitive(text).toString()

    private fun parentOf(parent: String?): String = parent?.let(::quoted) ?: "null"

    private fun text(id: String, text: String, parent: String? = null): String =
        """{"type":"assistant","message":{"model":"claude-opus-5","id":"$id","type":"message","role":"assistant",""" +
            """"content":[{"type":"text","text":${quoted(text)}}],"stop_reason":null,"stop_sequence":null},""" +
            """"parent_tool_use_id":${parentOf(parent)},"session_id":"s1","uuid":"u-$id"}"""

    private fun tool(id: String): String =
        """{"type":"assistant","message":{"model":"claude-opus-5","id":"$id","type":"message","role":"assistant",""" +
            """"content":[{"type":"tool_use","id":"toolu_$id","name":"Bash","input":{"command":"yarn test"}}],""" +
            """"stop_reason":null,"stop_sequence":null},"parent_tool_use_id":null,"session_id":"s1","uuid":"t-$id"}"""

    private fun stop(reason: String, parent: String? = null): String =
        """{"type":"stream_event","event":{"type":"message_delta","delta":{"stop_reason":"$reason",""" +
            """"stop_sequence":null,"stop_details":null}},"session_id":"s1","parent_tool_use_id":${parentOf(parent)},"uuid":"d"}"""

    private fun hook(): String =
        """{"type":"user","message":{"role":"user","content":"Stop hook feedback: run a style pass"},""" +
            """"parent_tool_use_id":null,"session_id":"s1","uuid":"h"}"""

    // The CLI writes the type of a result last, after everything else.
    private fun result(text: String): String =
        """{"is_error":false,"num_turns":3,"stop_reason":"end_turn","session_id":"s1","total_cost_usd":0.2,""" +
            """"subtype":"success","result":${quoted(text)},"type":"result","uuid":"r"}"""
}

package io.github.crmapache.amazingclaudecode.claude

import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertNull
import kotlin.test.assertTrue
import kotlinx.serialization.json.Json
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.jsonArray
import kotlinx.serialization.json.jsonObject

class PermissionChannelTest {

    private fun parse(line: String) = PermissionChannel.parse(Json.parseToJsonElement(line).jsonObject)

    // The very question whose absence made the buttons under a plan do nothing: this is how the agent
    // asks permission to leave plan mode.
    @Test
    fun `the question about leaving plan mode is parsed whole`() {
        val incoming = parse(
            """
            {"type":"control_request","request_id":"request-1","request":{
              "subtype":"can_use_tool","tool_name":"ExitPlanMode","display_name":"ExitPlanMode",
              "input":{"plan":"1. Do it\n2. Check it","planFilePath":"/tmp/plan.md"},
              "tool_use_id":"toolu_1","requires_user_interaction":true}}
            """.trimIndent(),
        )

        val request = (incoming as PermissionChannel.Incoming.Permission).request
        assertEquals("request-1", request.requestId)
        assertEquals("ExitPlanMode", request.toolName)
        // This is what the panel finds the already-drawn plan card by.
        assertEquals("toolu_1", request.toolUseId)
        assertTrue(request.requiresUserInteraction)
        assertEquals("1. Do it\n2. Check it", request.input["plan"]?.toString()?.trim('"')?.replace("\\n", "\n"))
    }

    @Test
    fun `an ordinary tool question carries no human-needed mark`() {
        val incoming = parse(
            """
            {"type":"control_request","request_id":"request-2","request":{
              "subtype":"can_use_tool","tool_name":"Write",
              "input":{"file_path":"/project/file.txt","content":"hello"},"tool_use_id":"toolu_2"}}
            """.trimIndent(),
        )

        val request = (incoming as PermissionChannel.Incoming.Permission).request
        assertEquals("Write", request.toolName)
        assertTrue(!request.requiresUserInteraction)
    }

    // An unanswered request stops a turn forever, so even an unfamiliar kind has to reach an answer
    // rather than get lost.
    @Test
    fun `an unfamiliar request is not lost but reaches an answer`() {
        val incoming = parse(
            """{"type":"control_request","request_id":"request-3","request":{"subtype":"request_user_dialog"}}""",
        )

        val unsupported = incoming as PermissionChannel.Incoming.Unsupported
        assertEquals("request-3", unsupported.requestId)
        assertEquals("request_user_dialog", unsupported.subtype)
    }

    // An empty spot in a request the CLI writes as an honest null, and the parsing has to survive it
    // silently: an exception from here flies straight into the stream's reading and takes the
    // conversation's not-yet-parsed events with it.
    @Test
    fun `empty request fields do not break the parsing`() {
        // There is no request at all - we answer as to an unfamiliar one: silence stops the turn.
        val empty = parse("""{"type":"control_request","request_id":"request-6","request":null}""")
        assertEquals("request-6", (empty as PermissionChannel.Incoming.Unsupported).requestId)

        val incoming = parse(
            """
            {"type":"control_request","request_id":"request-7","request":{
              "subtype":"can_use_tool","tool_name":"Bash","input":null,
              "tool_use_id":"toolu_7","permission_suggestions":null}}
            """.trimIndent(),
        )

        val request = (incoming as PermissionChannel.Incoming.Permission).request
        assertEquals("Bash", request.toolName)
        assertTrue(request.input.isEmpty())
        assertTrue(request.suggestions.isEmpty())
    }

    /**
     * Which lines of the stream are this channel's business at all - decided before any parsing.
     *
     * The check used to be one substring, and a withdrawal never matched it: "control_cancel_request"
     * does not contain "control_request". The news of a taken-back question fell straight through into
     * the feed's parsing, and the card it was about stayed on screen with live buttons.
     */
    @Test
    fun `both a question and its withdrawal are recognised in the stream`() {
        assertTrue(
            PermissionChannel.mayBelong(
                """{"type":"control_request","request_id":"r","request":{"subtype":"can_use_tool"}}""",
            ),
        )
        assertTrue(PermissionChannel.mayBelong("""{"type":"control_cancel_request","request_id":"r"}"""))
    }

    @Test
    fun `the conversation's own lines are not`() {
        assertTrue(!PermissionChannel.mayBelong("""{"type":"assistant","message":{"content":[]}}"""))
        assertTrue(
            !PermissionChannel.mayBelong(
                """{"type":"control_response","response":{"subtype":"success","request_id":"r"}}""",
            ),
        )
    }

    /**
     * A question taken back is not a question: answering it is worse than staying silent.
     *
     * The CLI does this for real - Stop pressed over a waiting card cancels the question along with the
     * turn - and an answer sent afterwards it discards, while the card that sent it has already drawn a
     * decision nobody carried out. Which is why this must not come out as Unsupported: that is the one
     * branch that answers.
     */
    @Test
    fun `a question the agent takes back is news rather than a request`() {
        val incoming = parse("""{"type":"control_cancel_request","request_id":"request-8"}""")

        assertEquals("request-8", (incoming as PermissionChannel.Incoming.Withdrawn).requestId)
    }

    // Without a number there is no telling which card it is about, and guessing would close the wrong one.
    @Test
    fun `a withdrawal with no number closes nothing`() {
        assertNull(parse("""{"type":"control_cancel_request"}"""))
    }

    @Test
    fun `the conversation's events and our own answers do not belong to the channel`() {
        assertNull(parse("""{"type":"assistant","message":{"role":"assistant","content":[]}}"""))
        assertNull(parse("""{"type":"control_response","response":{"subtype":"success","request_id":"x"}}"""))
    }

    // Allowing has to return the call's arguments: without updatedInput the CLI counts the answer as
    // incomplete, and the panel does not take it upon itself to change someone else's call.
    @Test
    fun `allowing returns the call with the same arguments`() {
        val input = Json.parseToJsonElement("""{"plan":"1. Do it"}""").jsonObject
        val answer = Json.parseToJsonElement(PermissionChannel.allow("request-1", input)).jsonObject

        val response = answer["response"]!!.jsonObject
        assertEquals("\"success\"", response["subtype"].toString())
        assertEquals("\"request-1\"", response["request_id"].toString())

        val decision = response["response"]!!.jsonObject
        assertEquals("\"allow\"", decision["behavior"].toString())
        assertEquals(input, decision["updatedInput"]?.jsonObject)
    }

    // A question from a tool inside a subagent: without this mark the card would go into the shared
    // conversation, although it is the subagent's branch that waits for an answer.
    @Test
    fun `a request from a subagent carries its mark`() {
        val incoming = parse(
            """
            {"type":"control_request","request_id":"request-4","request":{
              "subtype":"can_use_tool","tool_name":"Bash","input":{"command":"mkdir -p /tmp/x"},
              "tool_use_id":"toolu_4","agent_id":"a809ed6c3ed130b74"}}
            """.trimIndent(),
        )

        assertEquals("a809ed6c3ed130b74", (incoming as PermissionChannel.Incoming.Permission).request.agentId)
    }

    // "Always allow" is answered with the CLI's own rule: it parses the command better than any
    // heuristic of ours and knows which part matters. Out of what is offered we take rules only - the
    // person did not ask to open a whole directory or to switch the mode.
    @Test
    fun `always allow uses the CLI's rule, without anything nobody asked for`() {
        val incoming = parse(
            """
            {"type":"control_request","request_id":"request-5","request":{
              "subtype":"can_use_tool","tool_name":"Bash","input":{"command":"rm -f /tmp/x.txt"},
              "permission_suggestions":[
                {"type":"addRules","rules":[{"toolName":"Bash","ruleContent":"rm -f /tmp/x.txt"}],
                 "behavior":"allow","destination":"localSettings"},
                {"type":"addDirectories","directories":["/tmp"],"destination":"session"},
                {"type":"setMode","mode":"acceptEdits","destination":"session"}]}}
            """.trimIndent(),
        )

        val rules = PermissionChannel.rememberRules((incoming as PermissionChannel.Incoming.Permission).request)
        assertEquals(1, rules.size)
        assertEquals("\"addRules\"", rules[0].jsonObject["type"].toString())

        val decision = Json.parseToJsonElement(PermissionChannel.allow("request-5", JsonObject(emptyMap()), rules))
            .jsonObject["response"]!!.jsonObject["response"]!!.jsonObject
        assertEquals(rules, decision["updatedPermissions"])
    }

    // Tools whose arguments cannot be parsed (MCP, WebFetch) get no suggestions at all - the rule
    // becomes the tool itself, or the "always" button would silently remember nothing.
    @Test
    fun `with no suggestions the tool itself becomes the rule`() {
        val incoming = parse(
            """
            {"type":"control_request","request_id":"request-6","request":{
              "subtype":"can_use_tool","tool_name":"mcp__github__create_pr","input":{}}}
            """.trimIndent(),
        )

        val rule = PermissionChannel.rememberRules((incoming as PermissionChannel.Incoming.Permission).request)[0]
            .jsonObject
        assertEquals("\"addRules\"", rule["type"].toString())
        assertEquals("\"allow\"", rule["behavior"].toString())
        assertEquals(
            "\"mcp__github__create_pr\"",
            rule["rules"]!!.jsonArray[0].jsonObject["toolName"].toString(),
        )
    }

    // What was allowed once stays once: an unasked-for rule would change the project's settings, while
    // the person pressed "allow" rather than "always allow".
    @Test
    fun `an ordinary permission drags no rules behind it`() {
        val decision = Json.parseToJsonElement(PermissionChannel.allow("request-7", JsonObject(emptyMap())))
            .jsonObject["response"]!!.jsonObject["response"]!!.jsonObject

        assertNull(decision["updatedPermissions"])
    }

    // The reason arrives with the question: without it a question in "Bypass" mode looks like nagging
    // from the panel rather than a safety check by the CLI.
    @Test
    fun `the question's reason is parsed whole`() {
        val incoming = parse(
            """
            {"type":"control_request","request_id":"request-8","request":{
              "subtype":"can_use_tool","tool_name":"Bash","input":{"command":"rm -rf build/*"},
              "decision_reason":"Dangerous rm operation detected","decision_reason_type":"safetyCheck",
              "classifier_approvable":false,"suppress_always_allow_rule":true,
              "matched_ask_rule":{"source":"projectSettings","tool_name":"Bash","rule_content":"rm *"}}}
            """.trimIndent(),
        )

        val request = (incoming as PermissionChannel.Incoming.Permission).request
        assertEquals("Dangerous rm operation detected", request.reason)
        assertEquals("safetyCheck", request.reasonType)
        assertEquals(false, request.classifierApprovable)
        assertTrue(request.suppressAlwaysAllow)
        assertEquals("projectSettings", request.matchedAskRule?.source)
        assertEquals("rm *", request.matchedAskRule?.content)
    }

    // The CLI writes the reason's text the way it would print it in a terminal - with colouring. In the
    // panel that colours nothing and would show up as rubbish in the middle of a sentence.
    @Test
    fun `colouring is cut out of the reason`() {
        val incoming = parse(
            """
            {"type":"control_request","request_id":"request-9","request":{
              "subtype":"can_use_tool","tool_name":"Bash","input":{},
              "decision_reason":"\u001b[1mDangerous\u001b[0m rm operation","decision_reason_type":"safetyCheck"}}
            """.trimIndent(),
        )

        val request = (incoming as PermissionChannel.Incoming.Permission).request
        assertEquals("Dangerous rm operation", request.reason)
    }

    @Test
    fun `a question without a reason stays a question without a reason`() {
        val incoming = parse(
            """
            {"type":"control_request","request_id":"request-10","request":{
              "subtype":"can_use_tool","tool_name":"Bash","input":{"command":"ls"}}}
            """.trimIndent(),
        )

        val request = (incoming as PermissionChannel.Incoming.Permission).request
        assertEquals("", request.reason)
        assertEquals("", request.reasonType)
        assertNull(request.classifierApprovable)
        assertNull(request.matchedAskRule)
        assertTrue(!request.suppressAlwaysAllow)
    }

    // A refusal about a plan is not an error but a remark: the agent reads the text and offers the plan
    // again.
    @Test
    fun `a refusal travels with an explanation, and without one with a generic message`() {
        val explained = Json.parseToJsonElement(PermissionChannel.deny("request-1", "Rework the plan."))
            .jsonObject["response"]!!.jsonObject["response"]!!.jsonObject
        assertEquals("\"deny\"", explained["behavior"].toString())
        assertEquals("\"Rework the plan.\"", explained["message"].toString())

        val bare = Json.parseToJsonElement(PermissionChannel.deny("request-1", ""))
            .jsonObject["response"]!!.jsonObject["response"]!!.jsonObject
        assertTrue(bare["message"].toString().length > 2)
    }
}

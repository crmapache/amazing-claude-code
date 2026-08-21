package io.github.crmapache.amazingclaudecode.claude

import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertFalse
import kotlin.test.assertTrue
import kotlinx.serialization.json.Json
import kotlinx.serialization.json.JsonArray
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.jsonArray

class PermissionReasonTest {

    private fun request(
        reason: String = "",
        reasonType: String = "",
        classifierApprovable: Boolean? = null,
        suppressAlwaysAllow: Boolean = false,
        matchedAskRule: PermissionChannel.AskRule? = null,
        suggestions: JsonArray = JsonArray(emptyList()),
    ) = PermissionChannel.ToolPermission(
        requestId = "request",
        toolName = "Bash",
        toolUseId = "toolu_1",
        input = JsonObject(emptyMap()),
        requiresUserInteraction = false,
        suggestions = suggestions,
        reason = reason,
        reasonType = reasonType,
        classifierApprovable = classifierApprovable,
        suppressAlwaysAllow = suppressAlwaysAllow,
        matchedAskRule = matchedAskRule,
    )

    private fun rule(vararg contents: String): JsonArray =
        Json.parseToJsonElement(
            """[${contents.joinToString(",") { """{"type":"addRules","rules":[{"toolName":"Bash","ruleContent":"$it"}]}""" }}]""",
        ).jsonArray

    // The ordinary "the mode requires asking" has nothing to explain: the mode is captioned in the card
    // anyway, and an extra line would be empty noise.
    @Test
    fun `about the mode the card stays silent`() {
        assertEquals("", PermissionReason.text(request(reasonType = "mode")))
        assertEquals("", PermissionReason.text(request()))
    }

    // About the sandbox the terminal itself stays silent too: it substitutes the decision rather than
    // explains it.
    @Test
    fun `about the sandbox the card stays silent`() {
        assertEquals("", PermissionReason.text(request(reason = "sandbox", reasonType = "sandboxOverride")))
    }

    // This is exactly the question a person sees in "Bypass" mode: a dangerous deletion the CLI lets
    // through in no mode at all.
    @Test
    fun `a safety check is shown in the CLI's own words`() {
        val warning = "Dangerous rm operation detected: '/tmp/*'"

        assertEquals(warning, PermissionReason.text(request(reason = warning, reasonType = "safetyCheck")))
    }

    @Test
    fun `a hook and a classifier are captioned, so the person knows who was asked`() {
        assertEquals(
            "A hook asked to confirm this: PreToolUse said to check",
            PermissionReason.text(request(reason = "PreToolUse said to check", reasonType = "hook")),
        )
        assertEquals(
            "The auto-mode classifier asked to confirm this: the command touches production",
            PermissionReason.text(request(reason = "the command touches production", reasonType = "classifier")),
        )
    }

    @Test
    fun `without a reason's text the caption stays a finished sentence`() {
        assertEquals("A hook asked to confirm this.", PermissionReason.text(request(reasonType = "hook")))
    }

    @Test
    fun `an ask rule names both itself and the settings layer`() {
        val text = PermissionReason.text(
            request(
                reasonType = "rule",
                matchedAskRule = PermissionChannel.AskRule("projectSettings", "Bash", "git push *"),
            ),
        )

        assertEquals("An ask rule in shared project settings matched: Bash(git push *)", text)
    }

    @Test
    fun `a rule covering a whole tool is shown without empty brackets`() {
        val text = PermissionReason.text(
            request(reasonType = "rule", matchedAskRule = PermissionChannel.AskRule("session", "WebFetch", null)),
        )

        assertEquals("An ask rule in this session matched: WebFetch", text)
    }

    // An unfamiliar layer name (a new CLI build) must not turn into "in null".
    @Test
    fun `an unknown rule layer is simply not named`() {
        val text = PermissionReason.text(
            request(reasonType = "rule", matchedAskRule = PermissionChannel.AskRule("new-layer", "Bash", "ls")),
        )

        assertEquals("An ask rule matched: Bash(ls)", text)
    }

    @Test
    fun `an ordinary question offers to remember the decision`() {
        assertTrue(PermissionReason.rememberable(request(suggestions = rule("npm test"))))
        // MCP and WebFetch arrive without ready rules, but there is a rule for them - the tool itself,
        // whole (see PermissionChannel.rememberRules).
        assertTrue(PermissionReason.rememberable(request()))
    }

    @Test
    fun `a ban from the CLI itself removes the offer to remember`() {
        assertFalse(PermissionReason.rememberable(request(suppressAlwaysAllow = true)))
    }

    // Dangerous deletions: the rule would be written honestly, and the next call just like it would run
    // into the question again.
    @Test
    fun `a check no rule waives removes the offer to remember`() {
        assertFalse(
            PermissionReason.rememberable(
                request(reason = "Dangerous rm", reasonType = "safetyCheck", classifierApprovable = false),
            ),
        )
    }

    // And if the CLI itself offered a rule - it will work, and there is nothing to hide the button for:
    // that is how the terminal behaves too.
    @Test
    fun `an offered rule leaves the button in place`() {
        assertTrue(
            PermissionReason.rememberable(
                request(
                    reason = "suspicious path",
                    reasonType = "safetyCheck",
                    classifierApprovable = false,
                    suggestions = rule("ls"),
                ),
            ),
        )
    }
}

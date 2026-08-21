package io.github.crmapache.amazingclaudecode.claude

import kotlinx.serialization.json.JsonArray
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.JsonObjectBuilder
import kotlinx.serialization.json.addJsonObject
import kotlinx.serialization.json.booleanOrNull
import kotlinx.serialization.json.buildJsonArray
import kotlinx.serialization.json.buildJsonObject
import kotlinx.serialization.json.contentOrNull
import kotlinx.serialization.json.jsonPrimitive
import kotlinx.serialization.json.put
import kotlinx.serialization.json.putJsonArray
import kotlinx.serialization.json.putJsonObject

/**
 * The permissions the agent asks the panel for itself.
 *
 * This is the other half of the control channel: usually we send the requests over it (mode changes,
 * interrupts), here it is the reverse - the CLI asks and waits while the turn stands still. The
 * channel is switched on by ClaudeLaunch.PERMISSION_CHANNEL_FLAG; without it the streaming mode counts
 * as unattended and the tools that need a person are simply disabled - which is why the buttons under
 * a plan used to be a sham.
 *
 * Parsing and answering live apart from [ClaudeSession] on purpose: this is pure work with the text of
 * a protocol, and a test can see it without a single process running.
 */
internal object PermissionChannel {

    /**
     * The agent's question about a tool call.
     *
     * [toolUseId] is the same identifier the tool call has in the feed: the panel finds an
     * already-drawn card by it (a plan card, for instance) and does not show a second one.
     * [requiresUserInteraction] marks the tools that do not work without a person at all - ExitPlanMode
     * is exactly that.
     */
    data class ToolPermission(
        val requestId: String,
        val toolName: String,
        val toolUseId: String?,
        val input: JsonObject,
        val requiresUserInteraction: Boolean,
        /** Filled in only when the permission is asked by a tool inside a subagent. */
        val agentId: String? = null,
        /**
         * Ready-made "do not ask again" rules the CLI offers itself - the same thing the terminal shows
         * as its third option. There is no need to invent a rule on our side: the CLI parses the
         * command itself and knows which part of it matters and which is an accident of this call.
         */
        val suggestions: JsonArray = JsonArray(emptyList()),
        /**
         * Why it asked, in the CLI's own words. Not every question has it: with the ordinary "the mode
         * requires asking" there is nothing to explain, while a safety check, a hook and a classifier
         * arrive with text.
         */
        val reason: String = "",
        /**
         * The kind of reason: `safetyCheck`, `subcommandResults`, `hook`, `classifier`, `rule`, `mode`
         * and the other names from the protocol. The panel decides how to present the text by it -
         * parsing the text itself for that is not needed.
         */
        val reasonType: String = "",
        /**
         * A safety check demands a person specifically: no rule waives it and the `auto` classifier
         * does not wave it through. `null` means there is no safety check in the reason at all.
         */
        val classifierApprovable: Boolean? = null,
        /**
         * The CLI asks outright not to offer "always allow": the rule would come out wider than the
         * question itself (permission for the whole tool instead of this one call).
         */
        val suppressAlwaysAllow: Boolean = false,
        /** The "ask" rule this call ran into - when the question came from a rule. */
        val matchedAskRule: AskRule? = null,
    )

    /**
     * The `permissions.ask` rule that caught this call.
     *
     * [source] is the settings layer's name from the protocol (`userSettings`, `projectSettings` and so
     * on), [content] is the meaningful part of the rule: for `Bash(git push *)` that is `git push *`,
     * and a rule covering a whole tool has none.
     */
    data class AskRule(val source: String, val toolName: String, val content: String?)

    /** What kind of request arrived: either a question we understand, or everything else. */
    sealed interface Incoming {
        data class Permission(val request: ToolPermission) : Incoming

        /** A foreign or new kind of request: we still have to answer, or the turn stalls. */
        data class Unsupported(val requestId: String, val subtype: String) : Incoming
    }

    const val CAN_USE_TOOL = "can_use_tool"

    /** The kind of permission update that adds a rule: the name from the CLI's protocol. */
    private const val ADD_RULES = "addRules"

    /** null - the line is not about this channel: an ordinary conversation event, or our own answer. */
    fun parse(payload: JsonObject): Incoming? {
        if (payload["type"]?.jsonPrimitive?.contentOrNull != "control_request") return null

        val requestId = payload["request_id"]?.jsonPrimitive?.contentOrNull ?: return null
        // Here and below `as?` rather than `jsonObject`: an empty spot in the CLI's answer is not
        // always a missing field - an honest null gets written there too, and on that `jsonObject`
        // throws right inside the stream's parsing.
        val request = payload["request"] as? JsonObject
        val subtype = request?.get("subtype")?.jsonPrimitive?.contentOrNull.orEmpty()

        if (request == null || subtype != CAN_USE_TOOL) return Incoming.Unsupported(requestId, subtype)

        return Incoming.Permission(
            ToolPermission(
                requestId = requestId,
                toolName = request["tool_name"]?.jsonPrimitive?.contentOrNull.orEmpty(),
                toolUseId = request["tool_use_id"]?.jsonPrimitive?.contentOrNull,
                input = request["input"] as? JsonObject ?: JsonObject(emptyMap()),
                requiresUserInteraction =
                    request["requires_user_interaction"]?.jsonPrimitive?.booleanOrNull ?: false,
                agentId = request["agent_id"]?.jsonPrimitive?.contentOrNull?.takeIf { it.isNotEmpty() },
                suggestions = request["permission_suggestions"] as? JsonArray ?: JsonArray(emptyList()),
                reason = plain(request["decision_reason"]?.jsonPrimitive?.contentOrNull),
                reasonType = request["decision_reason_type"]?.jsonPrimitive?.contentOrNull.orEmpty(),
                classifierApprovable = request["classifier_approvable"]?.jsonPrimitive?.booleanOrNull,
                suppressAlwaysAllow =
                    request["suppress_always_allow_rule"]?.jsonPrimitive?.booleanOrNull ?: false,
                matchedAskRule = askRule(request["matched_ask_rule"] as? JsonObject),
            ),
        )
    }

    private fun askRule(rule: JsonObject?): AskRule? {
        val toolName = rule?.get("tool_name")?.jsonPrimitive?.contentOrNull?.takeIf { it.isNotEmpty() }
            ?: return null

        return AskRule(
            source = rule["source"]?.jsonPrimitive?.contentOrNull.orEmpty(),
            toolName = toolName,
            content = rule["rule_content"]?.jsonPrimitive?.contentOrNull?.takeIf { it.isNotEmpty() },
        )
    }

    /**
     * The reason's text arrives the way the terminal would have printed it - that is, it may carry
     * colouring escape sequences. In the panel they colour nothing, and would show up as rubbish in the
     * middle of a sentence, so they are cut out right here, at parse time.
     */
    private fun plain(text: String?): String = text.orEmpty().replace(ANSI, "").trim()

    /** Escape, then parameters, then the command letter: a terminal's colouring, whole. */
    private val ANSI = Regex("\\u001B\\[[0-9;?]*[ -/]*[@-~]")

    /**
     * What to answer "Always allow" with: a rule the CLI applies to this very session at once and
     * writes into the project's settings along the way - it will not ask about such a command again.
     *
     * Only suggestions of the addRules kind are taken. The rest the CLI puts beside them (open a whole
     * directory, switch the mode to acceptEdits) are answers to other questions, and the person pressed
     * "allow this command" specifically.
     *
     * An empty list of suggestions happens with tools whose arguments cannot be parsed (MCP, WebFetch):
     * then the rule is the tool itself, exactly as a person would have written it into
     * permissions.allow by hand.
     */
    fun rememberRules(request: ToolPermission): JsonArray {
        val offered = request.suggestions.filter { suggestion ->
            (suggestion as? JsonObject)?.get("type")?.jsonPrimitive?.contentOrNull == ADD_RULES
        }

        if (offered.isNotEmpty()) return JsonArray(offered)

        return buildJsonArray {
            addJsonObject {
                put("type", ADD_RULES)
                putJsonArray("rules") {
                    addJsonObject { put("toolName", request.toolName) }
                }
                put("behavior", "allow")
                put("destination", "localSettings")
            }
        }
    }

    /**
     * Allowing returns the call with the very arguments it was meant to have: the field is required,
     * and the panel does not take it upon itself to change someone else's call.
     *
     * [rules] is non-empty when the person chose "always allow": the CLI applies them to the current
     * session and writes them into the settings itself - see [rememberRules].
     */
    fun allow(requestId: String, input: JsonObject, rules: JsonArray = JsonArray(emptyList())): String =
        answer(requestId) {
            put("behavior", "allow")
            put("updatedInput", input)
            if (rules.isNotEmpty()) put("updatedPermissions", rules)
        }

    /**
     * A refusal - with an explanation: for ExitPlanMode this is exactly how a plan is sent back for
     * revision, and the agent reads the text as a remark about the plan.
     */
    fun deny(requestId: String, message: String): String =
        answer(requestId) {
            put("behavior", "deny")
            put("message", message.ifEmpty { "The user declined." })
        }

    private fun answer(requestId: String, decision: JsonObjectBuilder.() -> Unit): String =
        buildJsonObject {
            put("type", "control_response")
            putJsonObject("response") {
                // "success" here is about the answer itself, not about the decision: a refusal is just
                // as complete an answer as a permission.
                put("subtype", "success")
                put("request_id", requestId)
                putJsonObject("response", decision)
            }
        }.toString()
}

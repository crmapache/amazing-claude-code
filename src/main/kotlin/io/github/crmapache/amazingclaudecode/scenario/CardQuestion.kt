package io.github.crmapache.amazingclaudecode.scenario

import io.github.crmapache.amazingclaudecode.claude.ClaudeLaunch
import io.github.crmapache.amazingclaudecode.claude.PermissionChannel
import io.github.crmapache.amazingclaudecode.claude.PermissionPrompt
import kotlinx.serialization.json.JsonArray
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.buildJsonObject
import kotlinx.serialization.json.contentOrNull
import kotlinx.serialization.json.jsonObject
import kotlinx.serialization.json.jsonPrimitive
import kotlinx.serialization.json.put

/**
 * What a card stopped to ask, and how an answer is written back to it.
 *
 * Two different things arrive down the same channel and they are answered differently. A permission is a
 * yes or a no with a sentence attached. A question with options is not a permission at all: the CLI
 * expects the chosen option back in the call's own arguments and builds the tool result out of it itself,
 * so refusing one - which is what "no" means everywhere else - tells the card nobody answered.
 */
internal object CardQuestion {

    /** The line a person or the head reads: what it wants, in as few words as it can be put. */
    fun title(request: PermissionChannel.ToolPermission): String {
        if (request.toolName == ClaudeLaunch.ASK_TOOL) {
            return questions(request).firstOrNull()?.get("question")?.jsonPrimitive?.contentOrNull.orEmpty()
        }
        return PermissionPrompt.command(request.toolName, request.input)
            .ifBlank { PermissionPrompt.target(request.toolName, request.input) }
    }

    /** The answers it offered, when it offered any. Empty for an ordinary permission. */
    fun options(request: PermissionChannel.ToolPermission): List<String> =
        if (request.toolName != ClaudeLaunch.ASK_TOOL) {
            emptyList()
        } else {
            (questions(request).firstOrNull()?.get("options") as? JsonArray)
                .orEmpty()
                .mapNotNull { (it as? JsonObject)?.get("label")?.jsonPrimitive?.contentOrNull }
        }

    /**
     * What has to travel back beside the call's own arguments, or nothing for an ordinary permission.
     *
     * Under an `answers` object, keyed by the question's own text, with what was chosen for a value - the
     * label of an option, or the answer in whoever's own words when none of the labels is what they meant.
     * The shape is not ours to choose: the CLI reads the choice out of `answers` in the call's arguments
     * and builds the tool result from it, exactly as the panel sends it (see
     * SessionPermissions.answerAsk, where a person's answer takes the same road).
     *
     * Written without that wrapper it goes through as an argument the tool knows nothing about, and the
     * call comes back to the card as a question nobody answered - measured live: the card replied "the
     * response didn't come through" and asked again, the head sent it back to work, and the run stood on
     * the same question until somebody stopped it.
     */
    fun answers(request: PermissionChannel.ToolPermission, text: String): JsonObject? {
        if (request.toolName != ClaudeLaunch.ASK_TOOL) return null
        val asked = questions(request)
        if (asked.isEmpty()) return null

        val chosen = buildJsonObject {
            for (question in asked) {
                val label = question["question"]?.jsonPrimitive?.contentOrNull.orEmpty()
                if (label.isEmpty()) continue
                put(label, chosen(question, text))
            }
        }

        if (chosen.isEmpty()) return null

        return buildJsonObject { put("answers", chosen) }
    }

    /**
     * The option the answer meant, or the answer as it stands.
     *
     * Matched on the label rather than trusted to be one: the head is asked for an answer in words and
     * routinely gives a sentence around the label. An answer that matches nothing is passed through
     * whole - the CLI takes a typed-in answer of one's own, and half a sentence is better than a wrong
     * option chosen on its behalf.
     */
    private fun chosen(question: JsonObject, text: String): String {
        val labels = (question["options"] as? JsonArray)
            .orEmpty()
            .mapNotNull { (it as? JsonObject)?.get("label")?.jsonPrimitive?.contentOrNull }

        val said = text.trim()
        return labels.firstOrNull { it.equals(said, ignoreCase = true) }
            ?: labels.firstOrNull { said.contains(it, ignoreCase = true) }
            ?: said
    }

    private fun questions(request: PermissionChannel.ToolPermission): List<JsonObject> =
        (request.input["questions"] as? JsonArray).orEmpty().mapNotNull { it as? JsonObject }
}

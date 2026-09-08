package io.github.crmapache.amazingclaudecode.scenario

import io.github.crmapache.amazingclaudecode.claude.PermissionChannel
import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertNull
import kotlinx.serialization.json.Json
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.jsonObject
import kotlinx.serialization.json.jsonPrimitive

/**
 * What a card's question carries back to it, and it is the shape rather than the words that breaks.
 *
 * Written from a live run: the choice went back as a bare key of the call's own arguments, the CLI found
 * no `answers` there, and the card replied "the response didn't come through" and asked the same question
 * again. Nothing on the screen said anything was wrong - the run simply stood on a question that had been
 * answered.
 */
class CardQuestionTest {

    private fun ask(raw: String): PermissionChannel.ToolPermission = PermissionChannel.ToolPermission(
        requestId = "req-1",
        toolName = "AskUserQuestion",
        toolUseId = "call-1",
        input = Json.parseToJsonElement(raw) as JsonObject,
        requiresUserInteraction = true,
    )

    private val oneQuestion = """
        {"questions":[{"question":"Which word?","header":"Word","options":[
          {"label":"alpha","description":"the first"},
          {"label":"beta","description":"the second"}
        ],"multiSelect":false}]}
    """.trimIndent()

    @Test
    fun `the choice travels under answers, keyed by the question`() {
        val extra = CardQuestion.answers(ask(oneQuestion), "beta")

        assertEquals(setOf("answers"), extra?.keys)
        assertEquals("beta", extra?.get("answers")?.jsonObject?.get("Which word?")?.jsonPrimitive?.content)
    }

    @Test
    fun `a sentence around the label still chooses the option`() {
        val extra = CardQuestion.answers(ask(oneQuestion), "let's go with Beta, it reads better")

        assertEquals("beta", extra?.get("answers")?.jsonObject?.get("Which word?")?.jsonPrimitive?.content)
    }

    @Test
    fun `an answer that matches no option goes back whole`() {
        val extra = CardQuestion.answers(ask(oneQuestion), "neither - write gamma")

        assertEquals("neither - write gamma", extra?.get("answers")?.jsonObject?.get("Which word?")?.jsonPrimitive?.content)
    }

    @Test
    fun `an ordinary permission carries nothing`() {
        val bash = PermissionChannel.ToolPermission(
            requestId = "req-2",
            toolName = "Bash",
            toolUseId = "call-2",
            input = Json.parseToJsonElement("""{"command":"ls"}""") as JsonObject,
            requiresUserInteraction = true,
        )

        assertNull(CardQuestion.answers(bash, "yes"))
    }

    @Test
    fun `a question with nothing in it carries nothing`() {
        assertNull(CardQuestion.answers(ask("""{"questions":[]}"""), "beta"))
        assertNull(CardQuestion.answers(ask("""{"questions":[{"header":"Word"}]}"""), "beta"))
    }

    @Test
    fun `the title and the options are the words a person reads`() {
        assertEquals("Which word?", CardQuestion.title(ask(oneQuestion)))
        assertEquals(listOf("alpha", "beta"), CardQuestion.options(ask(oneQuestion)))
    }
}

package io.github.crmapache.amazingclaudecode.claude

import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertFalse
import kotlin.test.assertNull
import kotlin.test.assertTrue
import kotlinx.serialization.json.Json
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.add
import kotlinx.serialization.json.addJsonObject
import kotlinx.serialization.json.buildJsonArray
import kotlinx.serialization.json.buildJsonObject
import kotlinx.serialization.json.jsonArray
import kotlinx.serialization.json.jsonObject
import kotlinx.serialization.json.jsonPrimitive
import kotlinx.serialization.json.put

class SideQuestionTest {

    private fun json(text: String): JsonObject = Json.parseToJsonElement(text).jsonObject

    // The success body exactly as 2.1.280 sent it back for a question asked with the conversation free.
    @Test
    fun `an answer of the model's is an answer`() {
        val answer = SideQuestion.answerOf(json("""{"response":"PELICAN","synthetic":false}"""))

        assertEquals(SideQuestion.Answer.Answered("PELICAN", null), answer)
    }

    // The CLI's own placeholder - a refused tool call, a cut-off answer, an API error - is not the model
    // speaking, and drawn as an answer it would read as one. Its words still say what happened.
    @Test
    fun `a placeholder of the CLI's is no answer, with its words kept`() {
        val answer = SideQuestion.answerOf(
            json("""{"response":"(No answer available for this side question. Try again.)","synthetic":true}"""),
        )

        assertEquals(SideQuestion.Answer.Empty("(No answer available for this side question. Try again.)"), answer)
    }

    @Test
    fun `nothing at all is no answer`() {
        assertEquals(SideQuestion.Answer.Empty(null), SideQuestion.answerOf(json("""{"response":null,"synthetic":false}""")))
        assertEquals(SideQuestion.Answer.Empty(null), SideQuestion.answerOf(json("""{}""")))
        assertEquals(SideQuestion.Answer.Empty(null), SideQuestion.answerOf(json("""{"response":"   "}""")))
    }

    @Test
    fun `a model that declined leaves a notice beside the answer`() {
        val answer = SideQuestion.answerOf(
            json(
                """{"response":"Yes.","synthetic":false,
                   "refusal_fallback":{"original_model":"a","fallback_model":"b","content":"Answered by b"}}""",
            ),
        )

        assertEquals(SideQuestion.Answer.Answered("Yes.", "Answered by b"), answer)
    }

    // The cancel was recorded live: a control_cancel_request answered with exactly this error.
    @Test
    fun `the failures are told apart by their words`() {
        assertEquals(SideQuestion.Answer.Cancelled, SideQuestion.failureOf("Side question cancelled"))
        assertEquals(SideQuestion.Reason.TIMEOUT, (SideQuestion.failureOf("side_question timed out") as SideQuestion.Answer.Failed).reason)
        assertEquals(SideQuestion.Reason.ENDED, (SideQuestion.failureOf(SideQuestion.NO_SESSION) as SideQuestion.Answer.Failed).reason)

        val refused = SideQuestion.failureOf("Session is shutting down") as SideQuestion.Answer.Failed
        assertEquals(SideQuestion.Reason.REFUSED, refused.reason)
        assertEquals("Session is shutting down", refused.message)
    }

    @Test
    fun `progress is read off the CLI's line`() {
        val started = SideQuestion.progressOf(
            """{"type":"system","subtype":"control_request_progress","request_id":"r-1","status":"started","uuid":"u","session_id":"s"}""",
        )
        assertEquals(SideQuestion.Progress("r-1", "started", null, null, null, null), started)

        val retry = SideQuestion.progressOf(
            """{"type":"system","subtype":"control_request_progress","request_id":"r-1","status":"api_retry",
               "attempt":2,"max_retries":10,"retry_delay_ms":8000,"error_status":529}""".replace("\n", ""),
        )
        assertEquals(SideQuestion.Progress("r-1", "api_retry", 2, 10, 8000L, 529), retry)
    }

    // The check in front of the parse is a substring one, and the agent's own words may contain the word:
    // inside a string in JSON the quotes around it come escaped, and a line that is not progress at the top
    // level must go on to the feed.
    @Test
    fun `the word in the agent's text is not progress`() {
        val line = """{"type":"assistant","message":{"content":[{"type":"text","text":"the \"control_request_progress\" line"}]}}"""

        assertFalse(SideQuestion.isProgress(line))
        assertNull(SideQuestion.progressOf(line))
        assertTrue(SideQuestion.isProgress("""{"type":"system","subtype":"control_request_progress"}"""))
    }

    @Test
    fun `the history a client sends is cut to what is safe to forward`() {
        val sent = buildJsonArray {
            addJsonObject { put("question", "no answer") }
            addJsonObject {
                put("question", "")
                put("response", "no question")
            }
            add(42)
            for (n in 1..12) {
                addJsonObject {
                    put("question", "q$n")
                    put("response", "a$n")
                    if (n == 12) put("notice", "n")
                }
            }
        }

        val history = SideQuestion.historyOf(sent)

        // The newest kept: the malformed ones are gone, and of the twelve good ones the last ten remain.
        assertEquals(SideQuestion.HISTORY_KEPT, history.size)
        assertEquals("q3", history.first().question)
        assertEquals(SideQuestion.Exchange("q12", "a12", "n"), history.last())
        assertEquals(emptyList(), SideQuestion.historyOf(null))
    }

    @Test
    fun `the request carries the question and the thread in the CLI's words`() {
        val request = buildJsonObject {
            SideQuestion.request(this, "and why?", listOf(SideQuestion.Exchange("what?", "this", "notice")))
        }

        assertEquals("and why?", request["question"]?.jsonPrimitive?.content)
        val first = request["history"]!!.jsonArray.single().jsonObject
        assertEquals("what?", first["question"]?.jsonPrimitive?.content)
        assertEquals("this", first["response"]?.jsonPrimitive?.content)
        assertEquals("notice", first["fallback_notice"]?.jsonPrimitive?.content)
    }

    @Test
    fun `the client is told each ending in its own shape`() {
        val answered = json(SideQuestion.answerJson("main", "s-1", SideQuestion.Answer.Answered("Yes", "n")))
        assertEquals("sideAnswer", answered["type"]?.jsonPrimitive?.content)
        assertEquals("main", answered["sessionId"]?.jsonPrimitive?.content)
        assertEquals("s-1", answered["id"]?.jsonPrimitive?.content)
        assertEquals("answered", answered["outcome"]?.jsonPrimitive?.content)
        assertEquals("Yes", answered["text"]?.jsonPrimitive?.content)
        assertEquals("n", answered["notice"]?.jsonPrimitive?.content)

        val empty = json(SideQuestion.answerJson("main", "s-1", SideQuestion.Answer.Empty(null)))
        assertEquals("empty", empty["outcome"]?.jsonPrimitive?.content)
        assertNull(empty["text"])

        assertEquals(
            "cancelled",
            json(SideQuestion.answerJson("main", "s-1", SideQuestion.Answer.Cancelled))["outcome"]?.jsonPrimitive?.content,
        )

        val failed = json(
            SideQuestion.answerJson("main", "s-1", SideQuestion.Answer.Failed(SideQuestion.Reason.TIMEOUT, "side_question timed out")),
        )
        assertEquals("failed", failed["outcome"]?.jsonPrimitive?.content)
        assertEquals("timeout", failed["reason"]?.jsonPrimitive?.content)

        val progress = json(SideQuestion.progressJson("main", "s-1", SideQuestion.Progress("r", "api_retry", 2, 10, 8000L, 529)))
        assertEquals("sideProgress", progress["type"]?.jsonPrimitive?.content)
        assertEquals("api_retry", progress["status"]?.jsonPrimitive?.content)
        assertEquals("2", progress["attempt"]?.jsonPrimitive?.content)
        assertEquals("10", progress["maxRetries"]?.jsonPrimitive?.content)
        assertEquals("8000", progress["delayMs"]?.jsonPrimitive?.content)
        assertEquals("529", progress["errorStatus"]?.jsonPrimitive?.content)
    }
}

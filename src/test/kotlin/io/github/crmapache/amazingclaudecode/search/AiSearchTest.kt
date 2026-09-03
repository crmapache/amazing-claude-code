package io.github.crmapache.amazingclaudecode.search

import java.time.LocalDate
import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertNull
import kotlin.test.assertTrue

class AiSearchTest {

    /**
     * The run is streamed, so what comes back is a stack of lines with the answer last (see AiSearch).
     * The steps before it are the model's working and must not be mistaken for it.
     */
    private fun envelope(result: String, error: Boolean = false, structured: String? = null): String =
        """{"type":"system","subtype":"init"}
        |{"type":"assistant","message":{"content":[{"type":"tool_use","name":"Grep","input":{"pattern":"balance"}}]}}
        |{"type":"result","is_error":$error,"result":${result}${structured?.let { ",\"structured_output\":$it" } ?: ""}}
        """.trimMargin()

    @Test
    fun `the hits are read out of the model's text`() {
        val text = "\"Here you go:\\n```json\\n{\\\"hits\\\":[{\\\"conversationId\\\":\\\"bbbb\\\",\\\"uuid\\\":\\\"u-4\\\",\\\"reason\\\":\\\"about the balance\\\"}]}\\n```\""

        val hits = AiSearch.parse(envelope(text))

        assertEquals(listOf(AiHit("bbbb", "u-4", "about the balance")), hits)
    }

    @Test
    fun `a structured answer wins over the text`() {
        val hits = AiSearch.parse(envelope("\"prose\"", structured = """{"hits":[{"conversationId":"a","uuid":"u","reason":""}]}"""))
        assertEquals(listOf(AiHit("a", "u", "")), hits)
    }

    @Test
    fun `an empty list is an answer, prose is not`() {
        assertEquals(emptyList(), AiSearch.parse(envelope("\"{\\\"hits\\\":[]}\"")))
        assertNull(AiSearch.parse(envelope("\"I could not find anything.\"")))
        assertNull(AiSearch.parse(envelope("\"{}\"", error = true)))
        assertNull(AiSearch.parse("not json"))
    }

    @Test
    fun `a hit without names is dropped`() {
        val hits = AiSearch.parse(envelope("\"{\\\"hits\\\":[{\\\"uuid\\\":\\\"u\\\"},{\\\"conversationId\\\":\\\"a\\\",\\\"uuid\\\":\\\"u2\\\"}]}\""))
        assertEquals(listOf(AiHit("a", "u2", "")), hits)
    }

    @Test
    fun `the model's steps are read out of the stream as they arrive`() {
        val grep = AiSearch.stepIn("""{"type":"assistant","message":{"content":[{"type":"tool_use","name":"Grep","input":{"pattern":"Deepgram|баланс"}}]}}""")
        assertEquals(AiStep(AiStep.Kind.GREP, "Deepgram|баланс"), grep)

        val read = AiSearch.stepIn("""{"type":"assistant","message":{"content":[{"type":"tool_use","name":"Read","input":{"file_path":"/x/corpus/abc-123.txt"}}]}}""")
        assertEquals(AiStep(AiStep.Kind.READ, "abc-123"), read)

        val list = AiSearch.stepIn("""{"type":"assistant","message":{"content":[{"type":"tool_use","name":"Read","input":{"file_path":"/x/corpus/sessions.txt"}}]}}""")
        assertEquals(AiStep(AiStep.Kind.LIST, ""), list)

        // Everything else in the stream says nothing about what the model is doing.
        assertNull(AiSearch.stepIn("""{"type":"assistant","message":{"content":[{"type":"text","text":"thinking"}]}}"""))
        assertNull(AiSearch.stepIn("""{"type":"result","result":"{}"}"""))
        assertNull(AiSearch.stepIn("not json"))
    }

    @Test
    fun `the request travels last, between markers, with the date`() {
        val body = AiSearch.body("where did we talk about \"balance\"?", LocalDate.of(2026, 9, 1))

        assertTrue(body.contains("Today is 2026-09-01."))
        assertTrue(body.endsWith("<<<REQUEST\nwhere did we talk about \"balance\"?\nREQUEST>>>\n"))
        assertTrue(body.indexOf("REQUEST>>>") > body.indexOf("sessions.txt"))
    }

    @Test
    fun `the error out of the envelope is the one line worth showing`() {
        assertEquals("Not logged in", AiSearch.errorIn(envelope("\"Not logged in\"", error = true)))
        assertNull(AiSearch.errorIn(envelope("\"fine\"")))
    }
}

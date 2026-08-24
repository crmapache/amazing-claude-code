package io.github.crmapache.amazingclaudecode.claude

import kotlin.test.Test
import kotlin.test.assertContains
import kotlin.test.assertEquals
import kotlin.test.assertTrue
import kotlinx.serialization.json.Json
import kotlinx.serialization.json.jsonObject
import kotlinx.serialization.json.jsonPrimitive

class JournalTrimTest {

    @Test
    fun `an ordinary message is not touched`() {
        val message = """{"type":"agent","sessionId":"main","event":{"type":"result"}}"""

        assertEquals(message, JournalTrim.trim(message))
    }

    @Test
    fun `a long string is cut and says so`() {
        val message = """{"type":"agent","event":{"content":"${"x".repeat(300)}"}}"""

        val trimmed = JournalTrim.trim(message, maxChars = 100, maxStringChars = 50)

        val content = Json.parseToJsonElement(trimmed).jsonObject["event"]!!
            .jsonObject["content"]!!.jsonPrimitive.content
        assertTrue(content.startsWith("x".repeat(50)))
        assertContains(content, "250 more characters")
    }

    // The interface parses this by the same route as a live message: a message cut into invalid JSON
    // would take the whole feed down rather than one card.
    @Test
    fun `what comes out is still valid json with the same shape`() {
        val message = """{"type":"agent","sessionId":"main","event":{"type":"user","text":"${"y".repeat(300)}"}}"""

        val trimmed = JournalTrim.trim(message, maxChars = 100, maxStringChars = 20)

        val payload = Json.parseToJsonElement(trimmed).jsonObject
        assertEquals("agent", payload["type"]!!.jsonPrimitive.content)
        assertEquals("main", payload["sessionId"]!!.jsonPrimitive.content)
        assertEquals("user", payload["event"]!!.jsonObject["type"]!!.jsonPrimitive.content)
    }

    @Test
    fun `short strings inside a long message survive whole`() {
        val message = """{"type":"agent","event":{"name":"Read","content":"${"z".repeat(300)}"}}"""

        val trimmed = JournalTrim.trim(message, maxChars = 100, maxStringChars = 20)

        val event = Json.parseToJsonElement(trimmed).jsonObject["event"]!!.jsonObject
        assertEquals("Read", event["name"]!!.jsonPrimitive.content)
    }

    // Turning a number into a string would change the meaning of the field for whoever reads it.
    @Test
    fun `numbers and booleans are left alone`() {
        val message = """{"type":"agent","event":{"cost":12345,"ok":true,"text":"${"q".repeat(300)}"}}"""

        val trimmed = JournalTrim.trim(message, maxChars = 100, maxStringChars = 10)

        val event = Json.parseToJsonElement(trimmed).jsonObject["event"]!!.jsonObject
        assertEquals("12345", event["cost"]!!.jsonPrimitive.content)
        assertEquals("true", event["ok"]!!.jsonPrimitive.content)
    }

    @Test
    fun `something that is not json at all comes back untouched`() {
        val message = "x".repeat(300)

        assertEquals(message, JournalTrim.trim(message, maxChars = 100))
    }

    @Test
    fun `nested lists are walked too`() {
        val message = """{"event":{"message":{"content":[{"type":"text","text":"${"w".repeat(300)}"}]}}}"""

        val trimmed = JournalTrim.trim(message, maxChars = 100, maxStringChars = 20)

        val text = Json.parseToJsonElement(trimmed).jsonObject["event"]!!
            .jsonObject["message"]!!.jsonObject["content"]!!
            .let { it as kotlinx.serialization.json.JsonArray }[0]
            .jsonObject["text"]!!.jsonPrimitive.content
        assertTrue(text.length < 300)
    }
}

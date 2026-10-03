package io.github.crmapache.amazingclaudecode.claude

import kotlin.test.Test
import kotlin.test.assertContains
import kotlin.test.assertEquals
import kotlin.test.assertFalse
import kotlin.test.assertTrue
import kotlinx.serialization.json.Json
import kotlinx.serialization.json.jsonArray
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
        assertContains(content, "250 more characters are not kept in the panel's history.")
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

    /**
     * What the model wrote is what the person reads, and the history used to cut it at the same eight
     * kilobytes as a file read whole: a long answer came back as its first quarter. Only the opaque
     * signature beside the thinking is no writing and is cut as before.
     */
    @Test
    fun `an answer, its thinking and the arguments of its calls are kept whole`() {
        val long = "a".repeat(300)
        val answer = """{"type":"assistant","message":{"content":[""" +
            """{"type":"thinking","thinking":"$long","signature":"$long"},""" +
            """{"type":"text","text":"$long"},""" +
            """{"type":"tool_use","id":"t1","name":"ExitPlanMode","input":{"plan":"$long"}}]}}"""

        val blocks = contentOf(JournalTrim.trim(answer, maxChars = 100, maxStringChars = 20))

        assertEquals(long, blocks[0].jsonObject["thinking"]!!.jsonPrimitive.content)
        assertContains(blocks[0].jsonObject["signature"]!!.jsonPrimitive.content, "more characters")
        assertEquals(long, blocks[1].jsonObject["text"]!!.jsonPrimitive.content)
        assertEquals(long, blocks[2].jsonObject["input"]!!.jsonObject["plan"]!!.jsonPrimitive.content)
    }

    @Test
    fun `the person's own message is kept whole, a bare string or a text block`() {
        val long = "p".repeat(300)
        val bare = """{"type":"user","message":{"role":"user","content":"$long"}}"""
        val block = """{"type":"user","message":{"role":"user","content":[{"type":"text","text":"$long"}]}}"""

        assertEquals(bare, JournalTrim.trim(bare, maxChars = 100, maxStringChars = 20))
        assertEquals(long, contentOf(JournalTrim.trim(block, maxChars = 100, maxStringChars = 20))[0].jsonObject["text"]!!.jsonPrimitive.content)
    }

    /**
     * The monster all this exists for. A result's text blocks look exactly like a message's, so it is the
     * place a block sits in that decides, not its type.
     */
    @Test
    fun `a tool's result is still cut, inside the message and beside it`() {
        val long = "r".repeat(300)
        val result = """{"type":"user","message":{"role":"user","content":[""" +
            """{"type":"tool_result","tool_use_id":"t1","content":"$long"},""" +
            """{"type":"tool_result","tool_use_id":"t2","content":[{"type":"text","text":"$long"}]}]},""" +
            """"toolUseResult":{"stdout":"$long"}}"""

        val trimmed = JournalTrim.trim(result, maxChars = 100, maxStringChars = 20)
        val blocks = contentOf(trimmed)

        assertContains(blocks[0].jsonObject["content"]!!.jsonPrimitive.content, "more characters")
        assertContains(blocks[1].jsonObject["content"]!!.jsonArray[0].jsonObject["text"]!!.jsonPrimitive.content, "more characters")
        assertContains(Json.parseToJsonElement(trimmed).jsonObject["toolUseResult"]!!.jsonObject["stdout"]!!.jsonPrimitive.content, "more characters")
    }

    @Test
    fun `a pasted image is no writing and is cut`() {
        val image = """{"type":"user","message":{"role":"user","content":[""" +
            """{"type":"image","source":{"type":"base64","data":"${"i".repeat(300)}"}}]}}"""

        val data = contentOf(JournalTrim.trim(image, maxChars = 100, maxStringChars = 20))[0]
            .jsonObject["source"]!!.jsonObject["data"]!!.jsonPrimitive.content

        assertContains(data, "more characters")
    }

    /** A skill's body and its like are filed as the person's messages but draw nothing in the feed. */
    @Test
    fun `the shell's own marks are not spared`() {
        val meta = """{"type":"user","isMeta":true,"message":{"role":"user","content":"${"m".repeat(300)}"}}"""

        val content = Json.parseToJsonElement(JournalTrim.trim(meta, maxChars = 100, maxStringChars = 20))
            .jsonObject["message"]!!.jsonObject["content"]!!.jsonPrimitive.content

        assertContains(content, "more characters")
    }

    /** The live journal holds the CLI's events wrapped into the panel's own message, not bare. */
    @Test
    fun `an answer inside the panel's own message is kept whole too`() {
        val long = "l".repeat(300)
        val wrapped = """{"type":"agent","sessionId":"main","event":{"type":"assistant","message":{"content":[{"type":"text","text":"$long"}]}}}"""

        assertEquals(wrapped, JournalTrim.trim(wrapped, maxChars = 100, maxStringChars = 20))
    }

    /** A relay frame is a hard ceiling, and there the words go too once nothing else is left to cut. */
    @Test
    fun `with the words not spared, an answer is cut like anything else`() {
        val answer = """{"type":"assistant","message":{"content":[{"type":"text","text":"${"n".repeat(300)}"}]}}"""

        val text = contentOf(JournalTrim.trim(answer, maxChars = 0, maxStringChars = 20, spareWords = false))[0]
            .jsonObject["text"]!!.jsonPrimitive.content

        assertContains(text, "280 more characters")
    }

    /**
     * Cut for a relay frame, an answer used to reach the phone saying its rest was not kept in the panel's
     * history - while the history kept it whole and the panel at the desk showed every word of it.
     */
    @Test
    fun `a cut for the phone sends the reader to the IDE, not to the history`() {
        val answer = """{"type":"assistant","message":{"content":[{"type":"text","text":"${"f".repeat(300)}"}]}}"""

        val text = contentOf(
            JournalTrim.trim(answer, maxChars = 0, maxStringChars = 20, spareWords = false, reason = JournalTrim.Reason.PHONE),
        )[0].jsonObject["text"]!!.jsonPrimitive.content

        assertTrue(text.startsWith("f".repeat(20)))
        assertContains(text, "280 more characters are not shown on the phone")
        assertContains(text, "The full text is in the IDE.")
        assertFalse(text.contains("history"), "the history has nothing to do with this cut: $text")
    }

    private fun contentOf(json: String) =
        Json.parseToJsonElement(json).jsonObject["message"]!!.jsonObject["content"]!!.jsonArray

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

package io.github.crmapache.amazingclaudecode.webview

import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertTrue
import kotlinx.serialization.builtins.serializer
import kotlinx.serialization.json.Json
import kotlinx.serialization.json.jsonArray
import kotlinx.serialization.json.jsonObject
import kotlinx.serialization.json.jsonPrimitive

/**
 * A batch of messages travels into the page as one line of JavaScript - and if that line is assembled
 * wrongly, the channel falls silent entirely, without a single complaint in the log. So its shape is
 * checked here.
 */
class WebviewHostTest {

    @Test
    fun `assembles a batch into an array`() {
        val messages = parseArgument(single(listOf("""{"type":"a"}""", """{"type":"b"}""")))

        assertEquals(2, messages.size)
        assertEquals("a", messages[0].jsonObject["type"]?.jsonPrimitive?.content)
        assertEquals("b", messages[1].jsonObject["type"]?.jsonPrimitive?.content)
    }

    @Test
    fun `a single message travels as an array too`() {
        assertEquals(1, parseArgument(single(listOf("""{"type":"a"}"""))).size)
    }

    /**
     * An agent's answer is ordinary text and may hold anything: quotation marks, newlines, backslashes
     * out of code, unicode. None of that may escape the literal.
     */
    @Test
    fun `text with quotes and newlines does not tear the call apart`() {
        val text = """{"type":"agent","text":"he said \"yes\"\nand closed the \\ path"}"""
        val messages = parseArgument(single(listOf(text)))

        assertEquals("he said \"yes\"\nand closed the \\ path", messages[0].jsonObject["text"]?.jsonPrimitive?.content)
    }

    @Test
    fun `calls the page's receiver and guards against its absence`() {
        val call = single(listOf("""{"type":"a"}"""))

        assertTrue(call.startsWith("window.__accReceive && window.__accReceive("))
        assertTrue(call.endsWith(");"))
    }

    /**
     * A batch too long does not get into the page in one trip - and used to vanish silently along with
     * the turn's result. Now it travels in parts, and the glued parts have to give exactly the same
     * batch.
     */
    @Test
    fun `a long batch travels in parts and is glued back together`() {
        val big = """{"type":"agent","text":"${"i".repeat(400_000)}"}"""
        val calls = receiveCalls(listOf(big, """{"type":"result"}"""))

        assertTrue(calls.size > 1, "expected a split into parts, got a single trip")
        calls.forEachIndexed { index, call -> assertTrue(call.endsWith(", $index, ${calls.size});"), call.takeLast(40)) }

        val messages = Json.parseToJsonElement(joinParts(calls)).jsonArray
        assertEquals(2, messages.size)
        assertEquals("result", messages[1].jsonObject["type"]?.jsonPrimitive?.content)
    }

    /**
     * A character beyond the basic plane lives in a string as two halves. A pair cut in half would reach
     * the page as a replacement mark, and the glued batch would stop parsing as JSON - that is, be lost
     * entirely.
     */
    @Test
    fun `does not tear a surrogate pair apart on a part's boundary`() {
        val emoji = "🙂".repeat(200_000)
        val calls = receiveCalls(listOf("""{"type":"agent","text":"$emoji"}"""))

        assertTrue(calls.size > 1)
        val messages = Json.parseToJsonElement(joinParts(calls)).jsonArray
        assertEquals(emoji, messages[0].jsonObject["text"]?.jsonPrimitive?.content)
    }

    /**
     * The reason a batch is bounded by weight at all: a conversation opened from the history used to
     * leave the plugin as batches of about a megabyte, each of them cut into pieces inside the page - and
     * one piece gone took its whole batch with it, silently.
     */
    @Test
    fun `a batch stops at its weight rather than at its message count`() {
        val outbox = ArrayDeque((1..50).map { """{"type":"agent","text":"${"x".repeat(4_000)}"}""" })

        val batch = batchOf(outbox)

        assertTrue(batch.size in 2..40, "expected a batch bounded by weight, got ${batch.size} messages")
        assertTrue(batch.sumOf { it.length } <= 64 * 1024 + 4_100)
        assertEquals(1, receiveCalls(batch).size, "a batch of this weight should travel in one trip")
        assertTrue(outbox.isNotEmpty(), "the rest of the queue should still be waiting")
    }

    /**
     * A single message over the whole budget - a file read whole, a build log. It travels alone rather
     * than not at all: refused, it would sit at the head of the queue forever with the channel silent
     * behind it.
     */
    @Test
    fun `an outsized message travels on its own`() {
        val outbox = ArrayDeque(listOf("""{"type":"agent","text":"${"x".repeat(200_000)}"}""", """{"type":"result"}"""))

        val batch = batchOf(outbox)

        assertEquals(1, batch.size)
        assertEquals(1, outbox.size)
    }

    /** Ordinary live work: small messages, and the whole queue goes in one trip. */
    @Test
    fun `small messages travel together`() {
        val outbox = ArrayDeque((1..30).map { """{"type":"status","state":"running"}""" })

        assertEquals(30, batchOf(outbox).size)
        assertTrue(outbox.isEmpty())
    }

    /** A batch that travelled in one trip: that is how it is handed over almost always. */
    private fun single(batch: List<String>): String {
        val calls = receiveCalls(batch)
        assertEquals(1, calls.size, "a short batch should not be split into parts")
        return calls.first()
    }

    /** The same thing the bridge in the page does: glues the parts back into the original string. */
    private fun joinParts(calls: List<String>): String = calls.joinToString("") { call ->
        Json.decodeFromString(
            String.serializer(),
            call
                .substringAfter("window.__accChunk && window.__accChunk(")
                .substringBeforeLast(", ")
                .substringBeforeLast(", "),
        )
    }

    /** The same thing the page does: takes the literal out of the call and parses it back. */
    private fun parseArgument(call: String) =
        Json.parseToJsonElement(
            Json.decodeFromString(
                String.serializer(),
                call.substringAfter("JSON.parse(").substringBeforeLast("));"),
            ),
        ).jsonArray
}

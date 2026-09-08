package io.github.crmapache.amazingclaudecode.scenario

import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertNull
import kotlin.test.assertTrue
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.contentOrNull
import kotlinx.serialization.json.jsonPrimitive

/**
 * Reading what the head said.
 *
 * Worth a test of its own because it fails silently: an object read wrongly is a run that stops for no
 * reason anybody can see, and an object missed altogether is a night spent asking the same question.
 */
class HeadTalkTest {

    @Test
    fun `the words for the person and the object for the machine come apart`() {
        val reply = HeadTalk.read(
            """
            Both files are already migrated, so the fixer only needs the third.

            ```json
            {"slots": {"findings": "/tmp/x.md"}}
            ```
            """.trimIndent(),
        )

        assertEquals("Both files are already migrated, so the fixer only needs the third.", reply.words)

        val slots = reply.body?.get("slots") as? JsonObject
        assertEquals("/tmp/x.md", slots?.get("findings")?.jsonPrimitive?.contentOrNull)
    }

    // A fence is a habit rather than a promise: an answer without one is still an answer.
    @Test
    fun `an object with no fence around it is read all the same`() {
        val reply = HeadTalk.read("Nothing left to do. {\"again\": false, \"reason\": \"no findings\"}")

        assertEquals("Nothing left to do.", reply.words)
        assertEquals("false", reply.body?.get("again")?.toString())
    }

    /*
     * A brace inside a string is the reason this is scanned rather than searched backwards for the last
     * brace: a model asked for a path answers with one, and paths have braces in them.
     */
    @Test
    fun `braces inside a value do not end the object`() {
        val reply = HeadTalk.read("""Done. {"handoff": "wrote src/{a,b}.ts", "done": true}""")

        assertEquals("wrote src/{a,b}.ts", reply.body?.get("handoff")?.jsonPrimitive?.contentOrNull)
        assertEquals("true", reply.body?.get("done")?.toString())
    }

    // The last one, because the head routinely quotes the object it was asked for before answering it.
    @Test
    fun `the object that counts is the last one`() {
        val reply = HeadTalk.read("""You asked for {"done": true}. Here it is: {"done": false, "reason": "no"}""")

        assertEquals("false", reply.body?.get("done")?.toString())
    }

    @Test
    fun `prose alone is prose alone`() {
        val reply = HeadTalk.read("I think the card did what it was asked.")

        assertNull(reply.body)
        assertEquals("I think the card did what it was asked.", reply.words)
    }

    @Test
    fun `an empty answer is not an object`() {
        assertNull(HeadTalk.read("").body)
        assertNull(HeadTalk.read("   ").body)
    }

    /*
     * Both of these travel as a command-line argument, and on Windows a newline or a quotation mark ends
     * the command there - silently, with everything after it lost (see ClaudeLaunch). Everything with any
     * shape to it is said in a message instead, and this is what keeps that promise.
     */
    @Test
    fun `what travels as an argument survives a shell nobody asked for`() {
        for (briefing in listOf(HeadTalk.HEAD_BRIEFING, HeadTalk.CARD_BRIEFING)) {
            assertTrue('\n' !in briefing, "a newline in a launch argument ends the command there")
            assertTrue('"' !in briefing, "a quotation mark in a launch argument breaks the quoted run")
            assertTrue('\'' !in briefing, "an apostrophe in a launch argument breaks the quoted run")
        }
    }
}

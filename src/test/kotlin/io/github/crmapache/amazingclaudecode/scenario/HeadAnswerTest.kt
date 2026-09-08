package io.github.crmapache.amazingclaudecode.scenario

import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertNull
import kotlinx.serialization.json.Json
import kotlinx.serialization.json.JsonObject

/**
 * The head's answer is a model's JSON, and a field of the wrong shape must be a field nobody said - not
 * an exception on the thread that reads the CLI's output (see HeadAnswer).
 *
 * Written from a live run: a head on Haiku answered `handoff` with an object, and the panel put up the
 * IDE's own "Exception in plugin" dialog while the run stood still behind it.
 */
class HeadAnswerTest {

    private fun body(raw: String): JsonObject = Json.parseToJsonElement(raw) as JsonObject

    @Test
    fun `a field written in words is read`() {
        val answer = body("""{"reason": "the tests pass", "done": true, "again": false}""")

        assertEquals("the tests pass", HeadAnswer.text(answer, "reason"))
        assertEquals(true, HeadAnswer.flag(answer, "done"))
        assertEquals(false, HeadAnswer.flag(answer, "again"))
    }

    @Test
    fun `an object or a list where a sentence was asked for is nothing, not a throw`() {
        val answer = body("""{"handoff": {"files": ["a.ts"]}, "reason": ["too", "long"], "done": {"yes": true}}""")

        assertEquals("", HeadAnswer.text(answer, "handoff"))
        assertEquals("", HeadAnswer.text(answer, "reason"))
        assertNull(HeadAnswer.flag(answer, "done"))
    }

    @Test
    fun `a field nobody wrote is empty`() {
        val answer = body("""{}""")

        assertEquals("", HeadAnswer.text(answer, "handoff"))
        assertNull(HeadAnswer.flag(answer, "done"))
    }

    /** A model writing JSON by hand quotes its booleans often enough to be worth taking. */
    @Test
    fun `a quoted yes or no still answers the question`() {
        val answer = body("""{"done": "true", "again": "no", "allow": "maybe"}""")

        assertEquals(true, HeadAnswer.flag(answer, "done"))
        assertEquals(false, HeadAnswer.flag(answer, "again"))
        assertNull(HeadAnswer.flag(answer, "allow"))
    }
}

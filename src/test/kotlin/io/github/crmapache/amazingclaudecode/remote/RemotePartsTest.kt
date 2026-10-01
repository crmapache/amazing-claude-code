package io.github.crmapache.amazingclaudecode.remote

import kotlinx.serialization.json.Json
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.buildJsonObject
import kotlinx.serialization.json.jsonObject
import kotlinx.serialization.json.put
import kotlinx.serialization.json.putJsonObject
import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertFalse
import kotlin.test.assertIs
import kotlin.test.assertTrue

/**
 * A message too big for one relay frame, put back together on this side.
 *
 * The phone sends a message with photos as several ordinary frames (see mobile/link.ts). What has to hold
 * here: the message comes out exactly as it was sent, in whatever order the parts arrive, and nothing a
 * device sends can make this side hold more than a bounded amount, for longer than a bounded time.
 */
class RemotePartsTest {

    private var now = 1_000L
    private val parts = RemoteParts { now }

    private fun part(id: String, index: Int, count: Int, slice: String): JsonObject = buildJsonObject {
        put("p", 1)
        put("k", "part")
        put("id", id)
        put("i", index)
        put("n", count)
        put("d", slice)
    }

    /** The message cut the way the phone cuts it - by characters of its own text. */
    private fun slices(text: String, size: Int): List<String> = text.chunked(size)

    @Test
    fun `the parts of a message come out as the message`() {
        val message = """{"p":1,"k":"cmd","pj":"abc","b":{"type":"prompt","text":"привет","images":[{"data":"${"A".repeat(500)}"}]}}"""
        val pieces = slices(message, 100)

        val outcomes = pieces.mapIndexed { index, slice -> parts.take("phone", part("m1", index, pieces.size, slice)) }

        outcomes.dropLast(1).forEach { assertEquals(RemoteParts.Outcome.Waiting, it) }
        assertEquals(RemoteParts.Outcome.Whole(message), outcomes.last())
    }

    /** The relay keeps the order on one socket, but a reconnect half-way can put a buffered part behind a new one. */
    @Test
    fun `the order the parts arrive in does not matter`() {
        val message = "x".repeat(250) + "y".repeat(250)
        val pieces = slices(message, 100)

        val outcome = pieces.indices.reversed()
            .map { index -> parts.take("phone", part("m1", index, pieces.size, pieces[index])) }
            .last()

        assertEquals(RemoteParts.Outcome.Whole(message), outcome)
    }

    @Test
    fun `a part that arrives twice is taken once`() {
        parts.take("phone", part("m1", 0, 2, "ab"))
        parts.take("phone", part("m1", 0, 2, "ab"))

        assertEquals(RemoteParts.Outcome.Whole("abcd"), parts.take("phone", part("m1", 1, 2, "cd")))
    }

    /** Two phones may each be half-way through a message of the same name. */
    @Test
    fun `two devices do not share a message`() {
        parts.take("phone-a", part("m1", 0, 2, "aa"))
        parts.take("phone-b", part("m1", 0, 2, "bb"))

        assertEquals(RemoteParts.Outcome.Whole("aaAA"), parts.take("phone-a", part("m1", 1, 2, "AA")))
        assertEquals(RemoteParts.Outcome.Whole("bbBB"), parts.take("phone-b", part("m1", 1, 2, "BB")))
    }

    @Test
    fun `parts that disagree on how many there are drop the message`() {
        parts.take("phone", part("m1", 0, 3, "aa"))

        assertIs<RemoteParts.Outcome.Refused>(parts.take("phone", part("m1", 1, 2, "bb")))
        // Started again from nothing: the first part is gone with the rest.
        assertEquals(RemoteParts.Outcome.Waiting, parts.take("phone", part("m1", 1, 3, "bb")))
    }

    @Test
    fun `a part out of range or without its fields is refused`() {
        assertIs<RemoteParts.Outcome.Refused>(parts.take("phone", part("m1", 2, 2, "aa")))
        assertIs<RemoteParts.Outcome.Refused>(parts.take("phone", part("m1", -1, 2, "aa")))
        assertIs<RemoteParts.Outcome.Refused>(parts.take("phone", part("m1", 0, 1, "aa")))
        assertIs<RemoteParts.Outcome.Refused>(parts.take("phone", part("m1", 0, RemoteParts.MAX_PARTS + 1, "aa")))
        assertIs<RemoteParts.Outcome.Refused>(parts.take("phone", part("bad name!", 0, 2, "aa")))
        assertIs<RemoteParts.Outcome.Refused>(
            parts.take("phone", buildJsonObject { put("id", "m1"); put("i", 0); put("n", 2) }),
        )
        // An object where a number belongs - read as nothing rather than thrown out of the frame handler.
        assertIs<RemoteParts.Outcome.Refused>(
            parts.take("phone", buildJsonObject { put("id", "m1"); putJsonObject("i") {}; put("n", 2); put("d", "aa") }),
        )
    }

    @Test
    fun `a message past the ceiling is dropped as it grows`() {
        val slice = "a".repeat(1024 * 1024)
        val count = (RemoteParts.MAX_CHARS / slice.length).toInt() + 1

        val outcomes = (0 until count).map { index -> parts.take("phone", part("m1", index, count, slice)) }

        assertIs<RemoteParts.Outcome.Refused>(outcomes.last())
        assertTrue(outcomes.dropLast(1).all { it == RemoteParts.Outcome.Waiting })
    }

    /** The line dropped half-way: the phone sends it again under a new name, and the first never finishes. */
    @Test
    fun `a message whose last part never came is given up after a while`() {
        parts.take("phone", part("m1", 0, 2, "aa"))

        now += RemoteParts.PATIENCE_MS + 1

        // The second half, arriving after the first was given up, starts a message of its own.
        assertEquals(RemoteParts.Outcome.Waiting, parts.take("phone", part("m1", 1, 2, "bb")))
    }

    @Test
    fun `one device holds only a couple of half-built messages`() {
        parts.take("phone", part("m1", 0, 2, "11"))
        parts.take("phone", part("m2", 0, 2, "22"))
        // The third pushes out the oldest.
        parts.take("phone", part("m3", 0, 2, "33"))

        assertEquals(RemoteParts.Outcome.Waiting, parts.take("phone", part("m1", 1, 2, "!!")))
        assertEquals(RemoteParts.Outcome.Whole("33!!"), parts.take("phone", part("m3", 1, 2, "!!")))
    }

    @Test
    fun `a device that is let go leaves nothing half-built`() {
        parts.take("phone", part("m1", 0, 2, "aa"))

        parts.forget("phone")

        assertEquals(RemoteParts.Outcome.Waiting, parts.take("phone", part("m1", 1, 2, "bb")))
    }

    @Test
    fun `only a message may arrive in parts`() {
        fun whole(text: String): JsonObject = Json.parseToJsonElement(text).jsonObject

        assertTrue(RemoteParts.mayArriveInParts(whole("""{"k":"cmd","b":{"type":"prompt"}}""")))
        assertTrue(RemoteParts.mayArriveInParts(whole("""{"k":"cmd","b":{"type":"queuePrompt"}}""")))

        assertFalse(RemoteParts.mayArriveInParts(whole("""{"k":"cmd","b":{"type":"permissionDecision"}}""")))
        assertFalse(RemoteParts.mayArriveInParts(whole("""{"k":"subscribe","b":{"type":"prompt"}}""")))
        assertFalse(RemoteParts.mayArriveInParts(whole("""{"k":"part","b":{"type":"prompt"}}""")))
        assertFalse(RemoteParts.mayArriveInParts(whole("""{"k":"cmd","b":"prompt"}""")))
        assertFalse(RemoteParts.mayArriveInParts(whole("""{"k":"cmd","b":{"type":{"x":1}}}""")))
    }
}

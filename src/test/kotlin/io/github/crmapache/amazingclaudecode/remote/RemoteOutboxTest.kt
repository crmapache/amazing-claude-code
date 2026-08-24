package io.github.crmapache.amazingclaudecode.remote

import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertFalse
import kotlin.test.assertTrue

class RemoteOutboxTest {

    private val resync = listOf("resync".toByteArray())

    private fun frame(size: Int = 10) = ByteArray(size)

    @Test
    fun `what went in comes out in order`() {
        val outbox = RemoteOutbox()
        outbox.offer("first".toByteArray())
        outbox.offer("second".toByteArray())

        assertEquals(listOf("first", "second"), outbox.drain { resync }.map { String(it) })
    }

    @Test
    fun `draining empties it`() {
        val outbox = RemoteOutbox()
        outbox.offer(frame())

        outbox.drain { resync }

        assertEquals(0, outbox.size())
    }

    /**
     * The decision this class exists for. Dropping the oldest and carrying on leaves a feed with a hole
     * neither side can see; collapsing says "ask again", and the journal has all of it anyway.
     */
    @Test
    fun `a queue that overflows collapses into one marker`() {
        val outbox = RemoteOutbox(maxFrames = 3)
        repeat(5) { outbox.offer("frame-$it".toByteArray()) }

        assertTrue(outbox.needsResync())
        assertEquals(listOf("resync"), outbox.drain { resync }.map { String(it) })
    }

    /**
     * One queue, several phones. Each of them has just lost whatever was on its way, and each has to be
     * told in a frame addressed to it - a single frame addressed to nobody reached none of them, and a
     * collapse was silent at both ends.
     */
    @Test
    fun `every device is told to ask again`() {
        val outbox = RemoteOutbox(maxFrames = 2)
        repeat(5) { outbox.offer(frame()) }

        val notes = outbox.drain { listOf("to-phone".toByteArray(), "to-tablet".toByteArray()) }

        assertEquals(listOf("to-phone", "to-tablet"), notes.map { String(it) })
    }

    @Test
    fun `it overflows by weight as well as by count`() {
        val outbox = RemoteOutbox(maxFrames = 1000, maxBytes = 100)
        repeat(3) { outbox.offer(frame(60)) }

        assertTrue(outbox.needsResync())
    }

    /**
     * A night without signal must cost the same memory as a minute without it - that is the whole
     * reason for collapsing rather than trimming.
     */
    @Test
    fun `a very long outage costs no more than a short one`() {
        val outbox = RemoteOutbox(maxFrames = 10)
        repeat(100_000) { outbox.offer(frame(1024)) }

        assertEquals(1, outbox.drain { resync }.size)
    }

    /**
     * An answer the other side is waiting on is not part of the feed and must not be swept away with
     * it: a phone waiting on "did that go through?" would otherwise wait forever.
     */
    @Test
    fun `answers survive a collapse`() {
        val outbox = RemoteOutbox(maxFrames = 2)
        outbox.offerUrgent("result".toByteArray())
        repeat(5) { outbox.offer(frame()) }

        val drained = outbox.drain { resync }.map { String(it) }

        assertTrue(drained.contains("result"))
        assertTrue(drained.contains("resync"))
    }

    @Test
    fun `the marker comes before everything else`() {
        val outbox = RemoteOutbox(maxFrames = 2)
        repeat(5) { outbox.offer(frame()) }
        outbox.offerUrgent("result".toByteArray())

        assertEquals("resync", String(outbox.drain { resync }.first()))
    }

    @Test
    fun `answers are bounded too`() {
        val outbox = RemoteOutbox()
        repeat(RemoteOutbox.MAX_URGENT + 50) { outbox.offerUrgent(frame()) }

        assertEquals(RemoteOutbox.MAX_URGENT, outbox.size())
    }

    @Test
    fun `a drained marker is not sent twice`() {
        val outbox = RemoteOutbox(maxFrames = 1)
        outbox.offer(frame())
        outbox.offer(frame())

        outbox.drain { resync }

        assertFalse(outbox.needsResync())
        assertEquals(0, outbox.drain { resync }.size)
    }
}

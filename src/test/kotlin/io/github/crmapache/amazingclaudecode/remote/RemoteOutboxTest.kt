package io.github.crmapache.amazingclaudecode.remote

import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertFalse
import kotlin.test.assertTrue

class RemoteOutboxTest {

    private val phone = "phone"

    private val tablet = "tablet"

    private fun frame(size: Int = 10) = ByteArray(size)

    private fun resync(deviceId: String): ByteArray = "resync-$deviceId".toByteArray()

    private fun RemoteOutbox.words(): List<String> = drain(::resync).map { String(it.frame) }

    @Test
    fun `what went in comes out in order`() {
        val outbox = RemoteOutbox()
        outbox.offer(phone, "first".toByteArray())
        outbox.offer(phone, "second".toByteArray())

        assertEquals(listOf("first", "second"), outbox.words())
    }

    @Test
    fun `draining empties it`() {
        val outbox = RemoteOutbox()
        outbox.offer(phone, frame())

        outbox.drain(::resync)

        assertEquals(0, outbox.size())
    }

    /**
     * The decision this class exists for. Dropping the oldest and carrying on leaves a feed with a hole
     * neither side can see; collapsing says "ask again", and the journal has all of it anyway.
     */
    @Test
    fun `a queue that overflows collapses into one marker`() {
        val outbox = RemoteOutbox(maxFrames = 3)
        repeat(5) { outbox.offer(phone, "frame-$it".toByteArray()) }

        assertTrue(outbox.needsResync(phone))
        assertEquals(listOf("resync-phone"), outbox.words())
    }

    /**
     * The reason the queues are apart at all. A phone in a tunnel used to fill the one queue everybody
     * shared, and the collapse threw away the frames of the laptop on the desk - which had lost nothing
     * and was then told to ask for it again.
     */
    @Test
    fun `one device overflowing leaves the others alone`() {
        val outbox = RemoteOutbox(maxFrames = 2)
        repeat(5) { outbox.offer(phone, frame()) }
        outbox.offer(tablet, "for-the-tablet".toByteArray())

        assertTrue(outbox.needsResync(phone))
        assertFalse(outbox.needsResync(tablet))
        assertTrue(outbox.words().contains("for-the-tablet"))
    }

    /** And the marker that replaced what was thrown away is addressed to the one that lost it. */
    @Test
    fun `the device that lost its frames is the one told to ask again`() {
        val outbox = RemoteOutbox(maxFrames = 2)
        repeat(5) { outbox.offer(phone, frame()) }
        outbox.offer(tablet, frame())

        val notes = outbox.drain(::resync).filter { String(it.frame).startsWith("resync") }

        assertEquals(listOf(phone), notes.map { it.deviceId })
    }

    @Test
    fun `it overflows by weight as well as by count`() {
        val outbox = RemoteOutbox(maxFrames = 1000, maxBytes = 100)
        repeat(3) { outbox.offer(phone, frame(60)) }

        assertTrue(outbox.needsResync(phone))
    }

    /**
     * A night without signal must cost the same memory as a minute without it - that is the whole
     * reason for collapsing rather than trimming.
     */
    @Test
    fun `a very long outage costs no more than a short one`() {
        val outbox = RemoteOutbox(maxFrames = 10)
        repeat(100_000) { outbox.offer(phone, frame(1024)) }

        assertEquals(1, outbox.drain(::resync).size)
    }

    /**
     * An answer the other side is waiting on is not part of the feed and must not be swept away with
     * it: a phone waiting on "did that go through?" would otherwise wait forever.
     */
    @Test
    fun `answers survive a collapse`() {
        val outbox = RemoteOutbox(maxFrames = 2)
        outbox.offerUrgent(phone, "result".toByteArray())
        repeat(5) { outbox.offer(phone, frame()) }

        val drained = outbox.words()

        assertTrue(drained.contains("result"))
        assertTrue(drained.contains("resync-phone"))
    }

    @Test
    fun `the marker comes before everything else`() {
        val outbox = RemoteOutbox(maxFrames = 2)
        repeat(5) { outbox.offer(phone, frame()) }
        outbox.offerUrgent(phone, "result".toByteArray())

        assertEquals("resync-phone", outbox.words().first())
    }

    @Test
    fun `answers are bounded too`() {
        val outbox = RemoteOutbox()
        repeat(RemoteOutbox.MAX_URGENT + 50) { outbox.offerUrgent(phone, frame()) }

        assertEquals(RemoteOutbox.MAX_URGENT, outbox.size())
    }

    @Test
    fun `a drained marker is not sent twice`() {
        val outbox = RemoteOutbox(maxFrames = 1)
        outbox.offer(phone, frame())
        outbox.offer(phone, frame())

        outbox.drain(::resync)

        assertFalse(outbox.needsResync(phone))
        assertEquals(0, outbox.drain(::resync).size)
    }

    /**
     * The transport hands frames to a socket that can refuse them mid-batch. What it could not send has
     * to come back, in the order it was in: thrown away, it is a conversation quietly missing a minute
     * of itself on a connection that never looked broken.
     */
    @Test
    fun `what could not be sent goes back where it came from`() {
        val outbox = RemoteOutbox()
        outbox.offer(phone, "first".toByteArray())
        outbox.offer(phone, "second".toByteArray())
        outbox.offer(tablet, "third".toByteArray())

        val taken = outbox.drain(::resync)
        outbox.putBack(taken.subList(1, taken.size))

        assertEquals(listOf("second", "third"), outbox.words())
    }

    @Test
    fun `frames given back still go out before the ones queued after them`() {
        val outbox = RemoteOutbox()
        outbox.offer(phone, "first".toByteArray())

        val taken = outbox.drain(::resync)
        outbox.offer(phone, "later".toByteArray())
        outbox.putBack(taken)

        assertEquals(listOf("first", "later"), outbox.words())
    }

    /** Giving back more than the queue holds is still bounded - it collapses like anything else. */
    @Test
    fun `giving back too much collapses rather than grows`() {
        val outbox = RemoteOutbox(maxFrames = 3)
        repeat(3) { outbox.offer(phone, frame()) }

        val taken = outbox.drain(::resync)
        repeat(3) { outbox.offer(phone, frame()) }
        outbox.putBack(taken)

        assertTrue(outbox.needsResync(phone))
    }

    /** A revoked device is not worth holding frames for: nothing there can open them any more. */
    @Test
    fun `forgetting a device drops what was on its way`() {
        val outbox = RemoteOutbox()
        outbox.offer(phone, frame())
        outbox.offer(tablet, "for-the-tablet".toByteArray())

        outbox.forget(phone)

        assertEquals(listOf("for-the-tablet"), outbox.words())
    }
}

package io.github.crmapache.amazingclaudecode.remote

import kotlin.test.Test
import kotlin.test.assertFalse
import kotlin.test.assertTrue

/**
 * What a device may do, and how often.
 *
 * The numbers are not about politeness: this channel can send messages to an agent that has a shell on
 * the work machine, so the question each of them answers is what a phone in somebody else's hands
 * could do before anyone noticed.
 */
class RemoteLimitsTest {

    private val limits = RemoteLimits()

    @Test
    fun `ordinary use is not interrupted`() {
        // Five permissions in as many seconds is a normal morning, not an attack.
        repeat(5) { assertTrue(limits.allow("phone", "permissionDecision", now = 1000L + it * 1000)) }
    }

    @Test
    fun `a flood of messages is cut off`() {
        val allowed = (1..50).count { limits.allow("phone", "prompt", now = 1000L) }

        assertTrue(allowed <= RemoteLimits.PER_MINUTE.getValue("prompt"))
    }

    /** The window slides: being stopped for a minute is not being stopped for good. */
    @Test
    fun `the limit lifts once the minute has passed`() {
        repeat(20) { limits.allow("phone", "prompt", now = 1000L) }
        assertFalse(limits.allow("phone", "prompt", now = 2000L))

        assertTrue(limits.allow("phone", "prompt", now = 1000L + RemoteLimits.WINDOW_MS + 1))
    }

    /** One device going too fast must not stop another one. */
    @Test
    fun `one device's flood does not touch another`() {
        repeat(50) { limits.allow("noisy", "prompt", now = 1000L) }

        assertTrue(limits.allow("quiet", "prompt", now = 1000L))
    }

    /**
     * Answering is allowed far more often than sending, and deliberately: a person clearing a queue of
     * questions is quick, while a person typing is not.
     */
    @Test
    fun `answering is allowed more often than sending`() {
        assertTrue(
            RemoteLimits.PER_MINUTE.getValue("permissionDecision") >
                RemoteLimits.PER_MINUTE.getValue("prompt"),
        )
    }

    @Test
    fun `something enormous is refused whatever the rate`() {
        assertFalse(limits.allowBytes("phone", RemoteLimits.MAX_MESSAGE_BYTES + 1))
    }

    @Test
    fun `many merely large messages are refused together`() {
        val each = RemoteLimits.MAX_MESSAGE_BYTES
        val room = RemoteLimits.MAX_BYTES_PER_MINUTE / each

        repeat(room) { assertTrue(limits.allowBytes("phone", each, now = 1000L)) }

        assertFalse(limits.allowBytes("phone", each, now = 1000L))
    }

    @Test
    fun `a device that has gone stops occupying anything`() {
        repeat(50) { limits.allow("phone", "prompt", now = 1000L) }

        limits.forget("phone")

        assertTrue(limits.allow("phone", "prompt", now = 1000L))
    }
}

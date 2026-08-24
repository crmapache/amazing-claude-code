package io.github.crmapache.amazingclaudecode.remote

import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertFalse
import kotlin.test.assertTrue

/**
 * A frame that arrives twice is not a curiosity. Replay one carrying "allow this tool call" and the
 * agent grants the same permission a second time, at a moment nobody chose - the tag stops anyone
 * altering a frame, and only this stops them sending an unaltered one again.
 */
class ReplayWindowTest {

    @Test
    fun `frames in order are all accepted`() {
        val window = ReplayWindow()

        for (counter in 1L..100L) {
            assertTrue(window.accept(counter), "rejected $counter")
        }
    }

    @Test
    fun `the same frame twice is accepted once`() {
        val window = ReplayWindow()
        window.accept(5)

        assertFalse(window.accept(5))
    }

    /**
     * Order is not guaranteed end to end: a reconnect merges what the relay had buffered with what is
     * arriving live. A strict "must be higher than the last" would throw good frames away.
     */
    @Test
    fun `frames slightly out of order are still accepted`() {
        val window = ReplayWindow()
        window.accept(10)

        assertTrue(window.accept(8))
        assertTrue(window.accept(9))
        assertTrue(window.accept(11))
    }

    @Test
    fun `an out of order frame is not accepted twice either`() {
        val window = ReplayWindow()
        window.accept(10)
        window.accept(8)

        assertFalse(window.accept(8))
    }

    /**
     * Below the window there is no way to tell a repeat from something merely very late, and guessing
     * in the sender's favour is exactly how a replay gets through.
     */
    @Test
    fun `something far too old is dropped`() {
        val window = ReplayWindow(size = 8)
        window.accept(100)

        assertFalse(window.accept(50))
        assertFalse(window.accept(92))
        assertTrue(window.accept(93))
    }

    /** A jump forward past the whole window leaves nothing behind it to be replayed into. */
    @Test
    fun `a long jump forward moves the window whole`() {
        val window = ReplayWindow(size = 8)
        window.accept(1)

        assertTrue(window.accept(1000))
        assertFalse(window.accept(1))
        assertEquals(1000, window.highest())
    }

    @Test
    fun `the first frame sets the window wherever it lands`() {
        val window = ReplayWindow()

        assertTrue(window.accept(9_000))
        assertFalse(window.accept(9_000))
    }

    @Test
    fun `a negative counter is nonsense and is dropped`() {
        assertFalse(ReplayWindow().accept(-1))
    }

    /**
     * The shape of a real reconnect: a burst of buffered frames interleaved with live ones, some of
     * them repeats. Everything new gets in exactly once, and no repeat does.
     */
    @Test
    fun `a reconnect's mixed burst lets each frame in once`() {
        val window = ReplayWindow()
        val arriving = listOf(5L, 3L, 4L, 6L, 5L, 7L, 2L, 8L, 8L, 9L)

        val accepted = arriving.filter { window.accept(it) }

        assertEquals(listOf(5L, 3L, 4L, 6L, 7L, 2L, 8L, 9L), accepted)
    }
}

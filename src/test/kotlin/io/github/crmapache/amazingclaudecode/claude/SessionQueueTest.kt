package io.github.crmapache.amazingclaudecode.claude

import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertFalse
import kotlin.test.assertNull
import kotlin.test.assertTrue

class SessionQueueTest {

    private val queue = SessionQueue()

    private fun entry(id: String, text: String = id, images: Int = 0) = SessionQueue.Entry(
        id = id,
        text = text,
        attach = "",
        images = List(images) { ImageAttachment("image/png", "bytes") },
        echo = null,
        remote = false,
    )

    private fun ids(entries: List<SessionQueue.Entry>) = entries.map { it.id }

    @Test
    fun `messages wait in the order they were written`() {
        queue.add("main", entry("q1"))
        queue.add("main", entry("q2"))

        assertEquals(listOf("q1", "q2"), ids(queue.of("main")))
    }

    @Test
    fun `each conversation waits on its own`() {
        queue.add("main", entry("q1"))
        queue.add("fork", entry("q2"))

        assertEquals(listOf("q1"), ids(queue.of("main")))
        assertEquals(listOf("q2"), ids(queue.of("fork")))
    }

    /**
     * A phone that does not hear the answer sends the same thing again (see RemoteOutbox), and one
     * thought said twice is worse than a frame lost.
     */
    @Test
    fun `the same message arriving twice is still one message`() {
        queue.add("main", entry("q1"))
        queue.add("main", entry("q1"))

        assertEquals(listOf("q1"), ids(queue.of("main")))
    }

    @Test
    fun `a message taken back out leaves the rest as they were`() {
        queue.add("main", entry("q1"))
        queue.add("main", entry("q2"))
        queue.add("main", entry("q3"))

        assertEquals(listOf("q1", "q3"), ids(queue.remove("main", "q2")))
    }

    @Test
    fun `the front of the queue is handed over and is gone from it`() {
        queue.add("main", entry("q1", text = "first"))
        queue.add("main", entry("q2"))

        val (taken, rest) = queue.take("main")!!

        assertEquals("first", taken.text)
        assertEquals(listOf("q2"), ids(rest))
        assertEquals(listOf("q2"), ids(queue.of("main")))
    }

    @Test
    fun `an empty queue hands over nothing`() {
        assertNull(queue.take("main"))
    }

    @Test
    fun `the order named is the order kept`() {
        queue.add("main", entry("q1"))
        queue.add("main", entry("q2"))
        queue.add("main", entry("q3"))

        assertEquals(listOf("q3", "q1", "q2"), ids(queue.reorder("main", listOf("q3", "q1", "q2"))))
    }

    /**
     * Two windows are looking at this list. One drags while the other adds, and the message the drag
     * never saw must not be thrown away by it - it goes to the end, where nobody has decided anything
     * about it yet.
     */
    @Test
    fun `a message the reordering never mentioned keeps its place at the end`() {
        queue.add("main", entry("q1"))
        queue.add("main", entry("q2"))
        queue.add("main", entry("q3"))

        assertEquals(listOf("q2", "q1", "q3"), ids(queue.reorder("main", listOf("q2", "q1"))))
    }

    @Test
    fun `an order naming a message that is no longer there changes nothing about the rest`() {
        queue.add("main", entry("q1"))
        queue.add("main", entry("q2"))

        assertEquals(listOf("q2", "q1"), ids(queue.reorder("main", listOf("q2", "gone", "q1"))))
    }

    @Test
    fun `a conversation that ends says nothing it was waiting to say`() {
        queue.add("main", entry("q1"))

        assertTrue(queue.clear("main"))
        assertEquals(emptyList(), queue.of("main"))
        assertFalse(queue.clear("main"))
    }

    @Test
    fun `what travels with a message travels with it out of the queue`() {
        queue.add("main", entry("q1", images = 2))

        val (taken, _) = queue.take("main")!!

        assertEquals(2, taken.images.size)
    }
}

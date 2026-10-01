package io.github.crmapache.amazingclaudecode.claude

import kotlin.test.Test
import kotlin.test.assertFalse
import kotlin.test.assertTrue

/**
 * A message sent again is not said again (see ArrivedMessages).
 *
 * Written for a phone that keeps what it sent until the IDE confirms it and resends it on a reconnect:
 * that is only safe if the copy of a message that did arrive is recognised and dropped.
 */
class ArrivedMessagesTest {

    @Test
    fun `the first copy is taken and every later one is not`() {
        val arrived = ArrivedMessages()

        assertTrue(arrived.first("tab-1", "m-1"))
        assertFalse(arrived.first("tab-1", "m-1"))
        assertFalse(arrived.first("tab-1", "m-1"))
    }

    @Test
    fun `the same identifier in another conversation is another message`() {
        val arrived = ArrivedMessages()

        assertTrue(arrived.first("tab-1", "m-1"))
        assertTrue(arrived.first("tab-2", "m-1"))
    }

    @Test
    fun `a message that could not be said is taken when it comes again`() {
        val arrived = ArrivedMessages()

        assertTrue(arrived.first("tab-1", "m-1"))
        arrived.undo("tab-1", "m-1")

        assertTrue(arrived.first("tab-1", "m-1"))
    }

    @Test
    fun `only the latest messages are remembered`() {
        val arrived = ArrivedMessages(kept = 2)

        assertTrue(arrived.first("tab-1", "m-1"))
        assertTrue(arrived.first("tab-1", "m-2"))
        assertTrue(arrived.first("tab-1", "m-3"))

        assertTrue(arrived.first("tab-1", "m-1"))
        assertFalse(arrived.first("tab-1", "m-3"))
    }

    @Test
    fun `a closed conversation forgets what it took`() {
        val arrived = ArrivedMessages()

        assertTrue(arrived.first("tab-1", "m-1"))
        arrived.forget("tab-1")

        assertTrue(arrived.first("tab-1", "m-1"))
    }
}

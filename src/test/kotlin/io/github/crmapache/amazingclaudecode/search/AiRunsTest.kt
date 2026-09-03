package io.github.crmapache.amazingclaudecode.search

import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertFalse
import kotlin.test.assertTrue

/**
 * A cancel names a request, and the request exists before its process does. What is checked here is the
 * gap between the two: a cancel pressed while the search is still being prepared has to stop the run
 * from ever starting, and one pressed a moment after the start has to stop the process.
 */
class AiRunsTest {

    private val stopped = mutableListOf<String>()
    private val runs = AiRuns<String> { stopped.add(it) }

    @Test
    fun `a cancel before the start is remembered, and the run never starts`() {
        runs.asked("a-1")
        assertFalse(runs.isCancelled("a-1"))

        assertTrue(runs.cancel("a-1"))
        assertTrue(runs.isCancelled("a-1"))
        assertTrue(runs.finished("a-1"), "the outcome of a taken-back run is nobody's news")
        assertEquals(0, runs.size)
    }

    @Test
    fun `a cancel after the start stops the process`() {
        runs.asked("a-2")
        runs.started("a-2", "process")

        assertTrue(runs.cancel("a-2"))
        assertEquals(listOf("process"), stopped)
        assertTrue(runs.finished("a-2"))
    }

    // The race the class exists for: the cancel lands after the check before the start and before the
    // process is handed over. Then the process is stopped the moment it arrives.
    @Test
    fun `a process arriving after the cancel is stopped on arrival`() {
        runs.asked("a-3")
        runs.cancel("a-3")
        runs.started("a-3", "late")

        assertEquals(listOf("late"), stopped)
    }

    @Test
    fun `a run that ends on its own is forgotten, and its outcome is news`() {
        runs.asked("a-4")
        runs.started("a-4", "process")

        assertFalse(runs.finished("a-4"))
        assertEquals(0, runs.size)
        assertTrue(stopped.isEmpty())
    }

    @Test
    fun `a cancel for a request nobody asked is nothing`() {
        assertFalse(runs.cancel("a-5"))
        assertEquals(0, runs.size)
    }
}

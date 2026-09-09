package io.github.crmapache.amazingclaudecode.remote

import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertTrue

/**
 * The memory of what has already been sent, and the two ways it is let go of.
 *
 * A leak nobody sees: every row is one fingerprint, and the whole table is smaller than a single file
 * list. What makes it worth a test is that it only ever grew - a row per run, per paired device, for as
 * long as the IDE is open - and that neither half of the letting go has anything on screen to show it
 * working.
 */
class FactMemoryTest {

    private fun memory(vararg keys: String) = keys.associateWith { 1L }.toMutableMap()

    @Test
    fun `a device that is no longer watching takes its slots with it`() {
        val sent = memory(
            FactMemory.key("phone", "project"),
            FactMemory.key("phone", "scenarioRun r1"),
            FactMemory.key("phone", "scenarioRun r2"),
            FactMemory.key("tablet", "project"),
        )

        FactMemory.prune(sent, watching = setOf("tablet"))

        assertEquals(setOf(FactMemory.key("tablet", "project")), sent.keys)
    }

    /** The backstop for the phone that stays paired while a morning schedule runs all year. */
    @Test
    fun `a memory grown past its ceiling is let go of whole`() {
        val sent = (1..FactMemory.SLOTS + 1)
            .associate { FactMemory.key("phone", "scenarioRun r$it") to 1L }
            .toMutableMap()

        FactMemory.prune(sent, watching = setOf("phone"))

        assertTrue(sent.isEmpty())
    }

    @Test
    fun `a memory within its ceiling is left alone`() {
        val sent = memory(FactMemory.key("phone", "project"), FactMemory.key("phone", "files"))

        FactMemory.prune(sent, watching = setOf("phone"))

        assertEquals(2, sent.size)
    }
}

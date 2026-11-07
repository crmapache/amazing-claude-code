package io.github.crmapache.amazingclaudecode.webview

import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertFalse
import kotlin.test.assertTrue

/**
 * A page whose process died is loaded again by itself - but not forever: a page that dies again as soon
 * as it is back would otherwise flicker in front of the person until the IDE closes.
 */
class PageCrashesTest {

    private var clock = 0L
    private val crashes = PageCrashes(limit = 3, windowMs = 60_000, now = { clock })

    @Test
    fun `the first few deaths are brought back`() {
        assertEquals(listOf(true, true, true), List(3) { crashes.reloadAfterCrash() })
    }

    @Test
    fun `one death too many in a row is where it stops`() {
        repeat(3) { crashes.reloadAfterCrash() }

        assertFalse(crashes.reloadAfterCrash())
    }

    @Test
    fun `deaths far apart never add up`() {
        repeat(10) {
            clock += 61_000
            assertTrue(crashes.reloadAfterCrash())
        }
    }

    @Test
    fun `only the deaths within the window count`() {
        repeat(3) {
            crashes.reloadAfterCrash()
            clock += 25_000
        }

        // The first of the three is 75 seconds old by now and no longer counts.
        assertTrue(crashes.reloadAfterCrash())
    }
}

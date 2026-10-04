package io.github.crmapache.amazingclaudecode.claude

import kotlin.test.Test
import kotlin.test.assertFalse
import kotlin.test.assertTrue

class RewindsUnderWayTest {

    // The desk and the phone rewinding one tab at once: the first to end used to lift the hold for both, and
    // the end of the turn the second stopped fired the queue - and the "work is done" push - into the
    // conversation a moment before it was cut.
    @Test
    fun `a tab is held until the last of its rewinds is over`() {
        val rewinds = RewindsUnderWay()
        rewinds.start("tab")
        rewinds.start("tab")

        rewinds.end("tab")
        assertTrue("tab" in rewinds)

        rewinds.end("tab")
        assertFalse("tab" in rewinds)
    }

    @Test
    fun `an end with no start lifts nothing and goes below nothing`() {
        val rewinds = RewindsUnderWay()
        rewinds.end("tab")
        rewinds.start("tab")

        assertTrue("tab" in rewinds)
    }

    @Test
    fun `a closed tab forgets its rewinds whatever their count`() {
        val rewinds = RewindsUnderWay()
        rewinds.start("tab")
        rewinds.start("tab")

        rewinds.forget("tab")
        assertFalse("tab" in rewinds)
    }
}

package io.github.crmapache.amazingclaudecode.claude

import io.github.crmapache.amazingclaudecode.claude.ProjectCatalog.HintPace
import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertFalse
import kotlin.test.assertTrue

/**
 * How often the "/" hint looks at the disk again.
 *
 * It breaks silently in both directions - too eager and a share is walked without pause, too lazy and
 * the skill somebody has just written does not show up - and neither is visible on the machine it is
 * written on, where every walk is a millisecond. Hence the arithmetic apart from the timer.
 */
class HintPaceTest {

    private val ms = 1_000_000L

    @Test
    fun `a local walk keeps the quick round`() {
        // Measured on this machine: 97 commands and skills, 1.0-1.3 ms for the walk. Two seconds is the
        // floor, and nothing that fast is allowed to raise it.
        val pace = HintPace.after(HintPace.QUICK, tookNanos = 2 * ms, at = 0)

        assertEquals(HintPace.QUICK_MS, pace.waitMs)
    }

    @Test
    fun `a walk that costs a second pushes the next one out, in proportion`() {
        val pace = HintPace.after(HintPace.QUICK, tookNanos = 400 * ms, at = 0)

        assertEquals(400L * HintPace.BUDGET, pace.waitMs)
        assertFalse(pace.due(at = 0))
        assertTrue(pace.due(at = pace.waitMs * ms))
    }

    @Test
    fun `however slow the walk, the hint never answers slower than the round it replaces`() {
        // Past the slow round the fast one buys nothing the unconditional minute does not buy anyway,
        // and a hint slower than before the change would be a plain regression on the machines that can
        // least afford one.
        val pace = HintPace.after(HintPace.QUICK, tookNanos = 30_000 * ms, at = 0)

        assertEquals(HintPace.SLOWEST_MS, pace.waitMs)
    }

    @Test
    fun `one quick walk does not undo a slow one`() {
        // A page swapped in, an antivirus, a drive spinning up: one of those is not proof that the disk
        // is quick again, and taking it as proof means the round jumps back and forth with nothing on
        // screen to explain either.
        val slow = HintPace.after(HintPace.QUICK, tookNanos = 400 * ms, at = 0)
        val once = HintPace.after(slow, tookNanos = 2 * ms, at = 0)

        assertEquals(slow.waitMs, once.waitMs)
    }

    @Test
    fun `a run of quick walks earns the quick round back`() {
        var pace = HintPace.after(HintPace.QUICK, tookNanos = 400 * ms, at = 0)
        repeat(HintPace.SETTLED) { pace = HintPace.after(pace, tookNanos = 2 * ms, at = 0) }

        assertEquals(HintPace.QUICK_MS, pace.waitMs)
    }

    @Test
    fun `the deadline is counted from the clock that does not step backwards`() {
        // Wall time does step back - NTP after a long sleep, a restored snapshot - and a deadline
        // written in it freezes the round for the length of the step. The one this counts in cannot.
        val pace = HintPace.after(HintPace.QUICK, tookNanos = 2 * ms, at = 5_000 * ms)

        assertEquals(5_000 * ms + HintPace.QUICK_MS * ms, pace.nextAt)
    }

    @Test
    fun `a disk that is never quick in absolute terms still gets its round back`() {
        // A hundred milliseconds a walk: the 9P share, the SMB mount, the drive behind an antivirus -
        // the machines this brake was written for in the first place. Not one walk there fits an
        // absolute forty milliseconds, so measured against one the period could only ever go up: a
        // single spin-up pinned it at a minute for the rest of the day, and the responsiveness this
        // whole change is about was gone on exactly the machines that were promised it.
        var pace = HintPace.QUICK
        repeat(HintPace.SETTLED) { pace = HintPace.after(pace, tookNanos = 100 * ms, at = 0) }
        val settled = pace.waitMs
        assertTrue(settled < HintPace.SLOWEST_MS, "a hundred-millisecond walk is not worth the ceiling")

        pace = HintPace.after(pace, tookNanos = 30_000 * ms, at = 0)
        assertEquals(HintPace.SLOWEST_MS, pace.waitMs)

        repeat(HintPace.SETTLED) { pace = HintPace.after(pace, tookNanos = 100 * ms, at = 0) }
        assertEquals(settled, pace.waitMs, "the brake has to let go again, not only take hold")
    }

    @Test
    fun `the first round is due whatever number the clock starts at`() {
        // System.nanoTime is allowed to start anywhere, negative included, and on some machines it
        // does. A deadline written as a plain zero is then in the future - by years - and the fast
        // round never runs once: the hint quietly goes back to answering once a minute, with nothing
        // on screen to say why. "Never looked yet" is a state of its own rather than a number.
        val started = -5_000_000_000L

        assertTrue(HintPace.QUICK.due(at = started))
    }
}

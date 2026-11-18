package io.github.crmapache.amazingclaudecode.claude

import io.github.crmapache.amazingclaudecode.claude.CarryOns.Owed
import io.github.crmapache.amazingclaudecode.claude.CarryOns.Reason
import kotlin.test.Test
import io.github.crmapache.amazingclaudecode.scenario.LimitRelief
import kotlin.test.assertEquals
import kotlin.test.assertFalse
import kotlin.test.assertNull
import kotlin.test.assertTrue

/**
 * What the panel owes a tab, and when. It breaks in the direction nobody looks: a "carry on" that goes when it
 * should not starts work in a tab nobody is watching, and one that does not go leaves the tab standing still -
 * the very complaint all of this is for.
 */
class CarryOnsTest {

    private val changes = mutableListOf<String>()
    private val owed = CarryOns { sessionId -> changes += sessionId }

    @Test
    fun `an account switch's carry-on is due at once`() {
        owed.owe("tab", Owed(Reason.ACCOUNT_SWITCH))

        assertEquals(Reason.ACCOUNT_SWITCH, owed.take("tab", now = 1_000)?.reason)
        // Spent: it is said once.
        assertNull(owed.take("tab", now = 1_000))
    }

    @Test
    fun `a limit's carry-on waits for its moment`() {
        owed.owe("tab", Owed(Reason.LIMIT, notBefore = 5_000))

        assertNull(owed.take("tab", now = 4_999))
        // Still owed, and still waiting: an early look takes nothing away.
        assertEquals(5_000L, owed.of("tab")?.shownAt(4_999))
        assertEquals(Reason.LIMIT, owed.take("tab", now = 5_000)?.reason)
    }

    /** The stop and the background together are what an account switch's words say, so nothing outranks them. */
    @Test
    fun `an account switch stands over the rest`() {
        owed.owe("tab", Owed(Reason.LIMIT, notBefore = 5_000))
        owed.owe("tab", Owed(Reason.ACCOUNT_SWITCH))
        owed.owe("tab", Owed(Reason.RESTART, helpersLost = true))
        owed.owe("tab", Owed(Reason.LIMIT, notBefore = 9_000))

        assertEquals(Reason.ACCOUNT_SWITCH, owed.of("tab")?.reason)
    }

    /**
     * A restart under a tab waiting out a limit does not hurry the wait - the limit still refuses - and the
     * agents it lost are said when the wait is over.
     */
    @Test
    fun `agents lost during a limit's wait are carried by the wait`() {
        owed.owe("tab", Owed(Reason.LIMIT, notBefore = 5_000))
        owed.owe("tab", Owed(Reason.RESTART, helpersLost = true))

        val now = owed.of("tab")
        assertEquals(Reason.LIMIT, now?.reason)
        assertEquals(5_000L, now?.notBefore)
        assertTrue(now?.helpersLost == true)
    }

    @Test
    fun `a newer limit keeps what was lost before it`() {
        owed.owe("tab", Owed(Reason.RESTART, helpersLost = true))
        owed.owe("tab", Owed(Reason.LIMIT, notBefore = 9_000))

        assertEquals(9_000L, owed.of("tab")?.notBefore)
        assertTrue(owed.of("tab")?.helpersLost == true)
    }

    /** Somebody spoke, stopped it or closed it: nothing is owed, and the screens are told so. */
    @Test
    fun `dropping lets the wait go and says so`() {
        owed.owe("tab", Owed(Reason.LIMIT, notBefore = 5_000))
        owed.drop("tab")

        assertNull(owed.take("tab", now = 10_000))
        assertEquals("tab", changes.last())
        assertNull(owed.of("tab"))
    }

    /** Dropping a tab that owes nothing is no news - the screens are not told about it. */
    @Test
    fun `dropping nothing says nothing`() {
        owed.drop("tab")

        assertTrue(changes.isEmpty())
    }

    /**
     * What the panel said last tells a limit refusing its own "carry on" from one refusing the person's - the
     * count that stops the panel from trying for ever. Somebody speaking resets it.
     */
    @Test
    fun `the panel's last words are remembered until somebody speaks`() {
        owed.owe("tab", Owed(Reason.LIMIT, notBefore = 5_000, tries = 1))
        owed.take("tab", now = 5_000)

        assertEquals(1, owed.lastSaid("tab")?.tries)

        owed.drop("tab")
        assertNull(owed.lastSaid("tab"))
    }

    @Test
    fun `tabs are owed apart`() {
        owed.owe("one", Owed(Reason.ACCOUNT_SWITCH))
        owed.owe("two", Owed(Reason.LIMIT, notBefore = 5_000))

        assertEquals(Reason.ACCOUNT_SWITCH, owed.take("one", now = 0)?.reason)
        assertNull(owed.take("two", now = 0))
    }

    /**
     * "Don't carry on" and Stop take the panel's words away, not the wait: what is queued was written to go once
     * the limit lets it, and with the wait gone it stood in the queue past the reset until somebody wrote again.
     */
    @Test
    fun `saying no keeps the limit's wait for the queue, silent`() {
        owed.owe("tab", Owed(Reason.LIMIT, notBefore = 5_000))
        owed.cancel("tab")

        val now = owed.of("tab")
        assertTrue(now?.silent == true)
        // Nothing is promised on the screens any more, and the queue still waits for the reset.
        assertNull(now.shownAt(0))
        assertEquals(5_000L, now.dueAt(0))
        assertEquals(Reason.LIMIT, owed.take("tab", now = 5_000)?.reason)
    }

    @Test
    fun `saying no to any other carry-on lets it go`() {
        owed.owe("tab", Owed(Reason.ACCOUNT_SWITCH))
        owed.cancel("tab")

        assertNull(owed.of("tab"))
    }

    /**
     * A wait timed anew is written only over what was read: somebody who spoke in between has dropped it, and
     * writing it back would carry on behind their own message.
     */
    @Test
    fun `a wait is retimed only over what was read`() {
        owed.owe("tab", Owed(Reason.LIMIT, notBefore = 5_000, account = "a"))
        val read = owed.of("tab")!!

        owed.drop("tab")
        val written = owed.replace("tab", read, read.copy(notBefore = null, account = "b", moved = true))

        assertFalse(written)
        assertNull(owed.of("tab"))
    }

    @Test
    fun `a wait unchanged since it was read is retimed`() {
        owed.owe("tab", Owed(Reason.LIMIT, notBefore = 5_000, account = "a"))
        val read = owed.of("tab")!!

        assertTrue(owed.replace("tab", read, read.copy(notBefore = null, moved = true)))
        assertEquals(Reason.LIMIT, owed.take("tab", now = 0)?.reason)
    }

    /**
     * Three tries means three refusals in a row. A carry-on that went through and worked for hours is no try:
     * a night of five-hour windows used to stand still after the third, with not one refusal behind it.
     */
    @Test
    fun `a carry-on that went through is not counted as a try`() {
        owed.owe("tab", Owed(Reason.LIMIT, notBefore = 5_000, tries = 2))
        owed.take("tab", now = 5_000)
        owed.answered("tab")

        assertNull(owed.lastSaid("tab"))
    }

    @Test
    fun `a wait is planned at the reset, with the server's slack`() {
        val now = 1_000_000L
        val planned = CarryOns.limitWait(now, known = now + 60 * 60_000, previous = null, account = "a")

        assertEquals(now + 60 * 60_000 + LimitRelief.RESET_SLACK_MS, planned?.notBefore)
        assertEquals(false, planned?.guess)
        assertEquals("a", planned?.account)
    }

    @Test
    fun `an unknown reset is a guess tried a quarter of an hour on`() {
        val now = 1_000_000L
        val planned = CarryOns.limitWait(now, known = null, previous = null, account = "a")

        assertEquals(now + LimitRelief.UNKNOWN_RESET_MS + LimitRelief.RESET_SLACK_MS, planned?.notBefore)
        assertEquals(true, planned?.guess)
    }

    /** A weekly window resets in days, and by then the tab is old work - see CarryOns.LIMIT_WAIT_MS. */
    @Test
    fun `a wait longer than the cap is not planned`() {
        val now = 1_000_000L

        assertNull(CarryOns.limitWait(now, known = now + 3 * 24 * 60 * 60_000L, previous = null, account = "a"))
    }

    @Test
    fun `three refused carry-ons in a row leave the tab to the person`() {
        val now = 1_000_000L
        val second = Owed(Reason.LIMIT, tries = 1)
        val third = Owed(Reason.LIMIT, tries = 2)

        assertEquals(2, CarryOns.limitWait(now, known = now + 60_000, previous = second, account = "a")?.tries)
        assertNull(CarryOns.limitWait(now, known = now + 60_000, previous = third, account = "a"))
        // The person's own message refused is a fresh start.
        assertEquals(0, CarryOns.limitWait(now, known = now + 60_000, previous = null, account = "a")?.tries)
    }

    /** Moved to an account with room: at once. To one refused for a while: at its reset. For days: not at all. */
    @Test
    fun `a wait follows the tab to another account`() {
        val now = 1_000_000L
        val waiting = Owed(Reason.LIMIT, notBefore = now + 60_000, account = "a", guess = true)

        val free = CarryOns.limitAcross(waiting, to = "b", refusedUntil = null, now = now)
        assertNull(free?.notBefore)
        assertEquals(true, free?.moved)
        assertEquals("b", free?.account)

        val soon = CarryOns.limitAcross(waiting, to = "b", refusedUntil = now + 10 * 60_000, now = now)
        assertEquals(now + 10 * 60_000 + LimitRelief.RESET_SLACK_MS, soon?.notBefore)

        assertNull(CarryOns.limitAcross(waiting, to = "b", refusedUntil = now + 3 * 24 * 60 * 60_000L, now = now))
    }

    /**
     * Background agents that have not been heard from for a long time are not taken for work in progress: a
     * count stuck since the morning would otherwise start work in the evening in a tab nobody remembers.
     */
    @Test
    fun `only agents heard from lately count as lost work`() {
        val now = 10 * 60 * 60_000L

        assertTrue(CarryOns.helpersAtWork(pending = true, lastHeard = now - 60_000, now = now))
        assertFalse(CarryOns.helpersAtWork(pending = true, lastHeard = now - 5 * 60 * 60_000L, now = now))
        assertFalse(CarryOns.helpersAtWork(pending = false, lastHeard = now, now = now))
        assertFalse(CarryOns.helpersAtWork(pending = true, lastHeard = 0, now = now))
    }

    /** A turn the CLI started by itself and the limit refused does not undo the person's "Don't carry on". */
    @Test
    fun `a new refusal keeps the person's no`() {
        owed.owe("tab", Owed(Reason.LIMIT, notBefore = 5_000))
        owed.cancel("tab")
        owed.owe("tab", Owed(Reason.LIMIT, notBefore = 9_000))

        assertTrue(owed.of("tab")?.silent == true)
        assertEquals(9_000L, owed.of("tab")?.notBefore)
    }
}

package io.github.crmapache.amazingclaudecode.scenario

import java.time.LocalDateTime
import java.time.ZoneId
import java.time.ZonedDateTime
import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertFalse
import kotlin.test.assertNotNull
import kotlin.test.assertNull
import kotlin.test.assertTrue

/**
 * When a scheduled scenario is next due, and whether an hour that has passed still counts.
 *
 * Tested because it breaks silently and expensively: a run that never starts and a run that starts twice
 * both look, the morning after, exactly like a plugin that was not running. A fixed zone rather than the
 * machine's, so the answers are the same wherever this is run.
 */
class ScheduleClockTest {

    private val zone = ZoneId.of("Europe/Lisbon")

    /** Monday, 6 January 2025, 08:00. */
    private fun monday(hour: Int = 8, minute: Int = 0): ZonedDateTime =
        ZonedDateTime.of(LocalDateTime.of(2025, 1, 6, hour, minute), zone)

    private fun at(hour: Int, minute: Int = 0) = hour * 60 + minute

    private fun schedule(
        at: Int,
        repeat: String = ScenarioSchedule.ONCE,
        weekday: Int = 1,
        nextAt: Long = 0,
    ) = ScenarioSchedule(scenarioId = "s", at = at, repeat = repeat, weekday = weekday, nextAt = nextAt)

    private fun whenIs(millis: Long): ZonedDateTime = java.time.Instant.ofEpochMilli(millis).atZone(zone)

    @Test
    fun `an hour still ahead today is today's`() {
        val next = ScheduleClock.next(schedule(at(9, 30)), monday())

        assertEquals(monday(9, 30), whenIs(next))
    }

    /** The commonest case of all: somebody sets nine o'clock at ten, meaning tomorrow morning. */
    @Test
    fun `an hour already past today is tomorrow's`() {
        val next = ScheduleClock.next(schedule(at(7)), monday())

        assertEquals(monday(7).plusDays(1), whenIs(next))
    }

    @Test
    fun `weekdays skip the weekend`() {
        val friday = monday(9).plusDays(4)
        val next = ScheduleClock.next(schedule(at(8), ScenarioSchedule.WEEKDAYS), friday)

        // Friday's eight is behind us, Saturday and Sunday are not working mornings: Monday.
        assertEquals(monday(8).plusDays(7), whenIs(next))
    }

    @Test
    fun `a weekly hour waits for its day`() {
        // Thursday is 4, and we are standing on a Monday.
        val next = ScheduleClock.next(schedule(at(10), ScenarioSchedule.WEEKLY, weekday = 4), monday())

        assertEquals(monday(10).plusDays(3), whenIs(next))
    }

    /** The day the hour falls on is today's day when the hour is still ahead of us. */
    @Test
    fun `a weekly hour on today's day and still ahead is today's`() {
        val next = ScheduleClock.next(schedule(at(18), ScenarioSchedule.WEEKLY, weekday = 1), monday())

        assertEquals(monday(18), whenIs(next))
    }

    @Test
    fun `an hour that has just come is due, and one from yesterday is missed`() {
        val now = monday(9).toInstant().toEpochMilli()
        val justNow = schedule(at(9), nextAt = now - 60_000)
        val longAgo = schedule(at(9), nextAt = now - 6 * 60 * 60 * 1000L)

        assertTrue(ScheduleClock.due(justNow, now))
        assertFalse(ScheduleClock.missed(justNow, now))

        assertFalse(ScheduleClock.due(longAgo, now))
        assertTrue(ScheduleClock.missed(longAgo, now))
    }

    /** Nothing is due before its hour, and a schedule with no hour left is due never. */
    @Test
    fun `an hour still ahead and a spent one are neither due nor missed`() {
        val now = monday(9).toInstant().toEpochMilli()
        val ahead = schedule(at(10), nextAt = now + 60 * 60 * 1000L)
        val spent = schedule(at(10), nextAt = 0)

        assertFalse(ScheduleClock.due(ahead, now))
        assertFalse(ScheduleClock.missed(ahead, now))
        assertFalse(ScheduleClock.due(spent, now))
        assertFalse(ScheduleClock.missed(spent, now))
    }

    /*
     * The hour is taken first and its outcome written afterwards, so the two are tested apart.
     *
     * Split because the clock ticks twice a minute while a due hour stays due for five (see GRACE_MS):
     * the moment is claimed before a single process is raised, and by the time anybody knows whether the
     * run started, the record no longer remembers which moment it was about.
     */
    @Test
    fun `a daily hour moves to tomorrow the moment it is taken`() {
        val due = monday(9).toInstant().toEpochMilli()
        val armed = ScheduleClock.armed(schedule(at(9), ScenarioSchedule.DAILY, nextAt = due), firedAt = due + 500, zone = zone)

        assertEquals(monday(9).plusDays(1), whenIs(armed.nextAt))
        assertEquals(0, armed.lastAt)
        assertEquals(0, armed.missedAt)
    }

    @Test
    fun `a daily hour that started something says when`() {
        val due = monday(9).toInstant().toEpochMilli()
        val armed = ScheduleClock.armed(schedule(at(9), ScenarioSchedule.DAILY, nextAt = due), firedAt = due + 500, zone = zone)
        val settled = ScheduleClock.settled(armed, due = due, firedAt = due + 500, ran = true)

        assertNotNull(settled)
        assertEquals(monday(9).plusDays(1), whenIs(settled.nextAt))
        assertEquals(due + 500, settled.lastAt)
        assertEquals(0, settled.missedAt)
    }

    /**
     * A one-off that actually ran is forgotten: its trace is the run itself, in the list of past runs,
     * and a list of what is GOING to happen must not fill up with things that already have.
     */
    @Test
    fun `a one-off that started something is over`() {
        val due = monday(9).toInstant().toEpochMilli()
        val armed = ScheduleClock.armed(schedule(at(9), nextAt = due), firedAt = due, zone = zone)

        assertEquals(0, armed.nextAt)
        assertNull(ScheduleClock.settled(armed, due = due, firedAt = due, ran = true))
    }

    /**
     * A one-off that was REFUSED stays, because then there is no run: this row is the only place the
     * morning can say the hour came and nothing happened.
     */
    @Test
    fun `a one-off that was refused keeps its row and says it was missed`() {
        val due = monday(9).toInstant().toEpochMilli()
        val armed = ScheduleClock.armed(schedule(at(9), nextAt = due), firedAt = due, zone = zone)
        val settled = ScheduleClock.settled(armed, due = due, firedAt = due + 200, ran = false)

        assertNotNull(settled)
        assertEquals(0, settled.nextAt)
        assertEquals(due, settled.missedAt)
        assertEquals(0, settled.lastAt)
    }

    /**
     * The moment written down as missed is the one that was DUE, not the one the record holds now.
     *
     * Read off the record, this would say "missed tomorrow at nine": by the time an outcome is known the
     * next hour has already been claimed.
     */
    @Test
    fun `a missed hour is written down against the hour that passed`() {
        val due = monday(9).toInstant().toEpochMilli()
        val now = monday(15).toInstant().toEpochMilli()
        val armed = ScheduleClock.armed(schedule(at(9), ScenarioSchedule.DAILY, nextAt = due), firedAt = now, zone = zone)
        val settled = ScheduleClock.settled(armed, due = due, firedAt = now, ran = false)

        assertNotNull(settled)
        assertEquals(due, settled.missedAt)
        assertEquals(0, settled.lastAt)
        assertEquals(monday(9).plusDays(1), whenIs(settled.nextAt))
    }

    /**
     * A morning that worked wipes the memory of one that did not, and that is what "missed" has to mean.
     *
     * The mark is drawn INSTEAD of the next hour, and it is taken across every arrangement a scenario has -
     * so one Tuesday nobody was here for hid the coming hour on that scenario's row for months, while it
     * ran perfectly every single morning. Kept for ever, the word stops meaning "recently did not happen"
     * and starts meaning "once, at some point", which is not worth a line on a row that has only one.
     */
    @Test
    fun `an hour that started something forgets the one that did not`() {
        val missed = monday(9).toInstant().toEpochMilli()
        val due = monday(9).plusDays(1).toInstant().toEpochMilli()
        val schedule = schedule(at(9), ScenarioSchedule.DAILY, nextAt = due).copy(missedAt = missed)
        val armed = ScheduleClock.armed(schedule, firedAt = due, zone = zone)
        val settled = ScheduleClock.settled(armed, due = due, firedAt = due, ran = true)

        assertNotNull(settled)
        assertEquals(0, settled.missedAt)
        assertEquals(due, settled.lastAt)
    }

    /** And a morning that did not work says so about ITSELF, not about the one before it. */
    @Test
    fun `an hour that was refused again names the hour that just passed`() {
        val older = monday(9).toInstant().toEpochMilli()
        val due = monday(9).plusDays(1).toInstant().toEpochMilli()
        val schedule = schedule(at(9), ScenarioSchedule.DAILY, nextAt = due).copy(missedAt = older)
        val armed = ScheduleClock.armed(schedule, firedAt = due, zone = zone)
        val settled = ScheduleClock.settled(armed, due = due, firedAt = due, ran = false)

        assertNotNull(settled)
        assertEquals(due, settled.missedAt)
    }
}

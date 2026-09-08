package io.github.crmapache.amazingclaudecode.scenario

import java.time.LocalDateTime
import java.time.ZoneId
import java.time.ZonedDateTime
import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertFalse
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

    @Test
    fun `a daily hour moves to tomorrow once it has fired`() {
        val due = monday(9).toInstant().toEpochMilli()
        val fired = ScheduleClock.after(
            schedule(at(9), ScenarioSchedule.DAILY, nextAt = due),
            firedAt = due + 500,
            ran = true,
            zone = zone,
        )

        assertEquals(monday(9).plusDays(1), whenIs(fired.nextAt))
        assertEquals(due + 500, fired.lastAt)
        assertEquals(0, fired.missedAt)
    }

    /**
     * A one-off keeps the hour it was set for rather than disappearing: the row still has to be able to
     * say what happened at nine, and there is nothing left to say it with once the record is gone.
     */
    @Test
    fun `a one-off has nothing due after it fires`() {
        val due = monday(9).toInstant().toEpochMilli()
        val fired = ScheduleClock.after(schedule(at(9), nextAt = due), firedAt = due, ran = true, zone = zone)

        assertEquals(0, fired.nextAt)
        assertEquals(due, fired.lastAt)
    }

    /** An hour nobody was here for is remembered as missed, and the rhythm carries on to the next one. */
    @Test
    fun `a missed hour is written down and the next one is set`() {
        val due = monday(9).toInstant().toEpochMilli()
        val now = monday(15).toInstant().toEpochMilli()
        val moved = ScheduleClock.after(
            schedule(at(9), ScenarioSchedule.DAILY, nextAt = due),
            firedAt = now,
            ran = false,
            zone = zone,
        )

        assertEquals(due, moved.missedAt)
        assertEquals(0, moved.lastAt)
        assertEquals(monday(9).plusDays(1), whenIs(moved.nextAt))
    }
}

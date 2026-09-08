package io.github.crmapache.amazingclaudecode.scenario

import java.time.DayOfWeek
import java.time.ZoneId
import java.time.ZonedDateTime
import kotlinx.serialization.Serializable

/**
 * A scenario set to start by itself at a time somebody chose.
 *
 * The whole point of writing a round of work down is that it is the same every time - and a thing that is
 * the same every morning is a thing nobody wants to press a button for. So a scenario can be given an
 * hour and a rhythm, and the panel starts it.
 *
 * Kept on the machine rather than in the scenario's file (see ScheduleStore), and the reason is who a
 * schedule belongs to. The round of work is worth sharing through the repository; "at nine, on my
 * machine, with this branch in the question" is one person's arrangement with their own working day, and
 * arriving in a colleague's checkout it would start agents in their working copy at nine in their
 * morning.
 */
@Serializable
internal data class ScenarioSchedule(
    val scenarioId: String = "",
    val scope: String = ScenarioScope.PROJECT,
    /** Minutes from midnight, in the machine's own timezone: 9:30 is 570. */
    val at: Int = 0,
    val repeat: String = ONCE,
    /** For [WEEKLY] only: the day, as java.time numbers them - Monday is 1, Sunday is 7. */
    val weekday: Int = 1,
    /**
     * The answers to the scenario's own questions, given when the schedule was made.
     *
     * Kept with it because a run cannot start without them and there is nobody at the keyboard when the
     * hour comes: a schedule without them would be an alarm that rings and then asks a question of an
     * empty chair.
     */
    val inputs: Map<String, String> = emptyMap(),
    /** When this is next due, in epoch millis - worked out on this side so nobody else has to. */
    val nextAt: Long = 0,
    /** When it last started something. */
    val lastAt: Long = 0,
    /**
     * When it was due and nothing happened - the IDE was closed, the machine asleep, or a run of this
     * project was already going.
     *
     * Nothing is ever started late. A round of work that edits files, raised hours after its hour by the
     * mere fact that somebody opened the IDE, is a surprise nobody asked for; so the panel says out loud
     * that the hour passed and leaves the button where it was.
     */
    val missedAt: Long = 0,
) {
    internal companion object {
        const val ONCE = "once"
        const val DAILY = "daily"
        const val WEEKDAYS = "weekdays"
        const val WEEKLY = "weekly"

        val REPEATS = setOf(ONCE, DAILY, WEEKDAYS, WEEKLY)

        fun normalizeRepeat(raw: String): String = if (raw in REPEATS) raw else ONCE
    }
}

/**
 * When a schedule is next due, and whether an hour that has passed still counts.
 *
 * A separate object with a test because it is the part that breaks silently: a run that never starts and
 * a run that starts twice both look, on the morning after, exactly like a plugin that was not running.
 */
internal object ScheduleClock {

    /**
     * How late a due time may be found and still be run.
     *
     * The panel looks every half a minute, so anything within a few minutes means the IDE was here and
     * merely busy - a laptop that woke up, a beat that took its time. Beyond that the machine was away
     * for the hour, and the hour is gone (see [ScenarioSchedule.missedAt]).
     */
    const val GRACE_MS = 5 * 60 * 1000L

    /** The next moment this schedule is due, strictly after [from]. */
    fun next(schedule: ScenarioSchedule, from: ZonedDateTime): Long {
        val minutes = schedule.at.coerceIn(0, 24 * 60 - 1)
        val today = from.toLocalDate().atStartOfDay(from.zone).plusMinutes(minutes.toLong())
        val first = if (today.isAfter(from)) today else today.plusDays(1)

        return when (ScenarioSchedule.normalizeRepeat(schedule.repeat)) {
            ScenarioSchedule.ONCE, ScenarioSchedule.DAILY -> first
            ScenarioSchedule.WEEKDAYS -> first.let { start ->
                // Saturday and Sunday are not working mornings; the next one is Monday's.
                var day = start
                while (day.dayOfWeek == DayOfWeek.SATURDAY || day.dayOfWeek == DayOfWeek.SUNDAY) {
                    day = day.plusDays(1)
                }
                day
            }
            else -> first.let { start ->
                val wanted = DayOfWeek.of(schedule.weekday.coerceIn(1, 7))
                var day = start
                while (day.dayOfWeek != wanted) day = day.plusDays(1)
                day
            }
        }.toInstant().toEpochMilli()
    }

    /** The same, from a moment in epoch millis. */
    fun next(schedule: ScenarioSchedule, fromMillis: Long, zone: ZoneId = ZoneId.systemDefault()): Long =
        next(schedule, java.time.Instant.ofEpochMilli(fromMillis).atZone(zone))

    /** Whether the hour has come and is still fresh enough to act on. */
    fun due(schedule: ScenarioSchedule, now: Long): Boolean =
        schedule.nextAt in (now - GRACE_MS)..now

    /** Whether the hour came and went while nobody was here. */
    fun missed(schedule: ScenarioSchedule, now: Long): Boolean =
        schedule.nextAt in 1 until (now - GRACE_MS)

    /**
     * What a schedule becomes once its moment has been dealt with, one way or the other.
     *
     * A one-off is not deleted when it fires: it keeps the hour it was set for, with nothing due after it,
     * so the row can still say what happened and why nothing is coming. Deleting it would take away the
     * only place the panel could put "this ran at nine" or "this was missed at nine".
     */
    fun after(schedule: ScenarioSchedule, firedAt: Long, ran: Boolean, zone: ZoneId = ZoneId.systemDefault()): ScenarioSchedule {
        val due = schedule.nextAt
        val moved = schedule.copy(
            lastAt = if (ran) firedAt else schedule.lastAt,
            missedAt = if (ran) schedule.missedAt else due,
        )

        return if (ScenarioSchedule.normalizeRepeat(schedule.repeat) == ScenarioSchedule.ONCE) {
            moved.copy(nextAt = 0)
        } else {
            moved.copy(nextAt = next(moved, maxOf(firedAt, due), zone))
        }
    }
}

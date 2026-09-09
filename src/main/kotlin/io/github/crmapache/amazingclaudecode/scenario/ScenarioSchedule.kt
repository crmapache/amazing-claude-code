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
 * A scenario may have as many of these as somebody wants, and that is why [id] exists. Before it, a
 * schedule was known by the scenario it belonged to, which made "another hour for the same round of work"
 * unsayable: the second one replaced the first. What is stored now is a list of arrangements, each with a
 * name of its own, each editable and removable on its own, drawn as a list of its own under the shelves.
 *
 * Kept on the machine rather than in the scenario's file (see ScheduleStore), and the reason is who a
 * schedule belongs to. The round of work is worth sharing through the repository; "at nine, on my
 * machine, with this branch" is one person's arrangement with their own working day, and arriving in a
 * colleague's checkout it would start agents in their working copy at nine in their morning.
 */
@Serializable
internal data class ScenarioSchedule(
    /**
     * This arrangement's own name, and the only thing that tells two hours of one scenario apart.
     *
     * Defaulted to empty on purpose: a file written before this field existed has to read, and what fills
     * it in afterwards is [Schedules.identify], deterministically, so that two IDE windows on one project
     * arrive at the same answer without either of them writing.
     */
    val id: String = "",
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
     * empty chair. They are also what tells two arrangements of one scenario apart on the screen, which
     * is why the row draws them.
     */
    val inputs: Map<String, String> = emptyMap(),
    /**
     * When this is next due, in epoch millis - worked out on this side so nobody else has to.
     *
     * Zero means nothing is coming: a one-off whose hour has passed without starting anything. A one-off
     * that DID start something is not here at all any more - see [ScheduleClock.settled].
     */
    val nextAt: Long = 0,
    /** When it last started something. */
    val lastAt: Long = 0,
    /**
     * When it was due and nothing happened - the IDE was closed, the machine asleep, the CLI missing, or
     * a run this same arrangement started was still going.
     *
     * Nothing is ever started late. A round of work that edits files, raised hours after its hour by the
     * mere fact that somebody opened the IDE, is a surprise nobody asked for; so the panel says out loud
     * that the hour passed and leaves the button where it was.
     *
     * Cleared by the next hour that DOES start something (see [ScheduleClock.settled]): the word means
     * "recently did not happen", and the row it is drawn on has one line, which it takes from the hour
     * that is coming.
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
 * When a schedule is next due, and what it becomes once its moment has been dealt with.
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
     * The schedule with its next hour moved on - the hour it was standing on is now TAKEN.
     *
     * Split from [settled] because the two happen at different moments and the order matters. Moving the
     * hour is a claim on it and has to be written BEFORE anything is started: the clock ticks twice a
     * minute while a due hour stays due for five (see [GRACE_MS]), and until this side snapped the refusal
     * "a run is already going" was what quietly kept a beat from raising a second one. Writing the outcome,
     * on the other hand, can only happen after the launch has been tried, which is seconds of disk and of
     * processes coming up.
     *
     * A one-off is left with nothing coming; the rest get their next hour worked out from the one taken.
     */
    fun armed(schedule: ScenarioSchedule, firedAt: Long, zone: ZoneId = ZoneId.systemDefault()): ScenarioSchedule {
        val due = schedule.nextAt

        return if (ScenarioSchedule.normalizeRepeat(schedule.repeat) == ScenarioSchedule.ONCE) {
            schedule.copy(nextAt = 0)
        } else {
            schedule.copy(nextAt = next(schedule, maxOf(firedAt, due), zone))
        }
    }

    /**
     * What became of the hour, written onto a schedule whose next moment has already been moved.
     *
     * `due` is passed in rather than read off the record, and that is the whole reason this is a second
     * function: by now [armed] has replaced `nextAt`, so the record no longer remembers which moment this
     * is about. Read from the record, a refusal would mark a schedule as missed at zero (no trace at all)
     * or at tomorrow's hour (a miss in the future).
     *
     * Null means the arrangement is over and should be forgotten: a one-off that actually started
     * something. Its trace is the run itself, which stands in the list of past runs with everything the
     * schedule could have said and more - whereas a list of what is GOING to happen, filling up with
     * things that already have, stops being readable by the second week. A one-off that was REFUSED is
     * kept, because then there is no run and this row is the only place the morning can say so.
     */
    fun settled(schedule: ScenarioSchedule, due: Long, firedAt: Long, ran: Boolean): ScenarioSchedule? {
        if (ran && ScenarioSchedule.normalizeRepeat(schedule.repeat) == ScenarioSchedule.ONCE) return null

        return schedule.copy(
            lastAt = if (ran) firedAt else schedule.lastAt,
            // A morning that worked forgets one that did not. The mark is drawn INSTEAD of the coming hour
            // and is taken across every arrangement a scenario has, so one Tuesday nobody was here for hid
            // the next run on that row for months while it ran perfectly every single morning. Kept for
            // ever, "missed" stops meaning "recently did not happen" and is not worth the only line a row
            // has; the night it does describe is in the run beneath it either way.
            missedAt = if (ran) 0 else due,
        )
    }
}

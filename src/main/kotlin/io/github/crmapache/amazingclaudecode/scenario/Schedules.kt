package io.github.crmapache.amazingclaudecode.scenario

import io.github.crmapache.amazingclaudecode.feedback.ShortHash

/**
 * The arithmetic of the list of scheduled runs, away from the file it is kept in.
 *
 * Here rather than inside ScheduleStore for the reason ScheduleClock and ScenarioRules are where they
 * are: the store writes into somebody's real Claude folder, so it cannot be exercised, and every rule
 * below fails silently. A schedule that quietly stopped being editable, one that came back after being
 * deleted, one that two windows disagree about - each of those looks, the morning after, exactly like a
 * plugin that was not running.
 */
internal object Schedules {

    /**
     * Give a name to every arrangement that has none, and give the SAME name every time.
     *
     * Schedules written before they could be told apart carry no identifier, and until they have one the
     * list cannot be edited at all: a save names a record that is not found and adds a second alarm, a
     * delete names a record that is not found and does nothing while the hour keeps coming round.
     *
     * Worked out from what the arrangement says rather than handed out fresh, and that is the whole of it.
     * The file belongs to a project, not to a window, and two IDEs open on one repository read it
     * independently: fresh identifiers would give each of them its own answer, and whichever wrote last
     * would leave the other pointing at records that no longer exist. A digest of the fields costs nothing,
     * needs no write at all, and both windows arrive at it alone.
     *
     * Called from inside the store's own reading, so that everything above and below it - the list on the
     * screen, a save, a delete, the clock - is looking at the same named records.
     */
    fun identify(list: List<ScenarioSchedule>): List<ScenarioSchedule> {
        if (list.none { it.id.isBlank() }) return list

        val taken = list.mapNotNull { it.id.ifBlank { null } }.toMutableSet()

        return list.map { schedule ->
            if (schedule.id.isNotBlank()) return@map schedule

            val seed = listOf(
                schedule.scenarioId,
                schedule.scope,
                schedule.at.toString(),
                ScenarioSchedule.normalizeRepeat(schedule.repeat),
                schedule.weekday.toString(),
            ).joinToString(" ")

            // Two arrangements that say exactly the same thing are possible, and both still need a name of
            // their own; the suffix keeps them apart without making either of them depend on the clock.
            var id = ShortHash.of(seed, length = 16)
            var attempt = 1
            while (id in taken) {
                id = ShortHash.of("$seed $attempt", length = 16)
                attempt += 1
            }

            taken += id
            schedule.copy(id = id)
        }
    }

    /**
     * Store one arrangement: replace the one it names, or add it.
     *
     * An identifier that names nothing becomes a NEW record with a new identifier of this side's making,
     * rather than the one that arrived. Both halves of that matter. It has to be a new record because the
     * form on the screen may have been open while the arrangement behind it was deleted in another window,
     * and answering a save with silence loses what somebody just typed. It has to be this side's
     * identifier because the name of a stored thing is not a page's to choose.
     */
    fun put(list: List<ScenarioSchedule>, schedule: ScenarioSchedule): List<ScenarioSchedule> {
        val at = list.indexOfFirst { it.id.isNotBlank() && it.id == schedule.id }
        if (at >= 0) return list.toMutableList().also { it[at] = schedule.copy(id = list[at].id) }

        return list + schedule.copy(id = ScenarioStore.newId())
    }

    fun remove(list: List<ScenarioSchedule>, id: String): List<ScenarioSchedule> =
        if (id.isBlank()) list else list.filterNot { it.id == id }

    /**
     * Take the hour this arrangement is standing on, and refuse if somebody else already has.
     *
     * The claim is the whole of the locking now that two runs may go at once. `expected` is the moment the
     * clock believed was due; the arrangement on disk is only moved on if it still says the same thing.
     * Everything else follows from that: a beat that ran twice, a tick that took ten seconds to raise its
     * processes, and - the one no in-memory check can see - the second IDE window open on the same
     * repository, ticking on its own timer against the same file.
     *
     * Null means the hour was not this caller's to take.
     */
    fun claimHour(
        list: List<ScenarioSchedule>,
        id: String,
        expected: Long,
        armed: ScenarioSchedule,
    ): List<ScenarioSchedule>? {
        val at = list.indexOfFirst { it.id.isNotBlank() && it.id == id }
        if (at < 0) return null
        if (list[at].nextAt != expected) return null

        return list.toMutableList().also { it[at] = it[at].copy(nextAt = armed.nextAt) }
    }

    /**
     * Write what became of an hour onto whatever the record says NOW.
     *
     * Only this function's own three fields are laid over the stored record, never a copy of the one the
     * clock read. The clock reads the list at the top of a tick and writes at the bottom of it, and
     * between the two are the disk, a process coming up and, when several hours ripen together, other
     * launches - tens of seconds in which somebody can move this very arrangement to another time.
     * Writing back the copy would put the old time back, silently, every morning.
     *
     * A record that is gone stays gone, and one the clock says is finished with is removed.
     */
    fun settle(
        list: List<ScenarioSchedule>,
        id: String,
        due: Long,
        firedAt: Long,
        ran: Boolean,
    ): List<ScenarioSchedule> {
        val at = list.indexOfFirst { it.id.isNotBlank() && it.id == id }
        if (at < 0) return list

        val settled = ScheduleClock.settled(list[at], due = due, firedAt = firedAt, ran = ran)
            ?: return list.filterIndexed { index, _ -> index != at }

        return list.toMutableList().also { it[at] = settled }
    }

    /**
     * Drop the arrangements whose scenario is gone, and follow the ones whose scenario has moved shelf.
     *
     * Matched by the scenario's identifier rather than by identifier-and-shelf, because moving a scenario
     * from the repository to one's own folder is an ordinary thing the editor does - it rewrites the file
     * on the other shelf - and by the old rule that quietly took every hour set for it. With one schedule
     * per scenario that was one loss; with a list of them it is a morning's worth of times and answers
     * somebody typed in by hand.
     *
     * `project` and `user` are what each shelf actually said, and null means the shelf could not be
     * looked at - a branch checked out without a `.claude/scenarios` folder in it, a network share that
     * did not answer. Nothing is dropped then. Read as "no scenarios", an unreadable shelf empties the
     * whole file, and the schedules do not come back when the branch does.
     */
    fun keepOnly(
        list: List<ScenarioSchedule>,
        project: List<Scenario>?,
        user: List<Scenario>?,
    ): List<ScenarioSchedule> {
        val seen = (project.orEmpty() + user.orEmpty()).groupBy { it.id }

        return list.mapNotNull { schedule ->
            val found = seen[schedule.scenarioId].orEmpty()

            when {
                // The one place a shelf move is followed. With two scenarios answering to one identifier -
                // a project file that came back with a git checkout beside somebody's own copy - there is
                // no answer to "which one is it now", so the arrangement keeps the shelf it was given.
                found.size == 1 -> schedule.copy(scope = found.first().scope)
                found.isNotEmpty() -> schedule
                // Gone from a shelf nobody could read is not gone.
                project == null || user == null -> schedule
                else -> null
            }
        }
    }
}

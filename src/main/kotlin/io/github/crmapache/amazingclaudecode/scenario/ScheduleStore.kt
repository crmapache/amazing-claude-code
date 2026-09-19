package io.github.crmapache.amazingclaudecode.scenario

import com.intellij.openapi.diagnostic.thisLogger
import java.io.File
import kotlinx.serialization.json.Json

/**
 * The hours this project's scenarios are set to start at, kept on the machine beside the runs.
 *
 * Not in the repository, and that is the whole of the placing (see ScenarioSchedule): the round of work
 * is shared, the arrangement with somebody's own morning is not. Beside the runs rather than beside the
 * scenarios for the same reason - both are facts about what this machine does, and both are keyed by a
 * hash of the project's path rather than by the path itself.
 *
 * One file for all of them, and a LIST rather than one hour per scenario: a round of work is the same
 * every time and the thing that differs is when it runs and against what, so three arrangements of one
 * scenario is the ordinary case rather than the odd one. What each of them is called, and how the list is
 * added to, edited and pruned, is Schedules - this only reads and writes the file around it.
 */
internal class ScheduleStore(private val store: ScenarioFile) {

    /** The ordinary way in: the file this machine keeps a project's hours in. */
    constructor(workingDirectory: String?) : this(ScenarioFile.of(FOLDER, workingDirectory, FILE))

    /** For the tests, which need a file of their own rather than this person's real one. */
    constructor(file: File) : this(ScenarioFile(file))

    private val json = Json { ignoreUnknownKeys = true; encodeDefaults = true }

    /**
     * What the file says, or null when it could not be read at all.
     *
     * The two are not the same sentence and never were, which is the whole reason this answer is nullable
     * all the way up to the screen. A file half written by an older build, or written by a newer one, read
     * as "there is nothing here" empties the list a person made - on the screen, silently - and they set
     * every morning up again while the arrangements sit unharmed on the disk.
     */
    fun stored(): List<ScenarioSchedule>? = underLock { read() }

    /** The hours to act on: an unreadable file starts nothing, which is the safe half of not knowing. */
    fun all(): List<ScenarioSchedule> = stored().orEmpty()

    /** Whether the arrangement was stored - false for a file that could not be read or a write that failed. */
    fun put(schedule: ScenarioSchedule): Boolean = edited { Schedules.put(it, schedule) }

    /** The same for taking one back: false means the alarm is still there and will still ring. */
    fun remove(id: String): Boolean = edited { Schedules.remove(it, id) }

    /**
     * A scenario that is gone takes its hours with it - an alarm for nothing rings for ever otherwise.
     *
     * Both shelves are passed in as they were actually read, null for one nobody could look at, because
     * the decision here is destructive and "no scenarios" and "no answer" are not the same sentence (see
     * Schedules.keepOnly).
     */
    fun keepOnly(project: List<Scenario>?, user: List<Scenario>?): List<ScenarioSchedule>? =
        change { Schedules.keepOnly(it, project, user) }

    /**
     * Take the hour, or answer null because it was not this caller's to take.
     *
     * Null for all three ways that happens: the file could not be read, the record moved on under us (see
     * Schedules.claimHour), and - the one that used to pass for success - the new moment never reached the
     * disk. The claim is the ONLY gate before a round of work is raised, and a claim that lies leaves the
     * old moment lying there for the next beat half a minute later to take again, inside the same grace
     * window: two rounds of work editing one working copy, with nothing on any screen to say why.
     */
    fun claimHour(id: String, expected: Long, armed: ScenarioSchedule): List<ScenarioSchedule>? =
        underLock {
            val current = read() ?: return@underLock null
            val claimed = Schedules.claimHour(current, id, expected, armed) ?: return@underLock null
            if (write(claimed)) claimed else null
        }

    fun settle(id: String, due: Long, firedAt: Long, ran: Boolean): List<ScenarioSchedule>? =
        change { Schedules.settle(it, id, due = due, firedAt = firedAt, ran = ran) }

    /**
     * Read, change, write - and never write at all if the reading failed.
     *
     * The distinction is the whole of it. Before, an unreadable file answered with an empty list like any
     * other, and the first thing anybody did with that list was prune it against the scenarios on disk and
     * write it back: one file written by a newer build, or half-written when the power went, and every
     * arrangement somebody had made was gone for good, without a word on any screen.
     *
     * A change that changed nothing is not written either - the pruning runs on every look at the shelves,
     * and it usually has nothing to do. Compared whole rather than by length: a scenario that moved shelf
     * leaves the list exactly as long as it was, and that correction has to reach the disk or the clock
     * goes on looking for it where it no longer is.
     */
    private fun change(edit: (List<ScenarioSchedule>) -> List<ScenarioSchedule>): List<ScenarioSchedule>? =
        underLock {
            val current = read() ?: return@underLock null
            val wanted = edit(current)
            // What the disk actually says, never what was wanted: a save that did not land, answered with
            // the wanted list, sits on the screen looking done until somebody reopens the panel.
            if (wanted == current || !write(wanted)) current else wanted
        }

    /**
     * The same, answering only whether the change was made and reached the disk.
     *
     * Apart from [change] because the two failures matter to different people. A pruning that could not be
     * written is nobody's business - the list on the screen is still what the disk says. A schedule that
     * somebody typed in and that did not land has to be said out loud, or the row is drawn, then vanishes
     * at the next look, and the panel appears to have forgotten it on purpose.
     */
    private fun edited(edit: (List<ScenarioSchedule>) -> List<ScenarioSchedule>): Boolean =
        underLock {
            val current = read() ?: return@underLock false
            val wanted = edit(current)
            wanted == current || write(wanted)
        }

    /**
     * What the file says, with every arrangement named - or null when it could not be read at all.
     *
     * The naming happens here, at the single door, rather than on the way to the screen. Anywhere else and
     * the list going out would be named while the list a save or a delete works against would not: saving
     * an edited arrangement would add a second one, and deleting it would do nothing at all while its hour
     * went on coming round (see Schedules.identify).
     */
    private fun read(): List<ScenarioSchedule>? {
        // A file that is not there is an empty list; one that could not be read is not (see
        // ScenarioFile.Stored), and everything below depends on the difference.
        val text = when (val stored = store.read()) {
            ScenarioFile.Stored.Missing -> return emptyList()
            ScenarioFile.Stored.Unreadable -> return null
            is ScenarioFile.Stored.Text -> stored.text
        }

        val stored = runCatching { json.decodeFromString<List<ScenarioSchedule>>(text) }
            .onFailure { thisLogger().warn("Could not read the scenario schedules", it) }
            .getOrNull() ?: return null

        val named = Schedules.identify(stored)

        /*
         * The names go onto the disk the first time they are handed out, and then they are simply names.
         *
         * Worked out rather than stored, a name depends on the record's place among its twins: two
         * arrangements that say exactly the same thing are told apart by which comes first, and the one
         * that outlives its neighbour would answer to the neighbour's name. It happens not to bite today
         * only because every change writes the whole named list back - which is a property nobody is
         * keeping on purpose. Written once, it stops being a property at all.
         */
        if (named != stored) write(named)

        return named
    }

    /** The atomic write and the lock across windows are the file's own - see ScenarioFile. */
    private fun write(schedules: List<ScenarioSchedule>): Boolean = store.put(json.encodeToString(schedules))

    private fun <T> underLock(work: () -> T): T = store.underLock(work)

    private companion object {
        const val FILE = "schedules.json"

        /** Where on this machine a project's hours are kept - see ScenarioFile.of. */
        const val FOLDER = "scenario-schedules"
    }
}

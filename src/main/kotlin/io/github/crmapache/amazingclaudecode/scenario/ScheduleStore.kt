package io.github.crmapache.amazingclaudecode.scenario

import com.intellij.openapi.diagnostic.thisLogger
import io.github.crmapache.amazingclaudecode.feedback.ShortHash
import java.io.File
import java.nio.channels.FileChannel
import java.nio.channels.FileLock
import java.nio.file.Files
import java.nio.file.StandardCopyOption
import java.nio.file.StandardOpenOption
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
internal class ScheduleStore(private val file: File) {

    /** The ordinary way in: the file this machine keeps a project's hours in. */
    constructor(workingDirectory: String?) : this(fileFor(workingDirectory))

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
        if (!file.exists()) return emptyList()

        // A file of no length is damage rather than an empty list: this side never writes one (see [write]),
        // so one that is there was left by something going wrong, and reading it as "no arrangements" is the
        // very mistake this answer exists to avoid.
        val stored = runCatching { json.decodeFromString<List<ScenarioSchedule>>(file.readText()) }
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

    /**
     * Put the list on the disk, and say whether it got there.
     *
     * Beside the file and then moved onto it, rather than written over it. A write straight over the file
     * is readable garbage for as long as it takes - and the power going, or the IDE being killed, in that
     * window leaves a half list that reads as no list at all (see [read]). The move is one step for
     * anybody else looking, so a reader either sees yesterday's list or today's and never half of either.
     *
     * The answer is a boolean because the caller above has to be able to fail. A full disk and a folder
     * that turned read-only are ordinary, and a write that quietly reports success is worse than one that
     * fails loudly: everything upstream believes the arrangement was stored.
     */
    private fun write(schedules: List<ScenarioSchedule>): Boolean =
        runCatching {
            file.parentFile?.mkdirs()
            val beside = File(file.parentFile, "${file.name}$PART")
            beside.writeText(json.encodeToString(schedules))
            runCatching {
                Files.move(
                    beside.toPath(),
                    file.toPath(),
                    StandardCopyOption.ATOMIC_MOVE,
                    StandardCopyOption.REPLACE_EXISTING,
                )
            }.recover {
                // Not every filesystem promises an atomic move; a plain replace is still better than
                // writing through the file itself, which cannot even be attempted here.
                Files.move(beside.toPath(), file.toPath(), StandardCopyOption.REPLACE_EXISTING)
            }.getOrThrow()
        }.onFailure { thisLogger().warn("Could not write the scenario schedules", it) }.isSuccess

    /**
     * Held while the file is read and written - by every window on this machine, not just this one.
     *
     * Two locks because there are two kinds of neighbour. [GATE] keeps this JVM's own threads apart and,
     * being one object for every store, keeps two instances of this class off one file: a second lock
     * request on a file this process already holds is an error rather than a wait.
     *
     * The lock FILE is the one that matters, and it is what the promise about a second IDE window rests
     * on. Read-modify-write across two processes is not made safe by comparing what was read - both read
     * the same old moment, both find it still due, both write and both raise a round of work in one
     * working copy. A lock of its own rather than a lock on the list: on POSIX a lock is released by
     * closing ANY descriptor for that file, so writing the list would drop the lock on the list halfway
     * through the work it is guarding.
     *
     * A filesystem that will not lock (some network shares) is not a reason to refuse the work: the
     * arrangement is done unlocked, which is exactly where this stood before.
     */
    private fun <T> underLock(work: () -> T): T = synchronized(GATE) {
        val channel = runCatching {
            file.parentFile?.mkdirs()
            FileChannel.open(
                File(file.parentFile, "${file.name}$LOCK").toPath(),
                StandardOpenOption.CREATE,
                StandardOpenOption.WRITE,
            )
        }.getOrNull() ?: return@synchronized work()

        channel.use {
            val held = waitedFor(it)
            try {
                work()
            } finally {
                runCatching { held?.release() }
            }
        }
    }

    /**
     * The lock, or null after a short wait - and then the work is done without it.
     *
     * Asked for rather than waited on, because the caller is whoever brought the message: the thread of
     * the relay, or the one a panel is talking on. A share that went away mid-write, or another window
     * stopped in a debugger, would hold this for as long as it liked, and everything behind that thread
     * would stand with it - a whole line of conversations paying for one file.
     *
     * Giving up leaves exactly what there was before any of this: an unlocked read-modify-write, whose
     * worst case is a scheduled run raised twice. Standing here for ever has no best case at all.
     */
    private fun waitedFor(channel: FileChannel): FileLock? {
        val until = System.currentTimeMillis() + WAIT_MS

        do {
            val held = runCatching { channel.tryLock() }.getOrNull()
            if (held != null) return held
            runCatching { Thread.sleep(WAIT_STEP_MS) }.onFailure { return null }
        } while (System.currentTimeMillis() < until)

        return null
    }

    private companion object {
        const val FILE = "schedules.json"

        /** Beside the list while it is being written, and moved onto it when it is whole. */
        const val PART = ".part"

        /** The thing the windows actually take turns on - never the list itself, see [underLock]. */
        const val LOCK = ".lock"

        /** How long a window waits for its turn before going on without one - see [waitedFor]. */
        const val WAIT_MS = 2_000L

        const val WAIT_STEP_MS = 20L

        /** One for every store in this process: see [underLock]. */
        val GATE = Any()

        private fun fileFor(workingDirectory: String?): File =
            File(
                File(File(File(System.getProperty("user.home"), ".amazing-claude-code"), "scenario-schedules"), key(workingDirectory)),
                FILE,
            )

        private fun key(workingDirectory: String?): String =
            if (workingDirectory.isNullOrBlank()) "unknown" else ShortHash.of(workingDirectory, length = 16)
    }
}

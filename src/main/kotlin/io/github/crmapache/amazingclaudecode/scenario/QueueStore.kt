package io.github.crmapache.amazingclaudecode.scenario

import com.intellij.openapi.diagnostic.thisLogger
import java.io.File
import kotlinx.serialization.json.Json

/**
 * The queue of this project, kept on the machine beside the hours and the runs.
 *
 * Not in the repository, for the schedules' reason (see ScheduleStore): the round of work is worth
 * sharing, "these three, tonight, on my checkout" is one person's arrangement with one working copy.
 *
 * The queue survives the IDE being closed, and that is deliberate. Somebody puts three rounds of work on
 * it in the evening; an update, a crash or a reboot in the middle of the night must not be the end of the
 * night's work. What it does NOT survive is a run cut off by that closing - the next turn finds an ending
 * nobody can vouch for and stops, which is the safe way round (see QueueRules.step).
 *
 * What the list means - who is next, what a failure does to it, which turns a deleted scenario takes with
 * it - is QueueRules, where it can be exercised. This reads and writes the file around it.
 */
internal class QueueStore(private val store: ScenarioFile) {

    /** The ordinary way in: the file this machine keeps a project's queue in. */
    constructor(workingDirectory: String?) : this(ScenarioFile.of(FOLDER, workingDirectory, FILE))

    /** For the tests, which need a file of their own rather than this person's real one. */
    constructor(file: File) : this(ScenarioFile(file))

    private val json = Json { ignoreUnknownKeys = true; encodeDefaults = true }

    /**
     * What the file says, or null when it could not be read at all.
     *
     * Nullable all the way to the screen for the schedules' reason: read as an empty queue, an unreadable
     * file would be written back empty by the first thing that prunes it, and a night of work somebody
     * lined up would be gone with nothing said anywhere.
     */
    fun stored(): ScenarioQueue? = store.underLock { read() }

    /** The queue to act on: an unreadable file starts nothing, which is the safe half of not knowing. */
    fun all(): ScenarioQueue = stored() ?: ScenarioQueue()

    /** Change it, and say whether the change reached the disk. */
    fun edit(change: (ScenarioQueue) -> ScenarioQueue): Boolean =
        store.underLock {
            val current = read() ?: return@underLock false
            val wanted = change(current)
            wanted == current || write(wanted)
        }

    /**
     * Drop the turns whose scenario is gone, and follow the ones whose scenario moved shelf.
     *
     * Both shelves are passed in as they were actually read, null for one nobody could look at, because
     * the decision is destructive and "no scenarios" and "no answer" are not the same sentence (see
     * QueueRules.keepOnly). The answer is what the disk says now, so the screen never shows a pruning that
     * did not land.
     */
    fun keepOnly(project: List<Scenario>?, user: List<Scenario>?): ScenarioQueue? =
        store.underLock {
            val current = read() ?: return@underLock null
            val wanted = QueueRules.keepOnly(current, project, user)
            if (wanted == current || !write(wanted)) current else wanted
        }

    /**
     * Take the next turn, under the lock, and hand back what to do with it.
     *
     * This is the whole of the safety. Everything the queue decides is read-modify-write against a file
     * two IDE windows share, and the window that takes a turn has to have WRITTEN that it took it before a
     * single process comes up - otherwise the other window's next beat finds the same turn still waiting
     * and raises it as well, which is two sets of agents in one working copy with nothing on any screen to
     * say why.
     *
     * [ahead] works out what lies in front of the queue - how the run it stands behind turned out, and
     * what else is going - and only the caller can do that, since only the caller can see both the live
     * runs and the disk. It is a FUNCTION rather than an answer, and that is the whole of the locking
     * working: worked out before the lock, it would describe the queue as it was read a moment earlier,
     * and the ordinary way two IDE windows race is for the other one to take a turn in exactly that gap -
     * this window would then hand a verdict about a run that finished ("done") to a queue whose current
     * run has only just started, and raise a second set of agents in one working copy. Asked here, it is
     * asked about the queue the decision is made on.
     *
     * [runId] is the name the next run will be given - see QueueRules.step for why it is handed in rather
     * than made afterwards.
     *
     * A move whose write did not land is answered as [QueueMove.Wait]: the turn was not taken, and the next
     * beat will find the queue exactly as it was.
     */
    fun claimNext(ahead: (ScenarioQueue) -> QueueAhead, runId: String, now: Long): QueueMove =
        store.underLock {
            val current = read() ?: return@underLock QueueMove.Wait

            when (val move = QueueRules.step(current, ahead(current), runId, now)) {
                is QueueMove.Wait -> move
                is QueueMove.Hold -> if (write(move.queue)) move else QueueMove.Wait
                // Standing behind a run somebody else started is written for the same reason a turn taken
                // is: the other window judges that run's ending off this file, not off its own idea of it.
                is QueueMove.Follow -> if (write(move.queue)) move else QueueMove.Wait
                is QueueMove.Start -> if (write(move.queue)) move else QueueMove.Wait
            }
        }

    /**
     * The turn was taken and nothing could be raised: put it back and stop the queue.
     *
     * Read afresh under the lock rather than written from the queue the claim handed back, for the reason
     * Schedules.settle is written the way it is: between taking the turn and failing to start it lie the
     * disk and a process that would not come up, and in those seconds somebody may have added a turn or
     * dropped one. Writing back the old copy would undo that, silently.
     */
    fun putBack(entry: ScenarioQueued, why: String): Boolean =
        store.underLock {
            val current = read() ?: return@underLock false
            write(QueueRules.refused(current, entry, why))
        }

    private fun read(): ScenarioQueue? {
        // A file that is not there is an empty queue; one that could not be read is not.
        val text = when (val stored = store.read()) {
            ScenarioFile.Stored.Missing -> return ScenarioQueue()
            ScenarioFile.Stored.Unreadable -> return null
            is ScenarioFile.Stored.Text -> stored.text
        }

        return runCatching { json.decodeFromString<ScenarioQueue>(text) }
            .onFailure { thisLogger().warn("Could not read the scenario queue", it) }
            .getOrNull()
    }

    private fun write(queue: ScenarioQueue): Boolean = store.put(json.encodeToString(queue))

    private companion object {
        const val FILE = "queue.json"

        /** Where on this machine a project's queue is kept - see ScenarioFile.of. */
        const val FOLDER = "scenario-queues"
    }
}

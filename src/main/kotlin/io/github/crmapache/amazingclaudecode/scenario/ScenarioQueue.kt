package io.github.crmapache.amazingclaudecode.scenario

import kotlinx.serialization.Serializable

/**
 * A round of work set to start once the one before it is out of the way.
 *
 * Runs go side by side - that is what the shelf's Run button means and it is not changing (see
 * ScenarioDesk) - and side by side is exactly what a night of work must not be: three rounds of work
 * editing one working copy is a branch with a third of each of them in it. The queue is the other answer
 * to the same wish. Everything put on it is started ONE AT A TIME, in the order it was put there, and
 * nothing is started while the one before is still going.
 *
 * One queue for the whole project, not one per scenario, because the thing being taken in turns is the
 * working copy and there is one of those. A different project has its own queue and its own turn.
 *
 * A run somebody started by hand, or the clock did, counts as well. Run still means "start now, beside
 * whatever is going" - but that is a sentence about the run being started, not about what the queue does
 * afterwards: when a turn's time comes and a run is going in this working copy, whoever raised it, the
 * queue stands behind that run exactly as it stands behind one of its own (see [ScenarioQueue.runId]).
 * The first version waited only for runs of its own, and the way that showed was the simplest thing a
 * queue is for: one round of work started by hand, the next put on the queue behind it - and started at
 * once, beside it, in the same working copy.
 */
@Serializable
internal data class ScenarioQueued(
    val id: String = "",
    val scenarioId: String = "",
    val scope: String = ScenarioScope.PROJECT,
    /**
     * The scenario's name as it read when this was put on the queue.
     *
     * Copied rather than looked up, for the reason a run copies it (see ScenarioRun.scenarioName): a
     * scenario can be renamed or deleted while its turn waits, and a row that then says nothing at all is
     * a row nobody can decide anything about - least of all whether to drop it.
     */
    val scenarioName: String = "",
    /** The answers to the scenario's own questions, given when it was put on the queue. */
    val inputs: Map<String, String> = emptyMap(),
    /**
     * Whether the one before this has to have FINISHED WELL, or merely finished.
     *
     * True by default, and that default is the whole of the feature: a queue is a chain of work where the
     * later halves usually stand on the earlier ones - review what the first one wrote, release what the
     * second one built - and starting the second over a failed first is work done against a premise that
     * is not there. False is for the rounds of work that are genuinely independent, where a night must not
     * be lost because its first item fell over.
     */
    val afterSuccess: Boolean = true,
    val addedAt: Long = 0,
    /**
     * Why this entry could not be raised the last time its turn came, as a name the screen has words for.
     *
     * An entry whose scenario has been deleted, or whose CLI is missing, cannot simply be skipped: it was
     * put here on purpose, and dropping it silently is losing work somebody asked for. So it keeps its
     * place, wears the reason, and the queue stands until a person deals with it.
     */
    val failure: String = "",
)

/**
 * The queue of this project: what is waiting, what it raised last, and whether it has stopped.
 *
 * Kept on the machine beside the runs and the scheduled hours rather than in the repository, and for the
 * schedules' reason (see ScheduleStore): the round of work is worth sharing, "these three, tonight, on my
 * checkout" is one person's arrangement with one working copy.
 */
@Serializable
internal data class ScenarioQueue(
    /** The turns not taken yet, in the order they will be taken. */
    val waiting: List<ScenarioQueued> = emptyList(),
    /**
     * The run the queue stands behind, going or over: the one it raised last, or one started by hand or by
     * the clock that was going when the next turn's time came (see [QueueMove.Follow]).
     *
     * Both are written here rather than told apart, because everything downstream asks the same question
     * of either - has it ended, and well? - and a run the queue stood behind by choice or by circumstance
     * answers it the same way: its ending is the premise the next turn stands on.
     *
     * For a run of its own the identifier is written down BEFORE it is raised (see ScenarioDesk.stepQueue), which is what
     * makes the queue safe across two IDE windows and a power cut: an identifier pointing at a run that
     * never appeared reads as an ending nobody can vouch for, and an ending nobody can vouch for stops the
     * queue rather than letting it run on.
     */
    val runId: String = "",
    /** What that run is called, so a row can name it after the record is gone. */
    val runName: String = "",
    /** When it was raised - see [QueueRules.SETTLING_MS] for the one thing this is for. */
    val raisedAt: Long = 0,
    /**
     * The queue has stopped and is waiting for a person.
     *
     * Set when a turn wanted a clean ending and did not get one, and when an entry would not start at all.
     * Nothing is dropped and nothing is skipped: everything waiting stays where it is, in its order, and
     * the person says whether to go on. A queue that quietly stepped over a failure would spend the rest
     * of the night doing work whose premise failed at midnight.
     */
    val held: Boolean = false,
    /** Why it stopped: a run's own ending (failed, stopped) or the refusal that kept an entry from starting. */
    val heldWhy: String = "",
    /** Which scenario it stopped on, by name - the record it names may be gone by morning. */
    val heldName: String = "",
)

/** What the queue should do this moment, worked out where it can be exercised (see [QueueRules.step]). */
internal sealed interface QueueMove {
    /** Nothing to do: busy, empty, or already stopped. */
    data object Wait : QueueMove

    /** Raise this entry. [queue] is the queue with the turn already taken - write it BEFORE starting. */
    data class Start(val entry: ScenarioQueued, val queue: ScenarioQueue) : QueueMove

    /** The turn came and was not taken: the queue stops and says why. */
    data class Hold(val queue: ScenarioQueue) : QueueMove

    /**
     * Something the queue did not raise is going, and the next turn stands behind it: [queue] names that
     * run now - write it, raise nothing.
     *
     * Written rather than merely waited for, because the next step has to judge THAT run's ending, and
     * the band has to be able to say what the queue is waiting for - the one rule about a queue that must
     * not be invisible.
     */
    data class Follow(val queue: ScenarioQueue) : QueueMove
}

/**
 * What lies ahead of the queue this moment, worked out by the caller - the only one who can look at the
 * live map and the disk - and handed to [QueueRules.step].
 *
 * [outcome] is how the run in [ScenarioQueue.runId] stands (see [QueueOutcome]); [going] is every other
 * run of this project that is going right now, whoever raised it. Two facts rather than one, because they
 * are judged in that order: the ending of the run the queue stood behind first, and only where it would
 * otherwise raise something, what else is in the working copy.
 */
internal data class QueueAhead(val outcome: String, val going: List<QueueGoing> = emptyList())

/** One run going in this project - as much of it as the queue needs to stand behind it. */
internal data class QueueGoing(val id: String, val name: String, val startedAt: Long)

/**
 * How a run the queue raised turned out, as far as the queue is concerned.
 *
 * Only one of these means "go on". Every other way a run can end - fallen over, cut short by a person, an
 * IDE closed in the middle of it - is a night whose next item may have nothing left to stand on, and the
 * queue treats them alike.
 */
internal object QueueOutcome {
    /** Nothing was raised yet: the first turn of a fresh queue waits for nobody. */
    const val NONE = "none"
    const val DONE = "done"
    /** Still going, or paused, or standing on a question: not an ending at all. */
    const val GOING = "going"
    /** The record is not on this disk. Written off as an ending, and not a good one - see [QueueRules.step]. */
    const val UNKNOWN = "unknown"
}

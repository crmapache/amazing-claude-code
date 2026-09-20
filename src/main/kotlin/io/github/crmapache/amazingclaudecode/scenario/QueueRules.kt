package io.github.crmapache.amazingclaudecode.scenario

/**
 * The arithmetic of the queue, away from the file it is kept in and from the processes it raises.
 *
 * Here rather than inside ScenarioDesk for the reason Schedules and ScheduleClock are where they are:
 * every rule below fails silently and the next morning looks the same either way. A turn that never came
 * and a turn that came twice both read as "the plugin was not running"; a queue that stepped over a
 * failure reads as a night of work done properly, and only the branch says otherwise.
 */
internal object QueueRules {

    /**
     * How long a run raised by the queue may go unrecorded before its absence counts as an ending.
     *
     * The identifier is written into the queue before the run is raised (see ScenarioDesk.stepQueue), so
     * between those two moments the disk has a name and no record for it. Read as an ending, that gap
     * would stop the queue the moment it started something. A minute is far longer than the gap and far
     * shorter than any run.
     */
    const val SETTLING_MS = 60_000L

    /**
     * Put one on the end of the queue: the order is the order they were asked for.
     *
     * A turn put on a queue with nothing waiting, over a run that is already behind it, starts the queue
     * afresh: that run and any stop it left are forgotten, exactly as [letGo] forgets them. An ending is
     * the premise of the turns that were standing on it when it came, and here none were. Remembered, it
     * stopped a turn put on the queue hours later over a run nobody had stood on - recorded live: a run the
     * queue raised at ten, stopped by hand at half past two before a restart; at twenty to three one round
     * of work started by hand and two put on the queue behind it, and the queue stopped at once on the
     * morning's Stop, under the same scenario name as the run going in front of it, so the screen read as
     * "the run you just started was stopped by you". Forgotten, the turn stands where a fresh queue's first
     * turn stands - behind whatever is going, or started at once over an idle working copy.
     *
     * A run still going is kept, and that is the half that matters: the last turn raised, and the next one
     * put on the queue while it works, is the ordinary way a queue is used at all.
     *
     * [outcome] is how the named run stands (see QueueOutcome), worked out by the caller against the queue
     * the change is made on, for the reason [QueueStore.claimNext] asks its question under the lock.
     */
    fun put(queue: ScenarioQueue, entry: ScenarioQueued, outcome: String, now: Long): ScenarioQueue {
        val afresh = queue.waiting.isEmpty() && behind(queue, outcome, now)
        val base = if (afresh) letGo(queue) else queue
        return base.copy(waiting = base.waiting + entry)
    }

    /**
     * Take one turn off the queue.
     *
     * The last one gone takes the stop with it, as emptying the queue does (see [clear]): a stop is about
     * the turns that were waiting on an ending, and a band saying "nothing after it will start" over a list
     * with nothing on it is a screen asking to be told about work that is gone.
     */
    fun remove(queue: ScenarioQueue, id: String): ScenarioQueue {
        if (id.isBlank()) return queue

        val left = queue.copy(waiting = queue.waiting.filterNot { it.id == id })
        return if (left.waiting.isEmpty() && left != queue) clear(left) else left
    }

    /**
     * Whether the run the queue names is behind it: over, never raised, or never appeared once the gap for
     * it to appear in has passed (see [SETTLING_MS]).
     *
     * One question asked in two places - before a turn is taken ([step]) and before a turn is put on an
     * empty queue ([put]) - and written once, because the two answering it differently is exactly how a
     * run that has only just been raised would be read as over by one of them.
     */
    private fun behind(queue: ScenarioQueue, outcome: String, now: Long): Boolean =
        outcome != QueueOutcome.GOING && !(outcome == QueueOutcome.UNKNOWN && now - queue.raisedAt < SETTLING_MS)

    /**
     * Move one turn up or down its queue.
     *
     * By ONE step at a time and by identifier rather than by index, because two windows and a phone look at
     * this list: an index is a place in whatever the sender last drew, and the list may have lost its head
     * to a turn taken a second ago. Out of range is a move that does nothing rather than one that wraps -
     * the top of the queue is a place a person can see they are at.
     */
    fun move(queue: ScenarioQueue, id: String, by: Int): ScenarioQueue {
        val at = queue.waiting.indexOfFirst { it.id == id }
        if (at < 0 || by == 0) return queue

        val to = at + by
        if (to !in queue.waiting.indices) return queue

        val moved = queue.waiting.toMutableList()
        moved.add(to, moved.removeAt(at))
        return queue.copy(waiting = moved)
    }

    /** Change what one turn waits for: a clean ending, or merely an ending. */
    fun mode(queue: ScenarioQueue, id: String, afterSuccess: Boolean): ScenarioQueue =
        queue.copy(waiting = queue.waiting.map { if (it.id == id) it.copy(afterSuccess = afterSuccess) else it })

    /**
     * Empty the queue.
     *
     * What it stood behind is left where it is - that run happened, whoever raised it, and the row that
     * names it is the only place this queue's night can still be read - but nothing is standing on it any
     * more, so the hold goes with
     * the waiting: a stop with nothing behind it is a screen asking to be told about work that is gone.
     */
    fun clear(queue: ScenarioQueue): ScenarioQueue =
        queue.copy(waiting = emptyList(), held = false, heldWhy = "", heldName = "")

    /**
     * Go on anyway: the person has seen why it stopped and said to carry on.
     *
     * What it stood behind is forgotten along with the stop, and that is the whole of this function working
     * at all. The ending of that run is what [step] reads to decide, so a queue that only lost its `held` flag
     * would take one step, read the same failure again and stop again - a button that visibly does nothing,
     * which is how this was first written. Forgotten, the next turn stands where a queue's first turn
     * stands: nothing behind it to wait for. Nothing is lost by it - the run itself is in the list of past
     * runs with everything it did, and this pair of fields is only ever read to answer "may the next one
     * start".
     *
     * The mark on the head of the queue goes too. It says why the last attempt to raise THAT entry failed,
     * and once somebody has decided to try again it is a sentence about a decision already taken - left on,
     * it would sit on the row through a run that is going perfectly well.
     *
     * Safe to forget a run that is still going only because there is no such moment: a queue stops on an
     * ending, so by the time anybody can press this, what it names has already finished.
     */
    fun letGo(queue: ScenarioQueue): ScenarioQueue =
        queue.copy(
            held = false,
            heldWhy = "",
            heldName = "",
            runId = "",
            runName = "",
            raisedAt = 0,
            waiting = queue.waiting.mapIndexed { at, entry -> if (at == 0) entry.copy(failure = "") else entry },
        )

    /**
     * What the queue does now: nothing, raise the next one, stand behind something else that is going, or
     * stop and wait for a person.
     *
     * [ahead] is what lies in front of the queue - how the run it stands behind ended, and what else is
     * going in this project - worked out by the caller, who is the only one who can look at the live map
     * and the disk (see QueueAhead). [runId] is the name the next run will be given, handed in rather than
     * made here so that the queue can be written down with it BEFORE any process exists: a crash between
     * the write and the launch then leaves a queue pointing at a run that never appeared, which is read as
     * an ending nobody can vouch for and stops the queue - the safe way round. Made afterwards, the same
     * crash would leave the turn taken and nothing to show for it.
     */
    fun step(queue: ScenarioQueue, ahead: QueueAhead, runId: String, now: Long): QueueMove {
        /*
         * A stop is a verdict about an ENDING, and an ending can be taken back: a run that fell over is
         * picked up where it stood and goes on (see CarryOn), which is the ordinary answer to a queue that
         * stopped at three in the morning - pick that run up, let it finish, let the night go on. Going
         * again, the ending the stop was about is not there to judge, so the stop goes with it and the
         * queue stands behind that run once more, to judge how it ends THIS time. Left on, the band sat
         * over a run visibly working and every turn under it waited for a second press of a button whose
         * question had already been answered - and answered in the one way that actually deals with a
         * failure rather than stepping over it.
         *
         * Only ever the run the queue stopped ON. A stop left by a turn that would not start names no run
         * at all (see [refused]), and a run going BESIDE a stopped queue is not an answer to it: that one
         * is somebody's fix or somebody's unrelated evening, and the failure is still a verdict waiting
         * for a person.
         */
        if (queue.held) {
            if (ahead.outcome != QueueOutcome.GOING) return QueueMove.Wait
            return QueueMove.Follow(queue.copy(held = false, heldWhy = "", heldName = ""))
        }
        // Still going, or raised a moment ago and not on the disk yet - see [SETTLING_MS].
        if (!behind(queue, ahead.outcome, now)) return QueueMove.Wait

        val next = queue.waiting.firstOrNull() ?: return QueueMove.Wait

        // Nothing before it, or that something finished well. The first turn of a queue waits for nobody:
        // there is no premise for it to stand on yet.
        val clean = ahead.outcome == QueueOutcome.DONE || ahead.outcome == QueueOutcome.NONE
        if (!clean && next.afterSuccess) {
            return QueueMove.Hold(queue.copy(held = true, heldWhy = ahead.outcome, heldName = queue.runName))
        }

        /*
         * Something else is going in this working copy - started by hand, or by the clock. The turn would
         * start now, so it stands behind that instead: the newest of them, and when that one ends while an
         * older one is still going, the next step stands behind the older one in its turn. After the stop
         * rather than before it, because a failure the queue stood behind is a verdict for a person, and a
         * run going beside it - started to fix things, or unrelated - does not answer it. And only with a
         * turn waiting (see the return above): a run started by hand over an empty queue is nobody's
         * premise, and written down anyway its failure would stop the first turn put on the queue a week
         * later, about a run nobody was standing on.
         */
        ahead.going.filter { it.id != queue.runId }.maxByOrNull { it.startedAt }?.let { beside ->
            return QueueMove.Follow(queue.copy(runId = beside.id, runName = beside.name, raisedAt = now))
        }

        return QueueMove.Start(
            entry = next,
            queue = queue.copy(
                waiting = queue.waiting.drop(1),
                runId = runId,
                runName = next.scenarioName,
                raisedAt = now,
            ),
        )
    }

    /**
     * The turn was taken and the run would not start: the entry goes back to the head of the queue, wearing
     * the reason, and the queue stops.
     *
     * Back rather than dropped, because an entry that cannot start is the one thing on this list a person
     * has to see: a scenario deleted while its turn waited, a CLI that is not on this machine. Dropped, the
     * queue would work through the night having quietly decided that a round of work somebody asked for was
     * not worth mentioning.
     *
     * The run identifier is cleared with it. It names a run that does not exist, and left in place it would
     * be read at the next step as an ending nobody can vouch for - a second reason to stop, given by the
     * first one.
     */
    fun refused(queue: ScenarioQueue, entry: ScenarioQueued, why: String): ScenarioQueue =
        queue.copy(
            waiting = listOf(entry.copy(failure = why)) + queue.waiting.filterNot { it.id == entry.id },
            runId = "",
            runName = "",
            raisedAt = 0,
            held = true,
            heldWhy = why,
            heldName = entry.scenarioName,
        )

    /**
     * Drop the turns whose scenario is no longer on either shelf, and follow the ones that moved shelf.
     *
     * The same rule the scheduled hours live by, written out again because the two lists hold different
     * things (see Schedules.keepOnly): a shelf that could not be READ is not a shelf with nothing on it,
     * and a queue emptied by a branch checked out without `.claude/scenarios` would take a night of work
     * with it and not give it back when the branch came back.
     */
    fun keepOnly(
        queue: ScenarioQueue,
        project: List<Scenario>?,
        user: List<Scenario>?,
    ): ScenarioQueue {
        val seen = (project.orEmpty() + user.orEmpty()).groupBy { it.id }

        val kept = queue.waiting.mapNotNull { entry ->
            val found = seen[entry.scenarioId].orEmpty()

            when {
                // With two scenarios answering to one identifier - a project file that came back with a
                // git checkout beside somebody's own copy - there is no answer to "which one is it now",
                // so the turn keeps the shelf it was given.
                found.size == 1 -> entry.copy(scope = found.first().scope)
                found.isNotEmpty() -> entry
                project == null || user == null -> entry
                else -> null
            }
        }

        return if (kept == queue.waiting) queue else queue.copy(waiting = kept)
    }
}

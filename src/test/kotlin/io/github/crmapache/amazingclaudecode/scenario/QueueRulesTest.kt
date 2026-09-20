package io.github.crmapache.amazingclaudecode.scenario

import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertIs
import kotlin.test.assertTrue

/**
 * The queue's own arithmetic, exercised away from the disk and the processes.
 *
 * Everything here breaks silently, and in the direction nobody checks. A turn skipped is a round of work
 * somebody asked for that simply never happened; a turn taken twice is two sets of agents in one working
 * copy; a queue that steps over a failure spends the rest of the night working against a premise that
 * fell over at midnight - and the morning after, all three look exactly like a night that went fine.
 */
class QueueRulesTest {

    private fun entry(
        id: String = "q1",
        scenarioId: String = "s1",
        name: String = "Review and fix",
        afterSuccess: Boolean = true,
    ) = ScenarioQueued(
        id = id,
        scenarioId = scenarioId,
        scope = ScenarioScope.PROJECT,
        scenarioName = name,
        afterSuccess = afterSuccess,
        addedAt = 1_000,
    )

    private fun queueOf(vararg waiting: ScenarioQueued) = ScenarioQueue(waiting = waiting.toList())

    // --- Taking turns -----------------------------------------------------------------

    /** A fresh queue has nothing behind it, so its first turn waits for nobody. */
    @Test
    fun `the first turn of a queue starts at once`() {
        val move = QueueRules.step(queueOf(entry()), QueueAhead(QueueOutcome.NONE), runId = "r1", now = 2_000)

        val start = assertIs<QueueMove.Start>(move)
        assertEquals("q1", start.entry.id)
        assertEquals("r1", start.queue.runId)
        assertEquals(2_000, start.queue.raisedAt)
        assertTrue(start.queue.waiting.isEmpty())
    }

    /** Nothing is raised while the one before is still going - that is the whole of a queue. */
    @Test
    fun `a going run keeps the next turn waiting`() {
        val queue = queueOf(entry()).copy(runId = "r1", raisedAt = 1_500)

        assertIs<QueueMove.Wait>(QueueRules.step(queue, QueueAhead(QueueOutcome.GOING), runId = "r2", now = 2_000))
    }

    @Test
    fun `a clean ending lets the next turn through`() {
        val queue = queueOf(entry(id = "q2")).copy(runId = "r1", runName = "Review and fix", raisedAt = 1_500)

        val start = assertIs<QueueMove.Start>(
            QueueRules.step(queue, QueueAhead(QueueOutcome.DONE), runId = "r2", now = 2_000),
        )
        assertEquals("q2", start.entry.id)
        assertEquals("r2", start.queue.runId)
    }

    // --- What a failure does ----------------------------------------------------------

    /**
     * The default, and the reason the feature exists: the later halves of a chain stand on the earlier
     * ones, and a review of work that was never written is a night spent on nothing.
     */
    @Test
    fun `a failure stops a queue whose next turn wants a clean ending`() {
        val queue = queueOf(entry(id = "q2")).copy(runId = "r1", runName = "Build it", raisedAt = 1_500)

        val hold = assertIs<QueueMove.Hold>(
            QueueRules.step(queue, QueueAhead(RunState.FAILED), runId = "r2", now = 2_000),
        )
        assertTrue(hold.queue.held)
        assertEquals(RunState.FAILED, hold.queue.heldWhy)
        assertEquals("Build it", hold.queue.heldName)
        // Nothing is dropped and nothing is skipped: the turn is still first in line.
        assertEquals(listOf("q2"), hold.queue.waiting.map { it.id })
    }

    /** A person's own Stop is not a clean ending either: they stopped it for a reason. */
    @Test
    fun `a run cut short by a person stops the queue too`() {
        val queue = queueOf(entry(id = "q2")).copy(runId = "r1", raisedAt = 1_500)

        assertIs<QueueMove.Hold>(QueueRules.step(queue, QueueAhead(RunState.STOPPED), runId = "r2", now = 2_000))
    }

    /** The other half of the choice: turns that do not stand on anything go on regardless. */
    @Test
    fun `a turn that waits for any ending starts after a failure`() {
        val queue = queueOf(entry(id = "q2", afterSuccess = false)).copy(runId = "r1", raisedAt = 1_500)

        val start = assertIs<QueueMove.Start>(
            QueueRules.step(queue, QueueAhead(RunState.FAILED), runId = "r2", now = 2_000),
        )
        assertEquals("q2", start.entry.id)
    }

    /** A stopped queue does not move, whatever the last run did, until a person says so. */
    @Test
    fun `a queue that has stopped stays stopped`() {
        val queue = queueOf(entry(id = "q2")).copy(held = true, heldWhy = RunState.FAILED)

        assertIs<QueueMove.Wait>(QueueRules.step(queue, QueueAhead(QueueOutcome.DONE), runId = "r2", now = 2_000))
    }

    /**
     * The button has to actually start something, and that takes forgetting the run it stopped on as well
     * as the stop itself: the ending is what the next step reads, so a queue that only lost its flag would
     * read the same failure a moment later and stop again - a button that visibly does nothing.
     */
    @Test
    fun `going on anyway forgets the run it stopped on, so the next turn starts`() {
        val queue = queueOf(entry(id = "q2").copy(failure = "scenarioGone"), entry(id = "q3"))
            .copy(runId = "r1", runName = "Review and fix", held = true, heldWhy = "scenarioGone", heldName = "Review and fix")

        val letting = QueueRules.letGo(queue)

        assertTrue(!letting.held && letting.heldWhy.isEmpty() && letting.heldName.isEmpty())
        assertEquals("", letting.waiting.first().failure)
        assertEquals("", letting.runId)
        // Which is what the caller then works the outcome out from: nothing named, nothing to wait for.
        assertIs<QueueMove.Start>(QueueRules.step(letting, QueueAhead(QueueOutcome.NONE), runId = "r2", now = 2_000))
    }

    /**
     * The other answer to a failure, and the one that actually deals with it: the run that fell over is
     * picked up where it stood (see CarryOn) and goes on. The ending the stop was about is taken back with
     * it, so the stop goes too - left on, the band sat over a run visibly working and every turn under it
     * waited for a second press of a button whose question had already been answered.
     */
    @Test
    fun `the run a queue stopped on going again lifts the stop`() {
        val queue = queueOf(entry(id = "q2"), entry(id = "q3"))
            .copy(runId = "r1", runName = "Build it", raisedAt = 1_500, held = true, heldWhy = RunState.FAILED, heldName = "Build it")

        val follow = assertIs<QueueMove.Follow>(
            QueueRules.step(queue, QueueAhead(QueueOutcome.GOING), runId = "r2", now = 2_000),
        )

        assertTrue(!follow.queue.held && follow.queue.heldWhy.isEmpty() && follow.queue.heldName.isEmpty())
        // Still behind that run, because its ending is the premise again - this time the one it ends with.
        assertEquals("r1", follow.queue.runId)
        assertEquals(listOf("q2", "q3"), follow.queue.waiting.map { it.id })
        // And nothing starts beside it: the run is going.
        assertIs<QueueMove.Wait>(QueueRules.step(follow.queue, QueueAhead(QueueOutcome.GOING), runId = "r2", now = 2_100))
    }

    /**
     * And only the run it stopped ON. A run going beside a stopped queue is somebody's fix or somebody's
     * unrelated evening, and the failure is still a verdict waiting for a person.
     */
    @Test
    fun `a run going beside a stopped queue leaves the stop where it is`() {
        val queue = queueOf(entry(id = "q2"))
            .copy(runId = "r1", runName = "Build it", raisedAt = 1_500, held = true, heldWhy = RunState.FAILED)

        assertIs<QueueMove.Wait>(
            QueueRules.step(
                queue,
                QueueAhead(RunState.FAILED, going = listOf(QueueGoing(id = "r9", name = "Build it", startedAt = 1_800))),
                runId = "r2",
                now = 2_000,
            ),
        )
    }

    /**
     * A stop left by a turn that would not start names no run at all (see QueueRules.refused), so there is
     * nothing that can be picked up to answer it: it waits for a person, whatever else the project is doing.
     */
    @Test
    fun `a stop left by a turn that would not start is not lifted by anything going`() {
        val queue = QueueRules.refused(queueOf(entry(id = "q2")), entry(id = "q2"), why = "scenarioGone")

        assertIs<QueueMove.Wait>(QueueRules.step(queue, QueueAhead(QueueOutcome.NONE), runId = "r2", now = 2_000))
    }

    // --- A run somebody else started -----------------------------------------------------

    private fun going(id: String = "r9", name: String = "Build it", startedAt: Long = 1_800) =
        QueueGoing(id = id, name = name, startedAt = startedAt)

    /**
     * The simplest thing a queue is for: one round of work started by hand, the next put on the queue
     * behind it. Started at once beside it, the second is two sets of agents in one working copy - which
     * is what the first version did, because it waited only for runs of its own.
     */
    @Test
    fun `a turn stands behind a run started by hand rather than starting beside it`() {
        val move = QueueRules.step(
            queueOf(entry()),
            QueueAhead(QueueOutcome.NONE, going = listOf(going())),
            runId = "r1",
            now = 2_000,
        )

        val follow = assertIs<QueueMove.Follow>(move)
        assertEquals("r9", follow.queue.runId)
        assertEquals("Build it", follow.queue.runName)
        assertEquals(2_000, follow.queue.raisedAt)
        // Nothing was raised, so nothing was taken: the turn is still first in line.
        assertEquals(listOf("q1"), follow.queue.waiting.map { it.id })
    }

    /** Once it stands behind that run, the run's ending is judged like the ending of one of its own. */
    @Test
    fun `the run it stood behind decides the next turn like one of its own`() {
        val behind = assertIs<QueueMove.Follow>(
            QueueRules.step(queueOf(entry()), QueueAhead(QueueOutcome.NONE, listOf(going())), runId = "r1", now = 2_000),
        ).queue

        assertIs<QueueMove.Wait>(QueueRules.step(behind, QueueAhead(QueueOutcome.GOING), runId = "r1", now = 2_500))

        val hold = assertIs<QueueMove.Hold>(QueueRules.step(behind, QueueAhead(RunState.FAILED), runId = "r1", now = 3_000))
        assertEquals("Build it", hold.queue.heldName)

        val start = assertIs<QueueMove.Start>(QueueRules.step(behind, QueueAhead(QueueOutcome.DONE), runId = "r1", now = 3_000))
        assertEquals("q1", start.entry.id)
    }

    /** Of several going at once the newest is followed, and when it ends while an older one is still going, that one. */
    @Test
    fun `of several runs going the newest is followed, then the one still going`() {
        val both = listOf(
            going(id = "r8", name = "Older", startedAt = 1_000),
            going(id = "r9", name = "Newer", startedAt = 1_800),
        )

        val first = assertIs<QueueMove.Follow>(
            QueueRules.step(queueOf(entry()), QueueAhead(QueueOutcome.NONE, both), runId = "r1", now = 2_000),
        )
        assertEquals("r9", first.queue.runId)

        val again = assertIs<QueueMove.Follow>(
            QueueRules.step(first.queue, QueueAhead(QueueOutcome.DONE, listOf(both.first())), runId = "r1", now = 4_000),
        )
        assertEquals("r8", again.queue.runId)
        assertEquals("Older", again.queue.runName)
    }

    /**
     * The stop comes first. The run the queue stood behind failed and the next turn wanted a clean ending:
     * that is a verdict for a person, and a run going beside it - started to fix things, or unrelated -
     * does not answer it.
     */
    @Test
    fun `a failure stops the queue before it stands behind anything else`() {
        val queue = queueOf(entry(id = "q2")).copy(runId = "r1", runName = "Build it", raisedAt = 1_500)

        val hold = assertIs<QueueMove.Hold>(
            QueueRules.step(queue, QueueAhead(RunState.FAILED, listOf(going(name = "Other"))), runId = "r2", now = 2_000),
        )
        assertEquals("Build it", hold.queue.heldName)
        assertEquals("r1", hold.queue.runId)
    }

    /** A turn that does not care how the one before ended still does not start beside something going. */
    @Test
    fun `a turn that waits for anything still waits for what is going`() {
        val queue = queueOf(entry(id = "q2", afterSuccess = false)).copy(runId = "r1", raisedAt = 1_500)

        val follow = assertIs<QueueMove.Follow>(
            QueueRules.step(queue, QueueAhead(RunState.FAILED, listOf(going())), runId = "r2", now = 2_000),
        )
        assertEquals("r9", follow.queue.runId)
        assertEquals(listOf("q2"), follow.queue.waiting.map { it.id })
    }

    /**
     * Nothing waiting, nothing followed. A run started by hand over an empty queue is nobody's premise;
     * written down anyway, its failure would stop the first turn put on the queue a week later, about a
     * run nobody was standing on.
     */
    @Test
    fun `nothing is followed while nothing is waiting`() {
        val queue = ScenarioQueue(runId = "r1", runName = "Done one")

        assertIs<QueueMove.Wait>(
            QueueRules.step(queue, QueueAhead(QueueOutcome.DONE, listOf(going())), runId = "r2", now = 2_000),
        )
    }

    /** Its own run listed among what is going is its own, whatever the caller says, not something to stand behind twice. */
    @Test
    fun `its own run is not followed`() {
        val queue = queueOf(entry(id = "q2")).copy(runId = "r1", runName = "Build it", raisedAt = 1_500)

        assertIs<QueueMove.Start>(
            QueueRules.step(queue, QueueAhead(QueueOutcome.DONE, listOf(going(id = "r1", name = "Build it"))), runId = "r2", now = 2_000),
        )
    }

    // --- A turn put on the queue ----------------------------------------------------------

    /**
     * The case this was recorded from, step by step. The queue raised a run in the morning and it was
     * stopped by hand before a restart; nothing was waiting on it. Hours later one round of work was
     * started by hand and a turn put on the queue behind it - and the queue stopped at once on the
     * morning's Stop, under the same scenario name as the run going in front of it.
     */
    @Test
    fun `a turn put over a run already over does not stand on its ending`() {
        val morning = ScenarioQueue(runId = "r1", runName = "Task -> Prod", raisedAt = 1_000)

        val put = QueueRules.put(morning, entry(id = "q2", name = "Task -> Prod"), RunState.STOPPED, now = 50_000)

        assertEquals("", put.runId)
        assertEquals(listOf("q2"), put.waiting.map { it.id })
        // What the step then does: stand behind the run started by hand, not stop on the morning.
        val follow = assertIs<QueueMove.Follow>(
            QueueRules.step(put, QueueAhead(QueueOutcome.NONE, listOf(going(id = "r9", name = "Task -> Prod"))), runId = "r2", now = 50_000),
        )
        assertEquals("r9", follow.queue.runId)
        assertTrue(!follow.queue.held)
    }

    /** And over an idle working copy it simply starts: an empty queue whose last run is over is an idle queue. */
    @Test
    fun `a turn put over a failure nobody stood on starts at once`() {
        val put = QueueRules.put(ScenarioQueue(runId = "r1", raisedAt = 1_000), entry(), RunState.FAILED, now = 50_000)

        assertIs<QueueMove.Start>(QueueRules.step(put, QueueAhead(QueueOutcome.NONE), runId = "r2", now = 50_000))
    }

    /**
     * The half that matters: the last turn raised, and the next put on the queue while it works, is the
     * ordinary way a queue is used. That turn stands on the run's ending like any other.
     */
    @Test
    fun `a turn put while the last one raised is going stands on its ending`() {
        val put = QueueRules.put(ScenarioQueue(runId = "r1", runName = "Build it", raisedAt = 1_000), entry(), QueueOutcome.GOING, now = 2_000)

        assertEquals("r1", put.runId)
        val hold = assertIs<QueueMove.Hold>(QueueRules.step(put, QueueAhead(RunState.FAILED), runId = "r2", now = 3_000))
        assertEquals("Build it", hold.queue.heldName)
    }

    /** A run the queue raised a moment ago is not on the disk yet, and is not forgotten for it. */
    @Test
    fun `a turn put behind a run raised a moment ago keeps it`() {
        val queue = ScenarioQueue(runId = "r1", raisedAt = 2_000)

        val put = QueueRules.put(queue, entry(), QueueOutcome.UNKNOWN, now = 2_000 + QueueRules.SETTLING_MS - 1)

        assertEquals("r1", put.runId)
    }

    /** A stop is about the turns that were waiting when it came, and adding one more does not lift it. */
    @Test
    fun `a turn put on a stopped queue with turns waiting keeps the stop`() {
        val queue = queueOf(entry(id = "q2")).copy(runId = "r1", held = true, heldWhy = RunState.FAILED, heldName = "Build it")

        val put = QueueRules.put(queue, entry(id = "q3"), RunState.FAILED, now = 50_000)

        assertTrue(put.held)
        assertEquals("r1", put.runId)
        assertEquals(listOf("q2", "q3"), put.waiting.map { it.id })
    }

    /** The last turn taken off by hand takes the stop with it, as emptying the queue does. */
    @Test
    fun `the last turn taken off lets go of the stop`() {
        val queue = queueOf(entry(id = "q2")).copy(runId = "r1", held = true, heldWhy = RunState.FAILED, heldName = "Build it")

        val left = QueueRules.remove(queue, "q2")

        assertTrue(left.waiting.isEmpty() && !left.held && left.heldName.isEmpty())
        // Removing a turn that is not there changes nothing, the stop included.
        assertTrue(QueueRules.remove(queue, "nobody").held)
    }

    // --- A record that is not there ----------------------------------------------------

    /**
     * The identifier is written into the queue before the process exists, so for a moment the disk has a
     * name and no record. Read as an ending, the queue would stop the instant it started something.
     */
    @Test
    fun `a run raised a moment ago is waited for rather than written off`() {
        val queue = queueOf(entry(id = "q2")).copy(runId = "r1", raisedAt = 2_000)

        assertIs<QueueMove.Wait>(
            QueueRules.step(queue, QueueAhead(QueueOutcome.UNKNOWN), runId = "r2", now = 2_000 + QueueRules.SETTLING_MS - 1),
        )
    }

    /**
     * And after that gap the absence is an ending - one nobody can vouch for. An IDE killed mid-run leaves
     * exactly this, and going on from it would be going on from work that may not have happened.
     */
    @Test
    fun `a run that never appeared stops the queue once the gap has passed`() {
        val queue = queueOf(entry(id = "q2")).copy(runId = "r1", raisedAt = 2_000)

        val hold = assertIs<QueueMove.Hold>(
            QueueRules.step(queue, QueueAhead(QueueOutcome.UNKNOWN), runId = "r2", now = 2_000 + QueueRules.SETTLING_MS),
        )
        assertEquals(QueueOutcome.UNKNOWN, hold.queue.heldWhy)
    }

    // --- An entry that would not start ---------------------------------------------------

    /**
     * Put back rather than dropped. An entry whose scenario was deleted while its turn waited is the one
     * thing on this list a person has to be shown - quietly skipped, it is work asked for and never done.
     */
    @Test
    fun `an entry that would not start goes back to the head and stops the queue`() {
        val taken = queueOf(entry(id = "q3")).copy(runId = "r2", runName = "Review and fix", raisedAt = 2_000)

        val refused = QueueRules.refused(taken, entry(id = "q2"), why = "scenarioGone")

        assertEquals(listOf("q2", "q3"), refused.waiting.map { it.id })
        assertEquals("scenarioGone", refused.waiting.first().failure)
        assertTrue(refused.held)
        // The name of a run that never appeared would be read as an ending at the next step - a second
        // reason to stop, handed over by the first one.
        assertEquals("", refused.runId)
    }

    /** Put back at the head even when it was not there a moment ago, and never twice. */
    @Test
    fun `an entry put back does not stand in the queue twice`() {
        val taken = queueOf(entry(id = "q2"), entry(id = "q3"))

        val refused = QueueRules.refused(taken, entry(id = "q2"), why = "noClaude")

        assertEquals(listOf("q2", "q3"), refused.waiting.map { it.id })
    }

    // --- Keeping the list in order -------------------------------------------------------

    @Test
    fun `a turn moves one step at a time and not off the end`() {
        val queue = queueOf(entry(id = "q1"), entry(id = "q2"), entry(id = "q3"))

        assertEquals(listOf("q2", "q1", "q3"), QueueRules.move(queue, "q1", by = 1).waiting.map { it.id })
        assertEquals(listOf("q1", "q2", "q3"), QueueRules.move(queue, "q1", by = -1).waiting.map { it.id })
        assertEquals(listOf("q1", "q2", "q3"), QueueRules.move(queue, "nobody", by = 1).waiting.map { it.id })
    }

    @Test
    fun `emptying the queue lets go of the stop as well`() {
        val queue = queueOf(entry()).copy(held = true, heldWhy = RunState.FAILED, runId = "r1")

        val cleared = QueueRules.clear(queue)

        assertTrue(cleared.waiting.isEmpty())
        assertTrue(!cleared.held)
        // What it raised still happened, and the row that names it is where this queue's night is read.
        assertEquals("r1", cleared.runId)
    }

    /** A shelf nobody could read is not a shelf with nothing on it - the same rule the hours live by. */
    @Test
    fun `an unreadable shelf drops nothing`() {
        val queue = queueOf(entry(scenarioId = "s1"))

        assertEquals(1, QueueRules.keepOnly(queue, project = null, user = emptyList()).waiting.size)
        assertEquals(0, QueueRules.keepOnly(queue, project = emptyList(), user = emptyList()).waiting.size)
    }

    @Test
    fun `a scenario that moved shelf takes its turns with it`() {
        val queue = queueOf(entry(scenarioId = "s1"))
        val moved = listOf(Scenario(id = "s1", name = "Round", scope = ScenarioScope.USER))

        val kept = QueueRules.keepOnly(queue, project = emptyList(), user = moved)

        assertEquals(ScenarioScope.USER, kept.waiting.single().scope)
    }
}

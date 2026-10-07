package io.github.crmapache.amazingclaudecode.scenario

import kotlin.test.Test
import kotlin.test.assertEquals

/**
 * A run whose IDE went away is closed at the moment it was last known to be alive, not at the next start.
 *
 * The sweep runs when the IDE comes back, which may be the morning after: closed at that moment, a run that
 * fell over at two would say it worked until nine, and so would its last card. The moment it was last
 * written is the honest end (see ScenarioRun.writtenAt).
 */
class AbandonedRunTest {

    private val hour = 60L * 60 * 1000

    private fun run(vararg steps: RunStep) = ScenarioRun(
        id = "r1",
        state = RunState.RUNNING,
        startedAt = 0,
        steps = steps.toList(),
    )

    @Test
    fun `it ends where it was last written, and so does the card it was on`() {
        val closed = RunStore.abandoned(
            run(
                RunStep(key = "a", state = StepState.DONE, startedAt = 0, finishedAt = hour),
                RunStep(key = "b", state = StepState.RUNNING, startedAt = hour),
                RunStep(key = "c", state = StepState.WAITING),
            ).copy(writtenAt = 2 * hour),
            now = 9 * hour,
        )

        assertEquals(RunState.FAILED, closed.state)
        assertEquals(RunFailure.CRASHED, closed.failure)
        assertEquals(2 * hour, closed.finishedAt)
        assertEquals(hour, closed.steps[0].finishedAt)
        assertEquals(StepState.FAILED, closed.steps[1].state)
        assertEquals(2 * hour, closed.steps[1].finishedAt)
        assertEquals(StepState.SKIPPED, closed.steps[2].state)
    }

    /** A pause it went away in was never work, whichever way it ended. */
    @Test
    fun `a stretch it stood still in is closed at the same moment`() {
        val closed = RunStore.abandoned(
            run(RunStep(key = "a", state = StepState.PAUSED, startedAt = 0, rested = 10)).copy(
                state = RunState.PAUSED,
                writtenAt = 3 * hour,
                rested = 10,
                restingSince = hour,
            ),
            now = 9 * hour,
        )

        assertEquals(0, closed.restingSince)
        assertEquals(10 + 2 * hour, closed.rested)
        assertEquals(10 + 2 * hour, closed.steps[0].rested)
    }

    /** A record written before the stamp existed has nothing better than the moment it is found. */
    @Test
    fun `a record with no stamp ends now, as it always did`() {
        val closed = RunStore.abandoned(run(RunStep(key = "a", state = StepState.RUNNING, startedAt = 0)), now = 9 * hour)

        assertEquals(9 * hour, closed.finishedAt)
        assertEquals(9 * hour, closed.steps[0].finishedAt)
    }

    /** A stamp from a clock that ran ahead is not believed past the moment of finding it. */
    @Test
    fun `a stamp is never later than now or earlier than the start`() {
        assertEquals(9 * hour, RunStore.abandoned(run().copy(writtenAt = 20 * hour), now = 9 * hour).finishedAt)
        assertEquals(hour, RunStore.abandoned(run().copy(startedAt = hour, writtenAt = 5), now = 9 * hour).finishedAt)
    }
}

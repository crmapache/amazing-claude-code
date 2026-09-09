package io.github.crmapache.amazingclaudecode.scenario

import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertNull

/**
 * Where a finished run is picked up from.
 *
 * The engine's phase is not in the record, so the place to resume is read off the steps - and a reading
 * that is one row off either runs a card twice or skips one, with nothing on the screen to say so.
 */
class CarryOnTest {

    private fun step(index: Int, state: String, stageId: String = "s", pass: Int = 1) = RunStep(
        key = ScenarioRules.keyOf(stageId, "c$index", pass),
        cardId = "c$index",
        stageId = stageId,
        pass = pass,
        title = "Card $index",
        state = state,
        startedAt = if (StepState.begun(state)) 1_000L else 0L,
    )

    private fun run(state: String, vararg steps: RunStep, head: String = "head-1") =
        ScenarioRun(state = state, headConversationId = head, steps = steps.toList())

    @Test
    fun `a run stopped in the middle of a card is picked up at that card`() {
        val point = CarryOn.pointOf(
            run(RunState.STOPPED, step(1, StepState.DONE), step(2, StepState.FAILED), step(3, StepState.SKIPPED)),
        )

        assertEquals(CarryOn.Point(at = 1, begun = true), point)
    }

    /** Stopped while the head was deciding between two cards: nothing was cut, and the next card is next. */
    @Test
    fun `a run stopped between cards is picked up after the last finished one`() {
        val point = CarryOn.pointOf(
            run(RunState.STOPPED, step(1, StepState.DONE), step(2, StepState.DONE), step(3, StepState.SKIPPED)),
        )

        assertEquals(CarryOn.Point(at = 2, begun = false), point)
    }

    /**
     * A loop that ended early leaves skipped rows in the middle of the run. They are not where it stopped:
     * the cards after them ran, and the place to resume is the one cut short after those.
     */
    @Test
    fun `passes a loop never needed are not taken for the place to resume`() {
        val point = CarryOn.pointOf(
            run(
                RunState.FAILED,
                step(1, StepState.DONE, stageId = "loop", pass = 1),
                step(1, StepState.SKIPPED, stageId = "loop", pass = 2),
                step(1, StepState.SKIPPED, stageId = "loop", pass = 3),
                step(2, StepState.DONE, stageId = "after"),
                step(3, StepState.FAILED, stageId = "after"),
            ),
        )

        assertEquals(CarryOn.Point(at = 4, begun = true), point)
    }

    /** Stopped before the head ever answered: the run begins from its opening, at the first card. */
    @Test
    fun `a run that never got going is picked up from the start`() {
        val point = CarryOn.pointOf(run(RunState.STOPPED, step(1, StepState.SKIPPED), step(2, StepState.SKIPPED)))

        assertEquals(CarryOn.Point(at = 0, begun = false), point)
    }

    @Test
    fun `a finished run has nothing to pick up`() {
        assertNull(CarryOn.pointOf(run(RunState.DONE, step(1, StepState.DONE), step(2, StepState.SKIPPED))))
    }

    @Test
    fun `a run still going is not picked up`() {
        assertNull(CarryOn.pointOf(run(RunState.RUNNING, step(1, StepState.RUNNING))))
        assertNull(CarryOn.pointOf(run(RunState.PAUSED, step(1, StepState.PAUSED))))
    }

    /** No head conversation means the head never came up: there is nothing that remembers the run. */
    @Test
    fun `a run whose head never came up is not picked up`() {
        assertNull(CarryOn.pointOf(run(RunState.FAILED, step(1, StepState.SKIPPED), head = "")))
    }
}

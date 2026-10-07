package io.github.crmapache.amazingclaudecode.scenario

import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertSame

/**
 * The run's clock stops while it stands still and goes on when it works again - and the card on the board
 * is told about the same stretch, so its row and the run's clock agree.
 */
class RunClockTest {

    private val run = ScenarioRun(
        steps = listOf(
            RunStep(key = "a", state = StepState.DONE, startedAt = 1, finishedAt = 2),
            RunStep(key = "b", state = StepState.RUNNING, startedAt = 2),
            RunStep(key = "c", state = StepState.WAITING),
        ),
    )

    @Test
    fun `a stretch of standing still is stamped and then added up`() {
        val paused = RunClock.follow(run, resting = true, board = 1, now = 100)
        assertEquals(100, paused.restingSince)

        val back = RunClock.follow(paused, resting = false, board = 1, now = 160)
        assertEquals(0, back.restingSince)
        assertEquals(60, back.rested)
        assertEquals(60, back.steps[1].rested)
        assertEquals(0, back.steps[0].rested)
    }

    /** A pause lifted onto a question a person has to answer is one stretch, not two. */
    @Test
    fun `standing still twice in a row keeps the first stamp`() {
        val paused = RunClock.follow(run, resting = true, board = 1, now = 100)
        val blocked = RunClock.follow(paused, resting = true, board = 1, now = 130)

        assertEquals(100, blocked.restingSince)
        assertEquals(70, RunClock.follow(blocked, resting = false, board = 1, now = 170).rested)
    }

    /** Between two cards - a loop deciding another pass - the stretch is the run's and nobody else's. */
    @Test
    fun `a stretch with no card open on the board belongs to the run alone`() {
        val paused = RunClock.follow(run, resting = true, board = 0, now = 100)
        val back = RunClock.follow(paused, resting = false, board = 0, now = 130)

        assertEquals(30, back.rested)
        assertEquals(listOf(0L, 0L, 0L), back.steps.map { it.rested })
    }

    @Test
    fun `working while working changes nothing`() {
        assertSame(run, RunClock.follow(run, resting = false, board = 1, now = 100))
    }
}

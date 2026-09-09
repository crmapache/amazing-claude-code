package io.github.crmapache.amazingclaudecode.scenario

import kotlin.test.Test
import kotlin.test.assertEquals

/**
 * What a card of a going run says about itself.
 *
 * The summary is the light half of the wire - it goes out once a second to every window and every paired
 * device - and the band of live runs is drawn from it and from nothing else. So where the run has got to
 * is worked out here rather than sent as the whole record, and it is worth a test: read wrongly, the card
 * says "stage 0 of 3" over a run that is halfway through, and nothing else on the screen contradicts it.
 */
class RunSummaryTest {

    private fun card(id: String, title: String) = Card(id = id, title = title)

    private fun scenario() = Scenario(
        id = "s1",
        stages = listOf(
            Stage(id = "read", title = "Read", repeat = 1, cards = listOf(card("c1", "Collect the diff"))),
            Stage(
                id = "round",
                title = "Review, then fix",
                repeat = 3,
                untilDone = true,
                cards = listOf(card("c2", "Review it"), card("c3", "Fix what it found")),
            ),
        ),
    )

    private fun step(cardId: String, stageId: String, title: String, state: String, pass: Int = 1) = RunStep(
        key = ScenarioRules.keyOf(stageId, cardId, pass),
        cardId = cardId,
        stageId = stageId,
        pass = pass,
        title = title,
        state = state,
        startedAt = if (StepState.begun(state)) 1_000L else 0L,
    )

    @Test
    fun `the card a run is on is the one still open`() {
        val run = ScenarioRun(
            snapshot = scenario(),
            steps = listOf(
                step("c1", "read", "Collect the diff", StepState.DONE),
                step("c2", "round", "Review it", StepState.DONE),
                step("c3", "round", "Fix what it found", StepState.RUNNING),
            ),
        )

        val summary = run.summarise()

        assertEquals(2, summary.stage)
        assertEquals(2, summary.stages)
        assertEquals("Fix what it found", summary.at)
        assertEquals(2, summary.done)
    }

    /**
     * A run that is over still says where it got to.
     *
     * The row is about the night that happened, and one with nothing open would otherwise say nothing at
     * all about where it ended - which is exactly the question asked of a run that was cut short.
     */
    @Test
    fun `a finished run is placed by the last card that ever began`() {
        val run = ScenarioRun(
            state = RunState.STOPPED,
            snapshot = scenario(),
            steps = listOf(
                step("c1", "read", "Collect the diff", StepState.DONE),
                step("c2", "round", "Review it", StepState.FAILED),
                step("c3", "round", "Fix what it found", StepState.SKIPPED),
            ),
        )

        assertEquals("Review it", run.summarise().at)
        assertEquals(2, run.summarise().stage)
    }

    /** Which pass, but only where there is a loop to place it in: "pass 1 of 1" is a line about nothing. */
    @Test
    fun `the pass travels only for a stage that goes round`() {
        val looping = ScenarioRun(
            snapshot = scenario(),
            steps = listOf(step("c2", "round", "Review it", StepState.RUNNING, pass = 2)),
        ).summarise()

        assertEquals(2, looping.pass)
        assertEquals(3, looping.passes)

        val once = ScenarioRun(
            snapshot = scenario(),
            steps = listOf(step("c1", "read", "Collect the diff", StepState.RUNNING)),
        ).summarise()

        assertEquals(0, once.pass)
        assertEquals(0, once.passes)
    }

    /** What it stopped to ask, in the CLI's own words - a row that says "Bash" has said nothing. */
    @Test
    fun `the question travels as words, and falls back to the tool`() {
        val asked = ScenarioRun(
            snapshot = scenario(),
            steps = listOf(step("c2", "round", "Review it", StepState.ASKING)),
            question = RunQuestion(title = "Into the report, or the pull request only?", tool = "AskUserQuestion"),
        )

        assertEquals("Into the report, or the pull request only?", asked.summarise().asking)

        val permission = asked.copy(question = RunQuestion(title = "", tool = "Bash"))
        assertEquals("Bash", permission.summarise().asking)

        assertEquals("", asked.copy(question = null).summarise().asking)
    }

    /** A run nothing has begun in says so with a zero rather than with a stage nobody reached. */
    @Test
    fun `a run that has not begun names no stage`() {
        val summary = ScenarioRun(
            snapshot = scenario(),
            steps = listOf(step("c1", "read", "Collect the diff", StepState.WAITING)),
        ).summarise()

        assertEquals(0, summary.stage)
        assertEquals("", summary.at)
    }
}

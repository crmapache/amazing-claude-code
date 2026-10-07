package io.github.crmapache.amazingclaudecode.scenario

import kotlin.test.Test
import kotlin.test.assertEquals

/**
 * What a card of a going run says about itself.
 *
 * The summary is the light half of the wire - it goes out once a second to every window and every paired
 * device - and the band of live runs is drawn from it and from nothing else. So where the run has got to
 * is worked out here rather than sent as the whole record, and it is worth a test: read wrongly, the card
 * names a stage the road under it is not lit in, and nothing else on the screen contradicts it.
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

        assertEquals("Review, then fix", summary.stageTitle)
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

    /**
     * The road of a going run: every card of every pass, in order, with the stage each belongs to.
     *
     * The stage is a number counted from one so that the stage the run is in can be tinted on the road, and it
     * travels by name too - the card of a going run says which stage it is in, over its road.
     */
    @Test
    fun `a going run carries its road and the name of the stage it stands in`() {
        val summary = ScenarioRun(
            state = RunState.RUNNING,
            snapshot = scenario(),
            steps = listOf(
                step("c1", "read", "Collect the diff", StepState.DONE),
                step("c2", "round", "Review it", StepState.RUNNING),
                step("c3", "round", "Fix what it found", StepState.WAITING),
                step("c2", "round", "Review it", StepState.WAITING, pass = 2),
            ),
        ).summarise()

        assertEquals("Review, then fix", summary.stageTitle)
        assertEquals(listOf(1, 2, 2, 2), summary.roadmap.map { it.stage })
        assertEquals(
            listOf(StepState.DONE, StepState.RUNNING, StepState.WAITING, StepState.WAITING),
            summary.roadmap.map { it.state },
        )
        assertEquals(listOf(1, 1, 1, 2), summary.roadmap.map { it.pass })
        assertEquals("Fix what it found", summary.roadmap[2].title)
    }

    /** The table of finished runs draws no road, and the list of them goes out whole - so it is not carried. */
    @Test
    fun `a finished run carries no road`() {
        val run = ScenarioRun(
            state = RunState.DONE,
            snapshot = scenario(),
            steps = listOf(step("c1", "read", "Collect the diff", StepState.DONE)),
        )

        assertEquals(emptyList(), run.summarise().roadmap)
    }

    /** A card's name on the road is a hint's line, however long somebody made it. */
    @Test
    fun `a stop carries its card's name cut short`() {
        val long = "x".repeat(300)
        val run = ScenarioRun(
            state = RunState.RUNNING,
            snapshot = scenario(),
            steps = listOf(step("c1", "read", long, StepState.RUNNING)),
        )

        assertEquals(80, run.summarise().roadmap.single().title.length)
    }

    /** The clock travels as stamps and sums, so a live frame does not change every second for nothing. */
    @Test
    fun `the clock travels as stamps rather than as a figure`() {
        val summary = ScenarioRun(
            state = RunState.PAUSED,
            snapshot = scenario(),
            startedAt = 1_000,
            idle = 5,
            rested = 700,
            restingSince = 9_000,
        ).summarise()

        assertEquals(5, summary.idle)
        assertEquals(700, summary.rested)
        assertEquals(9_000, summary.restingSince)
    }

    /**
     * A run that has not begun a card yet already stands in its first stage, and its road is there.
     *
     * The head reads its brief for some seconds before the first card starts. A card that said nothing over
     * its road in that time, and then grew the line, pushed everything under it down a line under the eye.
     */
    @Test
    fun `a run that has not begun a card stands in its first stage with the whole road ahead`() {
        val waiting = ScenarioRun(
            state = RunState.RUNNING,
            snapshot = scenario(),
            steps = listOf(step("c1", "read", "Collect the diff", StepState.WAITING)),
        ).summarise()

        assertEquals("Read", waiting.stageTitle)
        // No card is "on" yet: the name over the road comes from the stage, not from a card.
        assertEquals("", waiting.at)

        // Before the plan is even written down: the road is the plan, every stop ahead.
        val starting = ScenarioRun(state = RunState.STARTING, snapshot = scenario()).summarise()

        assertEquals("Read", starting.stageTitle)
        assertEquals(1 + 3 * 2, starting.roadmap.size)
        assertEquals(setOf(StepState.WAITING), starting.roadmap.map { it.state }.toSet())
    }

    /** The name over the road is the stage of the lit stop - the first not over - so the two never disagree. */
    @Test
    fun `between two stages the name follows the next stop`() {
        val summary = ScenarioRun(
            state = RunState.RUNNING,
            snapshot = scenario(),
            steps = listOf(
                step("c1", "read", "Collect the diff", StepState.DONE),
                step("c2", "round", "Review it", StepState.WAITING),
            ),
        ).summarise()

        assertEquals("Review, then fix", summary.stageTitle)
    }
}

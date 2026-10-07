package io.github.crmapache.amazingclaudecode.scenario

/**
 * The run's own clock: how long it has genuinely worked, as opposed to how long it has existed.
 *
 * A run is a night, and a night has stretches in which nothing is done: a pause somebody pressed, a question
 * standing until a person wakes up to answer it, an IDE that went away and was opened again in the morning.
 * A clock that counts them says a run "took nine hours" that worked for two, and the table of past runs is
 * read to compare nights - a comparison that only works if the figure is the work.
 *
 * Three things are kept apart, and each is subtracted from the span between start and end:
 * - [ScenarioRun.idle] - between an ending and the moment the run was picked up again (ScenarioEngine.carryOn);
 * - [ScenarioRun.rested] - standing still while it was a run (this file);
 * - the time after an IDE went away - not counted at all, because the run is closed where it was last
 *   written rather than where it was found (RunStore.abandoned).
 *
 * The screens add up the same thing out of the same fields (runWorked in timeline.ts).
 */
internal object RunClock {

    /**
     * The run with its clock set to what the engine is doing now.
     *
     * Entering a stretch of standing still stamps its start; leaving it adds its length to the run and to
     * the card on the board, when one is begun and not over - the row of that card and the run's clock are
     * read side by side and must not disagree about the same pause. Anything else leaves the run as it is,
     * so it may be called on every change of phase.
     */
    fun follow(run: ScenarioRun, resting: Boolean, board: Int, now: Long): ScenarioRun {
        if (resting) return if (run.restingSince == 0L) run.copy(restingSince = now) else run
        if (run.restingSince == 0L) return run

        val length = (now - run.restingSince).coerceAtLeast(0)
        val onBoard = run.steps.getOrNull(board)?.takeIf { StepState.begun(it.state) && !StepState.over(it.state) }

        return run.copy(
            rested = run.rested + length,
            restingSince = 0,
            steps = if (onBoard == null) {
                run.steps
            } else {
                run.steps.map { if (it.key == onBoard.key) it.copy(rested = it.rested + length) else it }
            },
        )
    }
}

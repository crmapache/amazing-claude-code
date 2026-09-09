package io.github.crmapache.amazingclaudecode.scenario

/**
 * Where a finished run is picked up from - see ScenarioEngine.carryOn.
 *
 * A run that was stopped, or fell over, is not the end of the round of work: the main thread's
 * conversation is on the disk and remembers everything it was told, and so is the conversation of the
 * card it was on. What the record does NOT say is which phase the engine was in when it ended - that
 * lived in memory - so it is read back off the steps, and the reading is worth a test because a wrong one
 * either does a card twice or skips one, and both look perfectly healthy on the screen.
 *
 * The rule: the last card that finished is the last thing that certainly happened. After it there is at
 * most one card that had begun - the one cut short - and everything else never had its go. So the run is
 * picked up AT the cut card if there is one, and otherwise right after the last finished one - which is
 * also where a loop is asked "another pass?" again, since that is how the engine steps past a card.
 *
 * "After the last finished card" rather than "the first card that is not done", because of the loop that
 * ended early on purpose: the passes it never needed are skipped rows BEFORE later cards that did run,
 * and counted from the front they would be taken for the place to resume.
 */
internal object CarryOn {

    /** Which step to re-enter at, and whether that step had already begun when the run ended. */
    data class Point(val at: Int, val begun: Boolean)

    /** Null for a run that cannot be picked up: one still going, one that finished, one whose head never came up. */
    fun pointOf(run: ScenarioRun): Point? {
        if (!RunState.finished(run.state) || run.state == RunState.DONE) return null
        if (run.headConversationId.isEmpty()) return null

        val lastDone = run.steps.indexOfLast { it.state == StepState.DONE }
        val cut = run.steps.withIndex().firstOrNull { (index, step) -> index > lastDone && StepState.begun(step.state) }
        if (cut != null) return Point(cut.index, begun = true)

        val next = lastDone + 1
        if (next >= run.steps.size) return null
        return Point(next, begun = false)
    }
}

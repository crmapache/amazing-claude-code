package io.github.crmapache.amazingclaudecode.scenario

import kotlinx.serialization.Serializable

/**
 * A run: one pass of a scenario, as the timeline draws it while it happens and as the history keeps it.
 *
 * The same shape for both on purpose. The timeline somebody watches at midnight and the one they open in
 * the morning are the same timeline, and a second shape for "what happened" would be a second thing to
 * keep in step with the first.
 */

internal object RunState {
    const val STARTING = "starting"
    const val RUNNING = "running"
    /** Everything is interrupted and nothing is being spent; the processes are alive and remember. */
    const val PAUSED = "paused"
    /** Standing on a question a person has to answer - see HeadSettings.onQuestion. */
    const val BLOCKED = "blocked"
    const val DONE = "done"
    const val FAILED = "failed"
    const val STOPPED = "stopped"

    fun finished(state: String): Boolean = state == DONE || state == FAILED || state == STOPPED
}

internal object StepState {
    const val WAITING = "waiting"
    const val RUNNING = "running"
    /** The card stopped on a question of its own and nobody has answered it yet. */
    const val ASKING = "asking"
    /** The head's turn rather than the card's: choosing slots before it, judging what came back after. */
    const val JUDGING = "judging"
    const val PAUSED = "paused"
    const val DONE = "done"
    const val FAILED = "failed"
    /** Its go never came: the run ended, or the loop it belonged to stopped early. */
    const val SKIPPED = "skipped"

    fun over(state: String): Boolean = state == DONE || state == FAILED || state == SKIPPED
    fun begun(state: String): Boolean = state != WAITING && state != SKIPPED
}

/**
 * Why something did not finish, as a name rather than as a sentence.
 *
 * A name because this side has no words: the panel speaks ten languages and the IDE one, so what is
 * written here is drawn on a screen and the sentence for it is chosen there.
 */
internal object RunFailure {
    /** The head session never came up - a missing executable, an account not signed in. */
    const val NO_HEAD = "noHead"
    /** A card's own process would not start. */
    const val NO_START = "noStart"
    /** The ceiling on one card's working time. */
    const val TOO_LONG = "tooLong"
    /** The head went quiet without dying: asked something, and no answer came for a very long time. */
    const val HEAD_SILENT = "headSilent"
    const val CRASHED = "crashed"
    /** An agent's turn ended in an error of its own, and that one comes with its words. */
    const val REFUSED = "refused"
    /** The head answered without ever saying what it decided. */
    const val NO_VERDICT = "noVerdict"
    /** The head kept sending a card back until the ceiling. */
    const val RETRIES = "retries"
    const val STOPPED = "stopped"
    /** The card did not meet its definition of done and the head gave up on it. */
    const val UNDONE = "undone"
}

@Serializable
internal data class ScenarioRun(
    val id: String = "",
    val scenarioId: String = "",
    /** Copied rather than looked up: the scenario may be renamed, or gone, by the time this is read. */
    val scenarioName: String = "",
    val scope: String = ScenarioScope.PROJECT,
    /**
     * The scenario exactly as it was when this run began.
     *
     * Kept whole rather than looked up, and it is not belt and braces. A scenario is edited between runs -
     * that is what the editor is for - so a run drawn against today's flow is a picture of work that never
     * happened: five stages over a night that had two, cards in places nothing ever ran. Worse, a scenario
     * somebody deleted would leave its runs with no picture at all, which is exactly when somebody wants
     * to look at them.
     */
    val snapshot: Scenario = Scenario(),
    val startedAt: Long = 0,
    val finishedAt: Long = 0,
    val state: String = RunState.STARTING,
    /** The answers the person gave to the scenario's inputs before pressing play. */
    val inputs: Map<String, String> = emptyMap(),
    /** How many cards this run intended to start, every pass counted - what the bar is drawn from. */
    val total: Int = 0,
    /** The head's own conversation, once it has one. Its transcript is read like any other. */
    val headConversationId: String = "",
    /**
     * Every card of every pass, in the order they were planned.
     *
     * Written out before anything runs, so the timeline is a timeline from the first second rather than a
     * list that grows a row at a time - see ScenarioRules.plan.
     */
    val steps: List<RunStep> = emptyList(),
    /** What the head said in words as it went, in the order it said it. */
    val notes: List<RunNote> = emptyList(),
    /** The question the run is standing on, when it is standing on one. */
    val question: RunQuestion? = null,
    val failure: String = "",
    /** What the failure came with, in whoever's own words. Empty for the ones nobody explained. */
    val error: String = "",
    /** What the whole thing has cost so far, in dollars - the head's own turns included. */
    val cost: Double = 0.0,
    /**
     * How many tokens it has burnt, the head's own turns included.
     *
     * Beside the money rather than instead of it: the two answer different questions. What it cost is
     * what it took off the plan; how many tokens went through is the size of the work, and it is the one
     * that says whether a step read half the repository (see the panel's own daily counter, which is the
     * same figure over a day).
     */
    val tokens: Long = 0,
)

@Serializable
internal data class RunStep(
    /** stage:card:pass - see ScenarioRules.keyOf. */
    val key: String = "",
    val cardId: String = "",
    val stageId: String = "",
    /** Which pass of the stage this is, counting from one. */
    val pass: Int = 1,
    val title: String = "",
    val state: String = StepState.WAITING,
    /**
     * The conversation it is talking in, once there is one.
     *
     * Also how its log is found: a card is an ordinary conversation of the CLI's, so its transcript is
     * already on the disk and there is nothing here to copy (see StepTranscript).
     */
    val conversationId: String = "",
    val startedAt: Long = 0,
    val finishedAt: Long = 0,
    /** What the head put in the card's slots before starting it. */
    val slots: Map<String, String> = emptyMap(),
    /** The prompt as it was actually said, with the inputs and the slots written in. */
    val prompt: String = "",
    /** What the agent is saying right now, cut short - one line while the turn is open. */
    val said: String = "",
    /** The last thing it said, once the turn is over. What the row reads when nothing is moving. */
    val summary: String = "",
    /** How many times the head sent it back to work, and what it said each time. */
    val nudges: List<String> = emptyList(),
    /** What the head decided about the definition of done, once it has decided. */
    val verdict: String = "",
    val verdictReason: String = "",
    /** What the head carried forward from this card. */
    val handoff: String = "",
    val failure: String = "",
    val error: String = "",
    val cost: Double = 0.0,
    /** How many tokens this card's session burnt - see [ScenarioRun.tokens]. */
    val tokens: Long = 0,
)

/**
 * Something the head said in words while the run was going.
 *
 * The head answers the panel in a small JSON object, but it is asked for a sentence in front of it, and
 * this is that sentence: why it filled a slot the way it did, what it made of what came back. It is the
 * only part of an orchestrator's thinking that is worth a person's eye, and the timeline wedges it in
 * between the cards, where it happened.
 */
@Serializable
internal data class RunNote(
    val at: Long = 0,
    /** The card the head was busy with when it said this. Empty for a word said between stages. */
    val stepKey: String = "",
    val text: String = "",
)

/**
 * A question standing between the run and the rest of the night.
 *
 * Raised by a card - a permission its level of trust did not cover, or a question it asked out loud - and
 * reaching a person only when the scenario is set to stop for them. On the other setting the head answers
 * it and this is never filled in.
 */
@Serializable
internal data class RunQuestion(
    val stepKey: String = "",
    /** What the card wants to do, as the CLI itself words it. */
    val title: String = "",
    val tool: String = "",
    /** Enough of the tool's input to judge by, already shortened. */
    val detail: String = "",
    /** Filled in for a question the agent asked in words rather than for a permission. */
    val options: List<String> = emptyList(),
    val askedAt: Long = 0,
)

/** A run as the list of past runs draws it - without the steps, which are the expensive part. */
@Serializable
internal data class RunSummary(
    val id: String = "",
    val scenarioId: String = "",
    val scenarioName: String = "",
    val scope: String = ScenarioScope.PROJECT,
    val startedAt: Long = 0,
    val finishedAt: Long = 0,
    val state: String = "",
    val total: Int = 0,
    val done: Int = 0,
    val failure: String = "",
    val cost: Double = 0.0,
    /** What it was run with - so the next run of the same scenario can start from the same answers. */
    val inputs: Map<String, String> = emptyMap(),
)

internal fun ScenarioRun.summarise(): RunSummary = RunSummary(
    id = id,
    scenarioId = scenarioId,
    scenarioName = scenarioName,
    scope = scope,
    startedAt = startedAt,
    finishedAt = finishedAt,
    state = state,
    total = total,
    done = steps.count { it.state == StepState.DONE },
    failure = failure,
    cost = cost,
    inputs = inputs,
)

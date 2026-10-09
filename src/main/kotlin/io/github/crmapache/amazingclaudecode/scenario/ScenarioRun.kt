package io.github.crmapache.amazingclaudecode.scenario

import java.time.Instant
import java.time.LocalTime
import java.time.ZoneId
import java.time.format.DateTimeFormatter
import kotlinx.serialization.Serializable
import kotlinx.serialization.json.JsonElement

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
    /** The head took over the work of a card its session could not finish, and could not finish it either. */
    const val HEAD_GAVE_UP = "headGaveUp"
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
    /**
     * The scheduled arrangement that raised this, when one did rather than a hand on the button.
     *
     * Nothing draws it. It exists so that the clock can tell whether the round of work it is about to
     * start is already going FROM THIS ARRANGEMENT - a scenario waiting on a question stands for as long
     * as it takes somebody to answer, and a daily hour would otherwise pile up a run a day in one working
     * copy with nothing on any screen to say why. It travels on the wire because the whole record does,
     * and a field quietly stripped on the way out is a shape that depends on which side you read it from.
     */
    val runFrom: String = "",
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
    /**
     * Time the run was not a run: the gap between an ending and the moment it was picked up again (see
     * ScenarioEngine.carryOn). Subtracted from every clock drawn over it - or a run stopped at midnight
     * and continued after breakfast would say it took nine hours.
     */
    val idle: Long = 0,
    /**
     * Time the run stood still while it was still a run: paused, or standing on a question a person has to
     * answer. Subtracted from its clock the way [idle] is, and for the same reason - a question asked at
     * eleven and answered after breakfast is not nine hours of work. A head deciding a question is work and
     * is not counted here (see RunClock).
     *
     * A sum of lengths rather than a list of stretches, so that [ScenarioEngine.carryOn] moving a stage's
     * stamps past a gap does not have to move anything here as well.
     */
    val rested: Long = 0,
    /** When the stretch it is standing still in began, and 0 while it works or once it is over. */
    val restingSince: Long = 0,
    /**
     * When this record was last written by the IDE walking it (see RunStore.keep).
     *
     * The moment the run was last known to be alive. An IDE that went away mid-run leaves a record that
     * says "running", and it is closed at the next start (see RunStore.repairAbandoned) - at this moment
     * rather than at that start, or the hours the machine lay with nobody walking the run are counted as
     * work. The desk writes a live run at least every half a minute for exactly this (see ScenarioDesk.pulse).
     */
    val writtenAt: Long = 0,
    /**
     * A star a person put on it in the table of past runs - "I have looked at this one", or whatever else they
     * want to find it by later. The panel attaches no meaning to it; it is set and cleared by hand only (see
     * RunStore.star), and a run carried on keeps it, being the same run.
     */
    val starred: Boolean = false,
    /**
     * The head is answering something the person wrote to it, right now (see ScenarioEngine.tell) - what the
     * timeline shows as the main thread writing. Only ever true on a live run.
     */
    val answering: Boolean = false,
    /**
     * The limit the run is waiting out, while it waits: every account it could work on was refused, and it
     * carries on by itself at [RunLimit.until] (see ScenarioEngine.restOnLimit). The run's state is
     * [RunState.PAUSED] meanwhile - nothing is spent and the clock stands - and this is what tells such a
     * pause from one a person took. Null at every other moment.
     */
    val limit: RunLimit? = null,
)

/** A limit a run is waiting out - see [ScenarioRun.limit]. */
@Serializable
internal data class RunLimit(
    /** Whose limit, as the person named the account - empty for the CLI's own sign-in with no name. */
    val account: String = "",
    /** Which window ran out, in the CLI's own words (`five_hour`, `seven_day`...); empty when it did not say. */
    val window: String = "",
    /** When the run looks again, in milliseconds. */
    val until: Long = 0,
    /**
     * Why the account the run is on cannot take it: [RunMove.LIMIT] - its limit refused it; [RunMove.UNFIT] - it
     * is one the run moved to by itself and it failed before a turn went through.
     */
    val reason: String = RunMove.LIMIT,
)

/**
 * The run moved to another account, or stood still because none had room - what the panel itself did to
 * keep a run going, written into the timeline where it happened (see [RunNote.PANEL]).
 *
 * Names and figures rather than a sentence: the panel speaks ten languages, and the sentence is chosen there.
 */
@Serializable
internal data class RunMove(
    /**
     * [LIMIT] - the account it was on ran out; [UNFIT] - an account it had moved to by itself could not take it
     * (a dead sign-in, a model its plan does not have); [CHOICE] - the person chose another account.
     */
    val reason: String = "",
    /** The account it left, as the person named it - empty for the CLI's own sign-in with no name. */
    val from: String = "",
    /** The account it went to, named the same way - empty for an unnamed CLI sign-in, and when it waits. */
    val to: String = "",
    /**
     * Nothing had room and the run waits rather than moving. Its own flag rather than an empty [to]: the CLI's
     * own sign-in with no name and no known address is an empty name too, and a move onto it read as a wait.
     */
    val waits: Boolean = false,
    /** For [LIMIT]: which window ran out, in the CLI's own words. */
    val window: String = "",
    /** For [LIMIT]: when that window resets - or, for a wait, when the run looks again. 0 when unknown. */
    val until: Long = 0,
) {
    /**
     * The sentence in English, for a phone whose page is older than the panel's own notes: it draws [RunNote.text]
     * under the main thread's name and knows nothing of [RunNote.move]. A screen that knows the move chooses its
     * own words, in its own language (see scenarios/moves.ts).
     */
    fun inEnglish(): String {
        val origin = from.ifBlank { "the Claude Code sign-in" }
        val target = to.ifBlank { "the Claude Code sign-in" }
        val clock = if (until > 0) LocalTime.ofInstant(Instant.ofEpochMilli(until), ZoneId.systemDefault()).format(CLOCK) else ""
        val waiting = if (clock.isEmpty()) "The run waits." else "The run waits and goes on by itself at $clock."
        val ranOut = WINDOW_NAMES[window]?.let { "The $it limit" } ?: "The usage limit"

        return when {
            reason == CHOICE -> "Moved the run to $target - the account you chose."
            reason == UNFIT && waits -> "$origin could not take the run, and no other account has room. $waiting"
            reason == UNFIT -> "$origin could not take the run. Moved the run to $target."
            waits -> "$ranOut of $origin ran out, and no other account has room. $waiting"
            else -> "$ranOut of $origin ran out. Moved the run to $target."
        }
    }

    companion object {
        const val LIMIT = "limit"
        const val UNFIT = "unfit"
        const val CHOICE = "choice"

        private val CLOCK = DateTimeFormatter.ofPattern("HH:mm")

        /** The windows by the names the panel's English uses for them (see limitWindowName in feed/usage.ts). */
        private val WINDOW_NAMES = mapOf(
            "five_hour" to "5-hour",
            "seven_day" to "weekly",
            "seven_day_opus" to "weekly Opus",
            "seven_day_sonnet" to "weekly Sonnet",
            "seven_day_overage_included" to "weekly Fable",
        )
    }
}

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
    /**
     * What the agent is saying right now while the turn is open: its newest words, a paragraph per block
     * of text (see LiveWords).
     */
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
    /**
     * Why the head took this card's work over from its own session, cut short - and empty when it never
     * had to (see HeadSettings.onGiveUp).
     *
     * A reason rather than a flag, because the morning's question about such a row is not "was it taken
     * over" but "what did the card get stuck on", and that is the one thing the verdict written over it
     * afterwards no longer says. The head's own spending stays on the run rather than on the step: its
     * running total is one conversation's, and a share of it moved onto a card would be counted twice
     * the next time the run is picked up (see ScenarioEngine.carryOn).
     */
    val takeOver: String = "",
    /**
     * Time the run stood still while this card was the one on the board - see [ScenarioRun.rested].
     * Subtracted from the card's own span, so the row and the run's clock agree about the same pause.
     */
    val rested: Long = 0,
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
    /**
     * Who said it: the head (empty), or the person running the scenario, who can write to the head while the
     * run goes (see ScenarioEngine.tell). Empty for the head so that every note written before the person
     * could speak reads as what it was.
     */
    val who: String = "",
    /**
     * For a person's note: when it reached the head, and 0 while it is waiting for the head to be free to read
     * it - a head in the middle of judging a card is not interrupted for it (see ScenarioEngine.deliverTold).
     */
    val deliveredAt: Long = 0,
    /** For the head's answer to the person: what it passed on to the card at work, and empty when nothing. */
    val relayed: String = "",
    /**
     * For a person's note: what they wrote as the panel's field holds it - text and attachment chips in the
     * order they were put in - so the timeline draws it the way a chat draws a sent message. [text] is what
     * the head was told; this is only for the eye, and carries no image bytes (see HeadMail.shown).
     */
    val tokens: JsonElement? = null,
    /** For a note of the panel's own: the account it moved the run to, and why (see [PANEL]). */
    val move: RunMove? = null,
) {
    companion object {
        /** [who] of a note the person wrote. */
        const val PERSON = "person"

        /**
         * [who] of a note the panel itself wrote: it moved the run to another account, or put it to wait for
         * a limit. Neither the head's words nor the person's - drawn as the panel's, from [move].
         */
        const val PANEL = "panel"
    }
}

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

/**
 * A run as the lists draw it - without the steps, which are the expensive part.
 *
 * The fields under [inputs] are what a CARD of a going run says about itself: where it has got to, what it
 * has burnt, and what it has stopped to ask. They were added when the list of live runs became a band of
 * cards rather than a row each - "2/5 cards" answers how far, and nothing answered what it is doing - and
 * they are worked out here rather than sent as the whole record, which is tens of kilobytes and moves four
 * times a second.
 */
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
    /** How many tokens it has burnt so far - see [ScenarioRun.tokens]. */
    val tokens: Long = 0,
    /** See [ScenarioRun.idle]. */
    val idle: Long = 0,
    /**
     * See [ScenarioRun.rested] and [ScenarioRun.restingSince]. Stamps and sums rather than a running
     * figure: the live frame goes out every second and is only sent on when it changed (see
     * RemoteAgent.newFacts), and a clock worked out here would change it every time.
     */
    val rested: Long = 0,
    val restingSince: Long = 0,
    /**
     * The name of the stage the run stands in - the one line over the road on its card.
     *
     * Read off the road rather than off [at]: the stage of the first stop that is not over, so the name and
     * the lit stop never disagree, and a run that has not begun a card yet - the head reading its brief - is
     * already standing in its first stage. Left empty there, the line came a few seconds after the card and
     * pushed everything under it down.
     */
    val stageTitle: String = "",
    /** The card it is on right now, by name - what the card says over its road for an IDE with no stage name. */
    val at: String = "",
    /** What it has stopped to ask, in the CLI's own words. Empty when it is not standing on anything. */
    val asking: String = "",
    /**
     * Every card of every pass, in order, as the row of stops on the card of a going run draws it.
     *
     * Only while the run goes. The table of finished runs draws no road, and the list of them goes out
     * whole - a hundred nights carrying a hundred roads nobody draws, to a phone whose frame has a cap.
     */
    val roadmap: List<RoadmapStop> = emptyList(),
    /** See [ScenarioRun.starred]. */
    val starred: Boolean = false,
    /** See [ScenarioRun.limit]: the card of a run waiting out a limit says whose and until when. */
    val limit: RunLimit? = null,
)

/** One card of one pass on the road of a going run: how it stands, and where it belongs. */
@Serializable
internal data class RoadmapStop(
    val state: String = "",
    /** Which stage it belongs to, counting from one - what the tint behind the stage the run is in follows. */
    val stage: Int = 0,
    val pass: Int = 1,
    /** Its name, cut short: read in a hint over the stop, and beside the stop the run is on. */
    val title: String = "",
)

/** How much of a card's name its stop on the road carries - a hint's line, not the card's prompt. */
private const val ROADMAP_TITLE = 80

internal fun ScenarioRun.summarise(): RunSummary {
    /*
     * The card the run is on: the first that is still open, and failing that the last that ever began.
     *
     * "The last that began" matters for a run that has finished or been stopped - the card it got to is
     * what the row is about, and a run with nothing open would otherwise say nothing at all about where it
     * ended.
     */
    val here = steps.firstOrNull { !StepState.over(it.state) && StepState.begun(it.state) }
        ?: steps.lastOrNull { StepState.begun(it.state) }
    val stageOf = snapshot.stages.mapIndexed { index, one -> one.id to index + 1 }.toMap()

    /*
     * The road, and the stage it stands in.
     *
     * Before its plan is written down (the first moment of a run, see ScenarioEngine.begin) the road is the
     * plan itself, every stop ahead: a card that grows its road a second after it appears jumps under the
     * eye, and it is the same road a moment later anyway.
     */
    val road = if (steps.isNotEmpty()) {
        steps.map { RoadmapStop(state = it.state, stage = stageOf[it.stageId] ?: 0, pass = it.pass, title = it.title) }
    } else {
        ScenarioRules.plan(snapshot).map {
            RoadmapStop(state = StepState.WAITING, stage = stageOf[it.stageId] ?: 0, pass = it.pass, title = it.title)
        }
    }
    val standing = road.firstOrNull { !StepState.over(it.state) } ?: road.lastOrNull()
    val standingTitle = snapshot.stages.getOrNull((standing?.stage ?: 1) - 1)?.title.orEmpty()

    return RunSummary(
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
        tokens = tokens,
        idle = idle,
        rested = rested,
        restingSince = restingSince,
        stageTitle = standingTitle,
        at = here?.title.orEmpty(),
        // The words rather than the tool's name: a row that says "Bash" has said nothing about what it is
        // being asked. The tool is the fallback for a permission the CLI worded no other way.
        asking = question?.let { it.title.ifBlank { it.tool } }.orEmpty(),
        roadmap = if (RunState.finished(state)) emptyList() else road.map { it.copy(title = it.title.take(ROADMAP_TITLE)) },
        starred = starred,
        limit = limit,
    )
}

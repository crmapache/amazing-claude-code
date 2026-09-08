package io.github.crmapache.amazingclaudecode.scenario

import kotlinx.serialization.SerialName
import kotlinx.serialization.Serializable
import kotlinx.serialization.Transient

/**
 * A scenario: the round of work somebody repeats, written down once so the panel can walk it.
 *
 * The shape is a flow read top to bottom. A stage is a step of the round and exists for one reason - it
 * is the thing that can be sent round again. A card is one thing said to one conversation of its own,
 * and the cards of a stage happen one after another, so a card may be written in the knowledge that the
 * one above it has already finished.
 *
 * Two readers, and which one a field is addressed to is the whole of understanding this file. [Card.prompt]
 * is said to the card's own session and is the work. [Card.dod] and [Card.after] are read by the head:
 * they are how it knows the card is finished and what to carry forward. Mixing the two is how a scenario
 * ends up asking an agent to satisfy a definition of done it was never shown.
 */

/** The format's own number. A file from a later version is listed but never run - see ScenarioStore. */
internal const val SCENARIO_VERSION = 1

/** How many passes a stage may be given. Ten because the picker has to end somewhere. */
internal const val MAX_STAGE_REPEAT = 10

/** How many extra goes the head may give one card before the card is called failed. */
internal const val MAX_CARD_RETRIES = 5

/** Where a scenario lives: in the repository, or in the person's own Claude home. */
internal object ScenarioScope {
    const val PROJECT = "project"
    const val USER = "user"

    fun normalize(raw: String): String = if (raw == USER) USER else PROJECT
}

@Serializable
internal data class Scenario(
    val version: Int = SCENARIO_VERSION,
    /** Stable for the life of the scenario: runs are filed under it, not under the name. */
    val id: String = "",
    val name: String = "",
    val createdAt: Long = 0,
    val updatedAt: Long = 0,
    /** What the person is asked for when they press play - written into card text as {{name}}. */
    val inputs: List<ScenarioInput> = emptyList(),
    /** The session that runs the whole thing and decides what the cards were asking about. */
    val head: HeadSettings = HeadSettings(),
    val stages: List<Stage> = emptyList(),
    /**
     * Which of the two shelves this was read off.
     *
     * Deliberately not written to the file. The shelf is where the file lies, not what it says: a
     * scenario copied from the repository into the personal folder would otherwise go on calling itself
     * a project one, and the panel would offer to delete it from a place it is not in.
     */
    @Transient val scope: String = ScenarioScope.PROJECT,
)

/**
 * One thing asked before a run begins.
 *
 * [name] is what a card's text writes as `{{name}}`; the rest is for the little form. Kept apart from
 * the cards on purpose: the same scenario is run against a different task every day, and a value pasted
 * into the text of a card would be a new scenario each time.
 */
@Serializable
internal data class ScenarioInput(
    val id: String = "",
    val name: String = "",
    val label: String = "",
    val placeholder: String = "",
    val required: Boolean = false,
)

/**
 * The head of the run - one Claude session that lives as long as the run does.
 *
 * It is not a card and it does not do the work. It is told what the round of work is for, it fills each
 * card's slots, it reads what came back, it decides whether the card is done, and it answers the
 * questions the cards raise so that a night does not stop on a permission prompt.
 */
@Serializable
internal data class HeadSettings(
    /** What this round of work is about, in the person's own words. Joins the head's system prompt. */
    val briefing: String = "",
    /** Empty means whatever the panel would start a new tab with, for both. */
    val model: String = "",
    val effort: String = "",
    /**
     * How much a card is trusted before it has to stop and ask - the default every card falls back to.
     *
     * On the head rather than on the cards because it is a fact about the scenario: "this round of work
     * may edit files" is the sort of thing somebody decides once, for the whole of it. A card that needs
     * to differ says so for itself.
     */
    val permissionMode: String = "default",
    /**
     * What happens when a card asks something - a permission it was not trusted with, or a question of
     * its own.
     *
     * `head` hands the question to the session running the show, which answers it from the briefing and
     * from everything it has watched happen so far. That is the setting a night is left on.
     *
     * `stop` stands the run still, marks the card, and waits for a person. That is the setting for a
     * round of work that touches something irreversible.
     */
    val onQuestion: String = ON_QUESTION_HEAD,
    /**
     * How many times the head may send a card back to work after judging its definition of done unmet.
     *
     * A ceiling rather than a suggestion: the retry goes into the same session, so a card that
     * misunderstands the task misunderstands it again, and without a ceiling that is a night spent on
     * one card. Zero means one go and no second chances.
     */
    val retries: Int = 2,
) {
    internal companion object {
        const val ON_QUESTION_HEAD = "head"
        const val ON_QUESTION_STOP = "stop"
    }
}

@Serializable
internal data class Stage(
    val id: String = "",
    val title: String = "",
    /** How many times this stage runs, the first pass included. One is the ordinary case. */
    val repeat: Int = 1,
    /**
     * Whether [repeat] is a ceiling rather than a count.
     *
     * False is "exactly this many passes". True is "up to this many, and the head stops as soon as it
     * decides there is nothing left to do" - which is what review, fix, review again actually is: a loop
     * whose length nobody knows when they write it down. The timeline draws the passes that have not
     * happened yet as planned rather than as work, and drops them when the head ends the loop early.
     */
    val untilDone: Boolean = false,
    val cards: List<Card> = emptyList(),
)

/**
 * One thing said to one session of its own.
 *
 * Two kinds of placeholder in [prompt], and they are different on purpose. `{{name}}` is a scenario
 * input: the person types it once, before the run, and it is the same in every card. `[[name]]` is a
 * slot: the head fills it the moment it starts this card, from what the cards above found out. The first
 * is a constant of the run, the second is the run talking to itself, and one syntax for both would hide
 * which is which at exactly the moment somebody is debugging a flow that went wrong.
 */
@Serializable
internal data class Card(
    val id: String = "",
    /** What the card is called in the flow. Never sent to anybody - it is for the person's eye. */
    val title: String = "",
    val prompt: String = "",
    /** What the head must fill in before this card may start - the `[[name]]` in the prompt. */
    val slots: List<CardSlot> = emptyList(),
    /** How the head is to tell this card is finished. Empty means the turn ending is enough. */
    val dod: String = "",
    /** What the head should do once this card is done - check something, note something down. */
    val after: String = "",
    /** Empty means "the same as the head" for all three. */
    val model: String = "",
    val effort: String = "",
    @SerialName("permissionMode") val permissionMode: String = "",
)

@Serializable
internal data class CardSlot(
    val id: String = "",
    /** Written in the prompt as [[name]]. */
    val name: String = "",
    /** What the head is to put here, in the person's words. This is the whole of the instruction. */
    val description: String = "",
)

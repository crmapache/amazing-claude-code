package io.github.crmapache.amazingclaudecode.scenario

/**
 * What a scenario means, as arithmetic rather than as opinion: which names its text mentions, what gets
 * written where, and what is wrong with it.
 *
 * Mirrored in webview/src/scenarios/rules.ts, and that is a deliberate second copy rather than an
 * oversight - the same case as Frame.kt/frame.ts and Words/searchText.ts. The editor has to say what is
 * wrong while somebody types, which is a question asked on every keystroke and cannot be a round trip to
 * this side; and the run has to be refused before a process is raised, which cannot be left to a screen
 * that a phone or a stale page might not have run. Tests on both sides hold the same examples.
 */
internal object ScenarioRules {

    private val SCENARIO_RE = Regex("\\{\\{\\s*([a-zA-Z0-9_-]+)\\s*}}")
    private val SLOT_RE = Regex("\\[\\[\\s*([a-zA-Z0-9_-]+)\\s*]]")
    /** What an input or a slot may be called - the model's answers are held to it too (see ScenarioAuthor). */
    internal val NAME_RE = Regex("^[a-zA-Z0-9_-]+$")

    /** The `{{name}}` a piece of text mentions, in the order it mentions them, without repeats. */
    fun mentionedInputs(text: String): List<String> = names(text, SCENARIO_RE)

    /** The `[[name]]` a piece of text mentions - the slots the head has to fill before it may start. */
    fun mentionedSlots(text: String): List<String> = names(text, SLOT_RE)

    private fun names(text: String, re: Regex): List<String> =
        re.findAll(text).map { it.groupValues[1] }.distinct().toList()

    /**
     * A card's text with the run's answers written into it.
     *
     * An unknown name is left standing rather than emptied. A prompt that says `{{ticket}}` out loud is a
     * mistake somebody can see; one that quietly lost the ticket number is a turn that goes off and does
     * the wrong thing to the wrong branch.
     */
    fun fillInputs(text: String, values: Map<String, String>): String =
        SCENARIO_RE.replace(text) { match -> values[match.groupValues[1]] ?: match.value }

    /** The same for the slots the head filled in. */
    fun fillSlots(text: String, values: Map<String, String>): String =
        SLOT_RE.replace(text) { match -> values[match.groupValues[1]] ?: match.value }

    /**
     * The slots a card really has: the ones it declared, plus any `[[name]]` in the prompt nobody
     * declared.
     *
     * The second half matters more than it looks. A name left in a prompt with no declaration behind it
     * is a name nobody will ever be asked to fill, and the card's session would be handed the literal
     * text `[[findings]]` and asked to make sense of it. Listing it here turns a silent wrong answer into
     * a slot the head can see and fill.
     */
    fun declaredSlots(card: Card): List<CardSlot> {
        val declared = card.slots.filter { it.name.isNotBlank() }
        val known = declared.map { it.name }.toSet()
        val stray = mentionedSlots(card.prompt)
            .filterNot(known::contains)
            .map { CardSlot(id = it, name = it, description = "") }
        return declared + stray
    }

    /** How many cards a whole run of the scenario will start, every pass counted. */
    fun cardRuns(scenario: Scenario): Int =
        scenario.stages.sumOf { stage -> stage.cards.size * passesOf(stage) }

    /** How many passes a stage is given - clamped, because the file on disk is not to be trusted. */
    fun passesOf(stage: Stage): Int = stage.repeat.coerceIn(1, MAX_STAGE_REPEAT)

    /**
     * What is wrong with a scenario, as names the interface has words for.
     *
     * Checked rather than trusted because a scenario is edited in a form and run at midnight: the gap
     * between the two is where a missing name in a prompt turns into a card asking an agent to read the
     * file at `[[findings]]`.
     */
    data class Problem(val kind: String, val stageId: String = "", val cardId: String = "", val name: String = "")

    object Problems {
        const val NO_STAGES = "noStages"
        const val EMPTY_STAGE = "emptyStage"
        const val NO_PROMPT = "noPrompt"
        const val UNKNOWN_INPUT = "unknownInput"
        const val UNDECLARED_SLOT = "undeclaredSlot"
        const val UNUSED_SLOT = "unusedSlot"
        const val DUPLICATE_INPUT = "duplicateInput"
        const val DUPLICATE_SLOT = "duplicateSlot"
        const val BAD_INPUT_NAME = "badInputName"
        const val BAD_SLOT_NAME = "badSlotName"
        const val MISSING_INPUT = "missingInput"
    }

    fun problemsOf(scenario: Scenario): List<Problem> {
        val problems = ArrayList<Problem>()
        val inputNames = LinkedHashSet<String>()

        for (input in scenario.inputs) {
            when {
                !NAME_RE.matches(input.name) -> problems.add(Problem(Problems.BAD_INPUT_NAME, name = input.name))
                !inputNames.add(input.name) -> problems.add(Problem(Problems.DUPLICATE_INPUT, name = input.name))
            }
        }

        if (scenario.stages.isEmpty()) problems.add(Problem(Problems.NO_STAGES))

        for (stage in scenario.stages) {
            if (stage.cards.isEmpty()) problems.add(Problem(Problems.EMPTY_STAGE, stageId = stage.id))

            for (card in stage.cards) {
                if (card.prompt.isBlank()) problems.add(Problem(Problems.NO_PROMPT, cardId = card.id))

                val slotNames = LinkedHashSet<String>()
                for (slot in card.slots) {
                    when {
                        !NAME_RE.matches(slot.name) ->
                            problems.add(Problem(Problems.BAD_SLOT_NAME, cardId = card.id, name = slot.name))

                        !slotNames.add(slot.name) ->
                            problems.add(Problem(Problems.DUPLICATE_SLOT, cardId = card.id, name = slot.name))
                    }
                }

                // The prompt is the only place either kind is read from, because the prompt is the only
                // thing that reaches an agent.
                for (name in mentionedInputs(card.prompt)) {
                    if (name !in inputNames) {
                        problems.add(Problem(Problems.UNKNOWN_INPUT, cardId = card.id, name = name))
                    }
                }
                val used = mentionedSlots(card.prompt).toSet()
                for (name in used) {
                    if (name !in slotNames) {
                        problems.add(Problem(Problems.UNDECLARED_SLOT, cardId = card.id, name = name))
                    }
                }
                for (slot in card.slots) {
                    if (slot.name.isNotBlank() && slot.name !in used) {
                        problems.add(Problem(Problems.UNUSED_SLOT, cardId = card.id, name = slot.name))
                    }
                }
            }
        }

        return problems
    }

    /**
     * Which problems stop a run and which are only worth saying out loud.
     *
     * A slot declared and never used is untidy; a slot used and never declared is a card whose prompt
     * reaches the agent with `[[findings]]` still in it, because nobody was ever asked to fill it.
     */
    fun blocking(problem: Problem): Boolean = problem.kind != Problems.UNUSED_SLOT

    /** Whether the scenario may be started at all. */
    fun runnable(scenario: Scenario): Boolean = problemsOf(scenario).none(::blocking)

    /**
     * The inputs the person left empty that the scenario said it needed.
     *
     * Answered here rather than by the form, for the reason the rest of this file exists: the form is one
     * client's opinion, and the run is raised by whoever asked.
     */
    fun missingInputs(scenario: Scenario, values: Map<String, String>): List<String> =
        scenario.inputs
            .filter { it.required && it.name.isNotBlank() && values[it.name].orEmpty().isBlank() }
            .map { it.name }

    /**
     * The answers a run walks with: every name the scenario declared, whether anybody typed in it or not.
     *
     * A field the person never touched is not in what the form sends - only the ones they typed in are -
     * and [fillInputs] leaves a name it has no answer for standing. So an optional question left alone
     * reached the agent as the literal `{{notes}}`, while the same question typed in and cleared again
     * reached it as nothing: the prompt depended on whether a field had been touched rather than on what
     * was in it. The head was told "(left empty)" for both, so the two halves of one start said different
     * things about it.
     *
     * Filled here rather than by the form for the reason the rest of this file exists: the form is one
     * client's opinion, and the run is raised by whoever asked. A name that is NOT declared still stands -
     * that one is a typo in a prompt, and [fillInputs] says why it must be seen.
     */
    fun answers(scenario: Scenario, values: Map<String, String>): Map<String, String> {
        val declared = scenario.inputs
            .filter { it.name.isNotBlank() }
            .associate { it.name to values[it.name].orEmpty() }
        return values + declared
    }

    /**
     * The whole walk written out before it starts: every card of every pass, in the order they will run.
     *
     * Written down rather than worked out as it goes, because it is the picture: the timeline shows six
     * cards for two cards looped three times, and it shows them before any of them has happened. A stage
     * that stops as soon as the head says so simply leaves the tail of its passes unrun (see
     * [Stage.untilDone]) - the plan is what was intended, not a promise.
     */
    data class Planned(val key: String, val stageId: String, val cardId: String, val pass: Int, val title: String)

    fun plan(scenario: Scenario): List<Planned> = buildList {
        for (stage in scenario.stages) {
            for (pass in 1..passesOf(stage)) {
                for (card in stage.cards) {
                    add(
                        Planned(
                            key = keyOf(stage.id, card.id, pass),
                            stageId = stage.id,
                            cardId = card.id,
                            pass = pass,
                            title = card.title.ifBlank { "Untitled" },
                        ),
                    )
                }
            }
        }
    }

    /**
     * What one go at one card is called.
     *
     * The card's own identifier is not enough: a stage set to go round three times contributes three of
     * these, and they are three different things that happened.
     */
    fun keyOf(stageId: String, cardId: String, pass: Int): String = "$stageId:$cardId:$pass"
}

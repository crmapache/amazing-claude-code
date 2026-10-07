package io.github.crmapache.amazingclaudecode.scenario

import kotlinx.serialization.json.Json
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.jsonObject

/**
 * What is said to the head, and how what comes back is read.
 *
 * The head is a Claude session with no tools of ours: the panel asks it a question and reads its answer,
 * one question at a time. That is a deliberate choice over giving it tools to drive the board with. The
 * shape of the round of work - which stage is next, how many passes, which card follows which - belongs
 * to the engine, and a head able to start a card whenever it liked would be free to skip a stage, to loop
 * on one card, or to decide at four in the morning that the flow was wrong. A board whose picture is not
 * what happens is not a board.
 *
 * Every answer is a sentence for the person followed by a small JSON object for the machine, and both
 * halves earn their place. The object is what the engine acts on. The sentence is the only part of an
 * orchestrator's thinking anybody wants to read in the morning, and the timeline wedges it in between the
 * cards, where it was said.
 */
internal object HeadTalk {

    /**
     * What the head is told at launch, as one line without a quotation mark in it.
     *
     * Short, and short for a reason that is not taste: this travels as a command-line argument, where a
     * newline or a quote ends the command halfway through on Windows (see ClaudeLaunch). Everything with
     * any shape to it - the person's briefing, the rules, the run's own facts - is said in the first
     * message instead, where none of that applies.
     */
    const val HEAD_BRIEFING =
        "You are the main thread of a scenario run in the Amazing Claude Code panel of a JetBrains IDE. " +
            "Nobody is watching this conversation as it is written: it is read afterwards, in a timeline " +
            "of the run. You do not do the work yourself - each step of the scenario is carried out by a " +
            "separate Claude Code session in the same project, and you decide what to tell it and whether " +
            "what came back is what was asked for. Answer every message with one or two sentences for the " +
            "person, then a fenced json block holding exactly the object that message asks you for."

    /**
     * What the head is told at launch while it is doing a card's work itself (see ScenarioEngine.takeOver).
     *
     * A briefing of its own rather than the ordinary one with a line added: the ordinary one says in so
     * many words that the head does not do the work, and a process raised to do exactly that would start
     * from a system prompt saying the opposite. What lifts the role is the message handing the card over
     * (see [takeOverRequest]) - a paragraph in the system prompt loses to a transcript that is all the
     * other way, which the tab continuing a run's head measured (see ClaudeLaunch.AFTER_SCENARIO_HEAD) -
     * so this only has to stop contradicting it. Same one-line rule as the others.
     */
    const val TAKE_OVER_BRIEFING =
        "You are the main thread of a scenario run in the Amazing Claude Code panel of a JetBrains IDE, " +
            "and for now you are finishing the work of one card yourself, because its own session could " +
            "not. Nobody is watching this conversation as it is written. For this card you have the tools " +
            "and the trust every card of the run has, within what the briefing allows. When the work is " +
            "done, or cannot be, end with one or two sentences for the person, then a fenced json block " +
            "holding exactly the object the message handing you the card asked for."

    /**
     * What a card is told, beyond its own prompt. Same one-line rule, same reason.
     *
     * Short on purpose in a second sense as well: a card is meant to read as an ordinary task in an
     * ordinary repository, and the more it is told about the machinery around it, the more of its answer
     * is about the machinery.
     *
     * The one piece of machinery it is told about is the one it cannot see: its helpers started in the
     * background are waited for before its answer is read, and a command started there is not - a dev
     * server never ends (see BackgroundWork). A card that ended its turn to wait for its tests would be
     * judged on "waiting for the tests" and sent back for the rest.
     */
    const val CARD_BRIEFING =
        "This turn is one step of a scenario being run by the Amazing Claude Code panel of a JetBrains " +
            "IDE. Nobody is sitting in front of this session. Another Claude session is running the " +
            "scenario: it gave you this task, it reads your answer, and it decides whether the step is " +
            "done - so finish by saying plainly what you did and what came of it, because that answer is " +
            "the whole of what it sees. If you need a decision the task does not cover, ask for it: the " +
            "main thread answers, and it answers quickly. A command you run in the background is not " +
            "waited for: if you need what it returns, wait for it before you end your turn."

    /** The first message of the run: what it is for, how the board works, and what to answer with. */
    fun opening(scenario: Scenario, projectPath: String, inputs: Map<String, String>, total: Int): String {
        val said = scenario.head.briefing.trim()

        return buildString {
            appendLine("# The run you are the main thread of")
            appendLine()
            appendLine("## What this run is for")
            appendLine()
            appendLine(said.ifEmpty { "(Nothing was written here. Go by the steps themselves.)" })
            appendLine()
            appendLine("## How this works")
            appendLine()
            appendLine(
                "The round of work is stages, and a stage holds cards. The panel walks that shape itself " +
                    "and hands you exactly one card at a time, in order. You cannot reach the others and " +
                    "you are not meant to: the timeline on the screen is what happens, and a main thread free to " +
                    "reorder it would make that picture a guess. Do not ask for a card you have not been " +
                    "handed, and do not do a card's work yourself - you have no Write and no Edit here.",
            )
            if (scenario.head.onGiveUp == HeadSettings.ON_GIVE_UP_HEAD) {
                appendLine()
                appendLine(
                    "One exception, and it is this scenario's choice: a card its own session could not " +
                        "finish is handed to you, and then you do its work yourself before the run moves " +
                        "on. You will be told so in as many words when it happens, and not before.",
                )
            }
            appendLine()
            appendLine("For each card you will be asked, in this order:")
            appendLine()
            appendLine("1. **What to put in its slots** - from what the cards before it found out.")
            appendLine("2. **What to do about a question it stopped on**, if it stops on one.")
            appendLine("3. **Whether it is done**, once its turn is over, judged against its definition of done.")
            appendLine()
            appendLine(
                "Every message ends by naming the json object it wants back. Answer with one or two " +
                    "sentences first - those are shown to the person in the timeline, so say what you " +
                    "decided and why, not what you are about to do - and then the object in a ```json " +
                    "fence. Nothing else.",
            )
            appendLine()
            appendLine("## This run")
            appendLine()
            appendLine("- Project folder: $projectPath")
            appendLine("- Cards to get through: $total")
            appendLine()
            if (scenario.inputs.isNotEmpty()) {
                appendLine(
                    "What the person answered before pressing play. These are already written into the " +
                        "card prompts, so this is for your understanding rather than for pasting:",
                )
                appendLine()
                for (input in scenario.inputs) {
                    appendLine("- ${input.name}: ${inputs[input.name].orEmpty().ifBlank { "(left empty)" }}")
                }
                appendLine()
            }
            append("Say you have read this, and answer with `{\"ready\": true}`.")
        }
    }

    /**
     * Handing over one card: what its session will be told, what has to be filled in first, and how the
     * head will be expected to judge it.
     *
     * Written as a briefing rather than as a data structure, because the reader is a model and the thing
     * it is worst at is a wall of JSON with three different audiences in it. Each part says who it is
     * for: the prompt is for the card, the definition of done is for the head, the slots are the one
     * thing the head has to produce before anything can start.
     */
    fun handover(
        stage: Stage,
        card: Card,
        index: Int,
        total: Int,
        pass: Int,
        passes: Int,
        prompt: String,
        retries: Int,
        handsOver: Boolean = false,
    ): String {
        val slots = ScenarioRules.declaredSlots(card)

        return buildString {
            appendLine("# Card $index of $total - ${card.title.ifBlank { "Untitled" }}")
            appendLine()
            appendLine(if (passes > 1) "Stage ${stage.title}, pass $pass of $passes." else "Stage ${stage.title}.")
            if (passes > 1 && pass > 1) {
                appendLine()
                appendLine(
                    "This stage is going round again. The cards of an earlier pass have already run; this " +
                        "is a fresh session of the same card, so it remembers nothing of them - tell it " +
                        "what it needs through its slots.",
                )
            }
            appendLine()
            appendLine("## What its session will be told")
            appendLine()
            appendLine("```")
            appendLine(prompt)
            appendLine("```")
            appendLine()

            if (slots.isEmpty()) {
                appendLine("## Slots")
                appendLine()
                appendLine("This card declares none. Answer with an empty object for `slots`.")
            } else {
                appendLine("## Slots you must fill")
                appendLine()
                appendLine(
                    "Each appears in the prompt above as `[[name]]` and is replaced by what you give it, " +
                        "exactly as it stands. Give a path, not a sentence about a path.",
                )
                appendLine()
                /*
                 * Said out loud because a blank is refused and the run ends on it (see
                 * ScenarioEngine.startCard). There are slots nothing has happened for yet - the result of
                 * a pass that has not run, a list from a stage that found nothing - and left to itself the
                 * head answers those with an empty string, which reads on this side as "the head would not
                 * fill it" and fails the whole run on its first loop.
                 */
                appendLine(
                    "Never answer with an empty value. When nothing has happened for a slot yet - a first " +
                        "pass, a stage that found nothing - say that in words, in the language of the card.",
                )
                appendLine()
                for (slot in slots) {
                    val description = slot.description.trim().ifEmpty { "(used in the prompt but never described)" }
                    appendLine("- **${slot.name}** - $description")
                }
            }
            appendLine()
            appendLine("## Definition of done")
            appendLine()
            appendLine(
                card.dod.trim().ifEmpty {
                    "(Nothing written. The turn ending without an error is enough - unless what comes back " +
                        "plainly contradicts the prompt.)"
                },
            )
            if (card.after.isNotBlank()) {
                appendLine()
                appendLine("## After the card")
                appendLine()
                appendLine(card.after.trim())
            }
            appendLine()
            appendLine("---")
            appendLine()
            appendLine(
                "You will be able to send this card back to work at most $retries time(s) once it has " +
                    "answered.",
            )
            if (handsOver) {
                appendLine(
                    "If it still cannot finish, its work comes to you: you will finish it yourself before " +
                        "the run moves on.",
                )
            }
            append("Answer with `{\"slots\": {}}` - a value for every slot named above, by name.")
        }
    }

    /**
     * What the head is asked once a card's turn is over.
     *
     * [endings] is what the card said each time it meant to end the turn, oldest first (see TurnEndings).
     * More than one is said to the head in so many words: without it, a report followed by a note about a
     * hook's style pass reads as two halves of one answer, or as the note superseding the report.
     *
     * [waited] is whether some of those endings came while helpers the card had started in the background
     * were still at work (see ScenarioEngine.turnOver). Then the order of things is the other way round -
     * "waiting for the reviewers" first and the report last - and the head is told which way to read them.
     * [overdue] is a wait given up on while a helper's command was still running: then the last ending is
     * likely "waiting" itself, and the head is told that a report is still missing rather than that it came.
     *
     * [handsOver] is whether giving up on the card hands its work to the head (see TakeOver.wanted). Then
     * the head is offered two ways of saying no rather than one, and the difference is the point: a card
     * that could not do it is work the head can pick up, and a stop the briefing forbids getting past is
     * not - the head saying which is how a scenario's hard stops stay stops with the fence down.
     */
    fun verdictRequest(
        card: Card,
        endings: List<String>,
        ok: Boolean,
        nudgesLeft: Int,
        handsOver: Boolean = false,
        waited: Boolean = false,
        overdue: Boolean = false,
    ): String = buildString {
        appendLine(
            if (ok) {
                "The card's turn is over. This is what it said:"
            } else {
                "The card's turn ended badly. This is what came back:"
            },
        )
        appendLine()
        val said = endings.filter { it.isNotBlank() }
        if (waited && overdue) {
            appendLine(
                "It ended a turn while helpers it had started in the background were still at work, and " +
                    "their reports set it going again. The panel stopped waiting before all of them had " +
                    "reported: a command one of them had started was still running after half an hour, so " +
                    "its report has not come. What it said at every ending is here, in order, and the last " +
                    "may be the card still waiting rather than its report. Any other ending before the last " +
                    "is one a hook of the project sent it back to work from.",
            )
            appendLine()
        } else if (waited) {
            appendLine(
                "It ended a turn while helpers it had started in the background were still at work. Their " +
                    "reports set it going again, and the panel waited until every one of them had reported " +
                    "before asking you, so what it said at every ending is here, in order. Any other ending " +
                    "before the last is one a hook of the project sent it back to work from. Read them " +
                    "together: the last is where it finally stopped, and it usually holds the report.",
            )
            appendLine()
        } else if (said.size > 1) {
            appendLine(
                "It meant to end its turn ${said.size} times. Each time but the last, a hook of the project " +
                    "sent it back to work, so what it said at every ending is here, in order. Read them " +
                    "together: the report is usually the first, and the last is only what it did after the hook.",
            )
            appendLine()
        }
        said.forEachIndexed { index, ending ->
            appendLine(if (said.size > 1) "--- ending ${index + 1} of ${said.size}" else "---")
            appendLine(ending)
        }
        if (said.isEmpty()) {
            appendLine("---")
            appendLine("(it said nothing at all)")
        }
        appendLine("---")
        appendLine()
        appendLine("Judge it against its definition of done:")
        appendLine()
        appendLine(card.dod.trim().ifEmpty { "(nothing written - the turn ending without an error is enough)" })
        if (card.after.isNotBlank()) {
            appendLine()
            appendLine("And do what the card's \"after the card\" line asks, if you can do it by looking:")
            appendLine()
            appendLine(card.after.trim())
        }
        appendLine()
        appendLine("Answer with one of these:")
        appendLine()
        appendLine(
            "- `{\"done\": true, \"reason\": \"...\", \"handoff\": \"...\"}` - it is finished. `handoff` is " +
                "what the cards after this one need: the path it wrote, the number it found, the decision " +
                "it took. That is the only thing that travels forward, so write it out rather than " +
                "referring to it.",
        )
        if (nudgesLeft > 0) {
            appendLine(
                "- `{\"retry\": \"...\"}` - send it back to work. `retry` is said into the same session, " +
                    "which remembers everything it already did, so say exactly what is missing and do not " +
                    "repeat the task at it. $nudgesLeft go(es) left.",
            )
        }
        if (handsOver) {
            appendLine(
                "- `{\"done\": false, \"reason\": \"...\"}` - its session cannot finish it. This scenario hands " +
                    "the work to you next: you will be asked to finish it yourself, with the tools every card " +
                    "has, before the run moves on.",
            )
            append(
                "- `{\"done\": false, \"stop\": true, \"reason\": \"...\"}` - it stopped where the briefing says " +
                    "nobody but a person may go on. The run stops here, and nobody takes the card over.",
            )
            return@buildString
        }
        append(
            "- `{\"done\": false, \"reason\": \"...\"}` - give up on it. The run stops here, because " +
                "everything after this card was written on the assumption that it happened.",
        )
    }

    /**
     * Handing the head the work of a card its own session could not finish (see ScenarioEngine.takeOver).
     *
     * The role is lifted here, in the conversation, and not only in the system prompt: the transcript
     * the head comes up over is hundreds of messages telling it that it never writes, and one paragraph
     * beside it loses (see [TAKE_OVER_BRIEFING]). The rest is what a person said when they did this by
     * hand in the morning, made exact: do not start the card over, look at what it left on disk first,
     * and a stop the briefing forbids stays a stop.
     *
     * [said] is the card's last words when the head has not seen them - a card that ran past its time or
     * whose process went away was never judged - and null when they are in the verdict it just gave.
     * [transcript] is where the card's whole conversation lies, when the CLI has written one.
     */
    fun takeOverRequest(card: Card, prompt: String, why: String, said: String?, transcript: String?): String = buildString {
        appendLine("# You are finishing this card yourself")
        appendLine()
        appendLine("The card \"${card.title.ifBlank { "Untitled" }}\" did not get to its definition of done: ${why.ifBlank { "it said nothing about why" }}")
        appendLine()
        appendLine(
            "Its session is closed. This scenario hands such a card to you rather than ending the run, so from " +
                "this message until you answer with the object below, you do its work yourself. For this card " +
                "only, the rule that the main thread never writes to disk is lifted: you have the tools and the " +
                "trust every card of this run has, and you edit files, run commands and commit exactly as the " +
                "card would have.",
        )
        appendLine()
        appendLine(
            "Do not start the card over. What it has done so far is on the disk - look at it first (git status, " +
                "git log, the files it wrote) and carry on from the first thing that is not done.",
        )
        if (said == null) {
            appendLine("What it said last is in the message that asked you for your verdict.")
        } else {
            appendLine()
            appendLine("What it was saying when it stopped:")
            appendLine()
            appendLine("---")
            appendLine(said.ifBlank { "(nothing at all)" })
            appendLine("---")
        }
        if (!transcript.isNullOrBlank()) {
            appendLine()
            appendLine("Its whole conversation, every tool call included, is in $transcript - read it if what it did is not clear from the disk.")
        }
        appendLine()
        appendLine("## What its session was told")
        appendLine()
        appendLine("```")
        appendLine(prompt)
        appendLine("```")
        appendLine()
        appendLine("## Its definition of done")
        appendLine()
        appendLine(card.dod.trim().ifEmpty { "(nothing written - the work the prompt asks for being done is enough)" })
        appendLine()
        appendLine(
            "The briefing still holds. Where it names a stop that is not yours to get past, that stays a stop " +
                "for you as well: answer that it is not done at once, with the reason, and change nothing.",
        )
        appendLine()
        appendLine(
            "Finish within this turn. Whatever you start - a build, a check, a wait for CI - wait for it here " +
                "with a blocking call rather than in the background: the moment your turn ends, what you said " +
                "is read as your answer.",
        )
        appendLine()
        appendLine("When you are finished, say in one or two sentences what you did, then answer with one of these:")
        appendLine()
        appendLine(
            "- `{\"done\": true, \"reason\": \"...\", \"handoff\": \"...\"}` - it is finished. `handoff` is what " +
                "the cards after this one need, written out rather than referred to.",
        )
        appendLine("- `{\"done\": false, \"reason\": \"...\"}` - you could not finish it either. The run stops here.")
        appendLine()
        append(
            "Once you have answered you are the main thread again: the next card goes to a session of its own, " +
                "and you no longer do a card's work yourself.",
        )
    }

    /** What a head doing a card's work is told after a pause: the same words a card gets, and what to end with. */
    const val TAKE_OVER_CARRY_ON =
        "Carry on from where you stopped, and end with the object the message handing you this card asked for."

    /** What the head is asked when a card stops on a permission or a question of its own. */
    fun questionRequest(title: String, tool: String, detail: String, options: List<String>): String = buildString {
        appendLine("The card has stopped and is waiting for an answer. Its turn is still open - one answer carries it on.")
        appendLine()
        appendLine("It wants: ${title.ifBlank { tool }}")
        appendLine("Tool: $tool")
        if (options.isNotEmpty()) appendLine("The answers it offered: ${options.joinToString(" / ")}")
        appendLine()
        appendLine("What it asked with:")
        appendLine("```json")
        appendLine(detail)
        appendLine("```")
        appendLine()
        appendLine(
            "Decide the way the person who wrote this run would have: the briefing is what they told you, " +
                "and the card is what they asked for. Refuse what goes past either, and say why - the " +
                "refusal is read by the card and it will work around it.",
        )
        appendLine()
        append("Answer with `{\"allow\": true|false, \"answer\": \"...\"}`.")
    }

    /** What the head is asked at the end of a pass of a stage that stops when the head says so. */
    fun anotherPassRequest(stage: Stage, pass: Int, passes: Int): String = buildString {
        appendLine("Pass $pass of the stage \"${stage.title}\" is finished, and this stage runs again only while it is worth running - up to $passes passes.")
        appendLine()
        appendLine(
            "Another pass runs the same cards again in fresh sessions. Ask for one only if there is work " +
                "left that another pass would actually do; a pass that finds nothing costs a person's " +
                "subscription and their time.",
        )
        appendLine()
        append("Answer with `{\"again\": true|false, \"reason\": \"...\"}`.")
    }

    // --- What the person writes to the head while the run goes ------------------------

    /**
     * Words the person wrote to the head, put to it as a turn of their own - the head is free: a card is at
     * work, a question waits for the person, or the run is paused (see ScenarioEngine.deliverTold).
     *
     * A conversation rather than one more question with an object: the person asks what is going on, or says
     * how the rest of the night should go, and the answer is read by them in the timeline as a reply. What
     * they ask for stands for the rest of the run because the head is one conversation from the first card to
     * the last - so it is told that in so many words, and told the one thing it cannot do for them: the shape
     * of the run is not its to change, while pausing and stopping are the person's own buttons.
     *
     * [situation] is where the run stands, in a sentence. [toCard] is whether a card is there to pass words on
     * to - working, standing on a question, or paused in the middle of its work - and only then is the head
     * offered the way to do it.
     */
    fun toldRequest(said: List<String>, situation: String, toCard: Boolean): String = buildString {
        appendLine("# The person running this scenario has written to you")
        appendLine()
        appendLine(situation)
        appendLine()
        appendLine(if (said.size > 1) "They wrote, in this order:" else "They wrote:")
        appendLine()
        appendTold(said)
        appendLine()
        appendLine(
            "This is a conversation, not a question about a card: answer them in a few sentences, and they read " +
                "your answer in the run's timeline as your reply. What they ask of you stands for the rest of the " +
                "run - the slots you fill, the verdicts you give - until they take it back, so say plainly what " +
                "you will do differently because of it. You can look at the project to answer them. What you " +
                "cannot do is reach a card you have not been handed, or change the order of the run; if they ask " +
                "for that, say so - pausing and stopping the run are their own buttons.",
        )
        appendLine()
        if (toCard) {
            appendLine(
                "If part of it is for the card on the board, you can pass it on: its session reads your words " +
                    "between two of its own steps, as coming from the main thread. Pass on only what the card " +
                    "needs, in the words it needs them in.",
            )
            appendLine()
            append("End with `{\"toCard\": \"...\"}` holding the words for the card, or `{}` when there is nothing to pass on.")
        } else {
            append("End with `{}`.")
        }
    }

    /**
     * Words the person wrote while the head was busy with a question of the run's, said before the next one.
     *
     * The head was not interrupted for them: its answer to a question of the run's is an object the run moves
     * on, and a turn broken into by a conversation comes back without one. So they waited, and they go first in
     * the next thing said to it - the head answers them in the same sentences that go with its object.
     */
    fun withTold(said: List<String>, question: String): String = buildString {
        appendLine(
            if (said.size > 1) {
                "Before the message below: the person running this scenario wrote to you while you were busy, in this order."
            } else {
                "Before the message below: the person running this scenario wrote to you while you were busy."
            },
        )
        appendLine()
        appendTold(said)
        appendLine()
        appendLine(
            "What they ask of you stands for the rest of the run, until they take it back. Answer them in the " +
                "sentences that go with your answer below - those are what they read in the timeline - and then " +
                "answer the message below exactly as it asks.",
        )
        appendLine()
        appendLine("---")
        appendLine()
        append(question)
    }

    /**
     * Words the person wrote while the head is doing a card's work itself (see ScenarioEngine.takeOver).
     *
     * Said into the turn that is going rather than kept for later: that turn can be an hour of work, and these
     * are most often about that very work - "commit it as one", "leave the migration alone". The CLI reads a
     * message written into a running turn between two of its steps.
     */
    fun toldMidWork(said: List<String>): String = buildString {
        appendLine("The person running this scenario has written to you while you are finishing this card:")
        appendLine()
        appendTold(said)
        appendLine()
        append(
            "Take it into the work, and carry on. When you are finished, end the way the message handing you the " +
                "card asked for, and say in your sentences what you did about this.",
        )
    }

    /** What a card is told when the head passes the person's words on to it. */
    fun relayed(words: String): String =
        "A word from the main thread, which the person running this scenario asked it to pass on to you:\n\n$words"

    private fun StringBuilder.appendTold(said: List<String>) {
        for (one in said) {
            appendLine("---")
            appendLine(one)
        }
        appendLine("---")
    }

    /** Said once when a turn came back without the object it was asked for. */
    const val NO_OBJECT =
        "Your answer had no json object in it, so the panel has nothing to act on and the run cannot move. " +
            "Answer again now, with the object the previous message asked for and nothing else."

    // --- Reading what came back ---------------------------------------------------

    private val json = Json { ignoreUnknownKeys = true; isLenient = true }

    /**
     * What the head said: the words for the person, and the object for the engine.
     *
     * Read leniently and without a schema, and both of those are on purpose. The CLI's own structured
     * output would arrive as a `--json-schema` argument, and an argument with quotation marks in it is a
     * command cut in half on Windows (see ClaudeLaunch) - the same reason the search over conversations
     * asks for its json in words. Leniently, because the difference between an answer wrapped in a fence
     * and one that is not is not worth failing a night over.
     */
    data class Reply(val words: String, val body: JsonObject?)

    /**
     * What the head said over a turn that may have ended more than once (see TurnEndings).
     *
     * The object comes from the last ending that has one. A hook that sends the head back to work - a style
     * pass after it finished a card's work itself - leaves a last ending with no object in it, and asking
     * again for an answer already given spends the question's one allowance on nothing. The words are that
     * ending's own: the note under the card is what the head said with its decision.
     */
    fun read(endings: List<String>): Reply =
        endings.map(::read).lastOrNull { it.body != null } ?: read(endings.joinToString("\n\n"))

    fun read(text: String): Reply {
        val span = lastObject(text) ?: return Reply(tidy(text), null)
        val body = runCatching { json.parseToJsonElement(text.substring(span.first, span.last + 1)).jsonObject }
            .getOrNull() ?: return Reply(tidy(text), null)

        return Reply(tidy(text.substring(0, span.first)), body)
    }

    /**
     * The words with the fence around the object taken off.
     *
     * The opening ```json is left standing by the cut above - it comes before the brace - and a stray
     * fence in the middle of the timeline reads as something that failed to render.
     */
    private fun tidy(words: String): String =
        words.trim().removeSuffix("```json").removeSuffix("```JSON").removeSuffix("```").trim()

    /**
     * Where the last top-level object in the text begins and ends.
     *
     * Scanned forward with the string state tracked rather than by looking for the last brace: a model
     * asked for a path routinely answers with one that has a brace in it, and counting braces inside
     * quotation marks turns a good answer into an unreadable one.
     */
    private fun lastObject(text: String): IntRange? {
        var depth = 0
        var start = -1
        var last: IntRange? = null
        var inString = false
        var escaped = false

        for ((at, character) in text.withIndex()) {
            when {
                escaped -> escaped = false
                inString && character == '\\' -> escaped = true
                character == '"' -> inString = !inString
                inString -> Unit
                character == '{' -> {
                    if (depth == 0) start = at
                    depth += 1
                }

                character == '}' -> {
                    depth -= 1
                    if (depth == 0 && start >= 0) last = start..at
                    if (depth < 0) depth = 0
                }
            }
        }

        return last
    }
}

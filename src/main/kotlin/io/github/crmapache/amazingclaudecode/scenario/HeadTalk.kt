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
     * What a card is told, beyond its own prompt. Same one-line rule, same reason.
     *
     * Short on purpose in a second sense as well: a card is meant to read as an ordinary task in an
     * ordinary repository, and the more it is told about the machinery around it, the more of its answer
     * is about the machinery.
     */
    const val CARD_BRIEFING =
        "This turn is one step of a scenario being run by the Amazing Claude Code panel of a JetBrains " +
            "IDE. Nobody is sitting in front of this session. Another Claude session is running the " +
            "scenario: it gave you this task, it reads your answer, and it decides whether the step is " +
            "done - so finish by saying plainly what you did and what came of it, because that answer is " +
            "the whole of what it sees. If you need a decision the task does not cover, ask for it: the " +
            "main thread answers, and it answers quickly."

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
            append("Answer with `{\"slots\": {}}` - a value for every slot named above, by name.")
        }
    }

    /** What the head is asked once a card's turn is over. */
    fun verdictRequest(card: Card, answer: String, ok: Boolean, nudgesLeft: Int): String = buildString {
        appendLine(
            if (ok) {
                "The card's turn is over. This is what it said:"
            } else {
                "The card's turn ended badly. This is what came back:"
            },
        )
        appendLine()
        appendLine("---")
        appendLine(answer.ifBlank { "(it said nothing at all)" })
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
        append(
            "- `{\"done\": false, \"reason\": \"...\"}` - give up on it. The run stops here, because " +
                "everything after this card was written on the assumption that it happened.",
        )
    }

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

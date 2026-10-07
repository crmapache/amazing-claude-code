package io.github.crmapache.amazingclaudecode.scenario

import com.intellij.openapi.Disposable
import com.intellij.openapi.diagnostic.thisLogger
import com.intellij.util.concurrency.AppExecutorUtil
import io.github.crmapache.amazingclaudecode.claude.AgentStream
import io.github.crmapache.amazingclaudecode.claude.ClaudeHistory
import io.github.crmapache.amazingclaudecode.claude.ClaudeSession
import io.github.crmapache.amazingclaudecode.claude.PermissionChannel
import java.util.concurrent.ScheduledFuture
import java.util.concurrent.TimeUnit
import kotlinx.serialization.json.Json
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.JsonPrimitive
import kotlinx.serialization.json.booleanOrNull
import kotlinx.serialization.json.doubleOrNull
import kotlinx.serialization.json.longOrNull
import kotlinx.serialization.json.jsonObject

/**
 * One run of one scenario, from the head coming up to the last card being judged.
 *
 * The division of labour is the whole design and it is worth saying plainly. The **shape** belongs to
 * this file: which stage is next, how many passes it gets, which card comes after which, and the
 * ceilings that stop a night from spending itself. The **judgement** belongs to the head session:
 * whether what came back is what was asked for, what the next card needs to be told, and what to say to
 * a card that has stopped to ask something. Neither is good at the other's job. A host deciding whether
 * a review was thorough enough would be a second, worse model; a model deciding which stage comes next
 * would make the picture on the screen a suggestion.
 *
 * Written as a state machine rather than as a walk down a blocking thread. A run lasts hours and spends
 * nearly all of them waiting for a process to say something, and a thread parked on that for a night is
 * a thread taken out of the IDE's pool for a night. Everything here is entered from a process's reader
 * thread, so every entrance is synchronized: two answers arriving at once must not both decide what
 * happens next.
 */
internal class ScenarioEngine(
    private val workingDirectory: String?,
    /** Whose subscription pays. Fixed for the run: the CLI reads its credentials once, at launch. */
    private val accountId: String,
    private val defaultModel: String,
    private val defaultEffort: String,
    start: ScenarioRun,
    /** Something moved. Called often - the desk decides how often to redraw and how often to write. */
    private val onChange: (ScenarioRun) -> Unit,
    /** The run is over, however it ended. */
    private val onFinished: (ScenarioRun) -> Unit,
    /** Wake somebody: a run standing on a question, or a run that has finished. */
    private val notify: (String, String) -> Unit,
) : Disposable {

    /** What the engine is waiting for. Exactly one of these is true at a time. */
    private enum class Phase {
        /** Nothing yet: the head is coming up and has been told what the run is for. */
        OPENING,

        /** The head is choosing what to put in the current card's slots. */
        SLOTS,

        /** The card's own turn is running. */
        CARD,

        /** A card stopped on a question and the head is deciding it. */
        QUESTION,

        /** The card's turn is over and the head is judging it. */
        VERDICT,

        /** A pass of a stage that runs while it is worth running has ended; the head decides. */
        AGAIN,

        /** A card stopped on a question and the scenario said to wait for a person. */
        BLOCKED,

        /** A card's own session could not finish it, and the head is doing its work itself (see [takeOver]). */
        TAKEOVER,

        /** Interrupted by a hand on the button. The processes are alive and remember everything. */
        PAUSED,

        OVER,
    }

    @Volatile
    var run: ScenarioRun = start
        private set

    private val scenario = start.snapshot
    private val json = Json { ignoreUnknownKeys = true; isLenient = true }

    private var head: ClaudeSession? = null
    private var card: ClaudeSession? = null

    /**
     * What the engine is waiting for - and with it, whether the run's clock is running (see [restsFollow]).
     *
     * The clock hangs off the phase rather than off the places that pause and block, because the phase is
     * the one thing every road through here sets: a pause lifted over a question, a question withdrawn
     * under a pause, a card taken over while it stood on one. Remembering to start and stop a clock at each
     * of those is a promise that breaks with the next road somebody adds.
     */
    private var phase = Phase.OPENING
        set(value) {
            field = value
            restsFollow(value)
        }

    /** Where in [ScenarioRun.steps] the front of the work is. */
    private var at = 0

    /** How many times the head has sent the current card back to work. */
    private var nudges = 0

    /** Whether the current card's work has already been handed to the head - once per card (see TakeOver.wanted). */
    private var tookOver = false

    /**
     * Whether the head's process standing now was raised without its fence, to do a card's work.
     *
     * A fact about the process rather than about the phase, and that is why it is its own flag: a pause
     * leaves the phase at PAUSED over a head that is still the unfenced one, and a permission prompt of
     * its arriving in that moment must be answered by the rules it was raised under (see [raiseHead]).
     */
    private var unfenced = false

    /**
     * What the head was asked and has not answered yet.
     *
     * Kept so that a pause can be undone: pausing interrupts the head's turn, and the turn it was in the
     * middle of is not resumable - the question has to be put again. Resuming re-sends this.
     */
    private var pendingHead: String = ""

    /**
     * When the head was asked what it has not answered yet, and 0 when nothing is outstanding.
     *
     * The head gets a ceiling of its own for the reason the card has one: a process that goes quiet
     * without dying is invisible to everything else here. [onCrashed] wants a process that went away and
     * [onSessionError] wants a turn that failed out loud; a head sitting on a hung request is neither, and
     * without this the run stands in JUDGING for ever - and holds this project's one run slot against
     * every run after it until the IDE is restarted.
     *
     * Paused time is not counted and does not have to be: [resume] puts the question again, which winds
     * this from the top.
     */
    private var headAskedAt = 0L

    /**
     * The questions the current card is standing on, oldest first, so an answer goes back to the right one.
     *
     * A queue rather than one, because a card can ask for two things in a single answer: the CLI opens a
     * request per call and holds them all at once (see ClaudeSession.awaitingPermission), and the panel's
     * own cards have always behaved that way. Keeping one meant the second silently replaced the first,
     * and the first was left open for ever - the card waits for an answer nobody will ever send, nothing
     * on the screen says so, and the next thing to move is the card's three-hour ceiling taking the whole
     * run down with it. Put to whoever decides them one at a time and in the order they were asked.
     */
    private val questions = ArrayDeque<PermissionChannel.ToolPermission>()

    /** Which question the head is being asked about, so its answer cannot land on a different one. */
    private var deciding: String = ""

    /** What the run's two live sessions have said this turn, and what they have cost in total so far. */
    private val headTurn = TurnEndings()
    private val cardTurn = TurnEndings()
    private var headCost = 0.0
    private var cardCost = 0.0

    /**
     * The helpers the card on the board started in the background, and what it said each time it ended a
     * turn while they were still at work, oldest first.
     *
     * Such an ending is not the card's answer: the helpers' reports start its next turn by themselves, and
     * the card is judged once it ends a turn with nobody left to wait for (see [turnOver]). What it said on
     * the way is kept rather than dropped - the report can come before the wait as well as after it.
     */
    private var helpers = BackgroundWork()
    private val heldEndings = mutableListOf<String>()

    /** Everything the head is judging the card on right now - taken back if the card goes on working (see [onCardTurnStarted]). */
    private var judged: List<String> = emptyList()

    /**
     * Whether the card ended its turn to wait for its helpers and has not started another since - the one
     * state in which nothing on the card's side moves until a helper does (see [watchTheCard]).
     */
    private var cardWaits = false

    /** Set while an interrupt of ours is in flight, so the turn it ends is not read as an answer. */
    private var interrupting = false

    /**
     * Whether the card's turn ended while a question was still standing on it.
     *
     * The CLI can end a turn with a request of its own still open - a limit reached, a network error -
     * and that end arrives while the run is waiting for somebody to decide the question rather than for
     * the card. Kept here because there is nothing else left to keep it: the turn is gone, and the run
     * would otherwise go back to waiting for it (see [onCardTurnEnded], [afterQuestion]).
     */
    private var cardTurnEnded = false

    /**
     * What a paused run goes back to.
     *
     * Written down at the moment of pausing, because resuming is asking the same question again and after
     * a pause there is nobody left to say what the question was (see [pendingHead]).
     */
    private var resumeTo = Phase.OPENING

    /**
     * Whether the question the head is on has already been put to it a second time.
     *
     * One allowance per question, spent by either kind of bad answer - no object at all, or an object with
     * a slot left empty. Renewed by [askHead] and by nothing else (see the note there).
     */
    private var reasked = false

    private var clock: ScheduledFuture<*>? = null

    /** When the current card's turn began, and how much of the time since then does not count. */
    private var cardStartedAt = 0L
    private var pausedAt = 0L
    private var pausedFor = 0L

    // --- Starting ------------------------------------------------------------------

    @Synchronized
    fun begin() {
        val steps = ScenarioRules.plan(scenario).map { planned ->
            RunStep(
                key = planned.key,
                cardId = planned.cardId,
                stageId = planned.stageId,
                pass = planned.pass,
                title = planned.title,
            )
        }
        run = run.copy(steps = steps, total = steps.size, state = RunState.RUNNING)

        head = openHead()
        phase = Phase.OPENING
        /*
         * The clock is wound before the first message, not after it, and the order is the whole point.
         *
         * That message can fail the run where it stands - no executable, an account that will not resolve
         * - and it does so on this very thread: [end] runs inside it and has taken everything down by the
         * time the next line is reached. Wound afterwards, the clock is a task nothing will ever cancel,
         * because every entrance guards on OVER; it ticks every half minute until the IDE goes down, once
         * more for every failed start. Wound first, it is simply one of the things [takeEverythingDown]
         * takes down, and the few milliseconds it runs for cost nothing: [tick] does nothing outside CARD.
         */
        watchTheClock()
        askHead(HeadTalk.opening(scenario, workingDirectory.orEmpty(), run.inputs, steps.size))
        changed()
    }

    /** `resumeFrom` names a past conversation of the head's to come up over - see [carryOn]. */
    /**
     * Pick a finished run up where it stood - see CarryOn for where that is.
     *
     * The two conversations are raised again over their own transcripts rather than started afresh: the
     * head remembers every card it handed over and every verdict it gave, and the card that was cut
     * short remembers what it had already done - which is what makes "carry on" a whole instruction,
     * exactly as it is after a pause. What the record does not carry is the engine's phase, so the run
     * re-enters by the steps: at the cut card, told to go on; or right after the last finished one, the
     * way a card is stepped past in the ordinary course of things.
     *
     * The bill is picked up too. The CLI reports a conversation's running total, and a process raised
     * anew may count from zero or from where it was - so what the run has already charged is taken for
     * the baseline, and a total below it is read as a fresh count (see [spentOf]).
     */
    @Synchronized
    fun carryOn() {
        val point = CarryOn.pointOf(run) ?: return
        val now = System.currentTimeMillis()
        // Read before the ending is wiped off the step: the head's last word against it is part of
        // what the card is told (see [carryOnWords]).
        val words = run.steps.getOrNull(point.at)?.let(::carryOnWords) ?: CARD_CARRY_ON
        /*
         * Cut while the head was finishing the card itself (see [takeOver]): the work that was going is the
         * head's, so the head is what carries on - it remembers what it had already done, and the card's own
         * session knows nothing of it. Read off the step for the reason the phase is: the record is all that
         * survived.
         */
        val headWasFinishing = point.begun && run.steps.getOrNull(point.at)?.takeOver?.isNotEmpty() == true

        /*
         * The gap between the ending and this moment is not time the run spent (see ScenarioRun.idle) -
         * and the stage being picked up moves its clock past it. Every duration on the screen is the
         * difference between two stamps: the cut card's own, and the stage's from its first card to its
         * last. Left where they were, a card stopped at midnight and finished after breakfast worked for
         * nine hours, and so did its stage. Nothing draws a card's stamps as a time of day, so the stamps
         * of the stage's own cards are simply carried forward by the gap: each keeps its length, and the
         * stage's span stops covering a night nobody worked.
         */
        val gap = if (run.finishedAt > 0) (now - run.finishedAt).coerceAtLeast(0) else 0
        val stageId = run.steps.getOrNull(point.at)?.stageId
        fun RunStep.pastTheGap(): RunStep =
            if (stageId == null || this.stageId != stageId || startedAt == 0L) this
            else copy(startedAt = startedAt + gap, finishedAt = if (finishedAt > 0) finishedAt + gap else 0)

        run = run.copy(
            state = RunState.RUNNING,
            finishedAt = 0,
            failure = "",
            error = "",
            question = null,
            idle = run.idle + gap,
            steps = run.steps.mapIndexed { index, step ->
                when {
                    index < point.at -> step.pastTheGap()
                    // The cut card keeps what it had - its conversation, its slots, what it said, the goes
                    // it was sent back for - and loses only the ending that was written over it.
                    index == point.at && point.begun -> step.pastTheGap().copy(
                        state = StepState.WAITING,
                        finishedAt = 0,
                        failure = "",
                        error = "",
                        said = "",
                        verdict = "",
                        verdictReason = "",
                        // A card picked up in its own session gets a fresh chance to be handed over - the same
                        // as the goes it may be sent back for (see below); one the head was finishing stays its.
                        takeOver = if (headWasFinishing) step.takeOver else "",
                    )
                    // Everything after it never had its go: back to the plan, as [begin] wrote it.
                    else -> RunStep(key = step.key, cardId = step.cardId, stageId = step.stageId, pass = step.pass, title = step.title)
                }
            },
        )

        // The head's own running total, as the CLI keeps it: everything the run spent that no card did.
        headCost = (run.cost - run.steps.sumOf { it.cost }).coerceAtLeast(0.0)
        cardCost = 0.0
        head = openHead(resumeFrom = run.headConversationId, takingOver = headWasFinishing)
        unfenced = headWasFinishing
        tookOver = headWasFinishing
        watchTheClock()

        at = point.at
        val step = run.steps.getOrNull(at)
        val definition = step?.let { cut ->
            scenario.stages.firstOrNull { stage -> stage.id == cut.stageId }?.cards?.firstOrNull { card -> card.id == cut.cardId }
        }

        when {
            // The head was doing the card's work: the head is told to go on, with the card's clock again.
            headWasFinishing && step != null -> {
                editStep(step.key) { it.copy(state = StepState.RUNNING) }
                phase = Phase.TAKEOVER
                cardStartedAt = now
                pausedFor = 0
                pausedAt = 0
                askHead(HeadTalk.TAKE_OVER_CARRY_ON)
            }

            // Cut in the middle of its own turn: the same session, told to go on, as after a pause. The
            // allowance of goes starts again with it - a run that ended because the head ran out of them
            // is one somebody chose to give another chance.
            point.begun && step != null && definition != null && step.conversationId.isNotEmpty() -> {
                nudges = 0
                cardCost = step.cost
                freshCardTurn()
                editStep(step.key) { it.copy(state = StepState.RUNNING) }
                card = openCard(step, definition, resumeFrom = step.conversationId)
                phase = Phase.CARD
                cardStartedAt = now
                pausedFor = 0
                pausedAt = 0
                card?.sendPrompt(words)
            }

            // Cut before its session existed - the head was choosing its slots: handed over again.
            point.begun -> beginStep()

            // Nothing had happened yet: the opening never got its answer, so it is said again.
            at == 0 -> {
                phase = Phase.OPENING
                askHead(HeadTalk.opening(scenario, workingDirectory.orEmpty(), run.inputs, run.steps.size))
            }

            // Between two cards: stepped past the last finished one, which is also where a loop is asked
            // whether it is worth another pass.
            else -> {
                at -= 1
                nextStep()
            }
        }
        changed()
    }

    /** What a card cut short is told: the same words as after a pause, plus what the head held against it. */
    private fun carryOnWords(step: RunStep): String =
        if (step.verdictReason.isBlank()) CARD_CARRY_ON else "$CARD_CARRY_ON The main thread judged it not done yet: ${step.verdictReason}"

    private fun openHead(resumeFrom: String = "", takingOver: Boolean = false): ClaudeSession = ClaudeSession(
        workingDirectory = workingDirectory,
        resumeFrom = resumeFrom.ifEmpty { null },
        model = scenario.head.model.ifBlank { defaultModel },
        effort = scenario.head.effort.ifBlank { defaultEffort },
        /*
         * The head asks before it acts, and that is not a setting of the scenario's.
         *
         * Whatever the cards are trusted with, the head itself is a foreman: it reads the project to check
         * what a card claims, and everything that writes belongs to a card. The mode that asks is what
         * makes that a rule rather than a wish - see [onHeadPermission].
         *
         * The one exception is a head raised to do a card's work (see [takeOver]): it stands in for the
         * card, so it gets the card's trust - the scenario's own default, since the card it replaces may
         * have had one of its own for a reason that was about its task rather than about trust.
         */
        permissionMode = if (takingOver) scenario.head.permissionMode.ifBlank { "default" } else "default",
        accountId = accountId,
        briefing = if (takingOver) HeadTalk.TAKE_OVER_BRIEFING else HeadTalk.HEAD_BRIEFING,
        nameWanted = false,
        onEvent = { line -> onHeadLine(line) },
        onError = { message -> onSessionError(head = true, message = message) },
        onFinished = {},
        onToolPermission = { request -> onHeadPermission(request) },
        onCrashed = { onCrashed(head = true) },
        onTurnEnded = { onHeadTurnEnded() },
    )

    private fun openCard(step: RunStep, definition: Card, resumeFrom: String = ""): ClaudeSession {
        // A process's helpers are its own and die with it, so every process is read by a fresh count - bound
        // here rather than looked up later, so that the last lines of a process taken down cannot reach it.
        val work = BackgroundWork()
        helpers = work
        return ClaudeSession(
            workingDirectory = workingDirectory,
            resumeFrom = resumeFrom.ifEmpty { null },
            model = definition.model.ifBlank { scenario.head.model }.ifBlank { defaultModel },
            effort = definition.effort.ifBlank { scenario.head.effort }.ifBlank { defaultEffort },
            permissionMode = definition.permissionMode.ifBlank { scenario.head.permissionMode },
            accountId = accountId,
            briefing = HeadTalk.CARD_BRIEFING,
            nameWanted = false,
            onEvent = { line ->
                work.read(line)
                onCardLine(step.key, line)
            },
            onError = { message -> onSessionError(head = false, message = message) },
            onFinished = {},
            onToolPermission = { request -> onCardQuestion(request) },
            onPermissionWithdrawn = { onQuestionWithdrawn(it) },
            onCrashed = { onCrashed(head = false) },
            onTurnEnded = { onCardTurnEnded() },
            onTurnStarted = { onCardTurnStarted() },
        )
    }

    // --- What the two sessions say -------------------------------------------------

    private fun onHeadLine(line: String) {
        collect(line, headTurn) { total, tokens ->
            synchronized(this) {
                // Only a figure the CLI actually gave moves the running total: taking a missing one for
                // zero would count the whole conversation again on the next turn that has one.
                val spent = spentOf(total, headCost)
                if (total != null) headCost = total
                if (spent > 0 || tokens > 0) {
                    run = run.copy(cost = run.cost + spent, tokens = run.tokens + tokens)
                }
            }
        }
        // A head doing a card's work is working, and its row says so the way a card's does - otherwise an
        // hour of it reads on the screen as a card stuck with nothing moving (see [onCardLine]).
        val piece = LiveWords.piece(line)
        if (piece != null) {
            val moved = synchronized(this) {
                val step = run.steps.getOrNull(at)
                if (phase == Phase.TAKEOVER && step != null) {
                    editStep(step.key) { it.copy(said = LiveWords.add(it.said, piece, SAID_CHARS)) }
                    true
                } else {
                    false
                }
            }
            if (moved) changed()
        }
        rememberConversationIds()
    }

    private fun onCardLine(key: String, line: String) {
        collect(line, cardTurn) { total, tokens ->
            synchronized(this) {
                val spent = spentOf(total, cardCost)
                if (total != null) cardCost = total
                if (spent > 0 || tokens > 0) {
                    run = run.copy(cost = run.cost + spent, tokens = run.tokens + tokens)
                    editStep(key) { it.copy(cost = it.cost + spent, tokens = it.tokens + tokens) }
                }
            }
        }
        // What the agent is saying right now, so a card working for four minutes is visibly working
        // rather than visibly stuck (see LiveWords). Only while its own turn is what we are waiting for: a
        // line arriving during a pause is the tail of an interrupted turn and says nothing about now.
        val piece = LiveWords.piece(line)
        if (piece != null) {
            synchronized(this) {
                if (phase == Phase.CARD) editStep(key) { it.copy(said = LiveWords.add(it.said, piece, SAID_CHARS)) }
            }
            changed()
        }
        rememberConversationIds()
    }

    /**
     * What a turn added to the bill, out of the conversation's running total.
     *
     * A total below the last one is a count that started again: a process raised anew over the same
     * conversation counts from zero (see [carryOn]), and read as growth it would charge nothing until
     * it had caught up with a night it did not spend. The statistics read the same figure by the same
     * rule (see StatsCollector.noteResult).
     */
    private fun spentOf(total: Double?, before: Double): Double = when {
        total == null -> 0.0
        total < before -> total
        else -> total - before
    }

    /**
     * A turn's own answer, and what it added to the bill.
     *
     * The answer is every ending of the turn, not the CLI's `result` alone - a Stop hook that sends the
     * agent back to work leaves the result holding only what was said after it (see TurnEndings).
     *
     * The two figures are reported differently and are read differently. The cost the CLI gives is the
     * conversation's running total, so what this turn spent is what the total grew by - the same
     * arithmetic the statistics do (see StatsCollector.noteResult). The usage is this turn's alone, so
     * the turns are added up; and all four of its fields count, because a card that reads half a
     * repository spends nearly all of it on cache reads (the same sum the day's counter uses - see
     * ClaudeTokenUsage).
     */
    private fun collect(line: String, into: TurnEndings, spent: (Double?, Long) -> Unit) {
        into.read(line)
        if (!AgentStream.isTurnResult(line)) return
        val event = runCatching { json.parseToJsonElement(line).jsonObject }.getOrNull() ?: return

        val cost = (event["total_cost_usd"] as? JsonPrimitive)?.doubleOrNull
        val usage = event["usage"] as? JsonObject
        val tokens = if (usage == null) {
            0L
        } else {
            TOKEN_FIELDS.sumOf { name -> (usage[name] as? JsonPrimitive)?.longOrNull ?: 0L }
        }

        if (cost != null || tokens > 0) spent(cost, tokens)
    }

    /**
     * The conversation identifiers, once the processes have announced them.
     *
     * They are how the logs are found: a card is an ordinary conversation of the CLI's, and its whole
     * transcript is already on the disk under this project (see StepTranscript). Nothing here is copied.
     */
    @Synchronized
    private fun rememberConversationIds() {
        head?.conversationId?.takeIf { it != run.headConversationId }?.let {
            run = run.copy(headConversationId = it)
            conversations.note(it)
        }
        val conversation = card?.conversationId ?: return
        val step = run.steps.getOrNull(at) ?: return
        if (step.conversationId != conversation) {
            editStep(step.key) { it.copy(conversationId = conversation) }
            conversations.note(conversation)
        }
    }

    /**
     * Where the identifiers above are also written down, so the history can leave them out: they are
     * conversations of the plugin's, not of the person's (see ScenarioConversations).
     *
     * Written here rather than by the desk, because this is the one place that learns them at all, and
     * only on the beat where one is NEW - both branches above already ask that question to decide
     * whether the record is worth changing.
     */
    private val conversations = ScenarioConversations(workingDirectory)

    // --- The head's turns ----------------------------------------------------------

    /**
     * Ask the head something new. The one allowance to get it wrong belongs to the question, so it is
     * renewed here and nowhere else - a flag cleared on every answer instead would renew it on the very
     * answer it was meant to judge, and a head that keeps making the same mistake would keep being asked
     * about it all night.
     */
    private fun askHead(text: String) {
        reasked = false
        askAgain(text)
    }

    /** The same question, put again. The allowance is not renewed - that is what makes it an allowance. */
    private fun askAgain(text: String) {
        pendingHead = text
        headAskedAt = System.currentTimeMillis()
        headTurn.clear()
        head?.sendPrompt(text)
    }

    @Synchronized
    private fun onHeadTurnEnded() {
        /*
         * Our own interrupt, or a turn that ended with nothing asked of the head: after the run did, in a
         * pause, or after a verdict was taken back because the card went on working (see
         * [onCardTurnStarted]). None of them is an answer to anything - read as one, a turn cut short
         * without its object would be asked for the object again, about a question that no longer stands.
         */
        if (interrupting || (phase != Phase.TAKEOVER && phase !in HEAD_PHASES)) return

        val reply = HeadTalk.read(headTurn.last)
        // The opening message is about the run rather than about any card, so its answer belongs above
        // the first step rather than under it - the timeline reads the empty key exactly that way.
        if (reply.words.isNotBlank()) {
            note(reply.words, if (phase == Phase.OPENING) "" else run.steps.getOrNull(at)?.key.orEmpty())
        }

        val body = reply.body
        if (body == null) {
            /*
             * A turn that ended without the object is asked once, plainly, and then given up on.
             *
             * Once rather than in a loop: a head that answered in prose answers in prose again, and the
             * loop is a subscription being spent on a misunderstanding while nobody is watching. Once
             * rather than not at all, because the commonest reason is a long answer that forgot the fence,
             * and a single sentence recovers that for the price of one small turn.
             */
            if (reasked) return end(RunState.FAILED, RunFailure.NO_VERDICT, "the head never answered with an object")
            reasked = true
            askAgain(HeadTalk.NO_OBJECT)
            return
        }

        pendingHead = ""
        headAskedAt = 0

        when (phase) {
            Phase.OPENING -> beginStep()
            Phase.SLOTS -> startCard(body)
            Phase.QUESTION -> answerCardQuestion(body)
            Phase.VERDICT -> takeVerdict(body)
            Phase.AGAIN -> takeAnotherPass(body)
            Phase.TAKEOVER -> takeOverVerdict(body)
            else -> Unit
        }
        changed()
    }

    /** One or two sentences from the head, wedged into the timeline where they were said. */
    private fun note(text: String, stepKey: String) {
        run = run.copy(
            notes = run.notes + RunNote(
                at = System.currentTimeMillis(),
                stepKey = stepKey,
                text = shorten(text, NOTE_CHARS),
            ),
        )
    }

    // --- Walking the plan ----------------------------------------------------------

    /** Hand the head the card the board is standing on. */
    private fun beginStep() {
        val step = run.steps.getOrNull(at) ?: return end(RunState.DONE, "", "")
        val stage = scenario.stages.firstOrNull { it.id == step.stageId }
        val definition = stage?.cards?.firstOrNull { it.id == step.cardId }

        if (stage == null || definition == null) {
            // The snapshot is what the run walks, so this cannot happen from an edit - it can only be a
            // file that was already inconsistent when the button was pressed.
            return end(RunState.FAILED, RunFailure.CRASHED, "a step of this run points at a card that is not in it")
        }

        nudges = 0
        tookOver = false
        freshCardTurn()
        cardCost = 0.0
        editStep(step.key) {
            it.copy(state = StepState.JUDGING, startedAt = System.currentTimeMillis(), title = definition.title.ifBlank { it.title })
        }

        phase = Phase.SLOTS
        askHead(
            HeadTalk.handover(
                stage = stage,
                card = definition,
                index = at + 1,
                total = run.total,
                pass = step.pass,
                passes = ScenarioRules.passesOf(stage),
                prompt = ScenarioRules.fillInputs(definition.prompt, run.inputs),
                retries = scenario.head.retries,
                handsOver = TakeOver.wanted(scenario.head, alreadyTaken = false, stopAsked = false),
            ),
        )
        changed()
    }

    /** The head has chosen the slots: fill the prompt in and let the card start. */
    private fun startCard(body: JsonObject) {
        val step = run.steps.getOrNull(at) ?: return
        val stage = scenario.stages.firstOrNull { it.id == step.stageId } ?: return
        val definition = stage.cards.firstOrNull { it.id == step.cardId } ?: return

        val given = (body["slots"] as? JsonObject) ?: JsonObject(emptyMap())
        val wanted = ScenarioRules.declaredSlots(definition).map { it.name }
        // Read forgivingly: a value of the wrong shape is a slot nobody filled, and that is asked
        // again for and then given up on - not thrown from the thread reading the CLI (see HeadAnswer).
        val filled = wanted.associateWith { HeadAnswer.text(given, it) }
        val missing = wanted.filter { filled[it].orEmpty().isBlank() }

        if (missing.isNotEmpty()) {
            /*
             * A slot left empty is asked for once, and once only, for the reason the missing object is.
             *
             * Not filling it in ourselves: the whole point of a slot is that a person wrote down what has
             * to go there, and a blank pasted into the prompt is a card asked to work with a sentence
             * about nothing.
             */
            if (reasked) {
                return end(
                    RunState.FAILED,
                    RunFailure.NO_VERDICT,
                    "the head would not fill: ${missing.joinToString(", ")}",
                )
            }
            reasked = true
            askAgain(
                "No value came back for: ${missing.joinToString(", ")}. Every slot has to be filled before " +
                    "the card can start. Answer again with the whole `slots` object.",
            )
            return
        }

        val prompt = ScenarioRules.fillSlots(ScenarioRules.fillInputs(definition.prompt, run.inputs), filled)
        editStep(step.key) { it.copy(slots = filled, prompt = prompt, state = StepState.RUNNING, said = "") }

        card = openCard(step, definition)
        phase = Phase.CARD
        cardStartedAt = System.currentTimeMillis()
        pausedFor = 0
        pausedAt = 0
        card?.sendPrompt(prompt)
    }

    @Synchronized
    private fun onCardTurnEnded() {
        // Our own interrupt: the turn ends because we ended it, and there is nothing in it to judge.
        if (interrupting || phase == Phase.OVER) return

        /*
         * A turn that ends under a standing question is remembered rather than dropped.
         *
         * It is not the CLI closing a turn we are not waiting on - it is this card's turn dying with a
         * question still open on it, which a limit or a network error does. Dropped, the run went back to
         * waiting for that turn the moment the question was disposed of, and waited until the card's
         * three-hour ceiling took the whole run down under the name "it ran past its time" - for a card
         * that had not been working at all. A pause counts the same way, and only over a question: a
         * pause taken over the card's own work interrupts it, and the turn that ends afterwards is that
         * interrupt's own (see [pause]).
         *
         * Helpers of the dead turn may go on reporting while the question stands, each report a turn of
         * its own: what every such turn said is held as it ends, or only the last would reach the head.
         */
        if (phase == Phase.QUESTION || phase == Phase.BLOCKED) {
            cardTurnEnded = true
            holdWhileHelpersWork()
            return
        }
        if (phase == Phase.PAUSED) {
            if (resumeTo == Phase.QUESTION || resumeTo == Phase.BLOCKED) {
                cardTurnEnded = true
                holdWhileHelpersWork()
            }
            return
        }
        if (phase != Phase.CARD) return

        turnOver()
    }

    /**
     * The card started a turn by itself: a helper's report woke it, or a message of ours that went missing
     * went in again (see ClaudeSession.checkDeliveries).
     *
     * Waiting for its helpers, that is what was expected and nothing changes. Being judged, the card was not
     * done after all: a helper that reported in the last moments of a turn is taken up by the CLI with a
     * turn of its own right after it, by which time nothing was left to wait for and the card had gone to
     * the head on what it said before reading the report. The question is taken back from the head, and the
     * card is judged again when this turn ends, with everything it said before. Paused, the brake holds: the
     * turn is interrupted, and resuming goes back to the card rather than to a verdict on words it has since
     * gone past.
     */
    @Synchronized
    private fun onCardTurnStarted() {
        when (phase) {
            Phase.CARD -> cardWaits = false

            Phase.VERDICT -> {
                interrupting = true
                head?.interrupt()
                interrupting = false
                pendingHead = ""
                headAskedAt = 0
                heldEndings += judged
                judged = emptyList()
                cardTurn.clear()
                phase = Phase.CARD
                run.steps.getOrNull(at)?.let { step -> editStep(step.key) { it.copy(state = StepState.RUNNING) } }
                changed()
            }

            // The turn under the question had died (see [cardTurnEnded]) and a report has brought the card back:
            // answered now, the question leads to waiting for this turn's end, not to a verdict in its middle.
            Phase.QUESTION, Phase.BLOCKED -> cardIsBack()

            Phase.PAUSED -> when (resumeTo) {
                Phase.CARD, Phase.VERDICT -> {
                    interrupting = true
                    card?.interrupt()
                    interrupting = false
                    if (resumeTo == Phase.VERDICT) {
                        pendingHead = ""
                        headAskedAt = 0
                    }
                    resumeTo = Phase.CARD
                }

                // The brake holds over a question too - over one whose turn had died, that is: a live turn standing
                // on its question is never interrupted (see [pause]). The interrupted turn ends dead, as the one
                // before it did, and its end is read the way that one's was.
                Phase.QUESTION, Phase.BLOCKED -> if (cardTurnEnded) {
                    cardIsBack()
                    interrupting = true
                    card?.interrupt()
                    interrupting = false
                }

                else -> Unit
            }

            else -> Unit
        }
    }

    /** A turn that died under a question is alive again: what it said is held, and the new one's end is awaited. */
    private fun cardIsBack() {
        if (!cardTurnEnded) return
        cardTurnEnded = false
        heldEndings += cardTurn.last
        cardTurn.clear()
    }

    /** What every new message to the card starts from: nothing it ended with before is this turn's ending. */
    private fun freshCardTurn() {
        cardTurn.clear()
        heldEndings.clear()
        judged = emptyList()
        cardWaits = false
        // See [cardTurnEnded].
        cardTurnEnded = false
    }

    /** Keep what the card said at a turn it ended while its helpers were still at work (see [heldEndings]). */
    private fun holdWhileHelpersWork(): Boolean {
        if (!helpers.busy()) return false
        heldEndings += cardTurn.last
        cardTurn.clear()
        return true
    }

    /**
     * The card's turn is over: hand it to the head - unless helpers it started in the background are still
     * at work, and then wait for them.
     *
     * Their reports start the card's next turn by themselves, so waiting is staying in the card's phase
     * with the card's clock running on: it is the card's work, and a helper that never comes back is caught
     * by the card's three-hour ceiling, a wait that ran out without a turn by the clock (see [watchTheCard]).
     * A turn that died under a question comes here as well (see
     * [afterQuestion]) and goes back to the card's phase the same way. A pause taken while the card waits
     * interrupts it as it would mid-turn, and the CLI stops the helpers with it (measured on 2.1.280) - the
     * same full stop as everywhere else, and the card told to carry on starts them again if it needs them.
     */
    private fun turnOver() {
        if (!holdWhileHelpersWork()) return judgeTheCard()

        cardTurnEnded = false
        cardWaits = true
        if (phase == Phase.CARD) return

        phase = Phase.CARD
        run = run.copy(state = RunState.RUNNING)
        run.steps.getOrNull(at)?.let { step -> editStep(step.key) { it.copy(state = StepState.RUNNING) } }
    }

    /**
     * The card has said all it is going to say: hand what came of it to the head.
     *
     * A turn that died halfway leaves a short answer or none at all, and that is told to the head as it
     * is rather than decided here - `ok` is what it managed to say. Whether half an answer is worth
     * another go is the head's judgement, and it already has the machinery for it.
     *
     * [overdue] is a wait given up on while a helper's command was still running (see [watchTheCard]): the
     * head is told so, because then the last thing the card said is likely "waiting", not a report.
     */
    private fun judgeTheCard(overdue: Boolean = false) {
        val step = run.steps.getOrNull(at) ?: return
        val stage = scenario.stages.firstOrNull { it.id == step.stageId } ?: return
        val definition = stage.cards.firstOrNull { it.id == step.cardId } ?: return

        cardTurnEnded = false
        cardWaits = false
        val waited = heldEndings.isNotEmpty()
        val endings = heldEndings + cardTurn.last
        heldEndings.clear()
        judged = endings
        val answer = endings.joinToString("\n\n")
        editStep(step.key) { it.copy(state = StepState.JUDGING, said = "", summary = shorten(answer, SUMMARY_CHARS)) }

        phase = Phase.VERDICT
        askHead(
            HeadTalk.verdictRequest(
                card = definition,
                endings = endings,
                waited = waited,
                overdue = overdue,
                ok = answer.isNotBlank(),
                nudgesLeft = (scenario.head.retries - nudges).coerceAtLeast(0),
                handsOver = canTakeOver(stopAsked = false),
            ),
        )
        changed()
    }

    private fun takeVerdict(body: JsonObject) {
        val step = run.steps.getOrNull(at) ?: return
        val retry = HeadAnswer.text(body, "retry")
        val reason = HeadAnswer.text(body, "reason")

        if (retry.isNotBlank() && nudges < scenario.head.retries) {
            nudges += 1
            editStep(step.key) { it.copy(state = StepState.RUNNING, nudges = it.nudges + retry, said = "") }
            phase = Phase.CARD
            cardStartedAt = System.currentTimeMillis()
            pausedFor = 0
            pausedAt = 0
            freshCardTurn()
            card?.sendPrompt(retry)
            return
        }

        val done = HeadAnswer.flag(body, "done") ?: retry.isBlank()
        if (!done && canTakeOver(stopAsked = HeadAnswer.flag(body, "stop") ?: false)) {
            return takeOver(step, why = reason.ifBlank { "the main thread judged it not done" }, said = null)
        }
        closeCard()

        editStep(step.key) {
            it.copy(
                state = if (done) StepState.DONE else StepState.FAILED,
                verdict = if (done) "done" else "undone",
                verdictReason = reason,
                handoff = HeadAnswer.text(body, "handoff"),
                finishedAt = System.currentTimeMillis(),
                failure = if (done) "" else if (nudges >= scenario.head.retries && scenario.head.retries > 0) {
                    RunFailure.RETRIES
                } else {
                    RunFailure.UNDONE
                },
                error = if (done) "" else reason,
            )
        }

        if (!done) {
            /*
             * The run stops on a card the head gave up on, and that is deliberate rather than strict:
             * everything written after this card was written in the belief that this card happened.
             * Carrying on would be doing work against a state that never came about, which reads in the
             * morning as several cards failing for no reason.
             */
            val failed = run.steps[at]
            return end(RunState.FAILED, failed.failure, "${failed.title}: ${reason.ifBlank { "not done" }}")
        }

        nextStep()
    }

    /** Past this card - and, at the end of a pass that may be the last, ask the head whether to go again. */
    private fun nextStep() {
        val finished = run.steps.getOrNull(at) ?: return end(RunState.DONE, "", "")
        val next = run.steps.getOrNull(at + 1)
        val stage = scenario.stages.firstOrNull { it.id == finished.stageId }

        val passEnded = next == null || next.stageId != finished.stageId || next.pass != finished.pass
        val moreToCome = next != null && next.stageId == finished.stageId && next.pass > finished.pass

        if (stage != null && stage.untilDone && passEnded && moreToCome) {
            phase = Phase.AGAIN
            askHead(HeadTalk.anotherPassRequest(stage, finished.pass, ScenarioRules.passesOf(stage)))
            return
        }

        at += 1
        if (at >= run.steps.size) return end(RunState.DONE, "", "")
        beginStep()
    }

    /** The head has said whether a loop of a stage is worth another pass. */
    private fun takeAnotherPass(body: JsonObject) {
        val again = HeadAnswer.flag(body, "again") ?: false
        val here = run.steps.getOrNull(at) ?: return end(RunState.DONE, "", "")

        if (again) {
            at += 1
            if (at >= run.steps.size) return end(RunState.DONE, "", "")
            return beginStep()
        }

        /*
         * The passes that will not happen are marked as never having run, not quietly dropped.
         *
         * A timeline that loses rows when a loop ends early is a timeline whose length depends on the
         * outcome: the person who wrote "up to five passes" would have no way of seeing that three were
         * enough, which is the one thing worth knowing about a loop.
         */
        var index = at + 1
        while (index < run.steps.size && run.steps[index].stageId == here.stageId) {
            val key = run.steps[index].key
            editStep(key) { it.copy(state = StepState.SKIPPED, finishedAt = System.currentTimeMillis()) }
            index += 1
        }
        at = index
        if (at >= run.steps.size) return end(RunState.DONE, "", "")
        beginStep()
    }

    // --- The head doing a card's work --------------------------------------------------

    /**
     * Whether the card on the board, given up on now, would go to the head (see TakeOver.wanted).
     *
     * The head has to have a conversation to come up over as well: a take-over is the same head with its
     * memory of the night, and a head that never announced one would be a stranger handed a half-done job.
     */
    private fun canTakeOver(stopAsked: Boolean): Boolean =
        TakeOver.wanted(scenario.head, tookOver, stopAsked) && run.headConversationId.isNotEmpty()

    /**
     * The card's own session could not finish it: hand its work to the head, once.
     *
     * What a person otherwise did by hand in the morning, done at the moment it went wrong: the head's
     * conversation, which remembers the whole run, told to finish the job itself. The card is taken down
     * first - two sessions writing to one working copy is the thing the board exists to prevent - and
     * whatever it was asking dies with it. The head is raised again over its own conversation with the
     * card's trust and without its fence (see [raiseHead]); the message that hands the work over is what
     * lifts the role (see HeadTalk.takeOverRequest).
     *
     * The clock is the card's: the head is doing a card's work, and a card's three hours are what a piece of
     * work is given here. The step keeps its row and its state - it is still the same card being worked on -
     * and says on it why the head took over.
     */
    private fun takeOver(step: RunStep, why: String, said: String?) {
        val definition = scenario.stages.firstOrNull { it.id == step.stageId }?.cards?.firstOrNull { it.id == step.cardId }
            ?: return end(RunState.FAILED, RunFailure.CRASHED, "a step of this run points at a card that is not in it")

        tookOver = true
        closeCard()
        questions.clear()
        deciding = ""
        cardTurnEnded = false
        run = run.copy(state = RunState.RUNNING, question = null)
        editStep(step.key) {
            it.copy(
                state = StepState.RUNNING,
                takeOver = shorten(why, TAKE_OVER_CHARS),
                said = "",
                verdict = "",
                verdictReason = "",
            )
        }

        raiseHead(takingOver = true)
        phase = Phase.TAKEOVER
        cardStartedAt = System.currentTimeMillis()
        pausedFor = 0
        pausedAt = 0
        askHead(
            HeadTalk.takeOverRequest(
                card = definition,
                prompt = step.prompt.ifBlank { ScenarioRules.fillInputs(definition.prompt, run.inputs) },
                why = why,
                said = said?.let { shorten(it, SUMMARY_CHARS) },
                transcript = step.conversationId.takeIf { it.isNotEmpty() }
                    ?.let { ClaudeHistory.transcriptFile(workingDirectory, it)?.path },
            ),
        )
        changed()
    }

    /**
     * The head has said whether it finished the card's work.
     *
     * Finished, and it goes back to being a foreman before anything else is handed to it: the process is
     * raised again with its fence, because the next card is somebody else's work. Not finished, and the run
     * stops under a name of its own - a card nobody here could finish reads differently in the morning from
     * one the head simply gave up on.
     */
    private fun takeOverVerdict(body: JsonObject) {
        val step = run.steps.getOrNull(at) ?: return
        val done = HeadAnswer.flag(body, "done") ?: false
        val reason = HeadAnswer.text(body, "reason")

        editStep(step.key) {
            it.copy(
                state = if (done) StepState.DONE else StepState.FAILED,
                verdict = if (done) "done" else "undone",
                verdictReason = reason,
                handoff = HeadAnswer.text(body, "handoff"),
                finishedAt = System.currentTimeMillis(),
                failure = if (done) "" else RunFailure.HEAD_GAVE_UP,
                error = if (done) "" else reason,
                said = "",
            )
        }

        if (!done) {
            return end(RunState.FAILED, RunFailure.HEAD_GAVE_UP, "${step.title}: ${reason.ifBlank { "not done" }}")
        }

        raiseHead(takingOver = false)
        nextStep()
    }

    /**
     * The head's process taken down and raised again over its own conversation - fenced, or not.
     *
     * A fresh process rather than a mode switched on the live one, and for the fence's sake: switching a
     * mode is a request the CLI may refuse, and a refusal on the way BACK would leave a foreman with no
     * fence and nobody noticing. Raised anew, what it may do is what it was launched with. The process is
     * only started by the next message, so a head raised after the last card and taken down at the end
     * costs nothing. Our own stop is not a crash (see ClaudeSession.stop), and the bill carries on by the
     * rule a fresh count is read by (see [spentOf]).
     */
    private fun raiseHead(takingOver: Boolean) {
        head?.stop()
        unfenced = takingOver
        head = openHead(resumeFrom = run.headConversationId, takingOver = takingOver)
    }

    // --- Questions the cards raise -------------------------------------------------

    @Synchronized
    private fun onCardQuestion(request: PermissionChannel.ToolPermission) {
        // A card taken over is a card taken down: a request still in flight from it belongs to nobody.
        if (phase == Phase.OVER || phase == Phase.TAKEOVER) return
        val step = run.steps.getOrNull(at) ?: return

        questions.addLast(request)

        /*
         * Asked while the run is paused, which is a race rather than a rarity: pausing interrupts the
         * card, the interrupt takes a moment to land, and a question already in flight arrives inside it.
         *
         * Nothing here changes state - not the phase, not the step, not the screen. Putting it would lift
         * the pause silently: the phase would stop being PAUSED, and [resume] would then refuse to do
         * anything for the rest of the run, leaving a screen that says "paused" over agents that are
         * still working. The pause is the one brake on a run that edits files for hours unwatched, and a
         * brake that comes off when it is pulled is not one. It waits in the queue, and [resume] puts it.
         */
        if (phase == Phase.PAUSED) return

        editStep(step.key) { it.copy(state = StepState.ASKING) }

        // Already standing on an earlier one: this one waits its turn and is put when that one is done.
        if (questions.size > 1) {
            changed()
            return
        }
        putQuestion(step, request)
    }

    /** Put a question to whoever the scenario says decides it: a person, or the head. */
    private fun putQuestion(step: RunStep, request: PermissionChannel.ToolPermission) {
        if (scenario.head.onQuestion == HeadSettings.ON_QUESTION_STOP) {
            // Genuinely still: the card's turn is open, its process is up, and nothing is being spent.
            // The clock stops with it - a question asked at eleven must not kill the card at two for
            // taking too long over something nobody was doing.
            hold()
            phase = Phase.BLOCKED
            run = run.copy(state = RunState.BLOCKED)
            standOn(step, request)
            changed()
            return
        }

        deciding = request.requestId
        phase = Phase.QUESTION
        askHead(
            HeadTalk.questionRequest(
                title = CardQuestion.title(request),
                tool = request.toolName,
                detail = shorten(request.input.toString(), DETAIL_CHARS),
                options = CardQuestion.options(request),
            ),
        )
        changed()
    }

    /** The question a person is being shown, and the wake-up that goes with it. */
    private fun standOn(step: RunStep, request: PermissionChannel.ToolPermission) {
        val title = CardQuestion.title(request)
        editStep(step.key) { it.copy(state = StepState.ASKING) }
        run = run.copy(
            question = RunQuestion(
                stepKey = step.key,
                title = title,
                tool = request.toolName,
                detail = shorten(request.input.toString(), DETAIL_CHARS),
                options = CardQuestion.options(request),
                askedAt = System.currentTimeMillis(),
            ),
        )
        notify(run.scenarioName, "${step.title}: ${title.ifBlank { request.toolName }}")
    }

    /**
     * One question is disposed of: take the next the card asked for, or let it carry on.
     *
     * Called with the answered request already off the queue, and never while the run is paused - a paused
     * run decides that in [answer], where what it goes back to is what changes rather than what it is doing.
     */
    private fun afterQuestion() {
        val step = run.steps.getOrNull(at)

        /*
         * The turn that asked is already over, so there is nothing to go back to and nothing left to ask.
         *
         * Everything still in the queue belongs to that same dead turn: put to a person at three in the
         * morning it would be a question about work that has already stopped, and answered it would be
         * written into a request the CLI discards. The card goes to the head with whatever it managed to
         * say (see [judgeTheCard]) - or, with helpers of its still at work, waits for them first (see
         * [turnOver]).
         */
        if (cardTurnEnded) {
            questions.clear()
            deciding = ""
            if (phase == Phase.BLOCKED) release()
            run = run.copy(question = null)
            turnOver()
            return
        }

        val next = questions.firstOrNull()
        if (next != null && step != null) return putQuestion(step, next)

        if (phase == Phase.BLOCKED) release()
        phase = Phase.CARD
        run = run.copy(state = RunState.RUNNING, question = null)
        step?.let { editStep(it.key) { s -> s.copy(state = StepState.RUNNING) } }
    }

    /**
     * The CLI took a question back - a hook that decided it while we were asking, a turn that ended.
     *
     * Nothing is written back to it: an answer to a withdrawn request the CLI discards. What matters is
     * that the run stops waiting, or it waits for ever on a question nobody is asking any more.
     */
    @Synchronized
    private fun onQuestionWithdrawn(requestId: String) {
        // One further back in the queue: it was never put to anybody, so nothing that is on the screen or
        // in flight is about it, and dropping it is the whole of the work.
        val current = questions.firstOrNull()?.requestId == requestId
        if (!questions.removeAll { it.requestId == requestId }) return
        if (!current) return
        // The head is deciding a question that no longer exists: its answer must not land on the next one.
        if (deciding == requestId) deciding = ""

        // Taken back while the run is paused: nothing on screen changes now, but what the run goes back to
        // does - if no question is left, resuming must carry on the card rather than wait.
        if (phase == Phase.PAUSED) {
            if (resumeTo != Phase.BLOCKED && resumeTo != Phase.QUESTION) return
            val next = questions.firstOrNull()
            if (next == null) {
                resumeTo = Phase.CARD
                return
            }
            // Another question of the same batch is still standing, so the run goes back to waiting on that
            // one. Only a person's screen has to be told: a head that decides them is asked again on resume
            // and gets to the queue by itself.
            if (resumeTo == Phase.BLOCKED) {
                run.steps.getOrNull(at)?.let { step -> standOn(step, next) }
                changed()
            }
            return
        }

        /*
         * The head is mid-turn over the question that has just gone, so nothing is put to it now.
         *
         * A question handed over while its turn is still running would be answered by the sentence the
         * head is already writing about the old one. The turn is live and will end, and with [deciding]
         * cleared its answer is read as belonging to nothing - that is where the queue moves on.
         */
        if (phase == Phase.QUESTION) return

        if (phase != Phase.BLOCKED) return
        afterQuestion()
        changed()
    }

    private fun answerCardQuestion(body: JsonObject) {
        // The question the head was actually asked about. Anything else means it was taken back under us:
        // this answer belongs to nothing, and what the card asked for next is put now instead - there is
        // nobody left mid-turn to confuse.
        val request = questions.firstOrNull()?.takeIf { it.requestId == deciding } ?: return afterQuestion()
        questions.removeFirst()
        deciding = ""
        val allow = HeadAnswer.flag(body, "allow") ?: false
        val answer = HeadAnswer.text(body, "answer")

        afterQuestion()
        writeAnswer(request, allow, answer)
    }

    /**
     * A person answered the question the run was standing on.
     *
     * Answerable while paused as well, and that is not a loophole: a pause over a question interrupts
     * nothing (see [pause]), so the card is still holding its turn open and waiting. Refusing the answer
     * there would mean a screen with a live question on it and a button that does nothing.
     */
    @Synchronized
    fun answer(allow: Boolean, text: String) {
        val request = questions.firstOrNull() ?: return
        val paused = phase == Phase.PAUSED && resumeTo == Phase.BLOCKED
        if (phase != Phase.BLOCKED && !paused) return

        questions.removeFirst()
        run = run.copy(question = null)
        writeAnswer(request, allow, text)

        val next = questions.firstOrNull()
        if (!paused) {
            afterQuestion()
            changed()
            return
        }

        // Still paused, so what changes is what the run goes back to rather than what it is doing. The
        // next question the card asked for is put on the screen even so: it can be answered from a pause.
        if (next == null) {
            resumeTo = Phase.CARD
        } else {
            resumeTo = Phase.BLOCKED
            run.steps.getOrNull(at)?.let { step -> standOn(step, next) }
        }
        changed()
    }

    /**
     * The answer written back into the card's own request.
     *
     * A question with options is not a permission and is never refused: the CLI expects the chosen option
     * beside the call's own arguments and assembles the tool result out of it, so a "no" there tells the
     * card that nobody answered at all - and it stands where it was (see CardQuestion).
     */
    private fun writeAnswer(request: PermissionChannel.ToolPermission, allow: Boolean, text: String) {
        val session = card ?: return
        val extra = CardQuestion.answers(request, text)
        session.answerPermission(
            requestId = request.requestId,
            allow = allow || extra != null,
            message = text,
            extraInput = extra,
        )
    }

    /**
     * The head's own permission prompt, answered here because there is nobody upstream to ask.
     *
     * The head is a foreman and this is the fence that keeps it one: it may look at the project all it
     * likes, and everything that writes belongs to a card. The refusal is a sentence rather than a code,
     * because the reader is the head and it will work around what it is told. A head raised to do a card's
     * work stands in for that card, and is answered by the card's rules instead (see TakeOver.answer).
     */
    @Synchronized
    private fun onHeadPermission(request: PermissionChannel.ToolPermission) {
        val session = head ?: return
        val verdict = if (unfenced) TakeOver.answer(scenario.head, request) else HeadFence.judge(request)
        session.answerPermission(request.requestId, allow = verdict.ok, message = verdict.why)
    }

    // --- Pause, resume, stop -------------------------------------------------------

    /**
     * Everything stops where it stands, and nothing dies.
     *
     * A full stop rather than a boundary: the turn running right now is interrupted the way Escape
     * interrupts one at the desk, and the processes stay up with everything they remember. That is what
     * makes [resume] possible at all - a card told to carry on knows what it had already done, which a
     * fresh session handed the same instruction would not.
     */
    @Synchronized
    fun pause() {
        if (phase == Phase.OVER || phase == Phase.PAUSED) return

        interrupting = true
        hold()
        head?.interrupt()
        /*
         * The card is interrupted only when it is actually working.
         *
         * A card standing on a question is not doing anything - its turn is open and waiting for an
         * answer, which is the one thing an interrupt would destroy: the question would die with the turn,
         * and resuming would put the run back to waiting for an answer nobody can give any more. So a
         * pause over a question is simply a pause: nothing was running, and nothing is stopped.
         */
        if (phase == Phase.CARD) card?.interrupt()
        interrupting = false

        // What it was doing has to be remembered before the phase is overwritten: resuming is asking the
        // same question again, and after a pause there is nobody left to say what the question was.
        resumeTo = phase
        phase = Phase.PAUSED
        run = run.copy(
            state = RunState.PAUSED,
            steps = run.steps.map { if (StepState.over(it.state) || it.state == StepState.WAITING) it else it.copy(state = StepState.PAUSED) },
        )
        changed()
    }

    /**
     * Carry on from where it stood.
     *
     * The head is asked its question again - an interrupted turn has no answer to be had, and the
     * question is the one thing that survives it (see [pendingHead]). A card that was working is simply
     * told to carry on: the session is the same one, so "carry on" is a whole instruction.
     */
    @Synchronized
    fun resume() {
        if (phase != Phase.PAUSED) return

        /*
         * A question that came in during the pause and was never put to anybody (see [onCardQuestion]).
         *
         * Only possible where the run went to sleep working - a question put before the pause left
         * [resumeTo] on BLOCKED or QUESTION - so a waiting question over CARD is exactly that one. The
         * card is standing on it with its turn open, so carrying on means putting the question rather
         * than telling the card to carry on: told that, it would queue the words and go on waiting for an
         * answer nobody is being asked for, until its own ceiling took the run down hours later.
         */
        val waiting = if (resumeTo == Phase.CARD) questions.firstOrNull() else null
        val standing = run.steps.getOrNull(at)
        if (waiting != null && standing != null) {
            // A head deciding is work and the clock runs; a person deciding is not, and [putQuestion]
            // holds it there itself.
            if (scenario.head.onQuestion != HeadSettings.ON_QUESTION_STOP) release()
            run = run.copy(state = RunState.RUNNING)
            editStep(standing.key) { it.copy(state = StepState.ASKING) }
            putQuestion(standing, waiting)
            return
        }

        /*
         * The idle clock is only stopped when the run is genuinely going back to work.
         *
         * A pause lifted over a question that nobody has answered yet goes back to the same waiting, and
         * the waiting is exactly what does not count against the card's three hours. Stopping it here
         * would leave nothing to turn it on again - the answer arrives in the morning and the step is
         * failed for a night of work it never did.
         */
        if (resumeTo != Phase.BLOCKED) release()
        phase = resumeTo
        run = run.copy(state = if (phase == Phase.BLOCKED) RunState.BLOCKED else RunState.RUNNING)

        when (phase) {
            Phase.CARD -> {
                run.steps.getOrNull(at)?.let { step -> editStep(step.key) { it.copy(state = StepState.RUNNING) } }
                cardStartedAt = System.currentTimeMillis()
                pausedFor = 0
                pausedAt = 0
                freshCardTurn()
                card?.sendPrompt(CARD_CARRY_ON)
            }

            Phase.BLOCKED -> run.steps.getOrNull(at)?.let { step -> editStep(step.key) { it.copy(state = StepState.ASKING) } }

            // Doing a card's work, so carried on the way a card is rather than asked its question again:
            // the hand-over is an hour of work, and saying it a second time would start that hour over.
            Phase.TAKEOVER -> {
                run.steps.getOrNull(at)?.let { step -> editStep(step.key) { it.copy(state = StepState.RUNNING) } }
                cardStartedAt = System.currentTimeMillis()
                pausedFor = 0
                pausedAt = 0
                askAgain(HeadTalk.TAKE_OVER_CARRY_ON)
            }

            Phase.OPENING, Phase.SLOTS, Phase.QUESTION, Phase.VERDICT, Phase.AGAIN -> {
                run.steps.getOrNull(at)?.let { step -> editStep(step.key) { it.copy(state = StepState.JUDGING) } }
                // The same question again, not a new one: a pause taken in the middle of a re-ask must not
                // hand the head a fresh allowance to answer wrongly.
                askAgain(pendingHead.ifBlank { CARRY_ON })
            }

            else -> Unit
        }
        changed()
    }

    /** Stop for good: both processes are taken down and the run is written as stopped. */
    @Synchronized
    fun stop() {
        if (phase == Phase.OVER) return
        end(RunState.STOPPED, RunFailure.STOPPED, "")
    }

    /**
     * The run never got going: take down whatever did come up, and report nothing.
     *
     * Not [stop], which is a run that ended and says so - a notification, a record written as stopped, the
     * list redrawn. A [begin] that threw has its own failure to write and a desk to write it (see
     * ScenarioDesk.start); what is left here is the process it managed to raise before throwing, which
     * without this lives to the end of the IDE with its clock still ticking and nothing pointing at it.
     */
    @Synchronized
    fun abandon() {
        if (phase == Phase.OVER) return
        takeEverythingDown()
    }

    /** Both processes, the clock and the questions - everything the run holds while it is alive. */
    private fun takeEverythingDown() {
        phase = Phase.OVER

        clock?.cancel(false)
        clock = null
        closeCard()
        head?.stop()
        head = null
        questions.clear()
        deciding = ""
    }

    override fun dispose() {
        stop()
    }

    // --- Ceilings and failures ------------------------------------------------------

    private fun watchTheClock() {
        clock = AppExecutorUtil.getAppScheduledExecutorService().scheduleWithFixedDelay(
            { runCatching { tick() }.onFailure { thisLogger().warn("A scenario run's clock stumbled", it) } },
            TICK_SECONDS,
            TICK_SECONDS,
            TimeUnit.SECONDS,
        )
    }

    /**
     * The two things that can stand still for ever, looked at on the same beat.
     *
     * Polled rather than set as one timer, because the deadline moves: every minute parked on a person's
     * answer, or on a pause, pushes it out by a minute. A timer set once at the start could not know that.
     */
    @Synchronized
    private fun tick() {
        when {
            phase == Phase.CARD -> watchTheCard()
            phase == Phase.TAKEOVER -> watchTheTakeOver()
            headAskedAt > 0L && phase in HEAD_PHASES -> watchTheHead()
        }
    }

    /** Whether the work on the board - a card's, or the head's in its place - has run past a card's ceiling. */
    private fun pastTheCeiling(): Boolean {
        if (cardStartedAt == 0L) return false
        val parked = pausedFor + if (pausedAt > 0) System.currentTimeMillis() - pausedAt else 0
        return System.currentTimeMillis() - cardStartedAt - parked >= CARD_CEILING_MS
    }

    /**
     * How long the card on the board has genuinely been working.
     *
     * A card that ran past its time is one its session could not finish, so it goes to the head where the
     * scenario says so. What it was saying at that moment travels with it: the head never judged a turn
     * that never ended, and it is the one clue to where three hours went.
     *
     * A card waiting for its helpers is looked at on the same beat. A helper's report starts the card's
     * next turn by itself, so nothing is left to wait for while it still waits only when that never came:
     * a command of a helper's that outlived its allowance (see BackgroundWork.HELPERS_COMMAND_MS), or a
     * report the CLI did not take up. Its answer is then what it said so far, and the head judges that.
     */
    private fun watchTheCard() {
        if (cardWaits && !helpers.busy()) return judgeTheCard(overdue = helpers.overdue())
        if (!pastTheCeiling()) return

        val step = run.steps.getOrNull(at) ?: return
        if (canTakeOver(stopAsked = false)) {
            return takeOver(step, why = "it ran past its time (${CARD_CEILING_MS / HOUR_MS} hours)", said = step.said.ifBlank { step.summary })
        }
        editStep(step.key) { it.copy(failure = RunFailure.TOO_LONG) }
        end(RunState.FAILED, RunFailure.TOO_LONG, "${step.title}: it ran past its time")
    }

    /** The same ceiling over the head doing a card's work - and nobody left to hand it to after that. */
    private fun watchTheTakeOver() {
        if (!pastTheCeiling()) return

        val step = run.steps.getOrNull(at) ?: return
        editStep(step.key) { it.copy(failure = RunFailure.TOO_LONG) }
        end(RunState.FAILED, RunFailure.TOO_LONG, "${step.title}: the main thread ran past its time finishing it")
    }

    /**
     * How long the head has been sitting on a question of ours.
     *
     * Ended rather than asked again: putting the question a second time means interrupting the open turn,
     * and the turn does not close on the word - it closes some time later, in the same phase, where it
     * would be read as an answer to the question just asked. A head that has said nothing for half an
     * hour about a sentence and a small object is not a head that is about to speak, and the run has to
     * stop being a run so that the slot goes back (see [headAskedAt]).
     */
    private fun watchTheHead() {
        if (System.currentTimeMillis() - headAskedAt < HEAD_CEILING_MS) return

        run.steps.getOrNull(at)?.let { step -> editStep(step.key) { it.copy(failure = RunFailure.HEAD_SILENT) } }
        end(RunState.FAILED, RunFailure.HEAD_SILENT, "the main thread stopped answering")
    }

    /**
     * Start or stop the run's own clock as the phase moves (see RunClock).
     *
     * Standing still is a pause, and a question nobody but a person can answer - the same two the card's
     * ceiling does not count (see [hold]). A head deciding a question is work, and so is a card waiting for
     * its helpers: something is being done and paid for. The end of the run closes a stretch it ended in -
     * a run stopped while paused did not work through its pause either.
     */
    private fun restsFollow(phase: Phase) {
        val resting = phase == Phase.PAUSED || phase == Phase.BLOCKED
        run = RunClock.follow(run, resting = resting, board = at, now = System.currentTimeMillis())
    }

    private fun hold() {
        if (pausedAt == 0L) pausedAt = System.currentTimeMillis()
    }

    private fun release() {
        if (pausedAt == 0L) return
        pausedFor += System.currentTimeMillis() - pausedAt
        pausedAt = 0
    }

    @Synchronized
    private fun onSessionError(head: Boolean, message: String) {
        if (phase == Phase.OVER) return
        // A card taken over was taken down by us, so nothing it still says is about the run (see [onCrashed]).
        if (!head && phase == Phase.TAKEOVER) return
        // A first failure of the head is a head that never came up at all - a missing executable, an
        // account that is not signed in. Worth saying differently from a head that answered badly later.
        val failure = when {
            head && run.headConversationId.isEmpty() -> RunFailure.NO_HEAD
            head -> RunFailure.REFUSED
            else -> RunFailure.NO_START
        }
        end(RunState.FAILED, failure, message)
    }

    @Synchronized
    private fun onCrashed(head: Boolean) {
        if (phase == Phase.OVER) return
        // A card already taken over was taken down by us: whatever it reports now is about nothing.
        if (!head && (phase == Phase.TAKEOVER || tookOver)) return
        /*
         * A card whose process went away while it was working, or while it stood on a question, is a card
         * its session could not finish. The head is not asked about it first - there is no turn to judge -
         * and a card that died while being judged is not handed over either: its turn was already over, and
         * the head's verdict on it is on its way.
         */
        if (!head && phase in CARD_PHASES && canTakeOver(stopAsked = false)) {
            val step = run.steps.getOrNull(at) ?: return
            return takeOver(step, why = "its process went away", said = step.said.ifBlank { step.summary })
        }
        end(RunState.FAILED, RunFailure.CRASHED, if (head) "the head's process went away" else "a step's process went away")
    }

    // --- Ending ---------------------------------------------------------------------

    private fun end(state: String, failure: String, error: String) {
        if (phase == Phase.OVER) return
        takeEverythingDown()

        run = run.copy(
            state = state,
            finishedAt = System.currentTimeMillis(),
            failure = failure.ifEmpty { run.failure },
            error = error.ifEmpty { run.error },
            question = null,
            /*
             * The cards still in the air when the run ended, told apart by whether they had begun.
             *
             * A card that never got its go was skipped, and in the morning that is a different thing from
             * one that was halfway through something when somebody pressed stop. Calling both "skipped"
             * hides the only one of the two whose work may be half-done on the disk.
             */
            steps = run.steps.map { step ->
                if (StepState.over(step.state)) {
                    step
                } else {
                    val begun = StepState.begun(step.state)
                    step.copy(
                        state = if (begun) StepState.FAILED else StepState.SKIPPED,
                        failure = step.failure.ifEmpty {
                            if (begun) (if (state == RunState.STOPPED) RunFailure.STOPPED else RunFailure.CRASHED) else ""
                        },
                        finishedAt = if (step.finishedAt > 0) step.finishedAt else System.currentTimeMillis(),
                        said = "",
                    )
                }
            },
        )

        changed()
        onFinished(run)
    }

    private fun closeCard() {
        card?.stop()
        card = null
    }

    // --- Little helpers ---------------------------------------------------------------

    private fun editStep(key: String, change: (RunStep) -> RunStep) {
        run = run.copy(steps = run.steps.map { if (it.key == key) change(it) else it })
    }

    private fun changed() {
        runCatching { onChange(run) }.onFailure { thisLogger().warn("A scenario run's listener stumbled", it) }
    }

    private companion object {
        /** How long one card may genuinely work before the run gives up on it. Long, because work is long. */
        const val CARD_CEILING_MS = 3L * 60 * 60 * 1000

        /**
         * How long the head may take over one answer. Short beside a card's, because its work is short.
         *
         * A card is asked to do a piece of work and may read half a repository doing it. The head is asked
         * for a sentence or two and a small object, which is a turn of seconds - so half an hour is
         * already an order of magnitude more than a slow network and the CLI's own retries can want, and
         * still leaves the slot free by the end of the evening rather than at the next start of the IDE.
         */
        const val HEAD_CEILING_MS = 30L * 60 * 1000

        /** The phases in which the run is waiting on the head and on nothing else. */
        val HEAD_PHASES = setOf(Phase.OPENING, Phase.SLOTS, Phase.QUESTION, Phase.VERDICT, Phase.AGAIN)

        /** The phases in which the card's own turn is open - working, or standing on a question. */
        val CARD_PHASES = setOf(Phase.CARD, Phase.QUESTION, Phase.BLOCKED)
        const val HOUR_MS = 60L * 60 * 1000
        const val TICK_SECONDS = 30L
        /**
         * The newest words a row keeps (see LiveWords). Its live line shows the last three lines of them,
         * and across a wide panel three lines of the card's 11px type hold some seven hundred characters.
         */
        const val SAID_CHARS = 1200
        const val SUMMARY_CHARS = 4000
        const val NOTE_CHARS = 1200
        /** What a taken-over row says about why - one reason, not the card's whole last answer. */
        const val TAKE_OVER_CHARS = 400
        const val DETAIL_CHARS = 2000
        const val CARRY_ON = "Carry on from where you stopped."

        /**
         * The same words for a card, and one thing more: its helpers in the background did not survive. A
         * stop takes the process down, and a pause interrupts the card, which the CLI answers by stopping
         * them (measured on 2.1.280). Told nothing, a card last seen waiting for its reviewers goes on
         * waiting for reports that will never come, ends its turn on that, and is judged on it.
         */
        const val CARD_CARRY_ON = "$CARRY_ON Helpers you had started in the background did not survive the stop: " +
            "start again any you still need."

        /** Everything a turn was charged for - the cache is most of it on a card that reads a lot. */
        val TOKEN_FIELDS = listOf(
            "input_tokens",
            "output_tokens",
            "cache_creation_input_tokens",
            "cache_read_input_tokens",
        )

        fun shorten(text: String, limit: Int): String =
            if (text.length <= limit) text else text.take(limit) + "..."
    }
}

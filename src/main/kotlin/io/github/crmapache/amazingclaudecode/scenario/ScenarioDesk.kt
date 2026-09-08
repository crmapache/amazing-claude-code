package io.github.crmapache.amazingclaudecode.scenario

import com.intellij.notification.NotificationGroupManager
import com.intellij.notification.NotificationType
import com.intellij.openapi.Disposable
import com.intellij.openapi.application.ApplicationManager
import com.intellij.openapi.diagnostic.thisLogger
import com.intellij.openapi.project.Project
import com.intellij.openapi.util.Disposer
import com.intellij.util.concurrency.AppExecutorUtil
import io.github.crmapache.amazingclaudecode.claude.ClaudeExecutable
import io.github.crmapache.amazingclaudecode.claude.ClaudeHistory
import io.github.crmapache.amazingclaudecode.claude.ClaudePreferences
import io.github.crmapache.amazingclaudecode.claude.ClaudeSessionHub
import io.github.crmapache.amazingclaudecode.claude.accounts.ClaudeAccounts
import io.github.crmapache.amazingclaudecode.feedback.DiagnosticsLog
import io.github.crmapache.amazingclaudecode.remote.RemoteFeed
import io.github.crmapache.amazingclaudecode.search.AiRuns
import com.intellij.execution.process.ProcessHandler
import java.util.concurrent.ScheduledFuture
import java.util.concurrent.TimeUnit
import java.util.concurrent.atomic.AtomicBoolean
import kotlinx.serialization.json.Json
import kotlinx.serialization.json.JsonArray
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.JsonPrimitive
import kotlinx.serialization.json.add
import kotlinx.serialization.json.buildJsonObject
import kotlinx.serialization.json.contentOrNull
import kotlinx.serialization.json.decodeFromJsonElement
import kotlinx.serialization.json.encodeToJsonElement
import kotlinx.serialization.json.jsonPrimitive
import kotlinx.serialization.json.put
import kotlinx.serialization.json.putJsonArray

/**
 * One project's scenarios, as the clients see them: the two shelves, the runs that came of them, and
 * the one run that may be going right now.
 *
 * One run at a time and that is the whole of the locking. Two runs in one working copy are four agents
 * editing the same files with nobody to reconcile them, and the failure that produces is not a message
 * on a screen - it is a branch with half of one round of work and half of another in it. Ordinary chat
 * tabs are not restrained at all: a person at the keyboard can see what they are doing.
 *
 * Everything that touches the disk runs off the thread the request came in on, like the rest of the
 * plugin's readers: a shelf may be on a network drive, and the thread a message arrives on is the one
 * every other conversation's messages arrive on too.
 */
internal class ScenarioDesk(private val project: Project, private val hub: ClaudeSessionHub) : Disposable {

    private val json = Json { encodeDefaults = true; ignoreUnknownKeys = true }
    private val store = ScenarioStore(project.basePath)
    private val runs = RunStore(project.basePath)
    private val schedules = ScheduleStore(project.basePath)

    /**
     * The one run this project may have going, and the whole of the locking that keeps it one.
     *
     * Volatile because every thread a message can arrive on reads it, and claimed inside [gate] because
     * "is one going?" and "mine is going now" have to be one step. Apart, they are a race that two windows
     * on one project win regularly: both found the field empty, the second's engine took the field, and the
     * first's processes lived on with nothing left pointing at them - four agents in one working copy, no
     * way to stop half of them, and a diff afterwards with two rounds of work mixed into it.
     */
    @Volatile
    private var engine: ScenarioEngine? = null

    /** Held only while the run slot is taken or given up - never while anything touches the disk. */
    private val gate = Any()

    /**
     * The scenarios a model is writing right now, so that Cancel means something (see [draft]).
     *
     * The same bookkeeping the model's search has, and for its reason: a request is known from the moment
     * it is asked, while its process appears seconds later, and a cancel that only knew processes fell into
     * that gap - the run started anyway, worked to the end, was paid for, and its answer was thrown away by
     * a screen that had moved on. Not the one-at-a-time gate above: writing one down costs a few cents and
     * touches nothing, unlike a run, which is four agents in one working copy.
     */
    private val drafts = AiRuns<ProcessHandler> { it.destroyProcess() }

    /**
     * Held while a run's state goes outwards, so that the end of a run is the last thing anybody hears.
     *
     * The heartbeat and the end of a run are on different threads, and the heartbeat reads the run and
     * sends it as two steps. Between those two the run can finish: the end writes DONE and draws it, and
     * then the beat that is already holding the previous snapshot draws RUNNING over it and writes RUNNING
     * on top of the record. What that leaves is a tab that keeps its Pause and Stop buttons and never
     * moves again, and a finished run on the disk that says it is still going - which the next start of
     * the IDE dutifully repairs into a failure (see RunStore.repairAbandoned). A night's work that went
     * well reads in the morning as a night that crashed.
     *
     * It covers reading the run as well as sending it, because holding it only over the sending would
     * close nothing: the stale snapshot is taken before the lock is ever reached.
     */
    private val outward = Any()

    /** The runs left behind by an IDE that went away have to be closed before anybody sees them. */
    private val swept = AtomicBoolean(false)

    /**
     * The two clocks a live run beats to.
     *
     * A run moves on every line its agents write - a word of a streaming answer is a change of state - and
     * both a redraw and a write to the disk would be wrong to do that often. So the screen is caught up
     * several times a second, which is as often as an eye can use, and the disk a great deal more rarely,
     * because what the disk is for is surviving a crash rather than being current.
     */
    private var redraw: ScheduledFuture<*>? = null

    /** Volatile because the tick and the work are no longer on one thread (see [tick]). */
    @Volatile
    private var dirty = false
    private var lastWrite = 0L

    /** Whether a beat is still being worked on, so ticks do not stack up behind a slow one. */
    private val pulsing = AtomicBoolean(false)

    /** The clock that watches the hours, alive for as long as the project is open (see [tickHours]). */
    private var clock: ScheduledFuture<*>? = null

    init {
        Disposer.register(hub, this)

        clock = AppExecutorUtil.getAppScheduledExecutorService().scheduleWithFixedDelay(
            {
                // Off the scheduler's own thread, like the run's heartbeat: this pool is shared with the
                // Stop button's watchdog and the usage polling, and starting a run takes a moment.
                runCatching {
                    ApplicationManager.getApplication().executeOnPooledThread {
                        runCatching { tickHours() }.onFailure { thisLogger().warn("The scenario clock stumbled", it) }
                    }
                }
            },
            HOURS_MS,
            HOURS_MS,
            TimeUnit.MILLISECONDS,
        )
    }

    // --- What the clients ask for ----------------------------------------------------

    /**
     * Both shelves and the list of past runs, to everyone in this project.
     *
     * Told to everybody rather than answered to whoever asked, unlike the search or the history. A
     * scenario is not private to a window - a second window on the same project has the same two shelves
     * and needs to see the one just written - and which run is live is a fact about the project itself.
     * The hub keeps the latest of these, so a panel opened later is caught up without asking (see
     * broadcastProject); a phone never sees it, because this type is not on the list of facts forwarded
     * outwards (see RemoteFeed.PROJECT_FACTS).
     */
    fun sendList() {
        off {
            if (swept.compareAndSet(false, true)) runs.repairAbandoned()

            val kept = store.all()
            val scenarios = kept.map(::withShelf)
            val summaries = runs.summaries()
            // A scenario deleted from the shelf takes its hour with it: an alarm for a round of work that
            // no longer exists goes on being due for ever, and nothing on the screen would explain it.
            val hours = schedules.keepOnly(kept)
            hub.broadcastProject(
                buildJsonObject {
                    put("type", "scenarios")
                    put("scenarios", JsonArray(scenarios))
                    put("runs", json.encodeToJsonElement(summaries))
                    put("live", engine?.run?.id.orEmpty())
                    put("schedules", json.encodeToJsonElement(hours))
                    // Whether this project has anywhere to put a shared scenario at all: a directory that
                    // is not open has no .claude to write into, and offering the choice would be a form
                    // that cannot be submitted.
                    put("canShare", store.projectDirectory() != null)
                }.toString(),
            )
        }
    }

    fun save(clientId: String, payload: JsonObject) {
        val body = payload["scenario"] as? JsonObject ?: return
        val scope = payload["scope"]?.jsonPrimitive?.contentOrNull.orEmpty()

        off {
            val scenario = runCatching { json.decodeFromJsonElement<Scenario>(body) }.getOrNull()
            if (scenario == null) return@off outcome(clientId, ok = false, code = "scenarioBroken")

            val stored = store.save(scenario, scope.ifBlank { scenario.scope })
            if (stored == null) return@off outcome(clientId, ok = false, code = "scenarioNotWritten")

            hub.emitTo(
                clientId,
                buildJsonObject {
                    put("type", "scenarioSaved")
                    put("scenario", withShelf(stored))
                }.toString(),
            )
            sendList()
        }
    }

    fun delete(clientId: String, id: String, scope: String) {
        off {
            if (!store.delete(id, scope)) outcome(clientId, ok = false, code = "scenarioNotDeleted")
            sendList()
        }
    }

    fun duplicate(clientId: String, id: String, scope: String) {
        off {
            store.duplicate(id, scope) ?: return@off outcome(clientId, ok = false, code = "scenarioNotWritten")
            sendList()
        }
    }

    /**
     * A scenario written by a model out of a sentence, for whoever is meeting the form for the first time
     * (see ScenarioAuthor).
     *
     * Handed back rather than saved. What a model wrote is a draft until a person has read it: this opens
     * in the editor as a scenario nobody has stored yet, and Save is still theirs to press. Writing the
     * file here would put a round of work into somebody's repository because a model answered.
     */
    fun draft(clientId: String, id: String, description: String) {
        if (id.isBlank()) return
        drafts.asked(id)

        ScenarioAuthor.write(
            workingDirectory = project.basePath,
            description = description,
            // The account the scenarios themselves run on, so the writing is billed where the running is.
            accountId = ClaudeAccounts.getInstance().currentId,
            onStarted = { handler -> drafts.started(id, handler) },
            onError = { message ->
                if (drafts.finished(id)) return@write
                DiagnosticsLog.note(DiagnosticsLog.AGENT, "a scenario could not be written by a model")
                drafted(clientId, id, scenario = null, error = shortError(message))
            },
            onResult = { scenario ->
                if (drafts.finished(id)) return@write
                DiagnosticsLog.note(DiagnosticsLog.AGENT, "a scenario was written by a model")
                drafted(clientId, id, scenario = scenario, error = null)
            },
        )
    }

    /** The person stopped waiting: the process goes, and its answer with it (see AiRuns). */
    fun cancelDraft(id: String) {
        drafts.cancel(id)
    }

    private fun drafted(clientId: String, id: String, scenario: Scenario?, error: String?) {
        hub.emitTo(
            clientId,
            buildJsonObject {
                put("type", "scenarioDrafted")
                put("id", id)
                // The shelf is chosen on the screen the draft lands on, so it travels with one written in
                // like any other scenario does (see [withShelf]).
                scenario?.let { put("scenario", withShelf(it.copy(scope = shelfFor()))) }
                error?.let { put("error", it) }
            }.toString(),
        )
    }

    /** Where a fresh scenario would go: the repository when there is one, and this person's own folder when not. */
    private fun shelfFor(): String =
        if (store.projectDirectory() != null) ScenarioScope.PROJECT else ScenarioScope.USER

    /**
     * The CLI's own complaint, cut to a line. It is written for a terminal - a stack of it over a text
     * field says nothing the first sentence does not.
     */
    private fun shortError(message: String): String = message.trim().lineSequence().firstOrNull().orEmpty().take(200)

    // --- Running ----------------------------------------------------------------------

    /**
     * Press play, from the hub.
     *
     * The refusal goes back to whoever asked as a name they have words for; the work of actually raising
     * a run is [launch], which the clock uses too (see [fire]) - two copies of the claim, the record and
     * the engine would be two copies of the one thing in this file that must not be got wrong twice.
     */
    fun start(clientId: String, id: String, scope: String, inputs: Map<String, String>) {
        off {
            val refusal = launch(id, scope, inputs) { record ->
                hub.emitTo(
                    clientId,
                    buildJsonObject {
                        put("type", "scenarioStarted")
                        put("runId", record.id)
                    }.toString(),
                )
            }
            if (refusal != null) return@off outcome(clientId, ok = false, code = refusal)
        }
    }

    /**
     * Raise a run, or say in one word why not.
     *
     * Null means it is going. Everything before the claim is a cheap early no; the claim itself is the
     * only answer nobody can slip between, and it is taken before a single process is up.
     */
    private fun launch(id: String, scope: String, inputs: Map<String, String>, onStarted: (ScenarioRun) -> Unit): String? {
        val scenario = store.find(id, scope) ?: return "scenarioGone"
        // A cheap early no, so an obviously busy project is not read off the disk. The answer that counts
        // is the claim below.
        if (engine != null) return "scenarioBusy"
        if (!ScenarioRules.runnable(scenario)) return "scenarioBroken"
        if (ScenarioRules.missingInputs(scenario, inputs).isNotEmpty()) return "scenarioMissingInput"
        if (ClaudeExecutable.find() == null) return "noClaude"

        // Every declared name answered, blank included: what the form sends holds only the fields somebody
        // typed in, and an untouched one would reach the agent as `{{notes}}` (see ScenarioRules.answers).
        val answers = ScenarioRules.answers(scenario, inputs)

        /*
         * One copy of the scenario, taken now, used by both the engine and the record.
         *
         * Everything about a run - which stages, how many passes, what each card says, what the head was
         * told - has to be what it was when the button was pressed. Otherwise a scenario edited at midnight
         * changes what a run started at eleven is doing, and changes the picture of it afterwards to match
         * (see ScenarioRun.snapshot).
         */
        val record = ScenarioRun(
            id = ScenarioStore.newId(),
            scenarioId = scenario.id,
            scenarioName = scenario.name,
            scope = scenario.scope,
            snapshot = scenario,
            startedAt = System.currentTimeMillis(),
            state = RunState.STARTING,
            inputs = answers,
            total = ScenarioRules.cardRuns(scenario),
        )

        val walker = ScenarioEngine(
            workingDirectory = project.basePath,
            accountId = ClaudeAccounts.getInstance().currentId,
            defaultModel = ClaudePreferences.model,
            defaultEffort = ClaudePreferences.effort,
            start = record,
            onChange = { moved() },
            onFinished = { finished -> ended(finished) },
            notify = { title, body -> announce(title, body) },
        )

        // Claimed before a single process is up: the engine opens nothing until begin().
        if (!claim(walker)) return "scenarioBusy"

        runs.keep(record)
        lastWrite = System.currentTimeMillis()

        onStarted(record)
        beat()
        runCatching { walker.begin() }.onFailure { failure ->
            thisLogger().warn("A scenario run would not start", failure)
            DiagnosticsLog.note(DiagnosticsLog.AGENT, "a scenario run would not start")
            // Down before it is forgotten: begin() raises the head before it can throw, and a process
            // nothing points at any more lives to the end of the IDE with its clock still ticking.
            walker.abandon()
            // The heartbeat is already beating by now, so this ending is written under the same lock as
            // any other: otherwise a beat in flight writes RUNNING over the failure (see [outward]).
            synchronized(outward) {
                release(record.id)
                stopBeating()
                runs.keep(record.copy(state = RunState.FAILED, failure = RunFailure.CRASHED, finishedAt = System.currentTimeMillis()))
            }
        }
        sendList()
        return null
    }
    // --- The hours -------------------------------------------------------------------

    /**
     * Set the hour this scenario starts at by itself, or move the one it has.
     *
     * The answers to its questions come with it: when the hour comes there is nobody at the keyboard to
     * ask, so a schedule without them would be an alarm that rings and then asks a question of an empty
     * chair. Refused here rather than at the hour for the same reason - a scenario that cannot run is
     * something to be told about now, while somebody is still looking at the screen.
     */
    fun schedule(clientId: String, id: String, scope: String, at: Int, repeat: String, weekday: Int, inputs: Map<String, String>) {
        off {
            val scenario = store.find(id, scope)
            if (scenario == null) return@off outcome(clientId, ok = false, code = "scenarioGone")
            if (!ScenarioRules.runnable(scenario)) return@off outcome(clientId, ok = false, code = "scenarioBroken")
            if (ScenarioRules.missingInputs(scenario, inputs).isNotEmpty()) {
                return@off outcome(clientId, ok = false, code = "scenarioMissingInput")
            }

            val wanted = ScenarioSchedule(
                scenarioId = scenario.id,
                scope = scenario.scope,
                at = at.coerceIn(0, 24 * 60 - 1),
                repeat = ScenarioSchedule.normalizeRepeat(repeat),
                weekday = weekday.coerceIn(1, 7),
                inputs = ScenarioRules.answers(scenario, inputs),
            )

            schedules.put(wanted.copy(nextAt = ScheduleClock.next(wanted, System.currentTimeMillis())))
            sendList()
        }
    }

    fun unschedule(id: String, scope: String) {
        off {
            schedules.remove(id, scope)
            sendList()
        }
    }

    /**
     * The clock: every half a minute, is anything due?
     *
     * A beat of its own rather than the run's heartbeat, which only exists while something is running -
     * and the whole point of an hour is that it comes when nothing is. Half a minute is as coarse as it
     * can be and still start a nine o'clock run at nine o'clock.
     */
    private fun tickHours() {
        val now = System.currentTimeMillis()
        val hours = schedules.all()
        if (hours.isEmpty()) return

        var moved = false
        for (hour in hours) {
            if (ScheduleClock.due(hour, now)) {
                /*
                 * A run of this project may already be going - one at a time, by design (see [claim]).
                 * Then the hour is a miss rather than a queue: a round of work started at ten past nine
                 * because the previous one happened to finish is a round of work nobody chose the moment
                 * of, and the two of them share a working copy.
                 */
                val refused = launch(hour.scenarioId, hour.scope, hour.inputs) { record ->
                    DiagnosticsLog.note(DiagnosticsLog.AGENT, "a scheduled scenario started")
                    hub.broadcastProject(
                        buildJsonObject {
                            put("type", "scenarioStarted")
                            put("runId", record.id)
                            // Nobody pressed anything, so nobody's screen should jump to it: the run's own
                            // tab opens for the person who started it, and this one has no person.
                            put("scheduled", true)
                        }.toString(),
                    )
                }
                schedules.put(ScheduleClock.after(hour, now, ran = refused == null))
                moved = true
            } else if (ScheduleClock.missed(hour, now)) {
                // The hour came while the IDE was closed or the machine asleep. Nothing is started late -
                // agents raised hours after their hour are a surprise nobody asked for - so it is said.
                schedules.put(ScheduleClock.after(hour, now, ran = false))
                moved = true
            }
        }

        if (moved) sendList()
    }

    /** Take the project's one run slot for this engine, or refuse because somebody already has it. */
    private fun claim(walker: ScenarioEngine): Boolean = synchronized(gate) {
        if (engine != null) return@synchronized false
        engine = walker
        true
    }

    /** Give the slot back, and only if it is still this run's to give: a later run must not be dropped. */
    private fun release(runId: String) = synchronized(gate) {
        if (engine?.run?.id == runId) engine = null
    }

    fun pause(runId: String) = engine?.takeIf { it.run.id == runId }?.pause() ?: Unit

    fun resume(runId: String) = engine?.takeIf { it.run.id == runId }?.resume() ?: Unit

    fun stop(runId: String) = engine?.takeIf { it.run.id == runId }?.stop() ?: Unit

    fun answer(runId: String, allow: Boolean, text: String) =
        engine?.takeIf { it.run.id == runId }?.answer(allow, text) ?: Unit

    /**
     * The whole record of one run: the live one from memory, an older one off the disk.
     *
     * Cut down for whoever is not this machine, which the broadcast road does by itself and this one
     * cannot: an answer goes out sealed to the device that asked, past the place where a phone's facts
     * are trimmed (see RelayClient.answer). A night's run read off the disk carries every card's prompt
     * and every agent's summary, and a frame over the relay's cap is not shortened but thrown away -
     * so without this the one thing a phone asks for by name would be the one thing it never receives.
     */
    fun sendRun(clientId: String, runId: String) {
        val live = engine?.run?.takeIf { it.id == runId }
        if (live != null) return hub.emitTo(clientId, forClient(clientId, envelope(live)))

        off {
            val record = runs.read(runId)
            if (record == null) return@off outcome(clientId, ok = false, code = "runGone")
            hub.emitTo(clientId, forClient(clientId, envelope(record)))
        }
    }

    /** The panel gets the record whole; anything else gets what fits through the wire to it. */
    private fun forClient(clientId: String, message: String): String =
        if (hub.isLocal(clientId)) message else RemoteFeed.forPhone(RemoteFeed.SCENARIO_RUN, message)

    fun deleteRun(clientId: String, runId: String) {
        off {
            if (engine?.run?.id == runId) return@off outcome(clientId, ok = false, code = "scenarioBusy")
            runs.delete(runId)
            sendList()
        }
    }

    /**
     * What one step said, read off the conversation it said it in.
     *
     * Nothing of this is kept by the run: a step is an ordinary conversation of the CLI's, and its whole
     * transcript is already on the disk under this project. Copying it into the run's own folder would
     * double a night's writing to keep a second copy that can only go stale - and this is read once, when
     * somebody opens the step, rather than for every step of a run they never look inside.
     *
     * The tail of it, like a conversation opened from the history and for the same reason: a step that
     * read half a repository has a transcript in megabytes, and what anybody wants from it is the end.
     */
    fun sendLog(clientId: String, runId: String, key: String, conversationId: String) {
        off {
            val page = runCatching { ClaudeHistory.opening(project.basePath, conversationId) }.getOrNull()
            val lines = page?.lines.orEmpty()

            hub.emitTo(
                clientId,
                buildJsonObject {
                    put("type", "scenarioLog")
                    put("runId", runId)
                    put("key", key)
                    put("found", lines.isNotEmpty())
                    // A cursor means there is more above what is being shown - said out loud, because a
                    // log that silently begins in the middle reads as a step that began in the middle.
                    put("truncated", page?.cursor != null)
                    putJsonArray("events") {
                        for (line in lines) {
                            runCatching { Json.parseToJsonElement(line) }.getOrNull()?.let { add(it) }
                        }
                    }
                }.toString(),
            )
        }
    }

    // --- Keeping everyone up to date ---------------------------------------------------

    /**
     * The live run's state, to everyone in this project.
     *
     * A project-wide message rather than an answer, so that a panel opened while a run is going is caught
     * up with it without having to ask, and a second window on the same project draws the same timeline.
     */
    private fun envelope(record: ScenarioRun): String = buildJsonObject {
        put("type", "scenarioRun")
        put("run", json.encodeToJsonElement(record))
    }.toString()

    private fun moved() {
        dirty = true
    }

    /** No live run, nothing to catch anybody up on: the heartbeat has nothing left to beat for. */
    private fun stopBeating() {
        dirty = false
        redraw?.cancel(false)
        redraw = null
    }

    /** The heartbeat of a live run: redraw often, write rarely, and stop when there is nothing going. */
    private fun beat() {
        if (redraw != null) return
        redraw = AppExecutorUtil.getAppScheduledExecutorService().scheduleWithFixedDelay(
            ::tick,
            REDRAW_MS,
            REDRAW_MS,
            TimeUnit.MILLISECONDS,
        )
    }

    /**
     * The tick belongs on the scheduler, the work does not.
     *
     * A beat encodes the whole run afresh - every step, with the scenario's own snapshot inside it - four
     * times a second, and every couple of seconds writes it to the disk as well. This pool is a handful of
     * threads shared with the Stop button's watchdog, the permission mode switch and the usage polling, and
     * a run goes on for hours: done here, all of those queue behind it for the night, which is a Stop that
     * looks stuck and usage rings that stand still. So the scheduler only wakes up and hands the work on,
     * the same way the delivery check does (see ClaudeSession.scheduleDeliveryCheck).
     *
     * The flag is what the fixed delay used to give for nothing: two beats must not run at once. A skipped
     * tick costs nothing, because [dirty] is still standing and the next one draws what this one would have.
     */
    private fun tick() {
        if (!pulsing.compareAndSet(false, true)) return
        val handed = runCatching {
            AppExecutorUtil.getAppExecutorService().submit {
                runCatching { pulse() }.onFailure { thisLogger().warn("A scenario run's heartbeat stumbled", it) }
                pulsing.set(false)
            }
        }
        // Nobody took it - the pool is going down with the IDE. Put the flag back, or a heartbeat that
        // outlives the shutdown never beats again.
        if (handed.isFailure) pulsing.set(false)
    }

    private fun pulse() {
        synchronized(outward) {
            // Null once the run has ended: the slot is given back under this same lock, so a beat that
            // gets here afterwards has nothing to say rather than yesterday's news to say (see [outward]).
            val record = engine?.run ?: return
            if (!dirty) return
            dirty = false

            hub.broadcastProject(envelope(record))

            if (System.currentTimeMillis() - lastWrite >= WRITE_MS) {
                lastWrite = System.currentTimeMillis()
                runs.keep(record)
            }
        }
    }

    private fun ended(record: ScenarioRun) {
        synchronized(outward) {
            release(record.id)
            stopBeating()
            runs.keep(record)
            hub.broadcastProject(envelope(record))
        }
        announce(record.scenarioName, ending(record))
        // The list carries which run is live and how each of them ended: both have just changed, and
        // nobody is going to ask again on their own.
        sendList()
    }

    /**
     * A word from the IDE itself, because nobody may be looking at the panel.
     *
     * A run is what somebody starts and walks away from: the two moments worth a notification are the one
     * where it wants an answer and the one where it is over, and both of those happen while the person is
     * doing something else. The panel's own sounds and the phone's pushes are about a conversation's turn
     * and know nothing about this.
     */
    private fun announce(title: String, body: String) {
        NotificationGroupManager.getInstance()
            .getNotificationGroup(NOTIFICATIONS)
            .createNotification(title, body, NotificationType.INFORMATION)
            .notify(project)
    }

    private fun ending(record: ScenarioRun): String = when (record.state) {
        RunState.DONE -> "finished"
        RunState.STOPPED -> "stopped"
        else -> record.error.ifBlank { "stopped on a failure" }
    }

    /**
     * A scenario on its way to a client, with the shelf it was read off written in.
     *
     * The shelf is deliberately not part of the file - it is where the file lies, not what it says (see
     * Scenario.scope) - and the very annotation that keeps it out of the file keeps it out of everything
     * this serialiser produces, the wire included. A screen that cannot tell the two shelves apart shows
     * both of them empty, which is exactly what it did before this line existed.
     */
    private fun withShelf(scenario: Scenario): JsonObject =
        JsonObject((json.encodeToJsonElement(scenario) as JsonObject) + ("scope" to JsonPrimitive(scenario.scope)))

    private fun outcome(clientId: String, ok: Boolean, code: String) {
        hub.emitTo(
            clientId,
            buildJsonObject {
                put("type", "scenarioOutcome")
                put("ok", ok)
                put("code", code)
            }.toString(),
        )
    }

    private fun off(work: () -> Unit) {
        ApplicationManager.getApplication().executeOnPooledThread {
            runCatching(work).onFailure { thisLogger().warn("A scenario request failed", it) }
        }
    }

    override fun dispose() {
        clock?.cancel(false)
        clock = null
        redraw?.cancel(false)
        redraw = null
        // A run whose IDE is closing is not going anywhere: the processes go with it, and a record left
        // saying "running" would hold this project's one-at-a-time lock against every run after it.
        engine?.stop()
        engine = null
    }

    private companion object {
        const val NOTIFICATIONS = "Amazing Claude Code"
        const val REDRAW_MS = 250L
        const val WRITE_MS = 2_000L

        /** How often the hours are looked at - see tickHours for why half a minute is enough. */
        const val HOURS_MS = 30_000L
    }
}

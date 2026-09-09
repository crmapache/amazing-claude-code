package io.github.crmapache.amazingclaudecode.scenario

import com.intellij.notification.NotificationGroupManager
import com.intellij.notification.NotificationType
import com.intellij.openapi.Disposable
import com.intellij.openapi.application.ApplicationManager
import com.intellij.openapi.diagnostic.thisLogger
import com.intellij.openapi.project.Project
import com.intellij.openapi.util.Disposer
import com.intellij.util.concurrency.AppExecutorUtil
import io.github.crmapache.amazingclaudecode.claude.ClaudeCommandHints
import io.github.crmapache.amazingclaudecode.claude.ClaudeExecutable
import io.github.crmapache.amazingclaudecode.claude.ClaudeHistory
import io.github.crmapache.amazingclaudecode.claude.ClaudeHome
import io.github.crmapache.amazingclaudecode.claude.ClaudePlugin
import io.github.crmapache.amazingclaudecode.claude.ClaudePreferences
import io.github.crmapache.amazingclaudecode.claude.EffortLevels
import io.github.crmapache.amazingclaudecode.claude.InstalledPlugin
import io.github.crmapache.amazingclaudecode.claude.ClaudeSessionHub
import io.github.crmapache.amazingclaudecode.claude.accounts.ClaudeAccounts
import io.github.crmapache.amazingclaudecode.feedback.DiagnosticsLog
import io.github.crmapache.amazingclaudecode.remote.RemoteFeed
import io.github.crmapache.amazingclaudecode.search.AiRuns
import com.intellij.execution.process.ProcessHandler
import java.io.File
import java.time.Instant
import java.time.ZoneId
import java.util.concurrent.ConcurrentHashMap
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
 * however many runs are going right now.
 *
 * There used to be one at a time, refused at the door, and the argument for it was real: two runs in one
 * working copy are four agents editing the same files with nobody to reconcile them, and what that
 * produces is not a message on a screen but a branch with half of one round of work and half of another
 * in it. It was asked for anyway, and the reason is the better one: the same round of work against three
 * different tickets is three runs of one scenario, and told to take them in turn a person simply waits.
 * So the door is open, and the cost is paid where it can be seen - each run says which one it is (see
 * [markOf]), the hub lists them while they go, and the CLOCK still refuses to raise a second run from the
 * same standing arrangement, because nobody chose that moment.
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
     * One live run and the little bookkeeping that belongs to it alone.
     *
     * The flag and the moment of the last write used to be fields of this class, which was right while
     * there could only be one of them. Each run now moves at its own pace, so each carries its own; and
     * each carries its own lock, because the race the lock is for - a beat drawing a snapshot taken just
     * before the run ended - is about one run and nothing else. One lock for the desk would have made a
     * slow run hold up every other one's heartbeat.
     */
    private class Live(val engine: ScenarioEngine) {
        /** Volatile because it is raised on the agent's thread and read on the heartbeat's. */
        @Volatile
        var dirty = false
        var lastWrite = 0L
        val lock = Any()
    }

    /**
     * Every run this project has going, by its identifier.
     *
     * Concurrent because it is read on every thread a message can arrive on and walked by the heartbeat
     * while runs end on their own processes' threads. Walked by a SNAPSHOT of its values, never in place:
     * stopping a run finishes it synchronously, which takes its entry out from under the walk.
     */
    private val live = ConcurrentHashMap<String, Live>()

    /**
     * Held while the map is changed and while the heartbeat is started or stopped.
     *
     * The two belong together. Deciding to beat is "is the map empty?" plus "is there a timer?", and the
     * ordinary moment for a race is one run ending in the same second another starts - a morning where
     * several hours ripen at once, or a second press of Run. Apart, the new run can read a timer the old
     * one is about to cancel, and then a live run has no heartbeat at all: its timeline stands still for
     * hours and nothing of it reaches the disk, because that is the only place the record is written.
     */
    private val gate = Any()

    /**
     * Whose turn it is to be sent, so that runs take the beat in turn rather than all at once.
     *
     * The whole record of a run goes out on each beat - the scenario's snapshot inside it, every card's
     * prompt - which is tens of kilobytes even for a short one. Four times a second was already the
     * ceiling of what the panel can take; multiplied by however many runs somebody starts it would be a
     * megabyte a second into an embedded browser and a full redraw of the page for each of them. So the
     * beat stays what it was and the runs share it: with three going, each moves a third as often, which
     * is the honest price of watching three things at once.
     */
    private var lastSent = ""

    /**
     * The scenarios a model is writing right now, so that Cancel means something (see [draft]).
     *
     * The same bookkeeping the model's search has, and for its reason: a request is known from the moment
     * it is asked, while its process appears seconds later, and a cancel that only knew processes fell into
     * that gap - the run started anyway, worked to the end, was paid for, and its answer was thrown away by
     * a screen that had moved on. Nothing like the gate above: writing one down costs a few cents and
     * touches nothing, unlike a run, which is two agents in a working copy.
     */
    private val drafts = AiRuns<ProcessHandler> { it.destroyProcess() }

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

    /** Whether a beat is still being worked on, so ticks do not stack up behind a slow one. */
    private val pulsing = AtomicBoolean(false)

    /**
     * When the short "what is going" frame last went out, so it goes at a pace an eye can use.
     *
     * A frame of its own beside the heavy record, and this is the one everybody who is NOT looking at a
     * timeline reads: the hub's list of live runs, the phone's screen, the badge on a project card. A few
     * hundred bytes of summaries against tens of kilobytes of prompts, so it can go to the whole project
     * every second while the record goes to one turn at a time.
     */
    private var lastLive = 0L

    /**
     * Whether a look at the hours is already in flight.
     *
     * Set and cleared in ONE body, in a finally, and put back when the pool would not take the work -
     * exactly as [pulsing] is, and for a sharper reason: a flag left standing here does not slow anything
     * down, it stops every scheduled run on this machine until the IDE is restarted, silently.
     */
    private val hourly = AtomicBoolean(false)

    /** The clock that watches the hours, alive for as long as the project is open (see [tickHours]). */
    private var clock: ScheduledFuture<*>? = null

    init {
        Disposer.register(hub, this)

        clock = AppExecutorUtil.getAppScheduledExecutorService().scheduleWithFixedDelay(
            {
                // Off the scheduler's own thread, like the run's heartbeat: this pool is shared with the
                // Stop button's watchdog and the usage polling, and starting a run takes a moment.
                if (hourly.compareAndSet(false, true)) {
                    val handed = runCatching {
                        ApplicationManager.getApplication().executeOnPooledThread {
                            try {
                                tickHours()
                            } catch (failure: Throwable) {
                                thisLogger().warn("The scenario clock stumbled", failure)
                            } finally {
                                hourly.set(false)
                            }
                        }
                    }
                    // Nobody took it - the pool is going down with the IDE. Put the flag back, or the
                    // hours are never looked at again.
                    if (handed.isFailure) hourly.set(false)
                }
            },
            HOURS_MS,
            HOURS_MS,
            TimeUnit.MILLISECONDS,
        )
    }

    // --- What the clients ask for ----------------------------------------------------

    /**
     * Both shelves, the arrangements that will start them and the list of past runs, to everyone here.
     *
     * Told to everybody rather than answered to whoever asked, unlike the search or the history. A
     * scenario is not private to a window - a second window on the same project has the same two shelves
     * and needs to see the one just written. The hub keeps the latest of these, so a panel opened later is
     * caught up without asking (see broadcastProject); a phone gets a trimmed copy (see RemoteFeed).
     *
     * What is deliberately NOT in it is which runs are going. That changes several times a second while
     * this is two directories read off a disk, and the two travel apart for exactly that reason (see
     * [sendLive]).
     */
    fun sendList() {
        off {
            if (swept.compareAndSet(false, true)) runs.repairAbandoned(live.keys.toSet())

            // Each shelf as it actually answered, null for one that could not be looked at: what that is
            // for is the pruning below, where "there are no scenarios" and "no answer" must not be read as
            // the same sentence (see Schedules.keepOnly).
            val project = store.shelf(ScenarioScope.PROJECT)
            val user = store.shelf(ScenarioScope.USER)
            val scenarios = (project.orEmpty() + user.orEmpty()).map(::withShelf)
            val summaries = runs.summaries()
            // A scenario deleted from the shelf takes its hours with it: an alarm for a round of work that
            // no longer exists goes on being due for ever, and nothing on the screen would explain it.
            // Null means the file could not be read at all, which is NOT an empty list: read as one, the
            // screen tells somebody their mornings are gone while they sit unharmed on the disk.
            val hours = schedules.keepOnly(project, user)
            hub.broadcastProject(
                buildJsonObject {
                    put("type", "scenarios")
                    put("scenarios", JsonArray(scenarios))
                    put("runs", json.encodeToJsonElement(summaries))
                    put("schedules", json.encodeToJsonElement(hours.orEmpty()))
                    put("schedulesUnread", hours == null)
                    // Whether this project has anywhere to put a shared scenario at all: a directory that
                    // is not open has no .claude to write into, and offering the choice would be a form
                    // that cannot be submitted.
                    put("canShare", store.projectDirectory() != null)
                }.toString(),
            )
        }
    }

    /**
     * What is going right now, as summaries, to everyone in this project.
     *
     * The light half of the wire, and the only thing most screens need. A summary carries the name, the
     * state, how many cards of how many are done, what it cost and what it was asked - enough for the
     * hub's list of live runs, for the phone's screen and for the badge on a project card - and it is a
     * few hundred bytes rather than the tens of kilobytes a whole record weighs.
     *
     * Kept apart from the shelves for a plain reason: this changes while a run works and those do not, and
     * put together they would either send the disk several times a second or freeze the live list at
     * whatever it said when the run began. Kept apart from the record because the record is only of use to
     * whoever has that run's tab open, and there is one of those at most.
     *
     * Built from memory, never from the disk: a run's record is written every couple of seconds, and a
     * list of live work read from a file is a list that is always a little behind.
     */
    private fun sendLive() {
        lastLive = System.currentTimeMillis()
        val going = live.values.map { it.engine.run.summarise() }

        hub.broadcastProject(
            buildJsonObject {
                put("type", "scenarioLive")
                put("runs", json.encodeToJsonElement(going))
            }.toString(),
        )
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

        /*
         * What there is to call is read off the disk now, not remembered from the slash hint: the list is
         * the whole of what the writer knows about skills, and the rule beside each name is what decides
         * whether a card can start at all (see ScenarioAuthor). The plugins' folders come from the CLI
         * itself, and that run can fail or dawdle - then the project's and the person's own skills are
         * still listed, exactly as the hint under the field does it (see ProjectCatalog).
         */
        ClaudePlugin.installed(
            project.basePath,
            onResult = { installed -> askTheWriter(clientId, id, description, installed) },
            onError = { message ->
                thisLogger().info("Writing a scenario without the plugins' skills: $message")
                askTheWriter(clientId, id, description, emptyList())
            },
        )
    }

    /** Everything the writer is handed, gathered once the plugins have answered (see [draft]). */
    private fun askTheWriter(clientId: String, id: String, description: String, installed: List<InstalledPlugin>) {
        // Taken back while the plugins were being listed: nothing is raised for a form nobody is watching.
        if (drafts.isCancelled(id)) return

        // The account the scenarios themselves run on, so the writing is billed where the running is.
        val accountId = ClaudeAccounts.getInstance().currentId
        val home = ClaudeHome.of(project.basePath)
        val skills = ClaudeCommandHints.scan(project.basePath, installed)

        /*
         * Where those skills are defined, so the writer may read them: the person's own folders and the
         * installed plugins' - the project's are under the working directory already. Only what exists,
         * and only on this machine: a CLI inside WSL has no use for a path of this JVM's, and a file it
         * cannot open is better left unnamed than named and failed on. Each once: a plugin installed in
         * two scopes is listed twice with one path (seen live), and the flag would be repeated with it.
         */
        val readable = if (home.remote) {
            emptyList()
        } else {
            buildList {
                add(File(home.configDirectory, "skills"))
                add(File(home.configDirectory, "commands"))
                installed.mapNotNull { it.installPath }.forEach { add(home.hostPath(it)) }
            }.filter { it.isDirectory }.map { it.absolutePath }.distinct()
        }
        val listed = if (home.remote) skills.mapValues { (_, hint) -> hint.copy(file = "") } else skills

        ScenarioAuthor.write(
            workingDirectory = project.basePath,
            description = description,
            accountId = accountId,
            model = writingModel(accountId),
            effort = EffortLevels.normalize(ClaudePreferences.startingEffort()),
            skills = listed,
            readableDirectories = readable,
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

    /**
     * What the writing runs on: the model a new tab of this panel starts with, unless this account is
     * known not to run it.
     *
     * The same clamp a conversation gets (see ClaudeSessions.modelFor), for the same reason: a model the
     * account has no access to is not refused at launch, the process dies on its first message, and here
     * that is a strip over the field saying the answer could not be read. Unknown counts as yes - the
     * catalogue is asked for lazily, and an unasked one is the ordinary state of a project's first
     * minutes. Empty leaves the choice to the CLI.
     */
    private fun writingModel(accountId: String): String {
        val accounts = ClaudeAccounts.getInstance()
        val wanted = ClaudePreferences.startingModel()
        if (accounts.canRun(accountId, wanted) != false) return wanted

        val own = accounts.account(accountId)?.model.orEmpty()
        return if (own.isNotEmpty() && accounts.canRun(accountId, own) != false) own else ""
    }

    private fun drafted(clientId: String, id: String, scenario: Scenario?, error: String?) {
        val body = buildJsonObject {
            put("type", "scenarioDrafted")
            put("id", id)
            // The shelf is chosen on the screen the draft lands on, so it travels with one written in
            // like any other scenario does (see [withShelf]).
            scenario?.let { put("scenario", withShelf(it.copy(scope = shelfFor()))) }
            error?.let { put("error", it) }
        }.toString()

        // What a model wrote opens in an editor and is SAVED from it, so a copy shortened to fit a frame
        // would write a shortened prompt back to somebody's disk. Anything over the budget travels
        // without its body and says so (see RemoteFeed.wholeScenario).
        hub.emitTo(clientId, forClient(clientId, RemoteFeed.SCENARIO_DRAFTED, body))
    }

    /**
     * One scenario, whole, because somebody asked for it by name.
     *
     * The shelves travel with their prose cut out - it is the entire weight of that message and no list
     * draws a word of it (see RemoteFeed.trimmedScenarios) - so the editor asks. The panel is on this
     * machine and is sent the shelves untouched, which is why nothing here goes near it; this road exists
     * for the screen across the city.
     */
    fun sendScenario(clientId: String, id: String, scope: String) {
        off {
            val scenario = store.find(id, scope)
            val body = buildJsonObject {
                put("type", "scenarioFetched")
                put("id", id)
                put("scope", scope)
                // Absent for one that is on neither shelf - a thing the screen has to be able to say
                // rather than sit blank about.
                scenario?.let { put("scenario", withShelf(it)) }
            }.toString()

            hub.emitTo(clientId, forClient(clientId, RemoteFeed.SCENARIO_FETCHED, body))
        }
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
     * a run is [launch], which the clock uses too - two copies of the record and the engine would be two
     * copies of the one thing in this file that must not be got wrong twice.
     */
    fun start(clientId: String, id: String, scope: String, inputs: Map<String, String>) {
        off {
            val refusal = launch(id, scope, inputs, from = "") { record ->
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
     * Raise a run, or say in one word why not. Null means it is going.
     *
     * `from` is the standing arrangement this came out of, empty for a hand on the button; it is kept with
     * the run so that the clock can tell whether the round of work it is about to raise is already going
     * from the same arrangement (see [tickHours]).
     */
    private fun launch(
        id: String,
        scope: String,
        inputs: Map<String, String>,
        from: String,
        onStarted: (ScenarioRun) -> Unit,
    ): String? {
        val scenario = store.find(id, scope) ?: return "scenarioGone"
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
            runFrom = from,
            inputs = answers,
            total = ScenarioRules.cardRuns(scenario),
        )

        val walker = ScenarioEngine(
            workingDirectory = project.basePath,
            accountId = ClaudeAccounts.getInstance().currentId,
            defaultModel = ClaudePreferences.startingModel(),
            defaultEffort = ClaudePreferences.startingEffort(),
            start = record,
            onChange = { moved(record.id) },
            onFinished = { finished -> ended(finished) },
            // The engine names the scenario; which RUN of it this is, is known here (see [markOf]).
            notify = { _, body -> announceRun(record.id, body) },
        )

        val holder = Live(walker)
        // Taken before a single process is up: the engine opens nothing until begin().
        claim(record.id, holder)

        runs.keep(record)
        holder.lastWrite = System.currentTimeMillis()

        onStarted(record)
        sendLive()
        runCatching { walker.begin() }.onFailure { failure ->
            thisLogger().warn("A scenario run would not start", failure)
            DiagnosticsLog.note(DiagnosticsLog.AGENT, "a scenario run would not start")
            // Down before it is forgotten: begin() raises the head before it can throw, and a process
            // nothing points at any more lives to the end of the IDE with its clock still ticking.
            walker.abandon()
            // The heartbeat is already beating by now, so this ending is written under this run's own lock
            // like any other: otherwise a beat in flight writes RUNNING over the failure.
            synchronized(holder.lock) {
                release(record.id)
                runs.keep(record.copy(state = RunState.FAILED, failure = RunFailure.CRASHED, finishedAt = System.currentTimeMillis()))
            }
            sendLive()
        }
        sendList()
        return null
    }
    // --- The hours -------------------------------------------------------------------

    /**
     * Add a scheduled run, or change one that is already there.
     *
     * `scheduleId` empty means a new one; a scenario may have as many as somebody wants, so this adds
     * rather than replaces (see Schedules.put). The scenario is still named separately, because it is what
     * everything below is checked against.
     *
     * The answers to its questions come with it: when the hour comes there is nobody at the keyboard to
     * ask, so a schedule without them would be an alarm that rings and then asks a question of an empty
     * chair. Refused here rather than at the hour for the same reason - a scenario that cannot run is
     * something to be told about now, while somebody is still looking at the screen.
     */
    fun schedule(
        clientId: String,
        scenarioId: String,
        scope: String,
        scheduleId: String,
        at: Int,
        repeat: String,
        weekday: Int,
        inputs: Map<String, String>,
    ) {
        off {
            val scenario = store.find(scenarioId, scope)
            if (scenario == null) return@off outcome(clientId, ok = false, code = "scenarioGone")
            if (!ScenarioRules.runnable(scenario)) return@off outcome(clientId, ok = false, code = "scenarioBroken")
            if (ScenarioRules.missingInputs(scenario, inputs).isNotEmpty()) {
                return@off outcome(clientId, ok = false, code = "scenarioMissingInput")
            }

            val wanted = ScenarioSchedule(
                id = scheduleId,
                scenarioId = scenario.id,
                scope = scenario.scope,
                at = at.coerceIn(0, 24 * 60 - 1),
                repeat = ScenarioSchedule.normalizeRepeat(repeat),
                weekday = weekday.coerceIn(1, 7),
                inputs = ScenarioRules.answers(scenario, inputs),
            )

            val stored = schedules.put(wanted.copy(nextAt = ScheduleClock.next(wanted, System.currentTimeMillis())))
            sendList()
            // Said out loud rather than left to the list: a row that is drawn and then gone at the next
            // look reads as the panel having forgotten it, and the file is still there to be rescued.
            if (!stored) outcome(clientId, ok = false, code = "schedulesNotWritten")
        }
    }

    fun unschedule(clientId: String, scheduleId: String) {
        off {
            val gone = schedules.remove(scheduleId)
            sendList()
            if (!gone) outcome(clientId, ok = false, code = "schedulesNotWritten")
        }
    }

    /**
     * The clock: every half a minute, is anything due?
     *
     * A beat of its own rather than the run's heartbeat, which only exists while something is running -
     * and the whole point of an hour is that it comes when nothing is. Half a minute is as coarse as it
     * can be and still start a nine o'clock run at nine o'clock.
     *
     * The order below is the whole of the care. The hour is TAKEN in the file before anything is started,
     * and only then is the run raised and the outcome written back. Until runs could go side by side, the
     * refusal "one at a time" quietly did this job: a due hour stays due for five minutes (see
     * ScheduleClock.GRACE_MS) and the clock looks ten times in that window, so every look after the first
     * would have raised another run of the same thing. Taking the hour first closes that, and it closes
     * the one an in-memory check never could - a second IDE window on the same repository, with its own
     * clock, against the same file.
     */
    private fun tickHours() {
        val now = System.currentTimeMillis()
        val hours = schedules.all()
        if (hours.isEmpty()) return

        var moved = false
        for (hour in hours) {
            val due = hour.nextAt
            val ripe = ScheduleClock.due(hour, now)
            if (!ripe && !ScheduleClock.missed(hour, now)) continue

            // Take it, or leave it to whoever already has: another beat of this clock, or another window.
            if (schedules.claimHour(hour.id, expected = due, armed = ScheduleClock.armed(hour, now)) == null) continue
            moved = true

            /*
             * A run raised by THIS arrangement may still be going: a card can stand on a question for as
             * long as it takes somebody to answer it, and nothing puts a ceiling on that. Then the hour is
             * a miss rather than a queue - a daily arrangement would otherwise pile up a run a day in one
             * working copy, with nothing on any screen to say why. A run somebody started by hand, or one
             * from another arrangement, is no reason at all: that is what running side by side means.
             */
            val busy = live.values.any { it.engine.run.runFrom == hour.id }

            val refused = when {
                // The hour came while the IDE was closed or the machine asleep. Nothing is started late -
                // agents raised hours after their hour are a surprise nobody asked for - so it is said.
                !ripe -> "missed"
                busy -> "busy"
                else -> launch(hour.scenarioId, hour.scope, hour.inputs, from = hour.id) { record ->
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
            }

            schedules.settle(hour.id, due = due, firedAt = now, ran = refused == null)
        }

        if (moved) sendList()
    }

    /**
     * Take a place in the map for this run, and start the heartbeat if it was not already going.
     *
     * Both under one lock, and that is not tidiness. Starting the beat asks "is there a timer?" while
     * stopping it cancels one and forgets it, in two steps; the ordinary moment for those to cross is a
     * run ending in the same second another starts - a morning where several hours ripen together, or a
     * second press of Run. Crossed, the new run reads a timer the old one is about to cancel, and then a
     * live run has no heartbeat at all: nothing of it is drawn and nothing of it reaches the disk.
     */
    private fun claim(runId: String, holder: Live) = synchronized(gate) {
        live[runId] = holder
        beat()
    }

    /** Give the place back, and only if it is still this run's to give: a later run must not be dropped. */
    private fun release(runId: String) = synchronized(gate) {
        live.remove(runId)
        if (live.isEmpty()) stopBeating()
    }

    /**
     * Pick a finished run up where it stood (see ScenarioEngine.carryOn and CarryOn).
     *
     * The same record, the same tab, the same identifier: the run goes back onto the live map and its
     * heartbeat starts again, and the list learns that a night it had filed under "stopped" is going.
     * The refusals are the ones a person can meet from the button - a run already going, a record that
     * is gone, one whose main thread never came up - and each goes back as a name the screen has words
     * for.
     */
    fun carryOn(clientId: String, runId: String) {
        off {
            if (live.containsKey(runId)) return@off outcome(clientId, ok = false, code = "runBusy")
            val record = runs.read(runId) ?: return@off outcome(clientId, ok = false, code = "runGone")
            if (!RunState.finished(record.state)) return@off outcome(clientId, ok = false, code = "runBusy")
            if (CarryOn.pointOf(record) == null) return@off outcome(clientId, ok = false, code = "runNotResumable")
            if (ClaudeExecutable.find() == null) return@off outcome(clientId, ok = false, code = "noClaude")

            val walker = ScenarioEngine(
                workingDirectory = project.basePath,
                accountId = ClaudeAccounts.getInstance().currentId,
                defaultModel = ClaudePreferences.startingModel(),
                defaultEffort = ClaudePreferences.startingEffort(),
                start = record,
                onChange = { moved(runId) },
                onFinished = { finished -> ended(finished) },
                notify = { _, body -> announceRun(runId, body) },
            )
            val holder = Live(walker)
            claim(runId, holder)
            holder.lastWrite = System.currentTimeMillis()

            sendLive()
            runCatching { walker.carryOn() }.onFailure { failure ->
                thisLogger().warn("A scenario run would not carry on", failure)
                DiagnosticsLog.note(DiagnosticsLog.AGENT, "a scenario run would not carry on")
                walker.abandon()
                synchronized(holder.lock) {
                    release(runId)
                    runs.keep(record.copy(state = RunState.FAILED, failure = RunFailure.CRASHED, finishedAt = System.currentTimeMillis()))
                }
                sendLive()
            }
            // Written now rather than at the heartbeat's next write: the list is read off the disk, and
            // read in between it would file a going run under the past ones.
            synchronized(holder.lock) {
                if (live.containsKey(runId)) runs.keep(walker.run)
            }
            sendList()
        }
    }

    fun pause(runId: String) = live[runId]?.engine?.pause() ?: Unit

    fun resume(runId: String) = live[runId]?.engine?.resume() ?: Unit

    fun stop(runId: String) = live[runId]?.engine?.stop() ?: Unit

    fun answer(runId: String, allow: Boolean, text: String) =
        live[runId]?.engine?.answer(allow, text) ?: Unit

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
        val going = live[runId]?.engine?.run
        if (going != null) return hub.emitTo(clientId, forClient(clientId, RemoteFeed.SCENARIO_RUN, envelope(going)))

        off {
            val record = runs.read(runId)
            if (record == null) return@off outcome(clientId, ok = false, code = "runGone")
            hub.emitTo(clientId, forClient(clientId, RemoteFeed.SCENARIO_RUN, envelope(record)))
        }
    }

    /** The panel gets the record whole; anything else gets what fits through the wire to it. */
    private fun forClient(clientId: String, type: String, message: String): String =
        if (hub.isLocal(clientId)) message else RemoteFeed.forPhone(type, message).message

    fun deleteRun(clientId: String, runId: String) {
        off {
            // The only refusal left in this file that is about a run being busy - starting one no longer
            // is - so it names the run rather than the project.
            if (live.containsKey(runId)) return@off outcome(clientId, ok = false, code = "runBusy")
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

            val body = buildJsonObject {
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
            }.toString()

            // The panel reads it off the same disk it is written on; a phone gets the end of it, cut to
            // what a frame carries (see RemoteFeed.trimmedLog). Cutting rather than refusing, because
            // what anybody wants off a step at three in the morning is how it finished.
            hub.emitTo(clientId, forClient(clientId, RemoteFeed.SCENARIO_LOG, body))
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

    private fun moved(runId: String) {
        live[runId]?.dirty = true
    }

    /**
     * Nothing going, nothing to catch anybody up on: the heartbeat has nothing left to beat for.
     *
     * Only ever called with [gate] held, from [release], and only when the last run has left the map.
     */
    private fun stopBeating() {
        redraw?.cancel(false)
        redraw = null
    }

    /** The heartbeat of the live runs: redraw often, write rarely, and stop when there is nothing going. */
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
     * tick costs nothing, because the dirty flags are still standing and the next one draws what this one
     * would have.
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

    /**
     * One beat: everybody's summary if it is time for it, everybody's record to the disk if it is due,
     * and exactly ONE run's whole record onto the wire.
     *
     * The last part is the round. What goes out is the run with the snapshot of its scenario inside it and
     * every card's prompt - tens of kilobytes - and four of those a second was already as much as the
     * panel can take. Sent for every run at once it would be that much again for each of them, which is
     * a full redraw of the page per message and a megabyte a second of parsing on the thread that draws
     * the feed. So the beat is shared: whoever has waited longest goes next.
     */
    private fun pulse() {
        val now = System.currentTimeMillis()
        val holders = live.entries.sortedBy { it.key }
        if (holders.isEmpty()) return

        // What is going, to everybody, at a pace an eye can use - and cheaply enough to send it whole.
        if (now - lastLive >= LIVE_MS) sendLive()

        for ((_, holder) in holders) {
            synchronized(holder.lock) {
                if (holder.dirty && now - holder.lastWrite >= WRITE_MS) {
                    holder.lastWrite = now
                    runs.keep(holder.engine.run)
                }
            }
        }

        val from = holders.indexOfFirst { it.key > lastSent }.let { if (it < 0) 0 else it }
        for (step in holders.indices) {
            val (runId, holder) = holders[(from + step) % holders.size]
            synchronized(holder.lock) {
                if (!holder.dirty) return@synchronized
                // Gone since the snapshot of the map was taken: the end of a run gives its place back
                // under this same lock, so a beat that gets here afterwards has nothing to say rather
                // than yesterday's news to say.
                if (!live.containsKey(runId)) return@synchronized

                holder.dirty = false
                lastSent = runId
                hub.broadcastProject(envelope(holder.engine.run))
                return
            }
        }
    }

    private fun ended(record: ScenarioRun) {
        val holder = live[record.id]
        val said = markOf(record)

        synchronized(holder?.lock ?: gate) {
            release(record.id)
            runs.keep(record)
            hub.broadcastProject(envelope(record))
        }
        sendLive()
        announce(said, ending(record))
        // The list carries how each run ended, and it has just changed: nobody is going to ask again.
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
    /** The same, for a run that is going: the engine names the scenario, this names which run of it. */
    private fun announceRun(runId: String, body: String) {
        val record = live[runId]?.engine?.run ?: return
        announce(markOf(record), body)
    }

    private fun announce(title: String, body: String) {
        NotificationGroupManager.getInstance()
            .getNotificationGroup(NOTIFICATIONS)
            .createNotification(title, body, NotificationType.INFORMATION)
            .notify(project)
    }

    /**
     * What to call this run, when the name of its scenario is not enough.
     *
     * With one run at a time the scenario's name said everything; with three of one scenario going at
     * once, two notifications reading "Nightly review / finished" say nothing at all - and a notification
     * is the ONLY surface a run has while the panel is closed, which is most of the time a run is alive.
     *
     * The first answer somebody gave it, because that is what tells two starts of one round of work apart
     * - the ticket, the branch. Two runs given the same answers, or a scenario that asks nothing, fall
     * back to the minute they started at. The panel works the same thing out for its tabs and rows in ten
     * languages of its own (see runMarks); this side has one language and needs it for one line.
     */
    private fun markOf(record: ScenarioRun): String {
        val answer = record.inputs.values
            .firstOrNull { it.isNotBlank() }
            ?.lineSequence()?.firstOrNull()?.trim()?.take(MARK_CHARS)
            .orEmpty()

        // The clock is added whenever another run of the same scenario is about, and not only when there
        // is no answer to use: the commonest second start is the same round of work against the same
        // ticket, so the answers of the two are the same words.
        val crowded = live.values.count { it.engine.run.scenarioId == record.scenarioId } > 1
        // To the second, because two presses of Run land in the same minute more often than not.
        val started = Instant.ofEpochMilli(record.startedAt)
            .atZone(ZoneId.systemDefault())
            .toLocalTime()
            .withNano(0)
            .toString()

        val said = listOf(answer, if (answer.isEmpty() || crowded) started else "")
            .filter { it.isNotEmpty() }
            .joinToString(" · ")

        return if (said.isEmpty()) record.scenarioName else "${record.scenarioName} - $said"
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
        /*
         * A run whose IDE is closing is not going anywhere: the processes go with it, and a record left
         * saying "running" draws a timeline with a spinner on it for ever.
         *
         * Over a SNAPSHOT of the map rather than the map itself. Stopping a run finishes it on this very
         * thread, and finishing it takes its entry out - walking the map in place, the second one throws,
         * and every run after it keeps its processes editing the working copy of a window that is gone.
         */
        live.values.toList().forEach { it.engine.stop() }
        live.clear()
    }

    private companion object {
        const val NOTIFICATIONS = "Amazing Claude Code"
        const val REDRAW_MS = 250L
        const val WRITE_MS = 2_000L

        /** How often the short "what is going" frame goes out - see [sendLive]. */
        const val LIVE_MS = 1_000L

        /** How much of an answer stands as a run's name beside its scenario's - see [markOf]. */
        const val MARK_CHARS = 40

        /** How often the hours are looked at - see tickHours for why half a minute is enough. */
        const val HOURS_MS = 30_000L
    }
}

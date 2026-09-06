package io.github.crmapache.amazingclaudecode.claude

import com.intellij.openapi.Disposable
import com.intellij.openapi.application.ApplicationManager
import com.intellij.openapi.components.Service
import com.intellij.openapi.components.service
import com.intellij.openapi.diagnostic.thisLogger
import com.intellij.openapi.project.Project
import com.intellij.openapi.project.ProjectManager
import io.github.crmapache.amazingclaudecode.claude.accounts.AccountDesk
import io.github.crmapache.amazingclaudecode.claude.accounts.AccountsWatch
import io.github.crmapache.amazingclaudecode.editor.DiskRefresh
import io.github.crmapache.amazingclaudecode.editor.UnsavedEdits
import io.github.crmapache.amazingclaudecode.feedback.DiagnosticsLog
import io.github.crmapache.amazingclaudecode.remote.LocalBridgeServer
import io.github.crmapache.amazingclaudecode.remote.NotificationReasons
import io.github.crmapache.amazingclaudecode.remote.RemoteAgent
import io.github.crmapache.amazingclaudecode.search.SearchDesk
import io.github.crmapache.amazingclaudecode.remote.RemoteKeys
import io.github.crmapache.amazingclaudecode.remote.RemoteState
import io.github.crmapache.amazingclaudecode.stats.StatsCollector
import java.util.concurrent.ConcurrentHashMap
import java.util.concurrent.atomic.AtomicReference
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.addJsonObject
import kotlinx.serialization.json.buildJsonObject
import kotlinx.serialization.json.put
import kotlinx.serialization.json.putJsonArray
import kotlinx.serialization.json.putJsonObject

/**
 * The project's conversations, and everything anyone needs to know about them.
 *
 * Until now this lived inside the panel: [ClaudeSessions] was created while building the browser and
 * died with the tool window, the feed's state existed only in that browser's memory, and an event that
 * had been forwarded was forgotten on this side. Two things follow from that arrangement, and both are
 * defects rather than choices:
 *
 * - closing the panel over a running turn killed the process along with the whole conversation;
 * - a client that had not been present from the first message had no way to learn what had happened.
 *
 * The second one is what makes a phone impossible, and the first is what makes it pointless. So the
 * conversations move out here, to something whose life is the project's rather than a window's, and
 * the panel becomes one of its clients instead of its owner.
 *
 * Everything a client is sent goes out through one door - see [broadcast]. That is not tidiness: the
 * journal's numbering only means anything if the number a message carries and the order it goes out in
 * are decided in the same place. Twelve senders taking their own numbers would arrive in one order and
 * be numbered in another, and the tail handed out after a reconnect would come with holes in it.
 */
@Service(Service.Level.PROJECT)
internal class ClaudeSessionHub(private val project: Project) : Disposable {

    /**
     * The conversations themselves. Deliberately the same class with the same constructor it always
     * had: this hub is its owner rather than its replacement, and the tests that build one directly go
     * on working.
     */
    val conversations: ClaudeSessions by lazy {
        ClaudeSessions(
            workingDirectory = project.basePath,
            parentDisposable = this,
            onEvent = { sessionId, line -> onAgentLine(sessionId, line) },
            onError = { sessionId, text -> sendError(sessionId, text) },
            onDiagnostic = { sessionId, text -> diagnostics.forEach { it(sessionId, text) } },
            onFinished = { sessionId -> sendStatus(sessionId, SessionSnapshot.STATUS_IDLE) },
            onCrashed = { sessionId, exitCode -> sendProcessExited(sessionId, exitCode) },
            onToolPermission = { sessionId, request -> permissionListener?.invoke(sessionId, request) },
            // Straight to the owner of the cards rather than through a listener of its own: a question
            // taken back is news for exactly the place that is holding it, and there is nobody else to
            // tell.
            onPermissionWithdrawn = { sessionId, requestId -> permissions.withdraw(sessionId, requestId) },
            onTitle = { sessionId, title -> sendSessionTitle(sessionId, title) },
            // A tab already carrying a name the model picked is left alone - a name outlives the
            // process that asked for it, and asking again would spend a model call to arrive at the
            // same words. A stand-in or a guess off the first line is another matter: those are exactly
            // what the question exists to replace.
            titleWanted = { sessionId -> tabs.titleSource(sessionId) != SessionSnapshot.TITLE_LLM },
            onTurnEnded = { sessionId ->
                // Before the status goes out, and the order is load-bearing twice over. The status is
                // what drains this tab's queue (see runQueued), and a message queued while the turn ran
                // must go into the process the person's choice named rather than into the one it
                // replaces. And this is the first moment the move can be made at all: the raw-line
                // listener below runs while `busy` is still true, so a move applied from there saw the
                // tab as working and put itself straight back into the waiting list, for ever.
                conversations.applyPendingAccount(sessionId)
                sendStatus(sessionId, SessionSnapshot.STATUS_IDLE)
            },
            onTurnStarted = { sessionId -> sendStatus(sessionId, SessionSnapshot.STATUS_RUNNING) },
            onMoveStopping = { sessionId -> sendTurnStopped(sessionId) },
            // The tab stands ready on the new account: idle, and with whatever was queued while the old
            // turn ran now free to go into the process the person's choice named.
            onMoved = { sessionId -> sendStatus(sessionId, SessionSnapshot.STATUS_IDLE) },
            onMoveForced = { sessionId ->
                // The questions it was holding die with the process, and only this takes their cards off
                // the screen: the CLI says nothing when it is killed rather than when it changes its mind.
                permissions.withdrawAll(sessionId)
                sendTurnStopped(sessionId)
            },
            onMoveDropping = { sessionId ->
                permissions.withdrawAll(sessionId)
                sendProcessReplaced(sessionId)
            },
            onBorn = { sessionId, effort, model, accountId ->
                sendEffort(sessionId, effort)
                sendModel(sessionId, model)
                sendAccount(sessionId, accountId)
                // And the models that account may run. Once per account rather than per tab (see
                // ProjectUsage.refreshModels): a conversation resumed onto the account it was billed to
                // is the ordinary way a tab ends up on one nobody has asked about, and without this its
                // model menu falls back to the built-in list for the rest of the project's life.
                usage.refreshModels(sessionId, accountId)
            },
        )
    }

    val tabs = SessionRegistry()

    /**
     * The subscription's usage, today's tokens, the context window and the model catalogue. Its
     * schedules used to belong to the panel; they belong to the project now, because a phone watching
     * it wants the same figures.
     */
    val usage: ProjectUsage = ProjectUsage(project.basePath, this, isLoggedIn = { auth.loggedIn })

    val auth: ProjectAuth = ProjectAuth(
        project,
        this,
        onSignedIn = {
            usage.refreshLimits(urgent = true)
            usage.refreshTodayTokens()
            usage.refreshModels(ClaudeSessions.MAIN_SESSION)
            // Who that sign-in belongs to is what the accounts row is drawn from, and this is the moment
            // it becomes known (see ProjectAuth.lastStatus). The list as it stands: re-checking here
            // would start the very process that has this moment finished.
            accounts.sendList()
        },
        // The figures on the rings belong to the account they were asked about - see ProjectUsage.forget.
        onAccountChanged = { account -> usage.forget(account) },
    )

    val catalog: ProjectCatalog = ProjectCatalog(project, this)

    /**
     * The accounts screen - which subscription pays for the work (see AccountDesk).
     *
     * It used to belong to the panel, next to the voice and feedback desks, and its own comment said why:
     * the window is the one door a paired phone does not physically reach. That is no longer the rule it
     * is under - the phone drives this screen now (see RemoteCommands) - and the old place was wrong for
     * a second reason besides. A hub exists for every project a phone has attached to, tool window or
     * no tool window, and a desk owned by the window simply did not exist there: the very project a
     * person reaches from a sofa was the one that could not answer about accounts at all.
     *
     * Lazy for the reason [conversations] is: building one probes the CLI, and a hub is created by
     * things that have nothing to do with accounts.
     */
    val accounts: AccountDesk by lazy { AccountDesk(project, this, this) }

    /** Permissions, plans and questions - everything that stops a turn to wait for a person. */
    val permissions: SessionPermissions = SessionPermissions(this)

    /** The single entrance every request about a conversation comes through. */
    val commands: SessionCommands = SessionCommands(this)

    /** The search over this project's conversations - the three tabs behind the magnifier (see SearchDesk). */
    val search: SearchDesk = SearchDesk(project, this)

    /**
     * What the agent changes on disk, read back into the IDE - the other half of [UnsavedEdits]. One
     * takes the editor's text to the agent, the other brings the agent's text to the editor.
     */
    private val disk: DiskRefresh = DiskRefresh(project.basePath, this)

    /**
     * What this project contributes to the statistics tab. It is told about everything below - the
     * stream, the messages, the tabs, the decisions - and writes it into the machine-wide ledger.
     */
    val stats: StatsCollector = StatsCollector(
        projectKey = StatsCollector.keyOf(project.basePath ?: project.name),
        projectName = project.name,
        workingDirectory = project.basePath,
        parentDisposable = this,
        accountOf = { sessionId -> conversations.accountOf(sessionId) },
    )

    private val clients = ConcurrentHashMap<String, SessionClient>()

    private val journals = ConcurrentHashMap<String, SessionJournal>()
    private val snapshots = ConcurrentHashMap<String, AtomicReference<SessionSnapshot>>()
    private val streams = ConcurrentHashMap<String, SessionStream>()

    /** What each conversation is waiting to say once the turn in progress ends - see [SessionQueue]. */
    private val queued = SessionQueue()

    /**
     * One lock per conversation rather than one for the hub. Numbering under a shared lock would make
     * two busy conversations wait on each other for nothing, while numbering with no lock at all is the
     * very hole this exists to close.
     */
    private val locks = ConcurrentHashMap<String, Any>()

    /**
     * The last message of each project-wide kind - what a joining client is caught up with.
     *
     * Without this, a second client opening asks for all of it again, and "asking" here means starting
     * processes: the sign-in check, the MCP list and the plugin list are each a separate run of the
     * CLI. Re-opening the panel does that today for no reason at all; with two clients it would be
     * every time either of them appears.
     */
    private val projectCache = ConcurrentHashMap<String, String>()

    /** How many devices are watching over the relay - see [noteRemoteWatchers]. */
    private val remoteWatchers = java.util.concurrent.atomic.AtomicInteger(0)

    /** Whether the project's facts have been collected - see the note in [attach]. */
    private val warmed = java.util.concurrent.atomic.AtomicBoolean(false)

    /** Whoever wants the agent's raw lines - the sign-in watch, the usage counter, later the relay. */
    private val diagnostics = mutableListOf<(String, String) -> Unit>()
    private val rawListeners = mutableListOf<(String, String, Boolean) -> Unit>()

    /** Who draws permission cards. Set by whoever owns them - see SessionPermissions. */
    @Volatile
    private var permissionListener: ((String, PermissionChannel.ToolPermission) -> Unit)? = null

    /** Who is told that something worth a notification happened - see [onNotification]. */
    @Volatile
    private var notificationListener: ((String, String, String) -> Unit)? = null

    /** Who is told that the list a phone draws has changed - see [onInventoryChanged]. */
    @Volatile
    private var inventoryListener: (() -> Unit)? = null

    init {
        // Where the CLI keeps its files for this project is a process to find out on a WSL project, and
        // the history, the settings and the hint all ask it soon: paid now, off every thread anybody
        // waits on (see ClaudeHome). A project on this machine returns from this at once.
        ClaudeHome.warmUp(project.basePath)
        // The account register is one book for the whole machine, and a running IDE holds it in memory:
        // without this, a switch made in the window next door would not reach this one until a restart.
        // Started from the hub rather than from the panel - a project a phone attached to has
        // conversations and no tool window, and they follow the account too.
        AccountsWatch.getInstance().start()
        catalog.scheduleUpdates(this, usage)
        usage.scheduleUpdates(this)
        auth.scheduleUpdates(this)
        openLocalBridge()
        onPermissionRequest { sessionId, request -> permissions.ask(sessionId, request) }
        // A lost sign-in is reported past the event stream, before the first answer.
        onDiagnostic { _, text -> auth.noteLoggedOut(text) }
        onRawLine { sessionId, line, replay ->
            auth.noteLoggedOut(line)

            // A file the agent has just rewritten is still the old one as far as the IDE is concerned
            // until somebody asks it to look again (see DiskRefresh). Not from a replay: that disk
            // caught up months ago.
            if (!replay) runCatching { disk.noteLine(line) }
                .onFailure { thisLogger().warn("The disk refresh could not read a line", it) }

            // The statistics count what happens, not what happened: a past conversation's replay is
            // work already done and already counted, if it was ever ours to count.
            if (!replay) runCatching { stats.noteLine(sessionId, line) }
                .onFailure { thisLogger().warn("The statistics could not read a line", it) }

            /**
             * A process that has just come up: it has loaded a transcript, and how much of the window
             * that transcript takes is known to it alone.
             *
             * Waiting for the end of the first turn is too late for exactly one kind of tab - a fork. It
             * inherits the whole of its parent's conversation, so its window is full from the first
             * second, while the panel, knowing neither the figure nor the window's size, fell back to the
             * shared guess of two hundred thousand and drew a red 100% over an ordinary conversation (see
             * the seed in App.fork, which covers the seconds before this answer arrives).
             */
            if (!replay && line.contains(INIT_MARKER)) usage.refreshContext(sessionId)

            // The end of a turn is the only moment the taken context window has genuinely changed: we
            // ask the very process that has just finished for a fresh figure.
            if (line.contains(RESULT_MARKER)) {
                usage.refreshContext(sessionId)
                if (!replay) {
                    // The subscription usage: the turn has just cost some of the limit, and the freshest
                    // share is precisely at this process - it got it in the answer. A past conversation's
                    // replay does not count: everything there has already happened.
                    //
                    // Filed under the account THIS conversation runs on rather than the current one. They
                    // differ whenever a tab works on an account that is not the one new tabs start on, and
                    // then the question went to the wrong subscription: the working tab's own figures never
                    // moved, while a process was raised to ask about an account nothing had happened to.
                    //
                    // Asked BEFORE the move below, and the order is the whole of it: the account that just
                    // paid for this turn is the one the tab is on now, not the one it is about to become,
                    // and the process holding the freshest answer is the one the move is about to replace.
                    usage.refreshLimits(preferred = sessionId, account = conversations.accountOf(sessionId))
                }
            }
        }
    }

    /**
     * A second client on this machine, for finding out what two clients do to each other before there
     * is a network between them (see LocalBridgeServer).
     *
     * Off unless asked for explicitly, and asked for the way this project already asks for such things
     * - a system property on the sandbox run (see -Dacc.autoOpen and -Dacc.webview.devUrl). It is
     * scaffolding rather than a setting: a switch for it in the panel belongs to phase 3, along with
     * the pairing that makes it safe to offer.
     */
    private fun openLocalBridge() {
        if (System.getProperty(LocalBridgeServer.ENABLED_PROPERTY) != "true") return

        val address = LocalBridgeServer(this, this).start() ?: return
        thisLogger().warn("The local bridge is open: $address")
    }

    // --- Clients ----------------------------------------------------------------

    /**
     * A client joins and is caught up with everything it has missed.
     *
     * [since] is what it already has, by conversation: the numbers it read off the messages themselves.
     * An empty map means it has nothing and gets the lot.
     *
     * The order is fixed and it matters. The project's own facts first (a client cannot draw a tab
     * before it knows the project), then the list of tabs, then each tab's feed. Inside a tab the
     * restore is bracketed explicitly, so the interface can apply the whole of it as one change rather
     * than re-render on every entry.
     */
    /**
     * Take note of a client without handing it anything yet.
     *
     * The two halves are apart because they happen at different moments: a browser page exists as soon
     * as its stream opens, but what it already has it can only say once it has mounted - and that is
     * what decides whether it gets the whole feed or only the tail (see [attach]).
     */
    fun register(client: SessionClient) {
        clients[client.id] = client
        broadcastClients()
    }

    /** A client says what it has and is caught up with the rest. */
    fun attach(clientId: String, since: Map<String, Long> = emptyMap(), catchUp: CatchUp = CatchUp.EVERYTHING) {
        val client = clients[clientId] ?: return

        val batch = ArrayList<String>()
        batch += projectMessages()
        batch += sessionsMessage()

        // The registry's tabs, plus any conversation that has a journal without being in it. The second
        // part should never happen - a tab is opened before anything is said in it - but a feed that
        // exists and is silently not handed over is the worst way for that to go wrong.
        val known = tabs.tabs().map { it.id }
        for (sessionId in known + journals.keys.filterNot { it in known }) {
            if (!catchUp.wants(sessionId)) continue

            val seen = since[sessionId] ?: 0
            val journal = journal(sessionId)
            val entries = journal.since(seen, catchUp.maxEntries, catchUp.maxChars)

            batch += restoreStarted(sessionId, from = seen, truncated = journal.truncatedFrom(seen, entries))

            entries.forEach { entry -> batch += SessionMessages.stamp(entry.json, entry.seq, entry.at) }

            // The answer being printed at this very moment: it is not in the journal (see SessionStream)
            // and without it a conversation joined mid-turn looks frozen.
            val stream = streams[sessionId]
            if (stream != null && !stream.isEmpty()) {
                batch += buildJsonObject {
                    put("type", "streamingText")
                    put("sessionId", sessionId)
                    put("text", stream.text())
                    put("thinking", stream.thinking())
                }.toString()
            }

            batch += restoreFinished(sessionId, upTo = journal.lastSeq())

            // What this conversation is waiting to say. Not in the journal (see sendQueue), so a client
            // that was not listening when the list last changed has no other way to learn it - and one
            // that opens the panel over a queue put there from a phone would otherwise show none of it.
            val waiting = queued.of(sessionId)
            if (waiting.isNotEmpty()) batch += queueMessage(sessionId, waiting)

            // And what it works at: the effort is told by nobody but us (see [changeEffort]), so a client
            // joining now has no other way to learn it. A conversation that has not started yet says
            // nothing here - there is nothing to say, and the setting is the honest answer for it.
            conversations.effort(sessionId)?.let { batch += effortMessage(sessionId, it) }
            conversations.model(sessionId)?.let { batch += modelMessage(sessionId, it) }
            conversations.conversationIdOf(sessionId)?.let { batch += conversationMessage(sessionId, it) }
            batch += accountMessage(sessionId, conversations.accountOf(sessionId))
        }

        client.deliver(batch)

        // Nobody has asked the CLI anything yet in this project - the facts a client draws its first
        // screen from have to be collected. Every one of them costs a process, which is exactly why it
        // happens once here rather than on every join.
        //
        // By its own flag rather than by "the cache is empty", which is what this was and which was
        // wrong in a way that took a live IDE to notice: the relay connection reports its state through
        // the same cache and does it first, so the cache was never empty by the time the panel asked -
        // and the panel sat on "checking Claude Code…" forever.
        if (warmed.compareAndSet(false, true)) warmUp()
    }

    /**
     * How much of this project one joining client is handed.
     *
     * The panel takes all of it and should: it is the same machine, the messages are already in that
     * process's memory, and a tab that came back missing its middle would be a worse defect than any
     * amount of copying. A phone is the opposite case in every particular - it asked for one
     * conversation, it is on somebody's mobile data, and what stands between it and the IDE holds a
     * bounded queue (see RemoteOutbox).
     *
     * That queue is why this exists rather than as a kindness about data. Handing a working day's
     * journal - up to two thousand entries and eight megabytes - to a phone overflowed the queue in one
     * go, and an overflowed queue is thrown away whole: a long conversation opened from a phone came up
     * blank and stayed blank, while a short one worked. The budget is what keeps the two ends of that
     * pipe in proportion; the note about what was left out reaches the screen (see restoreStarted).
     */
    internal data class CatchUp(
        /** Which conversations to hand over - null means every one this project has. */
        val sessions: Set<String>? = null,
        val maxEntries: Int = Int.MAX_VALUE,
        val maxChars: Long = Long.MAX_VALUE,
    ) {
        fun wants(sessionId: String): Boolean = sessions?.contains(sessionId) ?: true

        companion object {
            val EVERYTHING = CatchUp()

            /**
             * One conversation, and its end rather than its whole. Three hundred entries is a long
             * evening of work in one tab, and a megabyte is what a phone can take without the screen
             * standing empty while it arrives.
             */
            fun tailOf(sessionId: String): CatchUp =
                CatchUp(sessions = setOf(sessionId), maxEntries = REMOTE_MAX_ENTRIES, maxChars = REMOTE_MAX_CHARS)

            const val REMOTE_MAX_ENTRIES = 300

            const val REMOTE_MAX_CHARS = 1024L * 1024
        }
    }

    /**
     * Collect what the project's first screen is made of. Deliberately not in the constructor: creating
     * the hub must start nothing at all, or merely having the plugin installed would run three CLI
     * processes in every open project.
     */
    private fun warmUp() {
        // Each on its own, because one of them failing must not take the rest with it. They are
        // independent facts, and the sign-in is the one the first screen depends on: a project whose
        // git status happened to throw would otherwise leave the panel on "checking Claude Code…"
        // forever, with nothing to say why.
        for ((what, collect) in listOf<Pair<String, () -> Unit>>(
            "the project" to { catalog.sendInit() },
            "the branch" to { catalog.refreshBranch() },
            "the pull request" to { catalog.refreshPullRequest() },
            "the sign-in" to { auth.check() },
            "the available modes" to { auth.checkModeAvailability() },
            "the file list" to { catalog.refreshFiles() },
            "the command hints" to { catalog.refreshCommandHints() },
            // The catalogue the agent named last time round: without it a panel just opened hints at
            // nothing but what lies on disk (see ProjectCatalog.sendCommands).
            "the commands" to { catalog.sendCommands() },
            "the remote state" to { broadcastRemoteState() },
            // Nobody else says it. `init` carries the language too, but it never leaves this machine
            // (see RemoteFeed), so without this a phone was drawn in English for ever - including on the
            // Chinese IDE the whole setting exists for, where nothing is ever chosen by hand and the
            // only other caller (the language screen) is therefore never reached.
            "the language" to { catalog.sendLocale() },
        )) {
            runCatching(collect).onFailure { thisLogger().warn("Could not collect $what", it) }
        }
    }

    fun detach(clientId: String) {
        clients.remove(clientId)
        broadcastClients()
    }

    /**
     * Who is watching this project right now.
     *
     * "It is always visible in the IDE that someone is connected remotely" is a requirement rather than
     * a decoration (see the plan's §3.4), and it is cheaper to build while there are two clients on one
     * machine than to add once there is a phone across the city.
     *
     * The panel itself is counted but not shown: a person does not need telling that the window they
     * are looking at is open.
     */
    /**
     * Whether this IDE can be reached from outside, and how that is going. Asked for by the panel when
     * it opens its remote access screen, and pushed by the agent whenever the connection moves.
     */
    fun broadcastRemoteState() {
        val agent = RemoteAgent.getInstance()
        val remote = RemoteState.getInstance()

        broadcastProject(
            buildJsonObject {
                put("type", "remoteState")
                put("state", agent.state().name.lowercase())
                put("enabled", agent.enabled())
                put("relay", agent.relayUrl())
                put("agentId", remote.agentId())
                agent.fingerprint()?.let { put("fingerprint", it) }
                // Whether a pairing made now would still be there tomorrow. An IDE set not to remember
                // passwords accepts the write and forgets it, which without this reads as an endless
                // cycle of pairing a phone that never stays paired.
                put("keysKept", RemoteKeys.usable(remote.agentId()))
                putJsonArray("devices") {
                    for (device in remote.devices()) {
                        addJsonObject {
                            put("id", device.id)
                            put("label", device.label)
                            put("fingerprint", device.fingerprint)
                            put("pairedAt", device.pairedAt)
                            put("lastSeenAt", device.lastSeenAt)
                        }
                    }
                }
                agent.pairingOffer()?.let { (url, expiresAt) ->
                    putJsonObject("pairing") {
                        put("url", url)
                        put("expiresAt", expiresAt)
                    }
                }
                agent.pendingPairing()?.let { (deviceId, label, fingerprint) ->
                    putJsonObject("pending") {
                        put("deviceId", deviceId)
                        put("label", label)
                        put("fingerprint", fingerprint)
                    }
                }
            }.toString(),
        )
    }

    /**
     * How many devices are watching over the network right now, as the agent counts them.
     *
     * Reported rather than inferred: from here, the whole relay is one client no matter how many
     * phones are behind it, and "one client" is exactly what the panel must not say when two people
     * are watching - or when nobody is.
     */
    fun noteRemoteWatchers(count: Int) {
        if (remoteWatchers.getAndSet(count) != count) broadcastClients()
    }

    private fun broadcastClients() {
        // The panel is itself a client and is not worth telling a person about: they are looking at it.
        // Neither is the relay's own connection - what matters there is the devices behind it, which it
        // counts for us.
        val local = clients.values.filterNot {
            it.id.startsWith(PANEL_PREFIX) || it.id.startsWith(RELAY_PREFIX)
        }
        val watchers = local

        stats.noteWatchers(watchers.size + remoteWatchers.get())

        broadcastProject(
            buildJsonObject {
                put("type", "clients")
                put("count", watchers.size + remoteWatchers.get())
                putJsonArray("clients") {
                    watchers.forEach { watcher ->
                        addJsonObject {
                            put("id", watcher.id)
                            put("local", watcher.isLocal)
                        }
                    }
                }
            }.toString(),
        )
    }

    /**
     * Whether this client sits on this machine.
     *
     * What is decided from a phone differs from what is decided at the desk - approving a plan most of
     * all (see SessionPermissions.decidePlan) - and so does the size of what is answered, because a
     * phone's frame is capped and ours is not (see ClaudeHistory.earlier).
     *
     * A client nobody knows is not this IDE. It used to be, on this road, and not on the other one - two
     * ways of asking the same question that answered a vanished client the opposite way, so a page of
     * history for one and the same departed client came out phone-sized or desk-sized depending on which
     * of the two was asked. Being this IDE is what grants the right to ask for anything at all
     * (see SessionCommands.handle); a client that is not in the room does not inherit it.
     */
    fun isLocal(clientId: String): Boolean = clients[clientId]?.isLocal ?: false

    /** Someone is watching right now - see the schedules that are pointless without one. */
    fun hasClients(): Boolean = clients.isNotEmpty()

    // --- Sending ----------------------------------------------------------------

    /**
     * A message about one conversation: numbered, kept, and sent to everyone watching.
     *
     * Everything a client would need to rebuild the feed comes this way. What does not: the deltas of
     * the answer being printed (see [emitLive]) and answers addressed to whoever asked (see [emitTo]).
     */
    fun broadcast(sessionId: String, json: String) {
        val trimmed = JournalTrim.trim(json)
        val at = System.currentTimeMillis()

        val stamped = synchronized(lock(sessionId)) {
            val entry = journal(sessionId).append(trimmed, at)
            SessionMessages.stamp(trimmed, entry.seq, entry.at)
        }

        // The reason a notification might be worth sending is a transition rather than a message: "a
        // permission appeared" rather than "here is a permission". Only this line knows both sides of
        // it, so it is worked out here and handed on - anywhere else it would be guesswork.
        val before = snapshot(sessionId).get()
        val after = snapshot(sessionId).updateAndGet { current -> SessionSnapshots.apply(current, trimmed, at) }
        val reason = NotificationReasons.of(trimmed, before, after)

        deliver(stamped)

        if (reason != null) {
            notificationListener?.invoke(sessionId, reason, targetOf(trimmed))
        }

        // A phone's list is drawn from these two fields, and it is not on the receiving end of this
        // message: it watches one conversation and hears nothing about the others. Without this the
        // list only caught up when the phone next asked - up to half a minute later, which on a screen
        // someone is holding reads as a card that simply refuses to say it is working.
        if (before.status != after.status || before.awaitsYou != after.awaitsYou) inventoryChanged()
    }

    /**
     * A message that is true only right now: the deltas of an answer being printed. Nothing is kept and
     * no number is spent - a client that missed them gets the fold instead (see [attach]).
     */
    fun emitLive(json: String) {
        deliver(json)
    }

    /** A project-wide message: kept as the latest of its kind and sent to everyone. */
    fun broadcastProject(json: String) {
        val type = messageType(json)
        if (type.isNotEmpty()) projectCache[type] = json

        deliver(json)
    }

    /**
     * An answer to one client's question - the clipboard, a command's output, the history list. It is
     * of no interest to anyone else and would be noise in the journal.
     */
    fun emitTo(clientId: String, json: String, asker: String = clientId) {
        val client = clients[clientId] ?: return

        if (asker == clientId) client.answer(listOf(json)) else client.answerOne(asker, listOf(json))
    }

    private fun deliver(json: String) {
        for (client in clients.values) {
            runCatching { client.deliver(listOf(json)) }
                .onFailure { thisLogger().warn("A client could not take a message", it) }
        }
    }

    // --- The conversations' own events -------------------------------------------

    /**
     * A line from the agent's stream.
     *
     * [replay] marks a past conversation being read off disk rather than a live turn - the mark travels
     * onwards untouched, because the interface treats the two differently (see feed/build.ts).
     */
    fun onAgentLine(sessionId: String, line: String, replay: Boolean = false) {
        // Not an event at all - there is nothing to put into an envelope. A live process does not bring
        // such a line this far (see ClaudeSession.noteDiagnostic), but an old transcript may hold one.
        if (!line.startsWith("{")) return

        // A process reporting what it came up with names every command it knows, the MCP servers' ones
        // included - the one place they can be learned from at all (see ProjectCatalog.noteCommands).
        // Not from a replay: an old transcript holds no such event, and a line read off disk says
        // nothing about what is connected right now.
        if (!replay) catalog.noteCommands(line)

        // The limit picture changes on its own, without anyone asking: extra usage begins the moment a
        // window runs out. Not from a replay for the same reason - an old transcript says nothing about
        // the state of the subscription right now.
        //
        // The moment it begins is also worth a phone: from it on the work is paid for on top of the
        // plan. It is announced from here rather than from the notification rules, because "it has just
        // begun" is a change of state and the state lives there - the event itself repeats on every
        // turn while it holds (see NotificationReasons.EXTRA_USAGE).
        if (!replay && usage.noteRateLimit(sessionId, line)) {
            notificationListener?.invoke(sessionId, NotificationReasons.EXTRA_USAGE, "")
        }

        rawListeners.forEach { it(sessionId, line, replay) }

        val replayFlag = if (replay) ""","replay":true""" else ""
        val envelope = """{"type":"agent","sessionId":"$sessionId"$replayFlag,"event":$line}"""

        // /clear leaves the conversation without its past, and so should the journal: a client joining
        // later must not be handed a feed of a conversation that no longer exists. The event itself
        // still goes out and into the empty journal - it is the mark in the feed that says what happened.
        if (line.contains(RESET_MARKER)) {
            synchronized(lock(sessionId)) { journal(sessionId).reset() }
            stream(sessionId).clear()
            snapshot(sessionId).set(SessionSnapshot(title = "", titleSource = SessionSnapshot.TITLE_DEFAULT))
            tabs.resetTitle(sessionId)
            broadcast(sessionId, envelope)
            broadcastSessions()
            return
        }

        if (stream(sessionId).accept(line)) {
            emitLive(envelope)
            return
        }

        broadcast(sessionId, envelope)
    }

    fun sendStatus(sessionId: String, state: String) {
        stats.noteStatus(sessionId, running = state == SessionSnapshot.STATUS_RUNNING)

        broadcast(
            sessionId,
            buildJsonObject {
                put("type", "status")
                put("sessionId", sessionId)
                put("state", state)
            }.toString(),
        )

        // The turn is over - whatever was written while it ran gets said now. After the status has gone
        // out rather than before it: what a client sees is the conversation coming free and the queued
        // message starting the next turn, in that order.
        if (state != SessionSnapshot.STATUS_RUNNING) runQueued(sessionId)
    }

    fun sendError(sessionId: String, text: String) {
        if (text.isBlank()) return

        diagnostics.forEach { it(sessionId, text) }

        broadcast(
            sessionId,
            buildJsonObject {
                put("type", "error")
                put("sessionId", sessionId)
                put("message", text)
            }.toString(),
        )
    }

    /**
     * A conversation's process died on its own rather than at our request. Anything that was running at
     * that moment would otherwise hang in the feed forever.
     */
    fun sendProcessExited(sessionId: String, exitCode: Int) {
        broadcast(
            sessionId,
            buildJsonObject {
                put("type", "processExited")
                put("sessionId", sessionId)
                put("exitCode", exitCode)
            }.toString(),
        )
    }

    /**
     * The tab's name as the CLI's own model picked it. It also lands in the registry: the list of tabs
     * is what a phone reads, and a list of "new session" tells nobody anything.
     */
    fun sendSessionTitle(sessionId: String, title: String) {
        if (!tabs.rename(sessionId, title, SessionSnapshot.TITLE_LLM)) return

        broadcast(
            sessionId,
            buildJsonObject {
                put("type", "sessionTitle")
                put("sessionId", sessionId)
                put("title", title)
            }.toString(),
        )

        broadcastSessions()
    }

    // --- Tabs --------------------------------------------------------------------

    /**
     * A tab was opened. The identifier is made up by whoever pressed the button: "+" has to answer
     * instantly, and a round trip here before the tab appears would be felt.
     */
    fun openSession(
        id: String,
        parentId: String?,
        title: String,
        quote: String,
        /**
         * What this conversation is to start on, when the request said so. Empty - the ordinary case -
         * means the settings decide, exactly as before (see SessionLaunch).
         */
        launch: SessionLaunch = SessionLaunch(),
    ) {
        val opened = tabs.open(
            id = id,
            parentId = parentId,
            title = title,
            titleSource = if (title.isBlank()) SessionSnapshot.TITLE_DEFAULT else SessionSnapshot.TITLE_HEURISTIC,
        )

        // Only for a tab this request genuinely opened. A refused identifier means the tab belongs to
        // somebody else, and starting theirs on a model chosen here would be the one surprise this
        // whole per-conversation business exists to avoid.
        if (opened && !launch.isEmpty) conversations.rememberLaunch(id, launch)

        if (opened && parentId != null) conversations.branchFrom(parentId, id)

        if (opened) {
            val tab = tabs.tabs().firstOrNull { it.id == id }
            stats.noteSessionOpened(id, parentId, groupId = tab?.groupId ?: id, depth = tab?.depth ?: 0)
        }

        // Sent even when the identifier was refused: whoever guessed a taken one has to see the truth
        // rather than a tab that exists only on their screen.
        broadcastSessions()
        if (quote.isNotEmpty()) thisLogger().info("Session $id forked from $parentId")
    }

    fun closeSession(id: String) {
        conversations.close(id)
        stats.noteSessionClosed(id)
        // What this conversation was waiting to say goes with it: there is nothing left to say it to.
        queued.clear(id)
        journals.remove(id)
        snapshots.remove(id)
        streams.remove(id)
        locks.remove(id)
        tabs.close(id)
        broadcastSessions()
    }

    /**
     * The heuristic name the interface guessed from the first message. It is worked out there rather
     * than here on purpose: the rule already exists in the interface (see deriveSessionTitle), it is
     * the same rule both clients must use, and a second copy in another language would drift from it.
     */
    fun renameSession(id: String, title: String) {
        if (tabs.rename(id, title, SessionSnapshot.TITLE_HEURISTIC)) broadcastSessions()
    }

    fun reorderGroups(groupId: String, beforeGroupId: String?) {
        if (tabs.moveGroup(groupId, beforeGroupId)) broadcastSessions()
    }

    /** A fork moved among its own group's tabs - see SessionRegistry.moveTab. */
    fun reorderTabs(sessionId: String, beforeSessionId: String?) {
        if (tabs.moveTab(sessionId, beforeSessionId)) broadcastSessions()
    }

    fun broadcastSessions() {
        deliver(sessionsMessage())
        // The tabs themselves are half of what a phone's list shows: one opened, closed or renamed
        // changes it as surely as a status does.
        inventoryChanged()
    }

    /** The list a phone draws is out of date - see [onInventoryChanged]. */
    private fun inventoryChanged() {
        runCatching { inventoryListener?.invoke() }
            .onFailure { thisLogger().warn("The inventory listener could not be told", it) }
    }

    private fun sessionsMessage(): String = buildJsonObject {
        put("type", "sessions")
        putJsonArray("sessions") {
            for (tab in tabs.tabs()) {
                val snapshot = snapshot(tab.id).get()
                addJsonObject {
                    put("id", tab.id)
                    put("title", tab.title)
                    put("titleSource", tab.titleSource)
                    put("kind", if (tab.depth == 0) "main" else "branch")
                    tab.parentId?.let { put("parentId", it) }
                    put("groupId", tab.groupId)
                    put("depth", tab.depth)
                    put("status", snapshot.status)
                    // What a list of sessions on a phone is really for: which of them will not move
                    // until you touch it.
                    put("awaitsYou", snapshot.awaitsYou)
                    if (snapshot.crashed) put("crashed", true)
                }
            }
        }
    }.toString()

    // --- What a client asks for ----------------------------------------------------

    /**
     * A message from a person into a conversation.
     *
     * The status is set optimistically, before the process has said a word: the interface has to answer
     * the press at once, and a turn that turns out never to have started is closed by the result that
     * arrives all the same.
     */
    fun prompt(
        sessionId: String,
        text: String,
        images: List<ImageAttachment> = emptyList(),
        /**
         * The message as it stands in the feed - the pieces it was assembled from, with their chips and
         * quotes. Kept and passed on without being understood: what a chip is and how it is drawn is the
         * interface's business, and a second description of it in Kotlin would drift from the first.
         *
         * Without this the restored feed would be answers with no questions above them: a person's
         * message reaches the agent as plain text, and nothing in the stream says where it began.
         */
        echo: JsonObject? = null,
        /** The message came from a paired phone rather than from the desk - the statistics tell the two apart. */
        remote: Boolean = false,
    ) {
        if (text.isBlank()) return

        stats.notePrompt(sessionId, text, images = images.size, remote = remote)

        // A message into a conversation nobody opened a tab for.
        //
        // It should not happen - a tab is opened before anything is written into it - but "should not"
        // is doing a lot of work there: two clients, two connections, and the request that opens the tab
        // can be lost while the one that writes into it arrives. What that used to leave was the worst
        // of both: a live process answering into a conversation no list mentions, so neither the panel
        // nor a phone could reach it. The tab is opened here instead.
        if (tabs.tabs().none { it.id == sessionId }) {
            thisLogger().info("A message arrived for $sessionId, which has no tab - opening one")
            openSession(id = sessionId, parentId = null, title = "", quote = "")
        }

        // Before the write into the process, not after: the entry's number has to fall where the message
        // genuinely stands in the conversation, or a fast first answer would be numbered ahead of the
        // question it answers.
        if (echo != null) {
            broadcast(
                sessionId,
                buildJsonObject {
                    put("type", "promptEcho")
                    put("sessionId", sessionId)
                    echo.forEach { (key, value) -> put(key, value) }
                }.toString(),
            )
        }

        sendStatus(sessionId, SessionSnapshot.STATUS_RUNNING)

        // The person's last edit may still be in an editor rather than on disk, and the agent only ever
        // sees the disk - see [UnsavedEdits]. This is the single door every turn goes through: the
        // panel, a phone, a queued message and an answer to a question all arrive here, so saving in
        // this one place covers the lot.
        UnsavedEdits.flush(project)
        conversations.prompt(sessionId, text, images)
    }

    /**
     * A message written while the agent was busy, to be said when it is free.
     *
     * It waits here rather than in the window it was typed in - see [SessionQueue] for why that matters
     * on a phone. The list travels to every client, so the panel at the desk shows what was queued from
     * the sofa and either of them can take it out again.
     *
     * A turn that ended while this was travelling is the ordinary case rather than an edge: the person
     * pressed Queue against what their screen showed a moment ago. It is sent straight away then - the
     * queue is a request to wait for the agent, not for a round trip.
     */
    fun queuePrompt(
        sessionId: String,
        id: String,
        text: String,
        attach: String = "",
        images: List<ImageAttachment> = emptyList(),
        echo: JsonObject? = null,
        remote: Boolean = false,
    ) {
        if (text.isBlank()) return

        sendQueue(sessionId, queued.add(sessionId, SessionQueue.Entry(id, text, attach, images, echo, remote)))
        runQueued(sessionId)
    }

    /** The cross on a queued message: it is not going to be said after all. */
    fun unqueuePrompt(sessionId: String, id: String) {
        sendQueue(sessionId, queued.remove(sessionId, id))
    }

    /** The queue dragged into another order - see [SessionQueue.reorder]. */
    fun reorderQueue(sessionId: String, ids: List<String>) {
        sendQueue(sessionId, queued.reorder(sessionId, ids))
    }

    /**
     * The conversation came free - say the next thing that was waiting.
     *
     * One message at a time: the one after it waits for the turn this one starts, exactly as it does at
     * the desk. A conversation that is running is left alone, and that single check is also what keeps a
     * queued message out of a compaction - `/compact` is a turn like any other, and a message written
     * into a running one is taken by the CLI and, more often than not, silently dropped (see
     * PromptDelivery).
     */
    private fun runQueued(sessionId: String) {
        if (snapshot(sessionId).get().status == SessionSnapshot.STATUS_RUNNING) return
        // Between a tab's two processes there is nothing to send into: the old conversation is gone and
        // the new one is not in yet, so this would raise a bare third one on no transcript at all. The
        // move says so itself the moment it is done (see ClaudeSessions.onMoved).
        if (conversations.isMoving(sessionId)) return

        val (entry, rest) = queued.take(sessionId) ?: return
        sendQueue(sessionId, rest)
        prompt(sessionId, entry.text, entry.images, entry.echo, entry.remote)
    }

    private fun sendQueue(sessionId: String, items: List<SessionQueue.Entry>) {
        // Live rather than into the journal: this is what a conversation is about to say, not something
        // it has said. Journalled, every add and every removal would sit in a feed's history forever,
        // crowding out the messages a phone is handed (see CatchUp) to describe a list that a single
        // later message makes wrong. A client joining is given the list as it stands - see [attach].
        emitLive(queueMessage(sessionId, items))
    }

    private fun queueMessage(sessionId: String, items: List<SessionQueue.Entry>): String =
        buildJsonObject {
            put("type", "queue")
            put("sessionId", sessionId)
            putJsonArray("items") {
                items.forEach { entry ->
                    addJsonObject {
                        put("id", entry.id)
                        put("text", entry.text)
                        put("attach", entry.attach)
                        // The count rather than the bytes: a photo from a phone is measured in hundreds
                        // of kilobytes, the frame that would carry it back to every client has a limit of
                        // 256, and all a queued row needs of it is that there is one.
                        put("images", entry.images.size)
                    }
                }
            }
        }.toString()

    /**
     * We interrupt the turn rather than cut down the process: the conversation must stay. We do not
     * rush into idle - the status will be shown by a real result event, and if the agent does not even
     * confirm the interrupt, we say honestly that things look bad.
     */
    fun interrupt(sessionId: String) {
        conversations.interrupt(sessionId) {
            sendError(sessionId, "Claude didn't confirm the stop - the process may be stuck.")
        }
    }

    /**
     * A forced stop: the user has already seen that the ordinary Stop went unconfirmed and asked
     * outright to kill the process.
     */
    fun kill(sessionId: String) {
        conversations.stop(sessionId)
        sendStatus(sessionId, SessionSnapshot.STATUS_IDLE)
    }

    fun stopTask(sessionId: String, taskId: String) {
        conversations.stopTask(sessionId, taskId) { error ->
            sendError(sessionId, "Couldn't stop the task: $error")
        }
    }

    /**
     * The mode of one conversation, and of no other: neither the MODE selector nor Shift+Tab nor an
     * approved plan touches what new tabs start in. That is chosen separately.
     *
     * The panel shows the applied mode, not the chosen one: if the agent refuses, the interface must
     * return to the previous one rather than lie with a tick in the menu.
     */
    fun changeMode(sessionId: String, mode: String) {
        conversations.setPermissionMode(sessionId, mode) { change ->
            broadcast(
                sessionId,
                buildJsonObject {
                    put("type", "mode")
                    put("sessionId", sessionId)
                    put("mode", change.mode)
                    put("applied", change.applied)
                    // A refusal without a reason looks like a broken panel, although the matter is
                    // usually the model: "auto" is not available on every one.
                    if (change.error.isNotEmpty()) put("error", change.error)
                }.toString(),
            )
        }
    }

    /**
     * The panel shows the applied model, not the chosen one - for the same reason as with the mode: the
     * agent can genuinely refuse (a model forbidden by an organization or unavailable on a plan), and
     * then the interface must return to the previous one and say why.
     *
     * The context window is asked for anew only on a real change: another model's is a different size,
     * and waiting for the turn's end for that figure serves nothing.
     */
    fun changeModel(sessionId: String, model: String, remember: Boolean = true) {
        conversations.setModel(sessionId, model, remember) { change ->
            broadcast(
                sessionId,
                buildJsonObject {
                    put("type", "model")
                    put("sessionId", sessionId)
                    put("model", change.model)
                    put("applied", change.applied)
                    if (change.error.isNotEmpty()) put("error", change.error)
                }.toString(),
            )

            if (change.applied) usage.refreshContext(sessionId)
        }
    }

    /**
     * The effort of one conversation, and of no other - the same promise the MODE and MODEL selectors
     * make. The chosen value does become what the NEXT tab starts on (see ClaudeSessions.setEffort),
     * but a conversation already running is never moved by a choice made in a neighbouring one.
     *
     * Told to the clients rather than left to be worked out, and this is the whole reason the message
     * exists: the CLI says nothing about the effort - not in `system/init`, not in an event of its own,
     * not in an answer to a question (see ClaudeSession.setEffort). What the panel knows about a
     * conversation's effort, it knows from here and from nowhere else.
     */
    fun changeEffort(sessionId: String, effort: String, remember: Boolean = true) {
        conversations.setEffort(sessionId, effort, remember)
        sendEffort(sessionId, effort)
    }

    /**
     * The effort a conversation works at right now - said on a change and at its birth, which is the only
     * moment anyone could learn what an untouched tab started on.
     *
     * Live rather than into the journal, for the same reason as the queue (see [sendQueue]): this is what
     * a conversation IS, not something it has said. Journalled, every pick would sit in the feed's history
     * forever and crowd out the messages a phone is handed to rebuild it - and the one message that
     * mattered would be the first to be trimmed away, leaving a long conversation drawn by a setting
     * chosen in some other tab. A client that was not listening is told on joining (see [attach]).
     */
    private fun sendEffort(sessionId: String, effort: String) {
        emitLive(effortMessage(sessionId, effort))
    }

    private fun effortMessage(sessionId: String, effort: String): String =
        buildJsonObject {
            put("type", "effort")
            put("sessionId", sessionId)
            put("effort", effort)
        }.toString()

    /**
     * The model a conversation came up on - said at its birth, the way the effort is, and for the same
     * reason: a tab whose model nobody has touched would otherwise be drawn by whatever the setting
     * holds now. `born` tells the panel this is a fact about the tab, not a choice to write into the
     * setting (see the `model` message in protocol.ts). Handed to a joining client beside the effort.
     */
    private fun sendModel(sessionId: String, model: String) {
        emitLive(modelMessage(sessionId, model))
    }

    private fun modelMessage(sessionId: String, model: String): String =
        buildJsonObject {
            put("type", "model")
            put("sessionId", sessionId)
            put("model", model)
            put("applied", true)
            put("born", true)
        }.toString()

    /**
     * Which Claude account a conversation runs on - said at its birth, like the effort and the model,
     * live rather than into the journal and for the same reason: it is what the conversation IS.
     *
     * The opaque id and nothing else. The label, the address and the organisation are not in here on
     * purpose: this message is per-conversation, so a subscribed phone receives it, and a phone has no
     * words for an account and no business with somebody's address. What the accounts screen needs to
     * draw a row travels separately, through the window's own door (see ClaudePanel).
     */
    private fun sendAccount(sessionId: String, accountId: String) {
        emitLive(accountMessage(sessionId, accountId))
    }

    /**
     * This turn is being stopped by the IDE rather than by the person, so that the conversation can move
     * to another account.
     *
     * Every client needs telling, and none of them could work it out. An interrupt looks from the
     * outside exactly like a turn ending early: the feed captioned it "Worked 3s", the finished sound
     * played, a push went to the phone, and the tool cards the turn was in the middle of stayed running
     * with live clocks against a process about to be destroyed.
     *
     * Deliberately NOT the panel's own stop mark. That one also arms the red "kill the process" button
     * after eight seconds - which is the same eight seconds this move's own deadline uses, so a person
     * who pressed nothing would be offered a frightening button for a stop they did not ask for.
     */
    private fun sendTurnStopped(sessionId: String) {
        broadcast(
            sessionId,
            buildJsonObject {
                put("type", "turnStopped")
                put("sessionId", sessionId)
                put("reason", "account")
            }.toString(),
        )
    }

    /**
     * A live process is being replaced under a tab that was not saying anything - see
     * ClaudeSessions.onMoveDropping.
     *
     * Deliberately not `turnStopped`: no turn is being stopped here, and a client that captioned this as
     * an interrupted turn would be inventing one. What this actually says is narrower and enough - the
     * process is gone, so everything that was running inside it is gone with it, whatever the tab's own
     * status happens to be.
     */
    private fun sendProcessReplaced(sessionId: String) {
        broadcast(
            sessionId,
            buildJsonObject {
                put("type", "processReplaced")
                put("sessionId", sessionId)
            }.toString(),
        )
    }

    private fun accountMessage(sessionId: String, accountId: String): String =
        buildJsonObject {
            put("type", "account")
            put("sessionId", sessionId)
            put("accountId", accountId)
        }.toString()

    /**
     * Opening a past conversation: the process comes up with its transcript, and its saved events are
     * replayed into the feed - otherwise the tab would look empty although the agent remembers
     * everything.
     */
    fun resumeConversation(
        sessionId: String,
        conversationId: String,
        /**
         * What this conversation is called, as the history screen shows it - empty when the asking
         * client did not say. The tab wears it from the first second: resuming drops the name the tab
         * carried (it belongs to a conversation no longer in it), and a name that arrives any later than
         * this is a tab called "New chat" for as long as nobody writes into it.
         */
        title: String = "",
        titleSource: String = SessionSnapshot.TITLE_HEURISTIC,
    ) {
        if (conversationId.isEmpty()) return

        // The tab may not exist at all: every client draws its own first and asks afterwards, and this
        // list is what they are all redrawn from (see SessionRegistry.takeOver).
        val opened = tabs.takeOver(sessionId, title, titleSource)
        if (opened) {
            val tab = tabs.tabs().firstOrNull { it.id == sessionId }
            stats.noteSessionOpened(sessionId, parentId = null, groupId = tab?.groupId ?: sessionId, depth = tab?.depth ?: 0)
        }

        stats.noteResumed(sessionId, conversationId)
        conversations.resume(sessionId, conversationId)
        // The feed that was there described a different conversation: every client is told to drop it
        // rather than left showing something that no longer exists.
        resetJournal(sessionId)
        broadcastSessions()

        ApplicationManager.getApplication().executeOnPooledThread {
            // The end of the conversation rather than the whole of it: what comes before is asked for by
            // whoever is looking, page by page (see ClaudeHistory.opening for why the whole of it never
            // arrived at all on Windows).
            val page = ClaudeHistory.opening(project.basePath, conversationId)

            /**
             * The conversation carries on at its own model, not at the setting's. The setting is what a
             * NEW tab starts on; a past conversation was answered by a model of its own, and its messages
             * were sized to that model's window. Launched on the setting's, an old conversation held on a
             * million-token model came up on a two-hundred-thousand one: the CLI honestly reported a
             * window taken one and a half times over, the meter clamped it to a red 100%, and the first
             * message would have compacted a conversation nobody asked to compact. The CLI itself,
             * resumed without a model flag, carries on at the session's model - this does the same and
             * tells the panel which one it is, before the replay names it.
             */
            if (page.model.isNotEmpty()) {
                // What was adopted rather than what was written in the transcript: the account paying
                // today may have no access to that model, and then the conversation comes up on another
                // one (see ClaudeSessions.adoptModel). Saying the transcript's would leave the chip
                // naming a model the process is not running.
                sendModel(sessionId, conversations.adoptModel(sessionId, page.model))
            }

            page.lines.forEach { line -> onAgentLine(sessionId, line, replay = true) }

            // How much of the conversation went to the feed, and whether more of it is waiting above. The
            // count and the weight, never a line of it: this buffer travels in bug reports (see
            // DiagnosticsLog). It is here because the alternative was what actually happened - a feed that
            // came up empty on somebody else's machine with nothing anywhere to say whether the transcript
            // had been read at all.
            DiagnosticsLog.note(
                DiagnosticsLog.PANEL,
                "opened a past conversation: ${page.lines.size} messages, " +
                    "${page.lines.sumOf { it.length }} chars, more above: ${page.cursor != null}",
            )

            // The replay is over - the panel closes the work left unfinished inside it. The transcript
            // holds only messages, while a background subagent's result arrives as a separate system
            // event, so for its card it would never come at all: a tab opened from the history showed
            // past agents as working right now.
            //
            // The cursor travels along: it is both the answer to "is there anything above this" - the mark
            // over the feed is drawn by it - and the boundary the next page is asked for by. Worked out
            // here rather than guessed from the lines on screen, because the topmost of them may well be
            // one the transcript keeps no name for.
            broadcast(
                sessionId,
                buildJsonObject {
                    put("type", "replayFinished")
                    put("sessionId", sessionId)
                    page.cursor?.let { put("cursor", it) }
                }.toString(),
            )

            // The taken context window is asked of the conversation itself - and for that we bring it up
            // without waiting for the first message. The replay does not know this figure at all: the
            // transcript holds neither the system prompt with its tools nor the model's window size, and
            // a conversation on a "1M" model looked overflowing by it from the very first second.
            conversations.wake(sessionId)
            usage.refreshContext(sessionId)
        }
    }

    // --- The journal itself -------------------------------------------------------

    /**
     * Start a conversation's feed over - the conversation it described is gone.
     *
     * Called when a past conversation is opened in a tab: the process is torn down and raised again
     * with a transcript of its own (see ClaudeSessions.resume), and the feed that was there belongs to
     * something else now.
     */
    fun resetJournal(sessionId: String) {
        synchronized(lock(sessionId)) { journal(sessionId).reset() }
        streams[sessionId]?.clear()
        snapshots[sessionId]?.set(SessionSnapshot())
        // The tab now holds a different conversation: what was queued was meant for the one it replaced,
        // and saying it into this one would be answering a question nobody here asked.
        if (queued.clear(sessionId)) sendQueue(sessionId, emptyList())

        deliver(
            buildJsonObject {
                put("type", "sessionReset")
                put("sessionId", sessionId)
            }.toString(),
        )

        // A reset wipes what a client holds about this tab, and the effort is state rather than history
        // (see [sendEffort]) - so it has to be said again. Otherwise a tab that has just taken a
        // different conversation would be drawn by the setting, which by then may be somebody else's
        // choice made in another tab.
        conversations.effort(sessionId)?.let { sendEffort(sessionId, it) }
        conversations.model(sessionId)?.let { sendModel(sessionId, it) }
        // And whose subscription pays for it now - the account chosen on this machine, whatever this
        // conversation was billed to when it was written. Said again because the reset wiped it, and a
        // tab left undrawn here would claim whatever the client happened to hold before.
        sendAccount(sessionId, conversations.accountOf(sessionId))
        // And which conversation the tab holds now - the panel wrote that down the moment the past
        // conversation was picked, and this reset has just wiped it. The process names it again only
        // once it is up, seconds later or never (no executable, a sign-in needed), and until then a
        // second press on the same row of the history opened a second tab on one transcript, and a
        // search's jump into the conversation waited under its veil for a process that might not come.
        conversations.conversationIdOf(sessionId)?.let { emitLive(conversationMessage(sessionId, it)) }
    }

    private fun conversationMessage(sessionId: String, conversationId: String): String =
        buildJsonObject {
            put("type", "conversation")
            put("sessionId", sessionId)
            put("conversationId", conversationId)
        }.toString()

    fun snapshotOf(sessionId: String): SessionSnapshot = snapshot(sessionId).get()

    /**
     * A project-wide fact as it was last sent, by its type - the model catalogue, for instance.
     *
     * Kept for whoever is not a client of this hub and still has to draw a screen out of these: the
     * network agent builds a phone's list from them without joining the project as a client and being
     * handed the whole feed for it (see RemoteAgent.inventoryBody).
     */
    fun projectFact(type: String): String? = projectCache[type]

    /** What a client should come back with after a break - see [attach]. */
    fun lastSeq(sessionId: String): Long = journal(sessionId).lastSeq()

    /**
     * The tail of one conversation's journal, for the debug report a person may attach to their feedback.
     *
     * The journal is the conversation itself - every message, every answer, the contents of every file
     * that was read - and none of that leaves this machine. What reads this takes each entry apart for
     * its shape alone and writes a line of its own from it (see FeedbackReport). The budget is small
     * because what is worth looking at is the last few minutes: a report nobody can read through is a
     * report whose promise nobody can check.
     */
    fun journalTail(sessionId: String, maxEntries: Int, maxChars: Long): List<SessionJournal.Entry> =
        synchronized(lock(sessionId)) { journal(sessionId).since(0, maxEntries, maxChars) }

    /**
     * Permission cards are the one part of the snapshot that cannot be read off the messages: plans and
     * questions never travel as messages of their own - the card for them is drawn by the tool call
     * itself (see SessionPermissions).
     */
    fun notePending(sessionId: String, plans: Set<String>, asks: Set<String>) {
        val changed = snapshot(sessionId).getAndUpdate { current ->
            current.copy(pendingPlans = plans, pendingAsks = asks)
        }

        if (changed.pendingPlans != plans || changed.pendingAsks != asks) broadcastSessions()
    }

    // --- Wiring -------------------------------------------------------------------

    fun onPermissionRequest(listener: (String, PermissionChannel.ToolPermission) -> Unit) {
        permissionListener = listener
    }

    /** Lines the process said past the event stream - a lost sign-in arrives that way. */
    fun onDiagnostic(listener: (String, String) -> Unit) {
        synchronized(diagnostics) { diagnostics.add(listener) }
    }

    /**
     * Every line of the agent's stream, before it is wrapped and sent. The usage counter watches turn
     * boundaries by it, and from phase 2 on the network agent will too.
     */
    /**
     * Something happened that a person away from their desk might want to know about - see
     * NotificationReasons. Set by the network agent, which is the only thing that can act on it.
     */
    fun onNotification(listener: (sessionId: String, reason: String, target: String) -> Unit) {
        notificationListener = listener
    }

    /**
     * What a device away from this machine draws its list from has changed: a conversation started or
     * stopped working, one is waiting for a person, a tab was opened or closed.
     *
     * Pushed rather than asked for. The phone does ask, on a timer, because that same question is what
     * proves the line is alive - but a list that only moves when the timer comes round is a list that
     * lags by up to half a minute, and the whole point of the phone is the moment something needs
     * answering.
     */
    fun onInventoryChanged(listener: () -> Unit) {
        inventoryListener = listener
    }

    private fun targetOf(message: String): String =
        Regex("\"target\":\"([^\"]*)\"").find(message)?.groupValues?.get(1).orEmpty()

    fun onRawLine(listener: (String, String, Boolean) -> Unit) {
        synchronized(rawListeners) { rawListeners.add(listener) }
    }

    /**
     * The project-wide facts a joining client is caught up with, in a fixed order: whoever draws them
     * needs the project itself before anything that refers to it.
     */
    private fun projectMessages(): List<String> =
        PROJECT_ORDER.mapNotNull { type -> projectCache[type] }

    /**
     * The bracket a restored feed arrives inside. The interface applies everything between the two as
     * one change: a couple of thousand entries applied one at a time is a couple of thousand redraws,
     * and the panel already struggles with that on a long replay from disk.
     */
    private fun restoreStarted(sessionId: String, from: Long, truncated: Boolean): String =
        buildJsonObject {
            put("type", "restoreStarted")
            put("sessionId", sessionId)
            put("from", from)
            // Showing a stump in silence is not an option: the client draws an explicit mark instead.
            if (truncated) put("truncated", true)
        }.toString()

    private fun restoreFinished(sessionId: String, upTo: Long): String =
        buildJsonObject {
            put("type", "restoreFinished")
            put("sessionId", sessionId)
            put("upTo", upTo)
        }.toString()

    private fun journal(sessionId: String): SessionJournal =
        journals.getOrPut(sessionId) { SessionJournal() }

    private fun snapshot(sessionId: String): AtomicReference<SessionSnapshot> =
        snapshots.getOrPut(sessionId) { AtomicReference(SessionSnapshot()) }

    private fun stream(sessionId: String): SessionStream =
        streams.getOrPut(sessionId) { SessionStream() }

    private fun lock(sessionId: String): Any = locks.getOrPut(sessionId) { Any() }

    private fun messageType(json: String): String {
        val at = json.indexOf(TYPE_FIELD)
        if (at < 0) return ""

        val from = at + TYPE_FIELD.length
        val to = json.indexOf('"', from)
        return if (to < 0) "" else json.substring(from, to)
    }

    /**
     * The set of Claude accounts, or which one is current, changed somewhere on this machine.
     *
     * The register is the machine's while the figures hang off each project's own hub, so a hub that is
     * not told goes on drawing the previous account's rings and plan - for five minutes, until the
     * sign-in round comes round, or indefinitely with nothing else to prompt it.
     */
    fun accountsChanged() {
        accounts.sendList()
        auth.check()
    }

    /**
     * The register was changed in another IDE on this machine - see AccountsWatch.
     *
     * The list as it stands and nothing else. [accountsChanged] above re-asks the CLI who is signed in
     * and puts a usage question to every account, which is right when the change was made here and
     * pointless when it was read out of a file: nothing about this machine's sign-in has moved, and the
     * cost would be a process per account per project per open IDE on every press of Select next door.
     */
    fun accountsChangedElsewhere() = accounts.sendList(withHealth = false)

    override fun dispose() {
        clients.clear()
    }

    companion object {

        fun getInstance(project: Project): ClaudeSessionHub = project.service()

        /**
         * Every conversation hub already alive on this machine.
         *
         * For the one decision that belongs to the machine rather than to a window - which account pays
         * (see AccountDesk.use). ClaudePanels.everyPanel is not enough for it: a hub exists for every
         * project a phone has attached to (see RemoteAgent.attach), tool window or no tool window, and
         * those conversations were walking straight past the switch and going on being billed to the
         * account just left.
         *
         * Already alive is the point of getServiceIfCreated: raising a hub for a project nobody has
         * opened the panel in would start its schedules, its warm-up and its bridge for a conversation
         * that does not exist.
         */
        fun everyHub(tell: (ClaudeSessionHub) -> Unit) {
            for (project in ProjectManager.getInstance().openProjects) {
                if (project.isDisposed) continue

                runCatching { project.getServiceIfCreated(ClaudeSessionHub::class.java)?.let(tell) }
                    .onFailure { thisLogger().warn("A hub could not be told about the account", it) }
            }
        }

        private const val RESET_MARKER = "\"type\":\"conversation_reset\""

        /** The end of a turn - the one moment the context window and the usage have genuinely moved. */
        private const val RESULT_MARKER = "\"type\":\"result\""

        /** A conversation's process has come up with its transcript loaded - see the context above. */
        private const val INIT_MARKER = "\"subtype\":\"init\""

        private const val TYPE_FIELD = "\"type\":\""

        /** How the panel's own client names itself - see ClaudePanel. */
        const val PANEL_PREFIX = "panel-"

        /** And the relay's - one client here however many phones sit behind it. */
        const val RELAY_PREFIX = "relay-"

        /**
         * The order the project's facts are handed over in. Explicit rather than "whatever the map
         * iterates as": the interface builds its first screen out of these, and a sign-in state
         * arriving before the project it belongs to is a screen drawn twice.
         */
        private val PROJECT_ORDER = listOf(
            // First of all of them: everything after this is drawn in whatever language it names, and a
            // client that joins without it draws the lot in English and then redraws it.
            "locale",
            "init",
            "auth",
            // Right after the sign-in it qualifies: a client that joins without it cannot draw the menu
            // row, and a fact not listed here never reaches one at all. Deliberately NOT in
            // RemoteFeed.PROJECT_FACTS - a phone is not told about accounts, and the default-deny there
            // is what keeps it that way.
            "accounts",
            "modeAvailability",
            "project",
            "models",
            "usage",
            "files",
            "commandHints",
            "commands",
            "clients",
            "remoteState",
            "mcpServers",
            "plugins",
            "marketplaces",
        )
    }
}

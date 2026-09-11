package io.github.crmapache.amazingclaudecode.claude

import com.intellij.ide.BrowserUtil
import com.intellij.ide.util.PropertiesComponent
import com.intellij.openapi.Disposable
import com.intellij.openapi.application.ApplicationManager
import com.intellij.openapi.diagnostic.thisLogger
import com.intellij.openapi.project.Project
import com.intellij.openapi.util.Disposer
import com.intellij.util.concurrency.AppExecutorUtil
import io.github.crmapache.amazingclaudecode.editor.UnsavedEdits
import io.github.crmapache.amazingclaudecode.project.ProjectFacts
import io.github.crmapache.amazingclaudecode.sound.AlertSounds
import java.util.concurrent.TimeUnit
import kotlinx.serialization.json.Json
import kotlinx.serialization.json.JsonArray
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.JsonPrimitive
import kotlinx.serialization.json.add
import kotlinx.serialization.json.booleanOrNull
import kotlinx.serialization.json.addJsonObject
import kotlinx.serialization.json.buildJsonObject
import kotlinx.serialization.json.contentOrNull
import kotlinx.serialization.json.jsonPrimitive
import kotlinx.serialization.json.put
import kotlinx.serialization.json.putJsonArray
import kotlinx.serialization.json.putJsonObject
import javax.xml.parsers.DocumentBuilderFactory

/**
 * What surrounds the conversations: the project's own facts, the files and commands the input field
 * hints with, the MCP servers, the plugins and the marketplaces.
 *
 * All of it belongs to the project rather than to a window, and all of it costs a process to learn -
 * `claude mcp list` and `claude plugin list` are separate runs of the CLI, and the file walk touches
 * a whole repository. Kept in the panel, that work was redone from scratch every time the panel was
 * re-opened, and with a second client it would be redone on every join. Here it is done once and the
 * answer is remembered by the hub (see ClaudeSessionHub.broadcastProject).
 */
internal class ProjectCatalog(
    private val project: Project,
    private val hub: ClaudeSessionHub,
) {

    /**
     * The conversation and the deadline up to which returning focus to the IDE should nudge the MCP
     * status ahead of schedule - see [scheduleMcpRefresh].
     */
    @Volatile
    var pendingMcpRefreshSessionId: String? = null
        private set

    @Volatile
    var pendingMcpRefreshUntil: Long = 0L
        private set

    // --- The command hints ----------------------------------------------------------

    /**
     * The plugins as `claude plugin list` last named them - the scan needs nothing of them but where
     * they were installed, and asking is a whole process (see [refreshCommandHints]).
     *
     * An answer that succeeded and named none is written here as readily as any other: guarding this
     * against emptiness meant it could never empty at all, so a plugin removed at lunchtime went on
     * being offered by the hint until the IDE was restarted, while the plugins screen next to it told
     * the truth. A run that FAILED is a different thing and leaves this alone - the CLI reports that
     * separately (see ClaudePlugin.installed).
     *
     * Written from the CLI's thread and read from the hints thread, which is why it is a reference
     * rather than a mutable list: a walk reads it once, and a list that changed underneath makes the
     * next fingerprint differ, so the round after picks it up.
     */
    @Volatile
    private var installedPlugins: List<InstalledPlugin> = emptyList()

    /** What the disk looked like when the hints were last read - see ClaudeCommandHints.scanIfChanged. */
    @Volatile
    private var hintStamp: String? = null

    /** And what was last sent out of it - see [SentHints]. */
    @Volatile
    private var sentHints: SentHints = SentHints.NOTHING

    /** How the fast round is pacing itself against a disk that answers slowly - see [HintPace]. */
    @Volatile
    private var hintPace: HintPace = HintPace.QUICK

    /**
     * Whether this project's last walk was already over its ceiling of candidates - the note about it is
     * written on the edge rather than every round (see ClaudeCommandHints).
     *
     * Here rather than in the walk itself, for the same reason the fingerprint is here: the walk belongs
     * to a project, and a second open project walks its own disk. One memory shared between the two,
     * with one of them over the ceiling and one under it, turned every round into an edge and filled the
     * report buffer with that one line.
     */
    private val hintCeilingSaid = java.util.concurrent.atomic.AtomicBoolean(false)

    /**
     * How many hint walks are queued or running. One at a time - and a fast round that finds one there
     * already is dropped rather than queued. The unconditional minute round is never dropped, so it can
     * queue behind a walk in progress: a couple a minute at the very worst, which is what its own note
     * further down explains. See [onHintsThread].
     */
    private val hintTasks = java.util.concurrent.atomic.AtomicInteger(0)

    /**
     * The one thread every hint walk happens on - the fast round, the minute round and the warm-up
     * alike, so that the fingerprint and the last thing sent have a single writer.
     *
     * The thread comes out of the application's shared pool, with a single permit on this executor. So a
     * walk stuck on a 9P share or a sleeping external drive does occupy a pooled thread while it hangs,
     * and holds the only permit here, delaying this executor's own scheduled tick behind it. Accepted
     * rather than overlooked: one permit is what gives the fingerprint and the last-sent map a single
     * writer, walks are few and cost milliseconds on any disk that is answering, and a thread of our own
     * per project is a steep price for that. The fast round drops itself when one is already running,
     * which is what keeps a hung walk from collecting thirty more behind it.
     */
    private val hints = AppExecutorUtil.createBoundedScheduledExecutorService("ACC command hints", 1)

    // --- The project's own facts ---------------------------------------------------

    /**
     * The language in force, as a fact of its own rather than only as part of `init`.
     *
     * `init` carries the working directory and never leaves this machine (see RemoteFeed), so a phone
     * would never learn the language from it. And a machine-wide setting changed in one window has to
     * reach the others: a fact sent on every change does both with one message.
     */
    fun sendLocale() {
        hub.broadcastProject(
            buildJsonObject {
                put("type", "locale")
                put("language", ClaudePreferences.language)
                put("ideLanguage", IdeLanguage.current())
            }.toString(),
        )
    }

    /**
     * The no-stress colour mode, as a fact of its own beside the language above - and for the same two
     * reasons. A phone is never sent `init`, so it would never learn the mode at all and would go on
     * showing a red bar to somebody who switched the red off; and the setting is machine-wide, so a
     * second window has to hear about the change without waiting for a restart.
     */
    fun sendCalmColors() {
        val vivid = ClaudePreferences.gaugeVivid
        hub.broadcastProject(
            buildJsonObject {
                put("type", "calmColors")
                put("vivid", vivid)
                // For a client whose bundle is older than this plugin: the relay serves the phone and is
                // deployed on its own, so a machine updated first is an ordinary day rather than an edge
                // case. Halfway down is the only defensible line for a switch - see the field in
                // protocol.ts, where both wrong answers are spelled out.
                put("on", vivid < ClaudePreferences.GAUGE_VIVID_FULL / 2)
            }.toString(),
        )
    }

    /**
     * The models added by hand, as a fact of their own beside the two above - and for the same two
     * reasons: a phone is never sent `init`, and a list changed in one window has to reach the others
     * without waiting for a restart.
     *
     * Beside the CLI's catalogue rather than inside it (see ProjectUsage.sendModels). The catalogue is
     * answered by an account and may never arrive at all - which is exactly the machine this list exists
     * for - and a list folded into a message that never comes is a list nobody ever sees.
     */
    fun sendCustomModels() {
        hub.broadcastProject(
            buildJsonObject {
                put("type", "customModels")
                putJsonArray("models") { ClaudePreferences.customModels.forEach { add(it) } }
            }.toString(),
        )
    }

    /**
     * What a new tab starts with: the two pins and the permission mode.
     *
     * A message of its own beside `init`, for the reason the colour mode has one - the setting is
     * machine-wide, so a change made in one window has to reach the others without waiting for a
     * restart (see announceNewTabDefaults in SessionCommands).
     *
     * The pins travel as they are, empty included: empty is the answer that means "whatever was last
     * chosen", which is what the panel does when nothing is pinned. The mode is resolved rather than
     * passed on, exactly as it is in `init` - the selector has to name the value the process will
     * genuinely come up with, and never having chosen one means Claude Code's own (see
     * PermissionDefaultMode).
     */
    fun sendNewTabDefaults() {
        hub.broadcastProject(
            buildJsonObject {
                put("type", "newTabDefaults")
                put("model", ClaudePreferences.newTabModel)
                put("effort", ClaudePreferences.newTabEffort)
                put(
                    "mode",
                    PermissionModes.resolve(
                        ClaudePreferences.mode,
                        fallback = PermissionDefaultMode.of(project.basePath),
                    ),
                )
            }.toString(),
        )
    }

    fun sendInit() {
        val preferences = ClaudePreferences.snapshot()

        hub.broadcastProject(
            buildJsonObject {
                put("type", "init")
                put("projectName", project.name)
                put("workingDirectory", project.basePath.orEmpty())
                ProjectFacts.gitBranch(project)?.let { put("gitBranch", it) }
                // The panel's own version, shown at the foot of the menu. Asked of the platform rather
                // than kept as a constant of ours: a second copy of a number that Gradle already patches
                // into plugin.xml is a number that will one day disagree with it.
                //
                pluginVersion?.let { put("pluginVersion", it) }
                // The choice of model and the rest outlives an IDE restart: looking for it again after
                // every opening is the same as not saving it at all.
                putJsonObject("preferences") {
                    put("model", preferences.model)
                    put("effort", preferences.effort)
                    // What a new tab is PINNED to, beside what was last chosen above. Two values rather
                    // than one, and the empty one is the point: empty means "whatever was last chosen",
                    // so the panel draws an untouched tab by the pick above and a pinned one by these
                    // (see ClaudePreferences.newTabModel).
                    put("newTabModel", preferences.newTabModel)
                    put("newTabEffort", preferences.newTabEffort)
                    // With the same value the process will genuinely come up with: the selector in the
                    // panel has to tell the truth from the first second. Never chosen at all - we take
                    // Claude Code's own default, the way the terminal takes it (see
                    // PermissionDefaultMode).
                    put(
                        "mode",
                        PermissionModes.resolve(
                            preferences.mode,
                            fallback = PermissionDefaultMode.of(project.basePath),
                        ),
                    )
                    if (preferences.composerLayout.isNotEmpty()) put("composerLayout", preferences.composerLayout)
                    // Sent only when chosen, like the layout above: an absent value means the panel's own
                    // default rather than "never fold", and the two must not be confused.
                    if (preferences.pasteCollapse.isNotEmpty()) put("pasteCollapse", preferences.pasteCollapse)
                    // And which key sends. Sent unconditionally, unlike the two above: an empty value
                    // says "Enter", which is a real answer here rather than an absent one - a panel
                    // that has never been asked sends on Enter (see normalizeSendKey).
                    put("sendKey", preferences.sendKey)
                    // And how much colour the gauges keep. Unconditional like the send key: a hundred is
                    // an answer rather than a missing one - a panel nobody has asked draws the ladder.
                    put("calmVivid", preferences.gaugeVivid)
                    // Two values rather than one, and the empty one is not the useless one: `language`
                    // is the explicit choice and is usually empty, `ideLanguage` is what the IDE itself
                    // is set to. Empty means "speak whatever the IDE speaks", and the picker needs the
                    // second value to say which language that is right now instead of promising
                    // something unnamed.
                    put("language", preferences.language)
                    put("ideLanguage", IdeLanguage.current())
                }
                // What the improve button asks for. Both texts: the screen shows the built-in one as what
                // is in force while nothing of one's own has been put in, and it is also what the restore
                // button restores - a default the screen cannot name is a default nobody edits.
                putJsonObject("improve") {
                    put("instructions", preferences.improveInstructions)
                    put("builtIn", PromptImprover.BUILT_IN_INSTRUCTIONS)
                }
                // The sound settings are also a choice made once.
                putJsonObject("sounds") {
                    putJsonArray("muted") {
                        ClaudePreferences.mutedSounds.filter { it in AlertSounds.ids }.forEach { add(it) }
                    }
                    putJsonObject("volumes") {
                        ClaudePreferences.soundVolumes
                            .filterKeys { it in AlertSounds.ids }
                            .forEach { (id, volume) -> put(id, volume) }
                    }
                }
            }.toString(),
        )
    }

    fun refreshBranch() {
        ApplicationManager.getApplication().executeOnPooledThread {
            val branch = ProjectFacts.gitBranch(project) ?: return@executeOnPooledThread

            hub.broadcastProject(
                buildJsonObject {
                    put("type", "project")
                    put("gitBranch", branch)
                }.toString(),
            )
        }
    }

    /**
     * The current branch's pull request for the bottom line. We send the field even when there is no PR
     * (as an empty string) rather than stay silent - otherwise the webview side cannot tell "the PR has
     * just been closed or merged" from "this message is not about a PR at all", see reducePanel.
     */
    fun refreshPullRequest() {
        ApplicationManager.getApplication().executeOnPooledThread {
            val pullRequest = ProjectFacts.pullRequest(project)

            hub.broadcastProject(
                buildJsonObject {
                    put("type", "project")
                    put("pullRequest", pullRequest?.number.orEmpty())
                    put("pullRequestUrl", pullRequest?.url.orEmpty())
                }.toString(),
            )
        }
    }

    /** Walking the disk is not instant on a big repository, so it happens in the background. */
    fun refreshFiles() {
        AppExecutorUtil.getAppExecutorService().submit {
            val files = ClaudeFileSearch.list(project.basePath)

            hub.broadcastProject(
                buildJsonObject {
                    put("type", "files")
                    putJsonArray("files") { files.forEach { file -> add(file) } }
                }.toString(),
            )
        }
    }

    /**
     * The names, descriptions and argument syntax of slash commands - out of the files on disk (see
     * ClaudeCommandHints). The list of installed plugins is needed only for their installPath, so we
     * take the light `plugin list` without `--available`.
     *
     * The disk is walked twice on purpose, and that is not the same as speaking twice. The first walk
     * does not wait for the plugin list: that list is a separate `claude` run - a whole Node start-up
     * that can time out, fail or answer in a shape we do not expect - and hanging the disk scan on its
     * success meant that one failure took the project's own commands with it. The panel then had nothing
     * to hint with until the agent named its own list, that is, until the first message of the
     * conversation had been sent: a person who had just installed the plugin typed "/" and did not find
     * their own commands.
     *
     * The first walk goes out with the plugins we already know rather than with none: the map replaces
     * the panel's wholesale, so every round used to blank out every plugin command's description and put
     * it back a moment later. The second speaks only if the plugin list changed the map, so in the
     * settled state exactly one message a minute leaves here. Two of them is the first round after the
     * IDE starts, when the plugin list arrives for the first time.
     *
     * This is the UNCONDITIONAL road - the frontmatter of every file is read, and the message goes out
     * even when nothing has changed. Both halves of that are load-bearing. Reading: a file system whose
     * timestamps are whole seconds does not move the fingerprint when a word is replaced by one of the
     * same length, so a round under the fingerprint would never bring that edit at all. Sending:
     * `broadcastProject` does not throw, a client that failed to receive is only logged, and a frame
     * lost on the way to the panel is a thing this plugin already knows happens (see channelLoss) - one
     * small message a minute is what heals it. What the fast round below buys is that those thirty
     * other ticks a minute cost a stat and say nothing.
     */
    fun refreshCommandHints() {
        onHintsThread { sweepCommandHints(installedPlugins, everything = true, heal = true) }

        ClaudePlugin.installed(
            project.basePath,
            onResult = { installed ->
                installedPlugins = installed
                // Reads everything, says nothing new: the pair used to be two messages a minute saying
                // the same thing, because a plugin list that has not changed changes no hint either.
                onHintsThread { sweepCommandHints(installed, everything = true) }
            },
            onError = { thisLogger().warn("Couldn't list plugins for command hints: $it") },
        )
    }

    /**
     * The fast round: a skill written while a conversation is running reaches the hint in seconds.
     *
     * Measured on CLI 2.1.263, twice: the CLI itself picks a new command up somewhere between t+1.6 s and
     * t+4.2 s, so at two seconds the hint and the CLI catch up with the file together. The panel used to learn about it
     * only from the minute round above, with no way to ask sooner - and up to a minute of "the skill I
     * have just written does not exist" is what the whole of this is about.
     *
     * Nothing here starts a process: the plugin list stays on the minute round.
     */
    private fun pollCommandHints() {
        onHintsThread(skippable = true) { sweepCommandHints(installedPlugins, everything = false) }
    }

    /**
     * One walk, and what to do about it.
     *
     * A walk that could not list a directory it can see is not the truth about the disk, and the honest
     * test of that is not the failure itself but what it cost: only a walk that LOST names we had
     * already sent is thrown away. A directory that is permanently unreadable (mode 0300, a plugin
     * folder owned by root) fails every single time, and refusing to broadcast on that alone would
     * leave the hint empty for the whole life of the project - the very defect this fixes, only worse.
     *
     * [everything] reads the frontmatter whatever the fingerprint says; [heal] sends the answer whether
     * it changed or not. They are not the same switch: the minute round asks for both, but only once -
     * the second half of it, after the plugins have answered, reads everything and speaks only if that
     * changed something, or the pair would be two messages a minute saying one thing.
     */
    private fun sweepCommandHints(installed: List<InstalledPlugin>, everything: Boolean, heal: Boolean = false) {
        // Resolved here, inside the task, and never kept: on a WSL project the platform answers with
        // this machine's home unless it is asked off a pooled thread, and a home computed once at
        // construction would leave that project reading a stranger's personal commands for ever. Asking
        // again costs nothing - ClaudeHome caches the answer per distribution (see its warmUp).
        val home = ClaudeHome.of(project.basePath)
        val since = if (everything) null else hintStamp
        val look = ClaudeCommandHints.scanIfChanged(home, project.basePath, installed, since, hintCeilingSaid)
        // Only the fast round paces itself: the minute one reads every file by design, and letting that
        // set the poll's pace would be timing one thing to slow another. It paces itself after EVERY
        // round, the ones that found nothing included - and those are nearly all of them. Written below
        // the early return, the brake was fed only by the rare round that found a change, so on a quiet
        // disk it was never fed at all: exactly backwards, since a quiet disk is what it walks.
        if (!everything) hintPace = HintPace.after(hintPace, look.walkNanos)
        val scan = look.scan ?: return

        val found = scan.hints.keys.toSet()
        if (!scan.whole && !sentHints.believes(found)) {
            // Held back rather than dropped for good: patience runs out, or a directory that has closed
            // for ever would silence the hint for the life of the project. See [SentHints].
            sentHints = sentHints.heldBack()
            return
        }
        // A walk that got through restores the patience, whatever it goes on to do with the map.
        sentHints = sentHints.believed()

        val fresh = canonicalHints(scan.hints)
        hintStamp = scan.stamp
        if (!heal && fresh == sentHints.canonical) return

        hub.broadcastProject(
            buildJsonObject {
                put("type", "commandHints")
                putJsonObject("hints") {
                    scan.hints.forEach { (id, hint) ->
                        putJsonObject(id) {
                            put("description", hint.description)
                            put("argumentHint", hint.argumentHint)
                        }
                    }
                }
            }.toString(),
        )

        // Only once the fact is in the hub's cache, which is what a client joining later is caught up
        // from (see ClaudeSessionHub.broadcastProject). What an exception in between costs is a minute,
        // not the life of the project: the unconditional round above re-reads and re-sends whatever the
        // fingerprint says, so recovery does not wait for anything on disk to move.
        sentHints = SentHints.of(fresh, found)
    }

    /**
     * What the hint map is compared by - the same content, in an order that does not depend on the disk.
     *
     * Never the serialised message: `listFiles` promises no order, the map keeps the walk's, and the one
     * thing that decides whether the panel is spoken to must not drift with it. The fingerprint sorts a
     * copy for exactly the same reason.
     */
    private fun canonicalHints(hints: Map<String, CommandHint>): String =
        hints.entries.sortedBy { it.key }.joinToString("\n") { (id, hint) ->
            "$id\t${hint.description}\t${hint.argumentHint}"
        }


    /**
     * The hints, all of them, on one thread and never queued up behind themselves.
     *
     * One at a time, because the fingerprint and the last thing sent are a pair and two rounds with
     * different plugin lists would let the loser of the race write its fingerprint last, leaving the
     * panel with the other one's map and nothing to correct it.
     *
     * The two-second round is [skippable] - dropped rather than queued, because file I/O does not answer
     * to interruption: a walk stuck on a dead share for a minute would otherwise collect a task per tick
     * and run them all, in full, the moment the share came back. The minute round is not: it is the one
     * that heals a lost frame and the one that brings an edit the fingerprint cannot see, and dropping
     * it because a poll happened to be walking is how the healing quietly stops healing. One a minute
     * cannot pile up the way thirty can.
     */
    private fun onHintsThread(skippable: Boolean = false, work: () -> Unit) {
        if (skippable && hintTasks.get() > 0) return
        hintTasks.incrementAndGet()

        // A throw inside would cancel a scheduled task for good, so nothing is allowed out of here; and
        // the counter is released whatever happens, or one failed walk would end the hint's life.
        runCatching {
            hints.execute {
                try {
                    runCatching(work).onFailure { thisLogger().warn("Couldn't refresh the command hints", it) }
                } finally {
                    hintTasks.decrementAndGet()
                }
            }
        }.onFailure { hintTasks.decrementAndGet() }
    }

    /**
     * The names of the slash commands themselves, as the agent last named them.
     *
     * The catalogue lives in the process rather than on disk: the MCP servers' commands
     * (`/mcp__server__prompt`) are asked of the servers at start-up and named only in `system:init`,
     * that is, after the first message of a conversation has been sent. Until then the hint knew
     * nothing about them, and a panel just opened answered a command typed from memory with "Unknown
     * command" - the very thing the hint exists to prevent.
     *
     * So the list heard once is kept with the project (in its workspace file, next to the rest of what
     * belongs to this checkout rather than to the user) and handed to the panel the moment it opens.
     * A stale entry is possible - an MCP server switched off since - and it costs one refusal at worst,
     * while it is corrected by the very next start-up (see [noteCommands]). An empty hint costs a
     * refusal every time.
     */
    fun sendCommands() {
        val remembered = PropertiesComponent.getInstance(project).getList(COMMANDS_KEY).orEmpty()
        if (remembered.isEmpty()) return

        broadcastCommands(remembered)
    }

    /**
     * A line of a conversation's stream: if it is a process reporting what it came up with, the command
     * catalogue in it is worth keeping (see [sendCommands]). Everything else passes through untouched -
     * the check inside is a substring search, because this runs on every line of every stream.
     */
    fun noteCommands(line: String) {
        val names = ClaudeCommandNames.of(line) ?: return

        val store = PropertiesComponent.getInstance(project)
        if (store.getList(COMMANDS_KEY).orEmpty() == names) return

        store.setList(COMMANDS_KEY, names)
        // Said out loud rather than left for the next opening: the conversation that has just started
        // knows the list from its own event, the tab beside it and a phone across the city do not.
        broadcastCommands(names)
    }

    private fun broadcastCommands(names: List<String>) {
        hub.broadcastProject(
            buildJsonObject {
                put("type", "commands")
                putJsonArray("commands") { names.forEach { add(it) } }
            }.toString(),
        )
    }

    /** Reading the history folder touches the disk, so it happens in the background. */
    fun sendHistory(clientId: String) {
        ApplicationManager.getApplication().executeOnPooledThread {
            val entries = ClaudeHistory.list(project.basePath)

            // Addressed at whoever asked rather than broadcast: this is a dialog someone opened, and it
            // is of no interest to anyone else watching the same project.
            hub.emitTo(
                clientId,
                buildJsonObject {
                    put("type", "history")
                    putJsonArray("conversations") {
                        for (entry in entries) {
                            addJsonObject {
                                put("id", entry.id)
                                put("title", entry.title)
                                put("updatedAt", entry.updatedAt)
                                put("messages", entry.messages)
                                // Where the name came from: a conversation opened in a tab keeps it,
                                // and a guess is worth replacing with the model's own name once the
                                // conversation carries on (see ClaudeSession.requestTitle).
                                put(
                                    "titleSource",
                                    if (entry.named) SessionSnapshot.TITLE_LLM else SessionSnapshot.TITLE_HEURISTIC,
                                )
                            }
                        }
                    }
                }.toString(),
            )
        }
    }

    /**
     * A page of this conversation's messages older than what the client already has - read straight off
     * the transcript Claude Code keeps for it (see ClaudeHistory.page), not off the in-memory journal:
     * that one exists to protect the live transport and forgets its own beginning long before the disk
     * does (see ClaudeSessionHub.CatchUp). Addressed at whoever asked, like [sendHistory] above - it is a
     * page turned by one reader, not a change to the conversation itself.
     */
    fun sendHistoryPage(clientId: String, sessionId: String, before: String?) {
        val conversationId = hub.conversations.conversationIdOf(sessionId)
        if (conversationId == null) {
            hub.emitTo(
                clientId,
                buildJsonObject {
                    put("type", "historyPage")
                    put("sessionId", sessionId)
                    putJsonArray("entries") {}
                    // The boundary is echoed even here: the reader tells one page from another by it, and
                    // an answer that names none looks to it like an answer to somebody else's question.
                    if (before != null) put("before", before)
                }.toString(),
            )
            return
        }

        ApplicationManager.getApplication().executeOnPooledThread {
            val page = ClaudeHistory.earlier(project.basePath, conversationId, before, hub.isLocal(clientId))

            hub.emitTo(
                clientId,
                buildJsonObject {
                    put("type", "historyPage")
                    put("sessionId", sessionId)
                    putJsonArray("entries") {
                        for (line in page.lines) add(Json.parseToJsonElement(line))
                    }
                    if (page.cursor != null) put("cursor", page.cursor)
                    if (before != null) put("before", before)
                }.toString(),
            )
        }
    }

    /**
     * What one agent of a workflow did, read off that agent's own transcript (see [WorkflowAgents]).
     *
     * Addressed at whoever asked, like the page above: one person unfolded one line, and the other
     * windows watching this project are not showing it. Off the event thread for the same reason too -
     * an agent of a code review writes a megabyte, and the thread this arrived on carries every message
     * the panel has.
     *
     * The conversation is the tab's own, and it may well have none: a workflow that ran in a tab
     * emptied since has left its files under the conversation it ran in, which is what the search below
     * falls back to.
     */
    fun sendAgentTranscript(clientId: String, sessionId: String, agentId: String) {
        val conversationId = hub.conversations.conversationIdOf(sessionId)

        ApplicationManager.getApplication().executeOnPooledThread {
            val transcript = WorkflowAgents.of(project.basePath, conversationId, agentId)

            hub.emitTo(
                clientId,
                buildJsonObject {
                    put("type", "agentTranscript")
                    put("sessionId", sessionId)
                    put("agentId", agentId)
                    put("found", transcript.found)
                    if (transcript.prompt.isNotEmpty()) put("prompt", transcript.prompt)
                    if (transcript.steps.isNotEmpty()) {
                        putJsonArray("steps") { for (step in transcript.steps) add(step) }
                    }
                    if (transcript.output.isNotEmpty()) put("output", transcript.output)
                    if (transcript.truncated) put("truncated", true)
                }.toString(),
            )
        }
    }

    // --- The improve button --------------------------------------------------------

    /**
     * The draft in the input field, rewritten (see [PromptImprover]).
     *
     * Addressed at whoever asked rather than broadcast, like the history above: a draft is one person's
     * unsent message, and the other windows watching this project have no business being handed it.
     *
     * An answer always goes back, a failure included - the button spins while it waits, and silence would
     * leave it spinning until the panel is reloaded.
     */
    fun improvePrompt(
        clientId: String,
        sessionId: String,
        id: String,
        draft: String,
        attachments: List<String>,
        rejected: List<String>,
    ) {
        // Without a number there is nobody to answer: the panel matches the answer to the press by it,
        // and applies nothing it cannot match.
        if (id.isBlank()) return

        PromptImprover.improve(
            workingDirectory = project.basePath,
            accountId = hub.conversations.accountOf(sessionId),
            draft = draft,
            attachments = attachments,
            rejected = rejected,
            onError = { message -> sendImproved(clientId, sessionId, id, error = shortError(message)) },
            onResult = { text -> sendImproved(clientId, sessionId, id, text = text) },
        )
    }

    private fun sendImproved(clientId: String, sessionId: String, id: String, text: String? = null, error: String? = null) {
        hub.emitTo(
            clientId,
            buildJsonObject {
                put("type", "promptImproved")
                put("sessionId", sessionId)
                put("id", id)
                text?.let { put("text", it) }
                error?.let { put("error", it) }
            }.toString(),
        )
    }

    /**
     * A failure as one line under the input field. The CLI can be verbose when it is unhappy - a stack of
     * a rate limit, a whole usage page - and none of that fits in the strip where it has to be read.
     */
    private fun shortError(message: String): String {
        val line = message.lineSequence().map { it.trim() }.firstOrNull { it.isNotEmpty() } ?: "Could not rewrite the prompt."
        return if (line.length > ERROR_LIMIT) "${line.take(ERROR_LIMIT)}…" else line
    }

    // --- Bash mode -----------------------------------------------------------------

    /**
     * A command from the input field typed through "!": we run it ourselves, in the project's working
     * directory, and return its output (see [ShellCommand]).
     *
     * On a pool rather than the interface thread: a command may run for minutes, and the panel has to
     * stay alive the whole time - the card in the feed is already drawn and waiting for a result.
     */
    fun runShellCommand(clientId: String, sessionId: String, id: String, command: String) {
        // Without a number there is nobody to answer: the card in the feed is found by exactly that.
        if (id.isBlank()) return

        // An empty command, on the other hand, gets an answer rather than silence: the card is already
        // standing in the feed and without one would stay "running" until the end of the conversation -
        // there is nothing to stop or remove it with.
        if (command.isBlank()) {
            sendBashResult(
                clientId,
                sessionId,
                id,
                ShellCommand.Result(exitCode = -1, stdout = "", stderr = "Empty command."),
            )
            return
        }

        ApplicationManager.getApplication().executeOnPooledThread {
            // A command through "!" reads the files off the disk exactly as the agent does, and a person
            // running `git diff` right after fixing a line means the line they just fixed - see
            // [UnsavedEdits]. The IDE saves before running anything of its own for the same reason.
            UnsavedEdits.flush(project)
            sendBashResult(clientId, sessionId, id, ShellCommand.run(command, project.basePath))
        }
    }

    private fun sendBashResult(clientId: String, sessionId: String, id: String, result: ShellCommand.Result) {
        hub.emitTo(
            clientId,
            buildJsonObject {
                put("type", "bashResult")
                put("sessionId", sessionId)
                put("id", id)
                put("exitCode", result.exitCode)
                put("stdout", result.stdout)
                put("stderr", result.stderr)
            }.toString(),
        )
    }

    // --- MCP -----------------------------------------------------------------------

    /**
     * What the panel knows about MCP - the same thing `/mcp` shows in a terminal: who is connected, who
     * needs a sign-in, who failed and why, where each one came from.
     *
     * We ask the conversation rather than parse the output of `claude mcp list`: the servers are raised
     * and held by the conversation's process, and only it knows their live state. The conversation is
     * brought up for this - as in the terminal, where `/mcp` is asked of a running session (see
     * ClaudeSessions.mcpStatus).
     */
    fun refreshMcp(sessionId: String, ifRunning: Boolean = false) {
        hub.conversations.mcpStatus(
            sessionId,
            onResult = { status -> sendMcpServers(status) },
            onFailure = { error -> sendMcpActionResult(false, error) },
            ifRunning = ifRunning,
        )
    }

    /**
     * Reconnecting one server. This is also the "try again" for a failed one: the CLI raises it anew by
     * the same request.
     */
    fun reconnectMcp(sessionId: String, server: String) {
        if (server.isEmpty()) return

        hub.conversations.mcpReconnect(
            sessionId,
            server,
            onResult = {
                sendMcpActionResult(true, "Reconnecting $server…")
                // Not at once: the handshake with a server takes seconds, and a status asked right away
                // would show the previous one.
                scheduleMcpRefresh(sessionId, MCP_RECONNECT_REFRESH_SECONDS)
            },
            onFailure = { error -> sendMcpActionResult(false, error) },
        )
    }

    /**
     * Signing in to a server that requires it - the same as "Authenticate" in the terminal's `/mcp`.
     *
     * The CLI hands over an address and says whether it is waiting for the browser's callback itself: for
     * an OAuth server it raises a handler inside the conversation's process, on this machine's loopback,
     * and the page has to be opened here - so the panel opens it, and a phone is told the sign-in stays
     * at the desk. A claude.ai connector is different (`callbackExpected: false` - measured on 2.1.263):
     * it is signed in on claude.ai itself and nothing comes back to this machine, so the address goes to
     * whoever asked, and a phone opens it in its own browser.
     *
     * About the sign-in's end the CLI sends no separate event either way, so the status is asked for
     * again a few times afterwards.
     */
    fun authenticateMcp(sessionId: String, server: String, clientId: String = "", asker: String = clientId) {
        if (server.isEmpty()) return

        val local = clientId.isEmpty() || hub.isLocal(clientId)

        hub.conversations.mcpAuthenticate(
            sessionId,
            server,
            onResult = { response ->
                val url = response["authUrl"]?.jsonPrimitive?.contentOrNull.orEmpty()
                val callbackHere = response["callbackExpected"]?.jsonPrimitive?.booleanOrNull != false

                if (url.isEmpty()) {
                    // No sign-in was needed - the server let it through, and the status will show that.
                    sendMcpActionResult(true, "$server is signed in.")
                    scheduleMcpRefresh(sessionId, MCP_AUTH_FIRST_REFRESH_SECONDS)
                    return@mcpAuthenticate
                }

                if (!local && callbackHere) {
                    // The page would send the person's browser back to a port of this machine, which a
                    // phone does not have. Said rather than attempted: a sign-in that ends on a dead
                    // redirect looks like a sign-in that failed for no reason.
                    sendMcpActionResult(false, "Signing in to $server ends in a browser on the machine with the IDE - finish it at the desk.")
                    return@mcpAuthenticate
                }

                if (local) {
                    BrowserUtil.browse(url)
                    sendMcpActionResult(true, "Finish signing in to $server in the browser - the list updates itself.")
                } else {
                    // The address to the one device that asked, not to the room: it is a sign-in somebody
                    // opened, of no interest to the other phones watching this project.
                    hub.emitTo(
                        clientId,
                        buildJsonObject {
                            put("type", "mcpSignIn")
                            put("name", server)
                            put("url", url)
                        }.toString(),
                        asker,
                    )
                }

                for (delay in MCP_AUTH_REFRESH_SECONDS) scheduleMcpRefresh(sessionId, delay)
            },
            onFailure = { error -> sendMcpActionResult(false, error) },
        )
    }

    fun addMcp(sessionId: String, name: String, command: String, transport: String?) {
        ClaudeMcp.add(
            project.basePath,
            name = name,
            commandOrUrl = command,
            transport = transport,
            onResult = { message ->
                sendMcpActionResult(true, message)
                // An added server comes up only in a new process: the config is read at launch, a live
                // conversation cannot be handed it.
                refreshMcpAfterRestart(sessionId)
            },
            onError = { error -> sendMcpActionResult(false, error) },
        )
    }

    fun removeMcp(sessionId: String, name: String) {
        ClaudeMcp.remove(
            project.basePath,
            name = name,
            onResult = { message ->
                sendMcpActionResult(true, message)
                refreshMcpAfterRestart(sessionId)
            },
            onError = { error -> sendMcpActionResult(false, error) },
        )
    }

    /**
     * The servers' config is read at process launch, so an added or removed server is visible only to a
     * new one: we restart the conversation - the transcript stays, the same one comes up.
     */
    private fun refreshMcpAfterRestart(sessionId: String) {
        // The screen is questioned once the process has actually been replaced, not once the restart has
        // been asked for. A restart waits for a running turn (see ClaudeSessions.restart), and a list
        // read off the process being replaced is the list the person has just changed - which reads as
        // "adding it did not work", with a second press to follow.
        hub.conversations.restart(sessionId) {
            scheduleMcpRefresh(sessionId, MCP_RECONNECT_REFRESH_SECONDS)
        }
    }

    fun scheduleMcpRefresh(sessionId: String, delaySeconds: Long) {
        // The same conversation and waiting window the panel's activation watch sees: that is how focus
        // returning to the IDE nudges the very same refresh ahead of schedule.
        pendingMcpRefreshSessionId = sessionId
        pendingMcpRefreshUntil = System.currentTimeMillis() + delaySeconds * 1000

        AppExecutorUtil.getAppScheduledExecutorService().schedule(
            { refreshMcp(sessionId) },
            delaySeconds,
            TimeUnit.SECONDS,
        )
    }

    fun clearPendingMcpRefresh() {
        pendingMcpRefreshSessionId = null
    }

    /**
     * The CLI's answer as it is, only laid out into the fields the panel draws. We invent no statuses of
     * our own: their set ("connected", "needs-auth", "failed", "pending", "disabled") is set by the CLI,
     * and the panel is obliged to call a server's state by the same word the terminal does.
     */
    private fun sendMcpServers(status: JsonObject) {
        val servers = status.items("mcpServers") ?: JsonArray(emptyList())

        hub.stats.noteMcp(
            servers.count { (it as? JsonObject)?.get("status")?.jsonPrimitive?.contentOrNull == "connected" },
        )

        hub.broadcastProject(
            buildJsonObject {
                put("type", "mcpServers")
                putJsonArray("servers") {
                    for (element in servers) {
                        val server = element as? JsonObject ?: continue
                        val config = server.child("config")

                        addJsonObject {
                            put("name", server["name"]?.jsonPrimitive?.contentOrNull.orEmpty())
                            put("status", server["status"]?.jsonPrimitive?.contentOrNull.orEmpty())
                            put("scope", server["scope"]?.jsonPrimitive?.contentOrNull.orEmpty())
                            put("transport", config?.get("type")?.jsonPrimitive?.contentOrNull.orEmpty())
                            put("command", commandOf(config))
                            put("error", server["error"]?.jsonPrimitive?.contentOrNull.orEmpty())
                        }
                    }
                }
            }.toString(),
        )
    }

    /** What a server is started by: a command with arguments, or an address. */
    private fun commandOf(config: JsonObject?): String {
        if (config == null) return ""

        config["url"]?.jsonPrimitive?.contentOrNull?.takeIf { it.isNotBlank() }?.let { return it }

        val command = config["command"]?.jsonPrimitive?.contentOrNull.orEmpty()
        val arguments = config.items("args").orEmpty()
            .mapNotNull { (it as? JsonPrimitive)?.contentOrNull }
            .joinToString(" ")

        return listOf(command, arguments).filter { it.isNotBlank() }.joinToString(" ")
    }

    private fun sendMcpActionResult(ok: Boolean, message: String) {
        hub.broadcastProject(
            buildJsonObject {
                put("type", "mcpActionResult")
                put("ok", ok)
                put("message", message)
            }.toString(),
        )
    }

    // --- Plugins and marketplaces ---------------------------------------------------

    fun listPlugins() {
        ClaudePlugin.list(
            project.basePath,
            onResult = { installed, available -> sendPlugins(installed, available) },
            onError = { error -> sendPluginActionResult(false, error) },
        )
    }

    fun listMarketplaces() {
        ClaudePlugin.marketplaces(
            project.basePath,
            onResult = { marketplaces -> sendMarketplaces(marketplaces) },
            onError = { error -> sendPluginActionResult(false, error) },
        )
    }

    /**
     * Install, uninstall, enable, disable: four subcommands of the CLI that differ in nothing but their
     * name. Each used to carry its own copy of "report the outcome, then ask for the list again", and
     * four copies of one paragraph are four chances for them to drift.
     */
    fun pluginAction(
        plugin: String,
        action: (String?, String, (String) -> Unit, (String) -> Unit) -> Unit,
    ) {
        if (plugin.isBlank()) return

        action(
            project.basePath,
            plugin,
            { message ->
                sendPluginActionResult(true, message)
                // The list has changed - we ask for it again ourselves: the CLI reports nothing about
                // it, and the tab would go on showing what was there before the action.
                ClaudePlugin.list(project.basePath, onResult = ::sendPlugins, onError = {})
            },
            { error -> sendPluginActionResult(false, error) },
        )
    }

    /** The same for the marketplaces: adding and removing differ only in which list is asked for anew. */
    fun marketplaceAction(
        argument: String,
        action: (String?, String, (String) -> Unit, (String) -> Unit) -> Unit,
    ) {
        if (argument.isBlank()) return

        action(
            project.basePath,
            argument,
            { message ->
                sendPluginActionResult(true, message)
                ClaudePlugin.marketplaces(project.basePath, onResult = ::sendMarketplaces, onError = {})
            },
            { error -> sendPluginActionResult(false, error) },
        )
    }

    private fun sendPlugins(installed: List<InstalledPlugin>, available: List<AvailablePlugin>) {
        hub.stats.notePlugins(installed.count { it.enabled })
        // A fresh answer is a fresh answer whoever asked for it: installing or removing a plugin comes
        // through here, and without this the "/" hint would go on offering a removed plugin's commands
        // until the next minute round asked the CLI again.
        installedPlugins = installed

        hub.broadcastProject(
            buildJsonObject {
                put("type", "plugins")
                putJsonArray("installed") {
                    installed.forEach { plugin ->
                        addJsonObject {
                            put("id", plugin.id)
                            put("version", plugin.version)
                            put("scope", plugin.scope)
                            put("enabled", plugin.enabled)
                        }
                    }
                }
                putJsonArray("available") {
                    available.forEach { plugin ->
                        addJsonObject {
                            put("id", plugin.id)
                            put("name", plugin.name)
                            put("description", plugin.description)
                            put("marketplace", plugin.marketplace)
                            put("installCount", plugin.installCount)
                        }
                    }
                }
            }.toString(),
        )
    }

    private fun sendPluginActionResult(ok: Boolean, message: String) {
        hub.broadcastProject(
            buildJsonObject {
                put("type", "pluginActionResult")
                put("ok", ok)
                put("message", message)
            }.toString(),
        )
    }

    private fun sendMarketplaces(marketplaces: List<PluginMarketplace>) {
        hub.broadcastProject(
            buildJsonObject {
                put("type", "marketplaces")
                putJsonArray("marketplaces") {
                    marketplaces.forEach { marketplace ->
                        addJsonObject {
                            put("name", marketplace.name)
                            put("source", marketplace.source)
                        }
                    }
                }
            }.toString(),
        )
    }

    // --- Background rounds -----------------------------------------------------------

    /**
     * The rounds that keep all of the above from going stale.
     *
     * They live on the hub's life rather than a window's now, because a phone watching this project
     * needs them just as much as the panel does. But they start only while someone is watching (see
     * [ClaudeSessionHub.hasClients]): today's tokens alone is the heaviest thing this plugin does in
     * the background - every project's transcripts, parsed - and running it in every open project for
     * the whole life of the IDE, with nobody looking, would be a plain waste.
     */
    fun scheduleUpdates(parentDisposable: Disposable, usage: ProjectUsage) {
        val slow = AppExecutorUtil.getAppScheduledExecutorService().scheduleWithFixedDelay(
            {
                if (!hub.hasClients()) return@scheduleWithFixedDelay
                // The PR is asked of GitHub by a separate process - hence the rare period. Neither the
                // branch nor the day's tokens come here: both have rounds of their own, one far more
                // frequent and one far rarer.
                refreshPullRequest()
                // The file list for the "@" hint goes stale too - the agent may have created new ones in
                // the meantime; the same rare period as the rest.
                refreshFiles()
                // Plugins and skills may have been installed or updated in the meantime - the same period
                // as the rest of the background refreshing.
                refreshCommandHints()
            },
            SLOW_PERIOD_MINUTES,
            SLOW_PERIOD_MINUTES,
            TimeUnit.MINUTES,
        )

        /**
         * "Today's tokens" is the most expensive thing done in the background, and by a wide margin:
         * every project's transcripts, every line of every file touched in the last two days, parsed as
         * JSON. So it gets a round of its own - the figure creeps rather than jumps, and five minutes of
         * staleness on it costs nothing.
         */
        val tokens = AppExecutorUtil.getAppScheduledExecutorService().scheduleWithFixedDelay(
            { if (hub.hasClients()) usage.refreshTodayTokens() },
            TOKENS_PERIOD_MINUTES,
            TOKENS_PERIOD_MINUTES,
            TimeUnit.MINUTES,
        )

        /**
         * The branch is simply a small file read from disk, not a trip to GitHub as the PR is. Running it
         * on the same rare round was a mistake: after a `git checkout` in the terminal the panel showed
         * the old branch for a noticeable while. Here the round is short - the same cost is near zero.
         */
        val branch = AppExecutorUtil.getAppScheduledExecutorService().scheduleWithFixedDelay(
            { if (hub.hasClients()) refreshBranch() },
            BRANCH_PERIOD_SECONDS,
            BRANCH_PERIOD_SECONDS,
            TimeUnit.SECONDS,
        )

        /**
         * The hints get a round of their own, and a short one: a skill written mid-conversation has to
         * reach the "/" hint about as fast as the CLI itself picks it up (1.6-4.2 s, measured on
         * 2.1.263), not in a minute. It costs a walk of a few directories with no file read at all
         * while nothing changes - 1.0-1.3 ms for the 97 commands and skills on this machine - and it
         * starts no process: the plugin list stays on the slow round above.
         *
         * The clients guard is not only about saving work here: it keeps the round idle until somebody
         * attaches, so the warm-up's first scan is never left waiting behind it.
         */
        val commandHints = hints.scheduleWithFixedDelay(
            {
                runCatching { if (hub.hasClients() && hintPace.due()) pollCommandHints() }
                    .onFailure { thisLogger().warn("Couldn't schedule a command hint refresh", it) }
            },
            HINTS_PERIOD_SECONDS,
            HINTS_PERIOD_SECONDS,
            TimeUnit.SECONDS,
        )

        Disposer.register(parentDisposable) {
            slow.cancel(false)
            tokens.cancel(false)
            branch.cancel(false)
            commandHints.cancel(false)
            hints.shutdown()
        }
    }

    /**
     * The map last broadcast, the names that were in it, and how long the guard has been holding back.
     *
     * The names are kept as a set of their own rather than read back out of [canonical]. Gluing the map
     * into one string and taking it apart again broke in two ways, and both were silent. A fresh
     * install: nothing had ever been sent, so the empty string parsed to one empty name and every walk
     * looked like it had "lost" it - the very first real broadcast was blocked. And a description
     * written on several lines, which the skill file format allows and a test here already covers: each
     * extra line read as a name that no longer exists. Held as a set, neither case can happen at all -
     * [NOTHING] believes anything, and a description is not a name.
     *
     * [refusals] is the other half. The guard is meant as a hiccup's worth of patience: the share
     * stuttered, we waited, it came back. But a directory can also close for good - macOS revoking
     * access to Documents, a plugin folder losing its mode, a volume that answers with a refusal from
     * now on - and then the guard fires on every single round for ever: the hint freezes on what was
     * read before the loss, a new skill never reaches it again, and no fingerprint is written either,
     * so the two-second round re-reads every file on disk until the IDE is restarted. So patience is
     * finite: after [PATIENCE] rounds in a row the loss is accepted as the truth, what was read is sent,
     * and the fingerprint is written. A hiccup is still ridden out in silence; a closed door stops being
     * a life sentence.
     */
    internal data class SentHints(val canonical: String, val names: Set<String>, val refusals: Int) {

        /** Whether a walk that came back incomplete may still be believed - see the note above. */
        fun believes(found: Set<String>): Boolean = found.containsAll(names) || refusals >= PATIENCE

        /** One more round spent waiting. Stops counting at the ceiling so nothing can overflow. */
        fun heldBack(): SentHints = if (refusals >= PATIENCE) this else copy(refusals = refusals + 1)

        /** A walk got through: the patience is whole again, whatever is done with the map next. */
        fun believed(): SentHints = if (refusals == 0) this else copy(refusals = 0)

        companion object {
            /** How many refusals in a row before the loss is taken for the truth: ten seconds of them. */
            const val PATIENCE = 5

            /** Nothing has been sent yet, so nothing can have been lost. */
            val NOTHING = SentHints("", emptySet(), 0)

            fun of(canonical: String, names: Set<String>): SentHints = SentHints(canonical, names, 0)
        }
    }

    /**
     * How long the fast round waits before walking the disk again.
     *
     * Two seconds is what a local disk is worth. Everything else this has to survive is a disk that is
     * not local: a 9P share, an SMB mount, an external drive spinning up, an antivirus. There a walk
     * costs seconds rather than milliseconds, and a fixed two-second round would keep one thread
     * permanently busy and keep the drive from ever going back to sleep - so the round pays back its own
     * cost fifty times over before it starts again.
     *
     * Four details, each of them a way to get this wrong:
     *
     * - the ceiling is the slow round. Above that the fast round buys nothing that the unconditional
     *   minute does not already buy, and a hint that answers slower than it did before the change would
     *   be a plain regression on exactly the machines that can least afford one.
     * - going back to quick takes a run of quick walks rather than one. A single spin-up or a swapped
     *   page would otherwise push the next look a hundred seconds out while the disk was already awake,
     *   with nothing on screen to say why.
     * - "quick" is measured against the round in force, not against a fixed number of milliseconds. On
     *   a share, a WSL mount or a disk behind an antivirus a walk costs a hundred milliseconds every
     *   time, so against an absolute figure no walk there is ever quick and the period could only ever
     *   go up: one spin-up pinned it at the ceiling until the IDE was restarted. Relative, the brake
     *   lets go again on any machine - it settles at what that machine's walk is actually worth.
     * - the clock is [System.nanoTime]. Wall time steps backwards - NTP after a long sleep, a restored
     *   snapshot - and a deadline written in it freezes the round for the length of the step. Which is
     *   also why "not looked yet" is [nextAt] absent rather than [nextAt] zero: nanoTime is allowed to
     *   start at any number at all, negative included, and on a machine whose clock starts below zero a
     *   deadline of zero sits years in the future - the fast round would never run once, silently.
     */
    internal data class HintPace(val waitMs: Long, val quickRuns: Int, val nextAt: Long?) {

        fun due(at: Long = System.nanoTime()): Boolean = nextAt == null || at - nextAt >= 0

        companion object {
            /** The floor: what a walk of a local disk is worth. */
            const val QUICK_MS = HINTS_PERIOD_SECONDS * 1000

            /** The ceiling: past this the unconditional minute round is doing the same job anyway. */
            const val SLOWEST_MS = SLOW_PERIOD_MINUTES * 60 * 1000

            /** How much of the round a walk is allowed to take: one part in fifty. */
            const val BUDGET = 50

            /** How many quick walks in a row earn the quick round back. */
            const val SETTLED = 3

            /** Nothing walked yet, so the first tick is due: see the note on the clock above. */
            val QUICK = HintPace(QUICK_MS, SETTLED, null)

            fun after(pace: HintPace, tookNanos: Long, at: Long = System.nanoTime()): HintPace {
                val tookMs = tookNanos / 1_000_000
                val wanted = (tookMs * BUDGET).coerceIn(QUICK_MS, SLOWEST_MS)
                // Quick means "fits the round we are keeping", not "under forty milliseconds": see the
                // third note above. Settled, the period drops to what this disk's walk is worth, which
                // on a local one is the floor and on a share is a few seconds - never the ceiling it
                // used to stick at.
                val quickRuns = if (wanted <= pace.waitMs) pace.quickRuns + 1 else 0
                val waitMs = if (quickRuns >= SETTLED) wanted else maxOf(wanted, pace.waitMs)

                return HintPace(waitMs, quickRuns, at + waitMs * 1_000_000)
            }
        }
    }

    companion object {
        /** Ours as the platform knows us - the same string Gradle patches into plugin.xml. */
        private const val PLUGIN_ID = "io.github.crmapache.amazingclaudecode"

        /**
         * Where the agent's own command catalogue is kept (see [sendCommands]). Per project rather than
         * shared: the MCP servers of one checkout are not those of another, and a list borrowed from a
         * neighbour would hint at commands this project has never had.
         */
        private const val COMMANDS_KEY = "acc.slashCommands"

        /** How much of a failed rewrite's complaint fits in the strip above the input field. */
        private const val ERROR_LIMIT = 240

        /**
         * Our own version, read out of our own plugin.xml.
         *
         * The platform knows this number and would hand it over, but every door it offers - the plugin
         * manager and the core behind it - is marked internal, and the marketplace's verifier turns a
         * plugin down for knocking on one. The descriptor Gradle patched the number into travels in our
         * own jar, and reading it needs nothing but the JDK.
         *
         * Every plugin and the platform itself carry a file under this name, and a class loader is free
         * to answer with any of them, so the one that names us is picked by its id rather than by being
         * first. Read once: it cannot change while the IDE runs, and a null is not worth retrying -
         * whatever made the file unreadable will not have healed by the next conversation.
         */
        internal val pluginVersion: String? by lazy {
            val builder = DocumentBuilderFactory.newDefaultInstance().newDocumentBuilder()

            ProjectCatalog::class.java.classLoader
                .getResources("META-INF/plugin.xml")
                .asSequence()
                .firstNotNullOfOrNull { descriptor ->
                    runCatching {
                        val document = descriptor.openStream().use { builder.parse(it) }
                        val id = document.getElementsByTagName("id").item(0)?.textContent?.trim()

                        if (id != PLUGIN_ID) null
                        else document.getElementsByTagName("version").item(0)?.textContent?.trim()
                    }.getOrNull()?.takeIf { it.isNotEmpty() }
                }
        }

        /** The round for everything that is expensive and changes unhurriedly. */
        internal const val SLOW_PERIOD_MINUTES = 1L

        /** And the one for the "/" hint, which has to keep up with the CLI itself - see [HintPace]. */
        internal const val HINTS_PERIOD_SECONDS = 2L

        /** Rarer still, because it is the heaviest of the lot. */
        private const val TOKENS_PERIOD_MINUTES = 5L

        private const val BRANCH_PERIOD_SECONDS = 5L

        /** How long we wait after a restart before asking for the MCP statuses again. */
        const val MCP_RECONNECT_REFRESH_SECONDS = 3L

        /** The server let us in without a sign-in - the status will update almost at once. */
        private const val MCP_AUTH_FIRST_REFRESH_SECONDS = 2L

        /**
         * When to ask for the status again while the person is signing in inside a browser. The CLI does
         * not report the sign-in's end, so we look ourselves - rarely and not forever: in ten seconds or
         * so the sign-in is usually done, and by a minute it becomes clear the window was simply closed.
         */
        private val MCP_AUTH_REFRESH_SECONDS = listOf(10L, 25L, 60L)
    }
}

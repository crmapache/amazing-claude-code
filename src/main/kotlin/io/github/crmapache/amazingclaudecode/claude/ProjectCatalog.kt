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
     * It goes out twice on purpose: first what is on disk right here, then the same with the plugins'
     * commands added. The plugin list is a separate `claude` run - a whole Node start-up that can time
     * out, fail or answer in a shape we do not expect - and hanging the disk scan on its success meant
     * that one failure took the project's own commands with it. The panel then had nothing to hint with
     * until the agent named its own list, that is, until the first message of the conversation had been
     * sent: a person who had just installed the plugin typed "/" and did not find their own commands.
     */
    fun refreshCommandHints() {
        broadcastCommandHints(installed = emptyList())

        ClaudePlugin.installed(
            project.basePath,
            onResult = { installed -> if (installed.isNotEmpty()) broadcastCommandHints(installed) },
            onError = { thisLogger().warn("Couldn't list plugins for command hints: $it") },
        )
    }

    private fun broadcastCommandHints(installed: List<InstalledPlugin>) {
        AppExecutorUtil.getAppExecutorService().submit {
            val hints = ClaudeCommandHints.scan(project.basePath, installed)

            hub.broadcastProject(
                buildJsonObject {
                    put("type", "commandHints")
                    putJsonObject("hints") {
                        hints.forEach { (id, hint) ->
                            putJsonObject(id) {
                                put("description", hint.description)
                                put("argumentHint", hint.argumentHint)
                            }
                        }
                    }
                }.toString(),
            )
        }
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
    fun refreshMcp(sessionId: String) {
        hub.conversations.mcpStatus(
            sessionId,
            onResult = { status -> sendMcpServers(status) },
            onFailure = { error -> sendMcpActionResult(false, error) },
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
     * The CLI hands over an address, the panel opens it for the person, and the code from the browser is
     * caught by the CLI itself: it has raised a local handler for that inside the conversation's
     * process. So all that is left is to ask for the status again - about the sign-in's end it sends no
     * separate event.
     */
    fun authenticateMcp(sessionId: String, server: String) {
        if (server.isEmpty()) return

        hub.conversations.mcpAuthenticate(
            sessionId,
            server,
            onResult = { response ->
                val url = response["authUrl"]?.jsonPrimitive?.contentOrNull.orEmpty()

                if (url.isEmpty()) {
                    // No sign-in was needed - the server let it through, and the status will show that.
                    sendMcpActionResult(true, "$server is signed in.")
                    scheduleMcpRefresh(sessionId, MCP_AUTH_FIRST_REFRESH_SECONDS)
                    return@mcpAuthenticate
                }

                BrowserUtil.browse(url)
                sendMcpActionResult(true, "Finish signing in to $server in the browser - the list updates itself.")
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
        hub.conversations.restart(sessionId)
        scheduleMcpRefresh(sessionId, MCP_RECONNECT_REFRESH_SECONDS)
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

        Disposer.register(parentDisposable) {
            slow.cancel(false)
            tokens.cancel(false)
            branch.cancel(false)
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
        private const val SLOW_PERIOD_MINUTES = 1L

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

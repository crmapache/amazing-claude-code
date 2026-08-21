package io.github.crmapache.amazingclaudecode.toolwindow

import com.intellij.ide.BrowserUtil
import com.intellij.ide.ui.LafManagerListener
import com.intellij.openapi.Disposable
import com.intellij.openapi.application.ApplicationActivationListener
import com.intellij.openapi.application.ApplicationManager
import com.intellij.openapi.application.ModalityState
import com.intellij.openapi.diagnostic.thisLogger
import com.intellij.openapi.editor.colors.EditorColorsListener
import com.intellij.openapi.editor.colors.EditorColorsManager
import com.intellij.openapi.project.Project
import com.intellij.openapi.util.Disposer
import com.intellij.openapi.wm.IdeFrame
import com.intellij.openapi.wm.ToolWindow
import com.intellij.openapi.wm.ToolWindowAnchor
import com.intellij.openapi.wm.ToolWindowManager
import com.intellij.openapi.wm.WindowManager
import com.intellij.openapi.wm.ex.ToolWindowManagerListener
import com.intellij.ui.components.JBLabel
import com.intellij.ui.components.JBPanel
import com.intellij.util.concurrency.AppExecutorUtil
import com.intellij.util.ui.JBUI
import io.github.crmapache.amazingclaudecode.AccBundle
import io.github.crmapache.amazingclaudecode.claude.AvailablePlugin
import io.github.crmapache.amazingclaudecode.claude.ClaudeAuth
import io.github.crmapache.amazingclaudecode.claude.ClaudeCommandHints
import io.github.crmapache.amazingclaudecode.claude.ClaudeExecutable
import io.github.crmapache.amazingclaudecode.claude.ClaudeFileSearch
import io.github.crmapache.amazingclaudecode.claude.ClaudeHistory
import io.github.crmapache.amazingclaudecode.claude.ClaudeLogin
import io.github.crmapache.amazingclaudecode.claude.ClaudeMcp
import io.github.crmapache.amazingclaudecode.claude.ClaudePlugin
import io.github.crmapache.amazingclaudecode.claude.ClaudePreferences
import io.github.crmapache.amazingclaudecode.claude.ClaudeSessions
import io.github.crmapache.amazingclaudecode.claude.ClaudeSessions.Companion.MAIN_SESSION
import io.github.crmapache.amazingclaudecode.claude.ImageAttachment
import io.github.crmapache.amazingclaudecode.claude.InstalledPlugin
import io.github.crmapache.amazingclaudecode.claude.PermissionBypass
import io.github.crmapache.amazingclaudecode.claude.PermissionDefaultMode
import io.github.crmapache.amazingclaudecode.claude.PermissionModes
import io.github.crmapache.amazingclaudecode.claude.PluginMarketplace
import io.github.crmapache.amazingclaudecode.claude.ShellCommand
import io.github.crmapache.amazingclaudecode.claude.child
import io.github.crmapache.amazingclaudecode.claude.items
import io.github.crmapache.amazingclaudecode.editor.SelectionReference
import io.github.crmapache.amazingclaudecode.project.ProjectFacts
import io.github.crmapache.amazingclaudecode.sound.AlertSounds
import io.github.crmapache.amazingclaudecode.webview.FilePicker
import io.github.crmapache.amazingclaudecode.webview.IdeTypography
import io.github.crmapache.amazingclaudecode.webview.WebviewClipboard
import io.github.crmapache.amazingclaudecode.webview.WebviewFileDrop
import io.github.crmapache.amazingclaudecode.webview.WebviewHost
import java.awt.BorderLayout
import java.util.concurrent.ScheduledFuture
import java.util.concurrent.TimeUnit
import javax.swing.JComponent
import kotlinx.serialization.json.Json
import kotlinx.serialization.json.JsonArray
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.JsonPrimitive
import kotlinx.serialization.json.add
import kotlinx.serialization.json.addJsonObject
import kotlinx.serialization.json.booleanOrNull
import kotlinx.serialization.json.buildJsonObject
import kotlinx.serialization.json.contentOrNull
import kotlinx.serialization.json.intOrNull
import kotlinx.serialization.json.jsonArray
import kotlinx.serialization.json.jsonObject
import kotlinx.serialization.json.jsonPrimitive
import kotlinx.serialization.json.put
import kotlinx.serialization.json.putJsonArray
import kotlinx.serialization.json.putJsonObject

/**
 * The panel's contents: the interface in a browser and the conversations with the agent underneath it.
 *
 * The routing of messages between the two lives here as well. The agent's events travel upwards
 * untouched: parsing them is more convenient on the interface side, where they are drawn, and there is
 * no sense in duplicating the models in two languages.
 *
 * What the panel counts (the usage windows, the model catalogue, the context) lives in [PanelUsage],
 * and what stops a turn to wait for a person (permissions, plans, questions) in [PanelPermissions]:
 * both have lives of their own - schedules, retries, requests outliving processes - and kept here they
 * buried the routing under rules nobody looks for in it.
 */
internal class ClaudePanel(
    private val project: Project,
    private val toolWindow: ToolWindow,
    private val parentDisposable: Disposable,
) {

    val component: JComponent

    /**
     * Whether the panel is still alive. The platform answers that same question only in a deprecated
     * way, while a checked disposable answers it itself: it dies with its parent and from that moment
     * on honestly says "I am gone".
     */
    private val alive = Disposer.newCheckedDisposable(parentDisposable)

    private var webview: WebviewHost? = null
    private var sessions: ClaudeSessions? = null

    /**
     * Until the sign-in is confirmed we start no processes: without it the agent answers every question
     * with a single line about /login, and the panel shows the sign-in screen.
     */
    @Volatile
    private var loggedIn = false

    /** Polling of the sign-in state while the user goes through it in the terminal. */
    private var loginPolling: ScheduledFuture<*>? = null

    /** Which outcome the polling is waiting for: signed in, or on the contrary signed out. */
    @Volatile
    private var awaitedAuth: Boolean? = null

    private val usage = PanelUsage(
        workingDirectory = project.basePath,
        sessions = { sessions },
        isLoggedIn = { loggedIn },
        send = { message -> webview?.send(message) },
    )

    private val permissions = PanelPermissions(
        sessions = { sessions },
        send = { message -> webview?.send(message) },
        sendPrompt = { sessionId, text ->
            sendStatus(sessionId, "running")
            sessions?.prompt(sessionId, text)
        },
        changeMode = ::changeMode,
    )

    /** When something was last dropped into the panel with the mouse - see [attachDropped]. */
    @Volatile
    private var lastDropAt = 0L

    /** Whether a file is being held over the panel right now - see [sendFileDrag]. */
    @Volatile
    private var fileDragOver = false

    /**
     * The conversation and the deadline up to which returning focus to the IDE should nudge the MCP
     * status ahead of schedule - see [watchIdeActivation] and [scheduleMcpRefresh].
     */
    @Volatile
    private var pendingMcpRefreshSessionId: String? = null

    @Volatile
    private var pendingMcpRefreshUntil: Long = 0L

    init {
        component = if (WebviewHost.isSupported()) {
            buildWebview(parentDisposable)
        } else {
            buildUnsupportedNotice()
        }

        ClaudePanels.getInstance(project).register(this, parentDisposable)
        Disposer.register(parentDisposable) { loginPolling?.cancel(false) }
        watchDockAnchor()
        watchTypography()
        watchIdeActivation()
    }

    private fun buildWebview(parentDisposable: Disposable): JComponent {
        val host = WebviewHost(parentDisposable) { message -> handleWebviewMessage(message) }
        webview = host

        sessions = ClaudeSessions(
            workingDirectory = project.basePath,
            parentDisposable = parentDisposable,
            onEvent = { sessionId, line -> forwardAgentEvent(sessionId, line) },
            onError = { sessionId, text -> sendError(sessionId, text) },
            // This does not travel into the feed, but a lost sign-in has to be noticed here too: the CLI
            // reports it past the event stream, before the first answer.
            onDiagnostic = { _, text -> noteLoggedOut(text) },
            onFinished = { sessionId -> sendStatus(sessionId, "idle") },
            onCrashed = { sessionId, exitCode -> sendProcessExited(sessionId, exitCode) },
            onToolPermission = { sessionId, request -> permissions.ask(sessionId, request) },
            onTitle = { sessionId, title -> sendSessionTitle(sessionId, title) },
            // A second, independent route to "the work is over": usually a turn is closed by the result
            // itself once it reaches the feed, but it may never get there - see ClaudeSession.onTurnEnded.
            // The status follows the event, so in ordinary life it merely confirms what is already drawn.
            onTurnEnded = { sessionId -> sendStatus(sessionId, "idle") },
            // A turn that started without a press in the panel: that is how the CLI takes up a message
            // written into the previous turn - and by then the panel has already cleared its work on that
            // turn's result. Without this it stands "free" for the whole of such a turn while the agent
            // answers (see ClaudeSession.onTurnStarted).
            onTurnStarted = { sessionId -> sendStatus(sessionId, "running") },
        )

        // Dragging files into the panel: inside the IDE that goes past the embedded browser, so we take
        // it here - see WebviewFileDrop.
        WebviewFileDrop.install(
            component = host.component,
            parentDisposable = parentDisposable,
            onDragging = ::sendFileDrag,
            onDropped = ::attachDropped,
        )

        usage.scheduleUpdates(parentDisposable)
        scheduleSlowUpdates(parentDisposable)
        scheduleTokenUpdates(parentDisposable)
        scheduleBranchUpdates(parentDisposable)
        return host.component
    }

    private fun buildUnsupportedNotice(): JComponent =
        JBPanel<JBPanel<*>>(BorderLayout()).apply {
            border = JBUI.Borders.empty(16)
            add(JBLabel(AccBundle["webview.unsupported.text"]).apply { setAllowAutoWrapping(true) })
        }

    private fun handleWebviewMessage(message: String) {
        val payload = runCatching { Json.parseToJsonElement(message).jsonObject }.getOrNull()

        if (payload == null) {
            thisLogger().warn("Malformed message from webview: $message")
            return
        }

        val field = { name: String -> payload[name]?.jsonPrimitive?.contentOrNull.orEmpty() }
        val sessionId = field("sessionId").ifEmpty { MAIN_SESSION }

        when (field("type")) {
            "ready" -> {
                thisLogger().info("Webview reported ready")
                sendInit()
                sendDockAnchor()
                sendTypography()
                refreshBranch()
                refreshPullRequest()
                checkAuth()
                checkModeAvailability()
                refreshFiles()
                refreshCommandHints()
            }

            "prompt" -> {
                val text = field("text")
                if (text.isNotBlank()) {
                    val images = payload["images"]?.jsonArray.orEmpty().mapNotNull { element ->
                        val obj = element as? JsonObject ?: return@mapNotNull null
                        val mediaType = obj["mediaType"]?.jsonPrimitive?.contentOrNull ?: return@mapNotNull null
                        val data = obj["data"]?.jsonPrimitive?.contentOrNull ?: return@mapNotNull null
                        ImageAttachment(mediaType, data)
                    }

                    sendStatus(sessionId, "running")
                    sessions?.prompt(sessionId, text, images)
                }
            }

            // A command through "!" - the panel's bash mode, see runShellCommand.
            "bash" -> runShellCommand(sessionId, field("id"), field("command"))

            "stop" -> {
                // We interrupt the turn rather than cut down the process: the conversation must stay. We
                // do not rush into idle - the status will be shown by a real result event, and if the
                // agent does not even confirm the interrupt, we say honestly that things look bad.
                sessions?.interrupt(sessionId) {
                    sendError(sessionId, "Claude didn't confirm the stop - the process may be stuck.")
                }
            }

            // A forced stop: the user has already seen that the ordinary Stop went unconfirmed and asked
            // outright to kill the process.
            "kill" -> {
                sessions?.stop(sessionId)
                sendStatus(sessionId, "idle")
            }

            // The cross on a chip: we kill one task - a subagent or a background command - while the turn
            // carries on. No answer of the panel's own is needed: about the task's end the CLI reports
            // with an ordinary notification, the same one it reports a natural end with.
            "stopTask" -> sessions?.stopTask(sessionId, field("taskId")) { error ->
                sendError(sessionId, "Couldn't stop the task: $error")
            }

            "newSession" -> {
                // A branch inherits the transcript of the conversation it was opened from.
                if (field("kind") == "branch") {
                    sessions?.branchFrom(field("parentId").ifEmpty { MAIN_SESSION }, sessionId)
                }
                thisLogger().info("New session requested: ${field("title")}")
            }

            "closeSession" -> sessions?.close(sessionId)

            "pick" -> pickAttachment()

            "dropped" -> attachDropped(
                payload["paths"]?.jsonArray.orEmpty().mapNotNull { it.jsonPrimitive.contentOrNull },
            )

            "permissionDecision" -> permissions.decide(field("id"), field("decision"))

            "planDecision" -> permissions.decidePlan(sessionId, field("id"), field("decision"), field("message"))

            "askAnswer" -> permissions.answerAsk(
                sessionId,
                itemId = field("id"),
                answers = payload["answers"]?.jsonObject ?: JsonObject(emptyMap()),
                fallbackText = field("text"),
            )

            "askDismiss" -> permissions.dismissAsk(field("id"))

            "setMode" -> changeMode(sessionId, field("mode"))
            /**
             * What new tabs start in - the only thing that writes the saved mode. Deliberately apart
             * from "setMode": that one answers "how do I work in this tab right now", and a person who
             * wants one tab out of ten in plan mode is not saying anything about the other nine.
             *
             * No conversation is touched here, not even the open one: changing the default is a
             * decision about the future, and reaching into a running turn to apply it would be the very
             * surprise this separation exists to remove.
             */
            "setDefaultMode" -> ClaudePreferences.mode = PermissionModes.normalize(field("mode"))

            // Another model's context window has a size of its own - we ask for it again without waiting
            // for the next turn to end.
            "setModel" -> changeModel(sessionId, field("model"))

            "setEffort" -> sessions?.setEffort(sessionId, field("effort"))

            "setComposerLayout" -> ClaudePreferences.composerLayout = field("layout")

            "refreshUsage" -> usage.refreshAll()

            "login" -> startLogin()

            "logout" -> {
                ClaudeLogin.logout(project)
                pollAuth(expected = false)
            }

            "history" -> sendHistory()

            "resumeSession" -> resumeConversation(sessionId, field("conversationId"))

            "checkAuth" -> checkAuth()

            // The panel calls the person. It decides that itself (only there is it known what exactly
            // the turn is busy with), and the sound happens here - see AlertSounds.
            "sound" -> playAlert(
                sound = field("sound"),
                volume = payload["volume"]?.jsonPrimitive?.intOrNull ?: 100,
                onlyIfAway = payload["onlyIfAway"]?.jsonPrimitive?.booleanOrNull == true,
            )

            "soundSettings" -> {
                ClaudePreferences.mutedSounds =
                    payload["muted"]?.jsonArray.orEmpty().mapNotNull { it.jsonPrimitive.contentOrNull }.toSet()
                ClaudePreferences.soundVolumes = payload["volumes"]?.jsonObject.orEmpty()
                    .mapNotNull { (id, value) -> value.jsonPrimitive.intOrNull?.let { id to it } }
                    .toMap()
            }

            // A line from the panel itself - see protocol, the trace message.
            "trace" -> thisLogger().info("Webview: ${field("message")}")

            // The automatic search missed - the person pointed at the file themselves.
            "setExecutablePath" -> {
                ClaudePreferences.executablePath = field("path").trim()
                checkAuth()
            }

            "openDevTools" -> webview?.openDevTools()

            // The cursor is set by the shell: an offscreen browser does not carry its own as far as the
            // IDE's window.
            "cursor" -> webview?.setCursor(field("cursor"))

            // The PR number in the status bar is a link: we open it in the system browser rather than
            // inside JCEF, so as not to raise a full web viewport inside the panel.
            "openExternal" -> field("url").takeIf { it.isNotBlank() }?.let { BrowserUtil.browse(it) }

            // The embedded browser's clipboard is its own and does not reach the IDE's (see
            // WebviewClipboard) - we go to the real one on its behalf.
            "clipboardWrite" -> writeClipboard(field("text"), field("html"))

            "clipboardRead" -> readClipboard(field("id"))

            "mcpList" -> refreshMcp(sessionId)

            "mcpAdd" -> ClaudeMcp.add(
                project.basePath,
                name = field("name"),
                commandOrUrl = field("command"),
                transport = field("transport").ifBlank { null },
                onResult = { message ->
                    sendMcpActionResult(true, message)
                    // An added server comes up only in a new process: the config is read at launch, a
                    // live conversation cannot be handed it.
                    refreshMcpAfterRestart(sessionId)
                },
                onError = { error -> sendMcpActionResult(false, error) },
            )

            "mcpReconnect" -> reconnectMcp(sessionId, field("name"))

            "mcpAuthenticate" -> authenticateMcp(sessionId, field("name"))

            "mcpRemove" -> ClaudeMcp.remove(
                project.basePath,
                name = field("name"),
                onResult = { message ->
                    sendMcpActionResult(true, message)
                    refreshMcpAfterRestart(sessionId)
                },
                onError = { error -> sendMcpActionResult(false, error) },
            )

            "pluginList" -> ClaudePlugin.list(
                project.basePath,
                onResult = { installed, available -> sendPlugins(installed, available) },
                onError = { error -> sendPluginActionResult(false, error) },
            )

            "pluginInstall" -> pluginAction(field("plugin"), ClaudePlugin::install)

            "pluginUninstall" -> pluginAction(field("plugin"), ClaudePlugin::uninstall)

            "pluginEnable" -> pluginAction(field("plugin"), ClaudePlugin::enable)

            "pluginDisable" -> pluginAction(field("plugin"), ClaudePlugin::disable)

            "marketplaceList" -> ClaudePlugin.marketplaces(
                project.basePath,
                onResult = { marketplaces -> sendMarketplaces(marketplaces) },
                onError = { error -> sendPluginActionResult(false, error) },
            )

            "marketplaceAdd" -> marketplaceAction(field("source"), ClaudePlugin::addMarketplace)

            "marketplaceRemove" -> marketplaceAction(field("name"), ClaudePlugin::removeMarketplace)

            else -> thisLogger().warn("Unknown message from webview: $message")
        }
    }

    // --- Plugins and marketplaces ---------------------------------------------

    /**
     * Install, uninstall, enable, disable: four subcommands of the CLI that differ in nothing but their
     * name. Each used to carry its own copy of "report the outcome, then ask for the list again", and
     * four copies of one paragraph are four chances for them to drift.
     */
    private fun pluginAction(
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
    private fun marketplaceAction(
        target: String,
        action: (String?, String, (String) -> Unit, (String) -> Unit) -> Unit,
    ) {
        if (target.isBlank()) return

        action(
            project.basePath,
            target,
            { message ->
                sendPluginActionResult(true, message)
                ClaudePlugin.marketplaces(project.basePath, onResult = ::sendMarketplaces, onError = {})
            },
            { error -> sendPluginActionResult(false, error) },
        )
    }

    // --- Sign-in ---------------------------------------------------------------

    /** We ask the CLI in the background: this starts a process, which has no place on the interface thread. */
    private fun checkAuth() {
        ApplicationManager.getApplication().executeOnPooledThread {
            val status = ClaudeAuth.status()

            loggedIn = status.loggedIn
            sendAuth(status)

            if (status.loggedIn == awaitedAuth) {
                awaitedAuth = null
                loginPolling?.cancel(false)
                loginPolling = null
            }

            // The model catalogue comes only after a confirmed sign-in: without one the CLI answers not
            // with a list but with "you are not signed in".
            if (status.loggedIn) {
                usage.refreshLimits(urgent = true)
                usage.refreshTodayTokens()
                usage.refreshModels(MAIN_SESSION)
            }
        }
    }

    /**
     * The sign-in happens in the built-in terminal: a browser opens there and a return is awaited. When
     * it finishes, nobody will tell us - so we simply ask the CLI again until we see the sign-in, or
     * until we tire of it.
     */
    private fun startLogin() {
        ClaudeLogin.login(project)
        pollAuth(expected = true)
    }

    /**
     * We wait for the person to finish in the terminal: there is nobody to tell us about it. And we wait
     * for the outcome we need - after a sign-out the polling should stop at "signed out" rather than
     * hammer away to the very limit.
     */
    private fun pollAuth(expected: Boolean) {
        awaitedAuth = expected
        loginPolling?.cancel(false)

        val polling = AppExecutorUtil.getAppScheduledExecutorService().scheduleWithFixedDelay(
            { checkAuth() },
            LOGIN_POLL_SECONDS,
            LOGIN_POLL_SECONDS,
            TimeUnit.SECONDS,
        )
        loginPolling = polling

        // We stop this polling specifically, not whatever happens to be in its place: between these two
        // moments the person could have started a new sign-in (or a sign-out), and a limit set by the
        // previous one would cut short someone else's freshly started polling - the panel would then not
        // notice the sign-in at all.
        AppExecutorUtil.getAppScheduledExecutorService().schedule(
            { polling.cancel(false) },
            LOGIN_POLL_LIMIT_MINUTES,
            TimeUnit.MINUTES,
        )
    }

    /**
     * Whether the "no questions" mode is allowed on this machine - the Shift+Tab cycle in the panel
     * depends on it. The answer requires questioning the CLI itself, so it goes into the background and
     * arrives as a separate message: holding the panel's first frame for it serves nothing.
     */
    private fun checkModeAvailability() {
        ApplicationManager.getApplication().executeOnPooledThread {
            val bypass = PermissionBypass.isAvailable(project.basePath)

            webview?.send(
                buildJsonObject {
                    put("type", "modeAvailability")
                    put("bypassPermissions", bypass)
                }.toString(),
            )
        }
    }

    private fun sendAuth(status: ClaudeAuth.Status) {
        webview?.send(
            buildJsonObject {
                put("type", "auth")
                put("installed", status.installed)
                put("loggedIn", status.loggedIn)
                put("email", status.email)
                put("plan", status.plan)
                put("executablePath", ClaudePreferences.executablePath)
                // Not found - we show where we looked and what the system itself answered. Those two
                // lists show why we missed, even when the machine is someone else's and cannot be looked
                // at.
                if (!status.installed) {
                    putJsonArray("searched") {
                        add(ClaudeExecutable.systemAnswer())
                        ClaudeExecutable.searchedPlaces().forEach { add(it) }
                    }
                }
            }.toString(),
        )
    }

    /**
     * The agent answers about the sign-in with ordinary text rather than a launch error, so we catch it
     * in the stream: otherwise the panel would be left with an input field there is no point writing
     * into.
     */
    private fun noteLoggedOut(text: String) {
        if (!loggedIn || !text.contains(NOT_LOGGED_IN)) return

        loggedIn = false
        checkAuth()
    }

    // --- Permission mode -------------------------------------------------------

    /**
     * The panel shows the applied mode, not the chosen one: if the agent refuses, the interface must
     * return to the previous one rather than lie with a tick in the menu.
     */
    /**
     * The mode of one conversation, and of no other: neither the MODE selector nor Shift+Tab nor an
     * approved plan touches what new tabs start in. That is chosen separately - see "setDefaultMode".
     */
    private fun changeMode(sessionId: String, mode: String) {
        sessions?.setPermissionMode(sessionId, mode) { change ->
            webview?.send(
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
     * then the interface must return to the previous one and say why, rather than report a change that
     * did not happen.
     *
     * The context window is asked for anew only on a real change: another model's is a different size,
     * and waiting for the turn's end for that figure serves nothing.
     */
    private fun changeModel(sessionId: String, model: String) {
        sessions?.setModel(sessionId, model) { change ->
            webview?.send(
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

    // --- Past conversations ----------------------------------------------------

    /** Reading the history folder touches the disk, so it happens in the background. */
    private fun sendHistory() {
        ApplicationManager.getApplication().executeOnPooledThread {
            val entries = ClaudeHistory.list(project.basePath)

            webview?.send(
                buildJsonObject {
                    put("type", "history")
                    putJsonArray("conversations") {
                        for (entry in entries) {
                            addJsonObject {
                                put("id", entry.id)
                                put("title", entry.title)
                                put("updatedAt", entry.updatedAt)
                                put("messages", entry.messages)
                            }
                        }
                    }
                }.toString(),
            )
        }
    }

    /**
     * Opening a past conversation: the process comes up with its transcript, and the panel replays the
     * saved events into the feed - otherwise the tab would look empty although the agent remembers
     * everything.
     */
    private fun resumeConversation(sessionId: String, conversationId: String) {
        if (conversationId.isEmpty()) return

        sessions?.resume(sessionId, conversationId)

        ApplicationManager.getApplication().executeOnPooledThread {
            // Line by line as they are read: a long conversation's transcript is tens of megabytes, and
            // there is no reason for any of it to sit in memory at once just to be forwarded onwards.
            ClaudeHistory.replay(project.basePath, conversationId) { line ->
                forwardAgentEvent(sessionId, line, replay = true)
            }

            // The replay is over - the panel closes the work left unfinished inside it. The transcript
            // holds only messages, while a background subagent's result arrives as a separate system
            // event, so for its card it would never come at all: a tab opened from the history showed
            // past agents as working right now.
            sendReplayFinished(sessionId)

            // The taken context window is asked of the conversation itself - and for that we bring it up
            // without waiting for the first message. The replay does not know this figure at all: the
            // transcript holds neither the system prompt with its tools nor the model's window size, and
            // a conversation on a "1M" model looked overflowing by it from the very first second. The
            // process is needed anyway - the conversation will be continued in it - it is merely ready a
            // little earlier.
            sessions?.wake(sessionId)
            usage.refreshContext(sessionId)
        }
    }

    // --- A reference from the editor -------------------------------------------

    /**
     * Put an attachment with a ready path into the input field - the same way a file dropped into the
     * panel with the mouse gets there.
     *
     * The path is taken as it is, without shortening: this is where "Send Absolute Path…" arrives, and
     * there the full path is the whole point of the action (see SendSelectionAbsoluteAction).
     */
    fun attachPath(path: String) {
        ApplicationManager.getApplication().executeOnPooledThread {
            // We do not touch the file system from the interface thread: a path may lead anywhere, up to
            // an unmounted drive.
            val kind = FilePicker.kindOf(path) ?: return@executeOnPooledThread

            webview?.send(
                buildJsonObject {
                    put("type", "picked")
                    put("kind", kind)
                    put("value", path)
                }.toString(),
            )

            // The action was invoked from the editor or from the project tree - the focus stayed there,
            // and typing into the input field would take a separate click.
            ApplicationManager.getApplication().invokeLater { webview?.focus() }
        }
    }

    /** A piece of a file from the editor: in the input field it becomes a reference, not text. */
    fun sendSelection(reference: SelectionReference) {
        webview?.send(
            buildJsonObject {
                put("type", "selection")
                put("path", reference.path)
                put("startLine", reference.startLine)
                put("startColumn", reference.startColumn)
                put("endLine", reference.endLine)
                put("endColumn", reference.endColumn)
                put("wholeLines", reference.wholeLines)
            }.toString(),
        )
    }

    // --- Background rounds -----------------------------------------------------

    /** The polling is not free (a separate process), so it is rare and runs in the background. */
    private fun scheduleSlowUpdates(parentDisposable: Disposable) {
        val task = AppExecutorUtil.getAppScheduledExecutorService().scheduleWithFixedDelay(
            {
                // The PR is asked of GitHub by a separate process - hence the rare period. Neither the
                // branch nor the day's tokens come here: both have rounds of their own, one far more
                // frequent and one far rarer (see scheduleBranchUpdates and scheduleTokenUpdates).
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

        Disposer.register(parentDisposable) { task.cancel(false) }
    }

    /**
     * "Today's tokens" is the most expensive thing the panel does in the background, and by a wide
     * margin: every project's transcripts, every line of every file touched in the last two days,
     * parsed as JSON - tens to hundreds of megabytes for an active user. All of it for one figure in
     * the row under the input field, and every open project window runs a copy of this over the same
     * shared directory.
     *
     * So it gets a round of its own rather than the shared one: the figure creeps rather than jumps, and
     * five minutes of staleness on it costs nothing, while the file list for the "@" hint on the shared
     * round genuinely does want a minute - the agent creates a file and one wants to mention it.
     *
     * The number does not wait five minutes to appear: the panel asks for it as it opens and again on a
     * confirmed sign-in (see PanelUsage.refreshAll).
     */
    private fun scheduleTokenUpdates(parentDisposable: Disposable) {
        val task = AppExecutorUtil.getAppScheduledExecutorService().scheduleWithFixedDelay(
            { usage.refreshTodayTokens() },
            TOKENS_PERIOD_MINUTES,
            TOKENS_PERIOD_MINUTES,
            TimeUnit.MINUTES,
        )

        Disposer.register(parentDisposable) { task.cancel(false) }
    }

    /**
     * The branch is simply a small file read from disk, not a trip to GitHub as the PR is (see
     * scheduleSlowUpdates). Running it on the same rare round was a mistake: after a `git checkout` in
     * the terminal the panel showed the old branch for a noticeable while. Here the round is short - the
     * same cost is near zero.
     */
    private fun scheduleBranchUpdates(parentDisposable: Disposable) {
        val task = AppExecutorUtil.getAppScheduledExecutorService().scheduleWithFixedDelay(
            { refreshBranch() },
            BRANCH_PERIOD_SECONDS,
            BRANCH_PERIOD_SECONDS,
            TimeUnit.SECONDS,
        )

        Disposer.register(parentDisposable) { task.cancel(false) }
    }

    /** Walking the disk is not instant on a big repository, so it happens in the background. */
    private fun refreshFiles() {
        AppExecutorUtil.getAppExecutorService().submit {
            sendFiles(ClaudeFileSearch.list(project.basePath))
        }
    }

    private fun sendFiles(files: List<String>) {
        webview?.send(
            buildJsonObject {
                put("type", "files")
                putJsonArray("files") { files.forEach { file -> add(file) } }
            }.toString(),
        )
    }

    /**
     * The description and argument syntax of slash commands - out of the frontmatter of files on disk
     * (see ClaudeCommandHints). The list of installed plugins is needed only for their installPath, so
     * we take the light `plugin list` without `--available`.
     */
    private fun refreshCommandHints() {
        ClaudePlugin.installed(
            project.basePath,
            onResult = { installed ->
                AppExecutorUtil.getAppExecutorService().submit {
                    val hints = ClaudeCommandHints.scan(project.basePath, installed)
                    webview?.send(
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
            },
            onError = { thisLogger().warn("Couldn't list plugins for command hints: $it") },
        )
    }

    /**
     * A command from the input field typed through "!": we run it ourselves, in the project's working
     * directory, and return its output to the panel (see [ShellCommand]).
     *
     * On a pool rather than the interface thread: a command may run for minutes, and the panel has to
     * stay alive the whole time - the card in the feed is already drawn and waiting for a result.
     */
    private fun runShellCommand(sessionId: String, id: String, command: String) {
        // Without a number there is nobody to answer: the card in the feed is found by exactly that.
        if (id.isBlank()) return

        // An empty command, on the other hand, gets an answer rather than silence: the card is already
        // standing in the feed and without one would stay "running" until the end of the conversation -
        // there is nothing to stop or remove it with.
        if (command.isBlank()) {
            sendBashResult(sessionId, id, ShellCommand.Result(exitCode = -1, stdout = "", stderr = "Empty command."))
            return
        }

        ApplicationManager.getApplication().executeOnPooledThread {
            sendBashResult(sessionId, id, ShellCommand.run(command, project.basePath))
        }
    }

    private fun sendBashResult(sessionId: String, id: String, result: ShellCommand.Result) {
        webview?.send(
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

    // --- The rest ---------------------------------------------------------------

    /** The chooser dialog lives on the IDE's interface thread, so we go there explicitly. */
    private fun pickAttachment() {
        ApplicationManager.getApplication().invokeLater {
            FilePicker.pick(project) { kind, path ->
                webview?.send(
                    buildJsonObject {
                        put("type", "picked")
                        put("kind", kind)
                        put("value", path)
                    }.toString(),
                )
            }
        }
    }

    /**
     * What the panel knows about MCP - the same thing `/mcp` shows in a terminal: who is connected, who
     * needs a sign-in, who failed and why, where each one came from.
     *
     * We ask the conversation rather than parse the output of `claude mcp list`: the servers are raised
     * and held by the conversation's process, and only it knows their live state. The conversation is
     * brought up for this - as in the terminal, where `/mcp` is asked of a running session (see
     * ClaudeSessions.mcpStatus).
     */
    private fun refreshMcp(sessionId: String) {
        sessions?.mcpStatus(
            sessionId,
            onResult = { status -> sendMcpServers(status) },
            onFailure = { error -> sendMcpActionResult(false, error) },
        )
    }

    /**
     * Reconnecting one server. This is also the "try again" for a failed one: the CLI raises it anew by
     * the same request.
     */
    private fun reconnectMcp(sessionId: String, server: String) {
        if (server.isEmpty()) return

        sessions?.mcpReconnect(
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
    private fun authenticateMcp(sessionId: String, server: String) {
        if (server.isEmpty()) return

        sessions?.mcpAuthenticate(
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

    /**
     * The servers' config is read at process launch, so an added or removed server is visible only to a
     * new one: we restart the conversation - the transcript stays, the same one comes up.
     */
    private fun refreshMcpAfterRestart(sessionId: String) {
        sessions?.restart(sessionId)
        scheduleMcpRefresh(sessionId, MCP_RECONNECT_REFRESH_SECONDS)
    }

    private fun scheduleMcpRefresh(sessionId: String, delaySeconds: Long) {
        // The same conversation and waiting window watchIdeActivation sees: that is how focus returning
        // to the IDE nudges the very same refresh ahead of schedule.
        pendingMcpRefreshSessionId = sessionId
        pendingMcpRefreshUntil = System.currentTimeMillis() + delaySeconds * 1000

        AppExecutorUtil.getAppScheduledExecutorService().schedule(
            { refreshMcp(sessionId) },
            delaySeconds,
            TimeUnit.SECONDS,
        )
    }

    /**
     * A file is being held over the panel - the page highlights the input field it will land in.
     *
     * This is asked on every mouse move, while sending a message is a call into the browser: we send
     * only the transitions, not every pixel of the path.
     */
    private fun sendFileDrag(over: Boolean) {
        if (over == fileDragOver) return
        fileDragOver = over

        webview?.send(
            buildJsonObject {
                put("type", "fileDrag")
                put("over", over)
            }.toString(),
        )
    }

    /**
     * Files and folders dropped into the input field. We answer with the same picked as for the chooser
     * dialog: for the panel this is one and the same attachment, the difference being only in the
     * gesture that called it.
     */
    private fun attachDropped(paths: List<String>) {
        if (paths.isEmpty()) return

        // One and the same drop can in theory arrive by both routes at once - from the IDE and from the
        // page itself. The chips would then be doubled, so a second one for the same gesture is thrown
        // away.
        val now = System.currentTimeMillis()
        if (now - lastDropAt < DROP_ECHO_MS) return
        lastDropAt = now

        ApplicationManager.getApplication().executeOnPooledThread {
            // We do not touch the virtual file system from the interface thread: a path may point
            // anywhere, up to an unmounted drive.
            val attachments = paths.mapNotNull { path -> FilePicker.describe(project, path) }

            for ((kind, value) in attachments) {
                webview?.send(
                    buildJsonObject {
                        put("type", "picked")
                        put("kind", kind)
                        put("value", value)
                    }.toString(),
                )
            }

            // The file is dragged from the project tree - the focus stays there, and typing into the
            // input field would take a separate mouse click. We return it to the panel ourselves; inside
            // it the caret lands after the chip (see Composer).
            if (attachments.isNotEmpty()) {
                ApplicationManager.getApplication().invokeLater { webview?.focus() }
            }
        }
    }

    /**
     * Put what was copied in the panel into the system clipboard.
     *
     * We put it from the interface thread: the platform keeps its own synchronization over the clipboard
     * and notifies those subscribed to content changes - and such notifications expect exactly this
     * thread.
     */
    private fun writeClipboard(text: String, html: String) {
        if (text.isEmpty() && html.isEmpty()) return

        ApplicationManager.getApplication().invokeLater { WebviewClipboard.write(text, html) }
    }

    /**
     * Hand the system clipboard's contents to the panel - as an answer to its request.
     *
     * We read off the interface thread on purpose: on X11, reading the clipboard is a request to another
     * application that owns it, with a wait for its answer, and that application may answer slowly or
     * not at all. On the interface thread such a wait is a frozen IDE, so it goes into the background,
     * and the page waits with a timeout of its own (see clipboard.ts).
     *
     * `id` is the same one the page sent: several requests may fly in a row, and each waits for its own
     * answer.
     */
    private fun readClipboard(id: String) {
        if (id.isEmpty()) return

        ApplicationManager.getApplication().executeOnPooledThread {
            val content = WebviewClipboard.read()

            webview?.send(
                buildJsonObject {
                    put("type", "clipboard")
                    put("id", id)
                    put("text", content.text)
                    put("html", content.html)
                    put("image", content.image)
                }.toString(),
            )
        }
    }

    /** The branch for the bottom line. A cheap file read - it can be asked for often. */
    private fun refreshBranch() {
        ApplicationManager.getApplication().executeOnPooledThread {
            val branch = ProjectFacts.gitBranch(project) ?: return@executeOnPooledThread

            webview?.send(
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
    private fun refreshPullRequest() {
        ApplicationManager.getApplication().executeOnPooledThread {
            val pullRequest = ProjectFacts.pullRequest(project)

            webview?.send(
                buildJsonObject {
                    put("type", "project")
                    put("pullRequest", pullRequest?.number.orEmpty())
                    put("pullRequestUrl", pullRequest?.url.orEmpty())
                }.toString(),
            )
        }
    }

    /**
     * An agent's event is ready-made JSON, so we put it into the envelope as it is.
     *
     * [replay] tells a past conversation's replay from a live turn: the event is the same, but it
     * happened long ago, and nothing the panel considers "right now" (the taken context window first of
     * all) may be taken from it.
     */
    private fun forwardAgentEvent(sessionId: String, line: String, replay: Boolean = false) {
        // Not an event - there is nothing to put into an envelope. A live process does not bring such a
        // line this far (see ClaudeSession.noteDiagnostic), but an old transcript may hold one.
        if (!line.startsWith("{")) return

        noteLoggedOut(line)
        val replayFlag = if (replay) ""","replay":true""" else ""
        webview?.send("""{"type":"agent","sessionId":"$sessionId"$replayFlag,"event":$line}""")

        // The end of a turn is the only moment when the taken context window has genuinely changed: we
        // ask the very process that has just finished for a fresh figure (see PanelUsage.refreshContext).
        if (line.contains("\"type\":\"result\"")) {
            usage.refreshContext(sessionId)
            // And the subscription usage along with it: the turn has just cost some of the limit, and
            // the freshest share is precisely at this process - it got it in the answer. A past
            // conversation's replay does not count here: everything there has already happened.
            if (!replay) usage.refreshLimits(preferred = sessionId)
        }
    }

    private fun sendError(sessionId: String, text: String) {
        if (text.isBlank()) return

        noteLoggedOut(text)

        webview?.send(
            buildJsonObject {
                put("type", "error")
                put("sessionId", sessionId)
                put("message", text)
            }.toString(),
        )
    }

    /**
     * A conversation's process died on its own rather than at our request. The panel has something to
     * close: any card that was "running" at that moment would otherwise hang there forever - saying so
     * honestly now is cheaper than guessing later.
     */
    private fun sendProcessExited(sessionId: String, exitCode: Int) {
        webview?.send(
            buildJsonObject {
                put("type", "processExited")
                put("sessionId", sessionId)
                put("exitCode", exitCode)
            }.toString(),
        )
    }

    /**
     * The CLI's answer as it is, only laid out into the fields the panel draws. We invent no statuses of
     * our own: their set ("connected", "needs-auth", "failed", "pending", "disabled") is set by the CLI,
     * and the panel is obliged to call a server's state by the same word the terminal does.
     */
    private fun sendMcpServers(status: JsonObject) {
        val servers = status.items("mcpServers") ?: JsonArray(emptyList())

        webview?.send(
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
        webview?.send(
            buildJsonObject {
                put("type", "mcpActionResult")
                put("ok", ok)
                put("message", message)
            }.toString(),
        )
    }

    private fun sendPlugins(installed: List<InstalledPlugin>, available: List<AvailablePlugin>) {
        webview?.send(
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
        webview?.send(
            buildJsonObject {
                put("type", "pluginActionResult")
                put("ok", ok)
                put("message", message)
            }.toString(),
        )
    }

    private fun sendMarketplaces(marketplaces: List<PluginMarketplace>) {
        webview?.send(
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

    /** A past conversation's replay has been played to the end - see [resumeConversation]. */
    private fun sendReplayFinished(sessionId: String) {
        webview?.send(
            buildJsonObject {
                put("type", "replayFinished")
                put("sessionId", sessionId)
            }.toString(),
        )
    }

    private fun sendStatus(sessionId: String, state: String) {
        webview?.send(
            buildJsonObject {
                put("type", "status")
                put("sessionId", sessionId)
                put("state", state)
            }.toString(),
        )
    }

    /**
     * The tab's name, picked by an LLM from the first message. While the panel waits for that answer the
     * tab already carries a heuristic title - the webview decides for itself whether to apply this
     * answer (the tab may have been closed or the conversation cleared in the meantime).
     */
    private fun sendSessionTitle(sessionId: String, title: String) {
        webview?.send(
            buildJsonObject {
                put("type", "sessionTitle")
                put("sessionId", sessionId)
                put("title", title)
            }.toString(),
        )
    }

    /**
     * Play an alert - if the person genuinely is not looking.
     *
     * `onlyIfAway` arrives from an occasion that happened in the open tab: calling someone to what is
     * already in front of them serves nothing. But "the open tab" does not yet mean "someone is looking
     * at it": the panel may be collapsed into a strip at the side or covered by a neighbouring tool
     * window, and the IDE's window put behind a browser or minimized altogether. Only the shell knows
     * that, so the last word is here.
     *
     * We ask on the interface thread: the windows' state lives there, while the message arrives from the
     * embedded browser on its own.
     */
    private fun playAlert(sound: String, volume: Int, onlyIfAway: Boolean) {
        if (!onlyIfAway) {
            AlertSounds.play(sound, volume)
            return
        }

        // A modal window may stand over the IDE - settings, a commit, a refactoring. An ordinary queue
        // would wait for it to close, that is, stay silent exactly when the person is busy with
        // something else and the sound is needed most, and then let everything accumulated out at once.
        ApplicationManager.getApplication().invokeLater(
            {
                // While the signal waited in the queue, the project could have been closed and the panel
                // disposed: asking them whether anyone is looking at the panel is no longer possible,
                // and there is nobody left to call anyway.
                if (!project.isDisposed && !alive.isDisposed && !isPanelWatched()) {
                    AlertSounds.play(sound, volume)
                }
            },
            ModalityState.any(),
        )
    }

    /**
     * The panel is in view, and the IDE's window is the one the person is working with right now.
     *
     * We ask carefully: by the time of the answer the project's window could have started closing and
     * the tool window been disposed. Bringing the IDE down with an error report over a sound is out of
     * the question; uncertainty is read as "not looking" - staying silent for nothing is worse than
     * calling for nothing.
     */
    private fun isPanelWatched(): Boolean = runCatching {
        toolWindow.isVisible && WindowManager.getInstance().getFrame(project)?.isActive == true
    }.getOrDefault(false)

    private fun sendInit() {
        val preferences = ClaudePreferences.snapshot()

        webview?.send(
            buildJsonObject {
                put("type", "init")
                put("projectName", project.name)
                put("workingDirectory", project.basePath.orEmpty())
                ProjectFacts.gitBranch(project)?.let { put("gitBranch", it) }
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

    /**
     * The panel can be docked to any edge of the screen, and only the side bordering the editor should
     * get a separating frame - as native tool windows have (the terminal, the project view and so on).
     * The anchor changes on the fly, when the user drags the panel to another side, so we subscribe to
     * the change rather than ask once at startup.
     */
    private fun watchDockAnchor() {
        // The stateChanged overload taking ToolWindowManagerEventType is marked @ApiStatus.Internal (the
        // Plugin Verifier does not let it through) - we use the public overload without the event type
        // and compare the anchor ourselves.
        var lastAnchor = toolWindow.anchor
        project.messageBus.connect(parentDisposable).subscribe(
            ToolWindowManagerListener.TOPIC,
            object : ToolWindowManagerListener {
                override fun stateChanged(toolWindowManager: ToolWindowManager) {
                    val currentAnchor = toolWindow.anchor
                    if (currentAnchor == lastAnchor) return
                    lastAnchor = currentAnchor
                    sendDockAnchor()
                }
            },
        )
    }

    private fun sendDockAnchor() {
        webview?.send(
            buildJsonObject {
                put("type", "dockAnchor")
                put("anchor", dockSide(toolWindow.anchor))
            }.toString(),
        )
    }

    /**
     * The panel does not choose its fonts: the IDE sets them, and they change while it runs - a person
     * edits the console font size or switches the theme and expects the panel to follow, like the
     * terminal beside it. The colour scheme carries the console font, the look-and-feel change the
     * interface one, so we listen to both events.
     */
    private fun watchTypography() {
        val connection = ApplicationManager.getApplication().messageBus.connect(parentDisposable)
        connection.subscribe(EditorColorsManager.TOPIC, EditorColorsListener { sendTypography() })
        connection.subscribe(LafManagerListener.TOPIC, LafManagerListener { sendTypography() })
    }

    /**
     * Signing in to an MCP server goes off into a browser outside the IDE - the status is pulled again
     * there by schedule (see [scheduleMcpRefresh]), but waiting for the next mark is awkward: the person
     * authorized and came straight back to the IDE while the list is still the old one. As soon as the
     * window is in focus again, we nudge the refresh right away - the waiting window and the
     * conversation are remembered by scheduleMcpRefresh.
     */
    private fun watchIdeActivation() {
        ApplicationManager.getApplication().messageBus.connect(parentDisposable).subscribe(
            ApplicationActivationListener.TOPIC,
            object : ApplicationActivationListener {
                override fun applicationActivated(ideFrame: IdeFrame) {
                    // And we repaint the panel afresh along the way: the frame may have been left torn
                    // since last time (see repaintWhole), and coming back to the IDE to such a sight is
                    // no good.
                    webview?.repaintWhole()

                    val sessionId = pendingMcpRefreshSessionId ?: return
                    if (System.currentTimeMillis() > pendingMcpRefreshUntil) return
                    refreshMcp(sessionId)
                }
            },
        )
    }

    private fun sendTypography() {
        val typography = IdeTypography.read()
        val host = webview ?: return

        host.setZoom(typography.scale)
        host.send(
            buildJsonObject {
                put("type", "typography")
                put("monoFamily", typography.monoFamily)
                put("uiFamily", typography.uiFamily)
                put("lineHeight", typography.lineHeight)
            }.toString(),
        )
    }

    private fun dockSide(anchor: ToolWindowAnchor): String = when (anchor) {
        ToolWindowAnchor.LEFT -> "left"
        ToolWindowAnchor.TOP -> "top"
        ToolWindowAnchor.BOTTOM -> "bottom"
        else -> "right"
    }

    private companion object {
        /** The round for everything that is expensive and changes unhurriedly - see [scheduleSlowUpdates]. */
        const val SLOW_PERIOD_MINUTES = 1L

        /** Rarer still, because it is the heaviest of the lot - see [scheduleTokenUpdates]. */
        const val TOKENS_PERIOD_MINUTES = 5L

        const val BRANCH_PERIOD_SECONDS = 5L
        const val LOGIN_POLL_SECONDS = 3L
        const val LOGIN_POLL_LIMIT_MINUTES = 10L

        /** How long we wait after a restart before asking for the MCP statuses again. */
        const val MCP_RECONNECT_REFRESH_SECONDS = 3L

        /** The server let us in without a sign-in - the status will update almost at once. */
        const val MCP_AUTH_FIRST_REFRESH_SECONDS = 2L

        /**
         * When to ask for the status again while the person is signing in inside a browser. The CLI does
         * not report the sign-in's end, so we look ourselves - rarely and not forever: in ten seconds or
         * so the sign-in is usually done, and by a minute it becomes clear the window was simply closed.
         */
        val MCP_AUTH_REFRESH_SECONDS = listOf(10L, 25L, 60L)

        /** Within this window a repeated drop counts as an echo of the first rather than a second file. */
        const val DROP_ECHO_MS = 700L
        const val NOT_LOGGED_IN = "Not logged in"
    }
}

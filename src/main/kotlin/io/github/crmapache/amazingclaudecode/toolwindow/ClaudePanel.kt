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
import com.intellij.util.ui.JBUI
import io.github.crmapache.amazingclaudecode.AccBundle
import io.github.crmapache.amazingclaudecode.claude.ClaudePreferences
import io.github.crmapache.amazingclaudecode.claude.ClaudeSessionHub
import io.github.crmapache.amazingclaudecode.claude.SessionClient
import io.github.crmapache.amazingclaudecode.editor.SelectionReference
import io.github.crmapache.amazingclaudecode.sound.AlertSounds
import io.github.crmapache.amazingclaudecode.webview.FilePicker
import io.github.crmapache.amazingclaudecode.webview.IdeTypography
import io.github.crmapache.amazingclaudecode.webview.WebviewClipboard
import io.github.crmapache.amazingclaudecode.webview.WebviewFileDrop
import io.github.crmapache.amazingclaudecode.webview.WebviewHost
import java.awt.BorderLayout
import javax.swing.JComponent
import kotlinx.serialization.json.Json
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.booleanOrNull
import kotlinx.serialization.json.buildJsonObject
import kotlinx.serialization.json.contentOrNull
import kotlinx.serialization.json.intOrNull
import kotlinx.serialization.json.jsonArray
import kotlinx.serialization.json.jsonObject
import kotlinx.serialization.json.jsonPrimitive
import kotlinx.serialization.json.longOrNull
import kotlinx.serialization.json.put

/**
 * The panel's contents: the interface in a browser, and the window's own half of the conversation with
 * it.
 *
 * The conversations themselves no longer live here - they belong to the project (see
 * [ClaudeSessionHub]), and this panel is one of the hub's clients rather than its owner. That is what
 * lets a turn carry on while the panel is closed, and what lets a second client - a phone - see the
 * same feed.
 *
 * What is left here is what genuinely needs a window: the embedded browser, the file chooser and drag
 * and drop, the clipboard, the cursor, the fonts and the dock side, and the sounds - because only a
 * window knows whether anyone is looking at it.
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

    private val hub = ClaudeSessionHub.getInstance(project)

    /**
     * The panel as the hub sees it. The messages arrive as a batch and go straight into the browser's
     * own queue, which already coalesces a frame's worth into one call and cuts oversized ones into
     * pieces (see WebviewHost) - a second such layer here would only argue with it over the order.
     */
    private val client = object : SessionClient {
        override val id = "${ClaudeSessionHub.PANEL_PREFIX}${System.identityHashCode(this@ClaudePanel)}"

        /** This one is the IDE - whatever a person may do at the keyboard, it may ask for. */
        override val isLocal = true

        override fun deliver(messages: List<String>) {
            val host = webview ?: return
            for (message in messages) host.send(message)
        }
    }

    /** When something was last dropped into the panel with the mouse - see [attachDropped]. */
    @Volatile
    private var lastDropAt = 0L

    /** Whether a file is being held over the panel right now - see [sendFileDrag]. */
    @Volatile
    private var fileDragOver = false

    init {
        component = if (WebviewHost.isSupported()) {
            buildWebview(parentDisposable)
        } else {
            buildUnsupportedNotice()
        }

        hub.register(client)
        ClaudePanels.getInstance(project).register(this, parentDisposable)
        Disposer.register(parentDisposable) {
            hub.detach(client.id)
            hub.auth.stopPolling()
        }
        watchDockAnchor()
        watchTypography()
        watchIdeActivation()
    }

    private fun buildWebview(parentDisposable: Disposable): JComponent {
        val host = WebviewHost(parentDisposable) { message -> handleWebviewMessage(message) }
        webview = host

        // Dragging files into the panel: inside the IDE that goes past the embedded browser, so we take
        // it here - see WebviewFileDrop.
        WebviewFileDrop.install(
            component = host.component,
            parentDisposable = parentDisposable,
            onDragging = ::sendFileDrag,
            onDropped = ::attachDropped,
        )

        return host.component
    }

    private fun buildUnsupportedNotice(): JComponent =
        JBPanel<JBPanel<*>>(BorderLayout()).apply {
            border = JBUI.Borders.empty(16)
            add(JBLabel(AccBundle["webview.unsupported.text"]).apply { setAllowAutoWrapping(true) })
        }

    /**
     * A message from the page.
     *
     * Anything about the conversations goes to the hub through its single entrance (see
     * SessionCommands) rather than being handled here: that entrance is where a network client will be
     * filtered, and a second path around it would be a hole nobody would notice. What is handled here
     * is what only this window can do.
     */
    private fun handleWebviewMessage(message: String) {
        val payload = runCatching { Json.parseToJsonElement(message).jsonObject }.getOrNull()

        if (payload == null) {
            thisLogger().warn("Malformed message from webview: $message")
            return
        }

        val field = { name: String -> payload[name]?.jsonPrimitive?.contentOrNull.orEmpty() }

        when (field("type")) {
            "ready" -> {
                thisLogger().info("Webview reported ready")
                // Whatever the page already has: after a reload of the page alone (the conversations
                // outlive it now) only the tail is worth sending.
                hub.attach(client.id, seenSequences(payload))
                sendDockAnchor()
                sendTypography()
            }

            "pick" -> pickAttachment()

            "dropped" -> attachDropped(
                payload["paths"]?.jsonArray.orEmpty().mapNotNull { it.jsonPrimitive.contentOrNull },
            )

            "setComposerLayout" -> ClaudePreferences.composerLayout = field("layout")

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

            else -> if (!hub.commands.handle(client.id, payload)) {
                thisLogger().warn("Unknown message from webview: $message")
            }
        }
    }

    /**
     * What the page says it already has, by conversation. A page that has just opened says nothing and
     * is given everything; one that has merely been reloaded over a live conversation names the last
     * number it saw and is given only the tail.
     */
    private fun seenSequences(payload: JsonObject): Map<String, Long> =
        payload["since"]?.jsonObject.orEmpty()
            .mapNotNull { (sessionId, value) -> value.jsonPrimitive.longOrNull?.let { sessionId to it } }
            .toMap()

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

    // --- Attachments --------------------------------------------------------------

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

    // --- The clipboard --------------------------------------------------------------

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

    // --- Sounds ---------------------------------------------------------------------

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

    // --- The window's own state -------------------------------------------------------

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
     * there by schedule, but waiting for the next mark is awkward: the person authorized and came
     * straight back to the IDE while the list is still the old one. As soon as the window is in focus
     * again, we nudge the refresh right away - the waiting window and the conversation are remembered
     * by the catalogue.
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

                    val sessionId = hub.catalog.pendingMcpRefreshSessionId ?: return
                    if (System.currentTimeMillis() > hub.catalog.pendingMcpRefreshUntil) return
                    hub.catalog.refreshMcp(sessionId)
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
        /** Within this window a repeated drop counts as an echo of the first rather than a second file. */
        const val DROP_ECHO_MS = 700L
    }
}

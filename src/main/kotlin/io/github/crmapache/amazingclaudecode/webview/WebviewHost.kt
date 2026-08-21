package io.github.crmapache.amazingclaudecode.webview

import com.intellij.ide.BrowserUtil
import com.intellij.openapi.Disposable
import com.intellij.openapi.application.ApplicationManager
import com.intellij.openapi.diagnostic.thisLogger
import com.intellij.openapi.util.Disposer
import com.intellij.openapi.wm.IdeGlassPaneUtil
import com.intellij.ui.jcef.JBCefApp
import com.intellij.ui.jcef.JBCefBrowser
import com.intellij.ui.jcef.JBCefBrowserBase
import com.intellij.ui.jcef.JBCefJSQuery
import com.intellij.util.Alarm
import java.awt.Cursor
import java.net.URI
import javax.swing.JComponent
import kotlinx.serialization.builtins.serializer
import kotlinx.serialization.json.Json
import org.cef.browser.CefBrowser
import org.cef.browser.CefFrame
import org.cef.handler.CefLifeSpanHandlerAdapter
import org.cef.handler.CefLoadHandlerAdapter
import org.cef.handler.CefRequestHandlerAdapter
import org.cef.network.CefRequest

/**
 * Calls into the page's receiver for a whole batch of messages.
 *
 * Every message is ready-made JSON, so an array of them is assembled by concatenation. The string
 * itself can only be carried into JS safely as a literal, so we encode it with the serializer and parse
 * it back on the page: otherwise the first quotation mark or newline inside an answer's text would tear
 * the whole call apart, and the channel would fall silent entirely.
 *
 * A long batch is handed over in parts rather than in one call. Every trip into the page is a message
 * between processes, and one too large simply does not reach it: silently, with no exception and no log
 * entry. What got lost then was not one card but a whole piece of the conversation together with the
 * turn's result - the panel stayed "thinking" forever over an answer that had long since arrived. A
 * review turn with a dozen subagents, where every event carries a finished report, is the easiest way
 * to assemble such a batch.
 */
internal fun receiveCalls(batch: List<String>): List<String> {
    val array = batch.joinToString(",", prefix = "[", postfix = "]")
    if (array.length <= MAX_CHUNK_CHARS) return listOf("window.__accReceive && window.__accReceive(JSON.parse(${literal(array)}));")

    val parts = splitKeepingPairs(array, MAX_CHUNK_CHARS)

    return parts.mapIndexed { index, part ->
        val last = index == parts.size - 1
        "window.__accChunk && window.__accChunk(${literal(part)}, $last);"
    }
}

/** A string as a JavaScript literal: the escaping comes from the serializer rather than from us. */
private fun literal(text: String): String = Json.encodeToString(String.serializer(), text)

/**
 * Splitting by length without tearing a surrogate pair apart.
 *
 * Emoji and everything else beyond the basic plane live in a string as two halves, and a half on its
 * own is not a character: it would reach the page as a replacement mark, and the string glued back
 * together would stop parsing as JSON. So the boundary is moved.
 */
private fun splitKeepingPairs(text: String, size: Int): List<String> {
    val parts = mutableListOf<String>()
    var start = 0

    while (start < text.length) {
        var end = minOf(start + size, text.length)
        if (end < text.length && text[end - 1].isHighSurrogate() && end - 1 > start) end--
        parts.add(text.substring(start, end))
        start = end
    }

    return parts
}

/**
 * How long we wait before handing over what has accumulated. A frame lasts about that long: there is
 * nowhere to redraw the interface more often anyway, and a delay of one sixtieth of a second is
 * indistinguishable from instant to the eye.
 */
private const val FLUSH_DELAY_MS = 16

/** The limit on one batch by message count - see flush. */
private const val MAX_BATCH = 200

/**
 * How many characters are carried into the page at once - see receiveCalls. A quarter of a megabyte
 * passes with room to spare, and a longer batch travels in several parts.
 */
private const val MAX_CHUNK_CHARS = 256 * 1024

/** How often a full frame is asked for while messages keep streaming. */
private const val HEAL_PERIOD_MS = 1000L

/** How long after the last batch we ask for a full frame once more - this time on a clean slate. */
private const val HEAL_SETTLE_MS = 250

/**
 * The embedded browser plus the message channel between the interface and the shell.
 *
 * Outwards it offers two things: a component for the panel, and the pair "send into the interface" /
 * "receive from the interface". Nothing here knows about the agent: what arrives are ready JSON
 * strings.
 */
internal class WebviewHost(
    parentDisposable: Disposable,
    private val onMessage: (String) -> Unit,
) : Disposable {

    private val browser = createBrowser()

    private val fromWebview = JBCefJSQuery.create(browser as JBCefBrowserBase)

    /**
     * Messages that have not yet travelled into the page: both those accumulated before it was ready
     * (otherwise the agent's first events fly into nothing - the receiver is not declared yet) and those
     * gathered into a batch over the last frame.
     */
    private val outbox = ArrayDeque<String>()
    private var pageReady = false
    private var flushScheduled = false

    /**
     * Only one thread at a time may take the queue apart. There are two of them here: the timer and the
     * one declaring the page ready - and without this lock they could take the queue apart at once and
     * carry their batches into the page in reverse order. An agent's event arriving ahead of its
     * predecessor is no longer a stutter but a scrambled feed.
     */
    private val flushLock = Any()

    // Created in init rather than here: their parent is this very object, and before init it is not yet
    // in the disposable tree.
    private val flushAlarm: Alarm
    private val healAlarm: Alarm

    /** When a whole frame was last asked to be redrawn - see [heal]. */
    @Volatile
    private var lastHealAt = 0L

    /**
     * The host is gone: the panel was closed along with the project - see [dispose].
     *
     * Volatile, because it is asked about from other threads: an agent's event arrives on a background
     * one, while the panel is closed on the interface thread.
     */
    @Volatile
    private var disposed = false

    val component: JComponent get() = browser.component

    init {
        Disposer.register(parentDisposable, this)
        Disposer.register(this, browser)
        Disposer.register(this, fromWebview)

        flushAlarm = Alarm(Alarm.ThreadToUse.POOLED_THREAD, this)
        healAlarm = Alarm(Alarm.ThreadToUse.POOLED_THREAD, this)

        fromWebview.addHandler { payload: String ->
            onMessage(payload)
            null
        }

        browser.jbCefClient.addLoadHandler(
            object : CefLoadHandlerAdapter() {
                /**
                 * The page is loading again - the person may have reloaded it from the crash screen, for
                 * instance. The message receiver lives in that page and disappears with it, so we clear
                 * the readiness: until the new one is in place everything goes into the queue. Otherwise
                 * a running turn's events (and its result) would be sent into nothing and lost forever -
                 * the panel would come back with an idle input in the middle of the work.
                 */
                override fun onLoadStart(browser: CefBrowser?, frame: CefFrame?, transitionType: CefRequest.TransitionType?) {
                    if (frame?.isMain != true) return
                    synchronized(outbox) { pageReady = false }
                }

                override fun onLoadEnd(browser: CefBrowser, frame: CefFrame, httpStatusCode: Int) {
                    if (!frame.isMain) return
                    thisLogger().info("Webview loaded: ${browser.url} (HTTP $httpStatusCode)")
                    installBridge()
                }
            },
            browser.cefBrowser,
        )

        keepNavigationOutside()

        thisLogger().info("Webview renders offscreen: ${browser.isOffScreenRendering}")

        WebviewResources.register()
        browser.loadURL(startUrl())
    }

    /**
     * The panel is an interface, not a browser: any departure from its own page is handed to the system
     * browser.
     *
     * The feed's cards already open links outside (see openExternal), but navigation can be reached past
     * them too: with the middle mouse button, by a link in an unexpected place, by a redirect, by
     * `target="_blank"`. It happened once: a click on a link carried the whole panel off to a GitHub
     * page - with the chat interface replaced by someone else's site and not a single "back" button.
     *
     * We intercept at the browser's own level: nothing gets past here by any route.
     */
    private fun keepNavigationOutside() {
        browser.jbCefClient.addRequestHandler(
            object : CefRequestHandlerAdapter() {
                override fun onBeforeBrowse(
                    browser: CefBrowser?,
                    frame: CefFrame?,
                    request: CefRequest?,
                    userGesture: Boolean,
                    isRedirect: Boolean,
                ): Boolean {
                    val url = request?.url ?: return false
                    if (isOwnPage(url)) return false

                    BrowserUtil.browse(url)
                    // true means "cancel the navigation": the panel's page stays where it is.
                    return true
                }
            },
            browser.cefBrowser,
        )

        browser.jbCefClient.addLifeSpanHandler(
            object : CefLifeSpanHandlerAdapter() {
                override fun onBeforePopup(
                    browser: CefBrowser?,
                    frame: CefFrame?,
                    targetUrl: String?,
                    targetFrameName: String?,
                ): Boolean {
                    val url = targetUrl.orEmpty()
                    if (url.isNotBlank() && !isOwnPage(url)) BrowserUtil.browse(url)
                    // The embedded browser never opens a window of its own.
                    return true
                }
            },
            browser.cefBrowser,
        )
    }

    /**
     * Our own page is the one we loaded ourselves: the plugin's resources or Vite's dev server. Internal
     * addresses (`about:blank`, the developer tools) are ours too: handing them to the system browser is
     * meaningless.
     *
     * We compare a parsed address rather than the start of a string. By the start of a string
     * `http://acc-webview.example.com` would also count as ours - someone else's site that only has to
     * match the first few characters to carry the whole panel off to itself; `http://localhost:5173`
     * would take `:51730` for itself in exactly the same way.
     */
    private fun isOwnPage(url: String): Boolean {
        if (url.startsWith("about:") || url.startsWith("devtools://") || url.startsWith("chrome-devtools://")) return true

        val origin = originOf(url) ?: return false
        if (origin == originOf(WebviewResources.ORIGIN)) return true

        return devUrl.isNotBlank() && origin == originOf(devUrl)
    }

    /** The scheme, host and port - what makes a page ours. The path does not matter for that. */
    private fun originOf(url: String): String? = runCatching {
        val uri = URI(url)
        val host = uri.host ?: return@runCatching null
        "${uri.scheme.orEmpty().lowercase()}://${host.lowercase()}:${uri.port}"
    }.getOrNull()

    /**
     * Send a message into the interface. The order is kept even while the page is still loading.
     *
     * It does not travel at once: messages accumulate and are handed over as a batch once per frame. The
     * agent runs with partial messages, that is, during an answer events pour in by the dozen per
     * second, and every separate trip into the page is both a call across a process boundary and a task
     * of its own in the browser, which it can no longer merge with its neighbours: as many messages, as
     * many full interface repaints. As a batch they turn into one.
     */
    fun send(json: String) {
        // An agent's event may arrive on a background thread (processTerminated, for instance) after the
        // panel has been closed and this host disposed together with its flushAlarm - then there is
        // nothing to schedule a request into, and the platform would complain "Already disposed".
        if (disposed) return

        synchronized(outbox) {
            outbox.addLast(json)
            if (!pageReady || flushScheduled) return
            flushScheduled = true
        }
        flushAlarm.addRequest(::flush, FLUSH_DELAY_MS)
    }

    /** Open the browser's developer tools - there is no debugging the interface otherwise. */
    fun openDevTools() = browser.openDevtools()

    /**
     * Set the cursor the page asks for.
     *
     * Usually that is the browser's own concern, but here it renders offscreen, in a separate process
     * (the platform switches that mode on itself, ignoring the request for a window - see the warning in
     * the log), and its cursor does not reach the IDE's window: over the panel's buttons an ordinary
     * arrow would remain. The names arrive the same as in CSS.
     */
    fun setCursor(cursor: String) {
        val type = when (cursor) {
            "pointer" -> Cursor.HAND_CURSOR
            "text" -> Cursor.TEXT_CURSOR
            // Dragging: AWT has no grabbing hand of its own, and the nearest thing in meaning is the
            // move cursor.
            "grab", "grabbing", "move" -> Cursor.MOVE_CURSOR
            "col-resize", "ew-resize" -> Cursor.E_RESIZE_CURSOR
            "row-resize", "ns-resize" -> Cursor.N_RESIZE_CURSOR
            "wait", "progress" -> Cursor.WAIT_CURSOR
            "crosshair" -> Cursor.CROSSHAIR_CURSOR
            else -> Cursor.DEFAULT_CURSOR
        }

        val component = browser.component
        val predefined = Cursor.getPredefinedCursor(type)
        ApplicationManager.getApplication().invokeLater {
            component.cursor = predefined
            // By the same trick the platform's own ThreeComponentsSplitter divider uses: component.cursor
            // alone is not always enough over the window's glass pane - that pane is what answers for
            // what is seen above a component while the mouse moves across it.
            IdeGlassPaneUtil.find(component).setCursor(predefined, this)
        }
    }

    /**
     * Give the panel the keyboard focus.
     *
     * Needed after a file is dragged in: it is dragged from the project tree, the focus stays there, and
     * typing into the input field without a mouse click would be impossible. In two steps, because the
     * focus here is double: first the IDE's component gets it, and only inside that the page itself,
     * which Swing knows nothing about.
     */
    fun focus() {
        browser.component.requestFocusInWindow()
        browser.cefBrowser.setFocus(true)
    }

    /**
     * Scale the whole page - that is how the panel follows the font size in the IDE's settings without
     * rewriting sizes in the styles (see IdeTypography).
     *
     * This is a multiplier rather than a zoom level: the browser itself counts zoom in steps of 1.2, but
     * the platform takes multiples (1.0 being a hundred per cent) and converts them into steps for us. A
     * logarithm of our own has no place here - it would be applied second and squash the page down to
     * the smallest possible scale.
     */
    fun setZoom(scale: Double) {
        if (scale <= 0) return
        browser.zoomLevel = scale
    }

    /**
     * The host has been closed. We note it ourselves rather than ask the platform later: it can only be
     * asked about that in a deprecated way, while an object's own answer to "am I still alive?" is right
     * here - and it is the first to know.
     */
    override fun dispose() {
        disposed = true
    }

    private fun installBridge() {
        // The interface sends through window.__accSend and receives through window.__accReceive, which it
        // declares itself. Readiness is announced with an event: the page may have rendered before the
        // bridge was in place.
        // __accChunk gathers a batch that arrived in parts (see receiveCalls): the parts come in order
        // over the same channel, so they are glued in arrival order, without numbering. The buffer lives
        // in the page itself and disappears with it - an unsent tail after a reload has nothing to glue
        // itself to.
        val bridge = """
            window.__accSend = function (payload) {
                ${fromWebview.inject("payload")}
            };
            window.__accChunk = function (part, last) {
                window.__accParts = (window.__accParts || []).concat(part);
                if (!last) return;
                var joined = window.__accParts.join('');
                window.__accParts = [];
                if (window.__accReceive) window.__accReceive(JSON.parse(joined));
            };
            window.dispatchEvent(new Event('acc:ready'));
        """.trimIndent()

        browser.cefBrowser.executeJavaScript(bridge, browser.cefBrowser.url, 0)

        synchronized(outbox) { pageReady = true }
        flush()
    }

    /**
     * Hand the page everything that has accumulated.
     *
     * The batch is limited by message count: a past conversation's replay arrives all at once, and the
     * interface finds it easier to parse in portions rather than whole. The remainder travels as the
     * next batch within the same trip, without extra waiting. The string's own length is handled by
     * receiveCalls - it is what cuts it into parts.
     */
    private fun flush() {
        synchronized(flushLock) {
            while (true) {
                val batch = synchronized(outbox) {
                    flushScheduled = false
                    if (!pageReady || outbox.isEmpty()) return
                    List(minOf(outbox.size, MAX_BATCH)) { outbox.removeFirst() }
                }
                deliver(batch)
            }
        }
    }

    private fun deliver(batch: List<String>) {
        for (call in receiveCalls(batch)) {
            browser.cefBrowser.executeJavaScript(call, browser.cefBrowser.url, 0)
        }

        heal()
    }

    /**
     * Ask the browser to redraw a whole frame.
     *
     * The panel renders offscreen (the platform does not allow windowed mode - see setCursor), that is,
     * a finished frame travels from a separate process through shared memory, while the IDE updates only
     * the changed pieces on its side. Under a stream of events the frames overlap, and a band from an
     * old one stays on the panel: one state on the left, another on the right. It does not pass by
     * itself - the following frames touch only small things like a running counter, and nobody repaints
     * the band.
     *
     * A full frame wipes that band out. We ask for one no more than once a second while the stream runs,
     * and once more when the stream has settled: that way a tear lives for fractions of a second instead
     * of "until you touch the panel", and on a quiet panel this work does not happen at all.
     */
    private fun heal() {
        if (disposed) return

        val now = System.currentTimeMillis()
        if (now - lastHealAt >= HEAL_PERIOD_MS) repaintWhole()

        healAlarm.cancelAllRequests()
        healAlarm.addRequest(::repaintWhole, HEAL_SETTLE_MS)
    }

    /**
     * The same thing, but for an outside reason: we came back to the IDE's window - and the frame there
     * may have been left torn since last time.
     */
    fun repaintWhole() {
        lastHealAt = System.currentTimeMillis()
        if (browser.isOffScreenRendering) browser.cefBrowser.invalidate()
        // One invalidate does not fix everything: the band may have stayed in the frame the IDE already
        // holds on its side. repaint() is safe from any thread.
        browser.component.repaint()
    }

    /** Vite's dev server address, if the panel was asked to load from it rather than from the plugin's resources. */
    private val devUrl: String get() = System.getProperty("acc.webview.devUrl").orEmpty()

    private fun startUrl(): String {
        if (devUrl.isNotBlank()) {
            thisLogger().info("Loading webview from dev server: $devUrl")
            return devUrl
        }
        return "${WebviewResources.ORIGIN}/index.html"
    }

    internal companion object {

        /** Whether this IDE can show the embedded browser the panel lives in. */
        fun isSupported(): Boolean = JBCefApp.isSupported()

        /**
         * A proxy settings warm-up used to stand here, reading them in advance and by the ordinary route.
         *
         * It worked around someone else's breakage: while raising the embedded browser, JCEF read the
         * IDE's proxy inside its class's static initializer, and the platform forbids creating services
         * in such initializers - it answered the very first read with an error in "IDE Internal Errors",
         * with our plugin in the title, although none of that code is ours. The warm-up created the same
         * service in advance from ordinary code, and there was nothing left to complain about.
         *
         * The platform has fixed it: in current builds its browser does not touch the proxy settings from
         * the initializer at all. The workaround is gone, and with it went the only reference here to a
         * class closed to plugins - because of which the marketplace's verifier marked the version as
         * problematic. Verified live: the panel opened at the very start of the IDE (the case where the
         * error used to be caught) comes up without a single error entry.
         */
        private fun createBrowser(): JBCefBrowser = JBCefBrowser.createBuilder()
            .setOffScreenRendering(false)
            .build()
    }
}

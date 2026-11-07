package io.github.crmapache.amazingclaudecode.webview

import com.intellij.openapi.Disposable
import com.intellij.openapi.application.ApplicationManager
import com.intellij.openapi.application.ModalityState
import com.intellij.openapi.diagnostic.logger
import com.intellij.openapi.util.Disposer
import io.github.crmapache.amazingclaudecode.feedback.DiagnosticsLog
import java.util.concurrent.CopyOnWriteArrayList
import java.util.concurrent.atomic.AtomicBoolean
import org.cef.CefApp

/**
 * The IDE's embedded browser as a whole has stopped - and every page in it, the panel's included.
 *
 * Since 2025.1 the browser runs out of process: one `cef_server` per IDE serves every embedded page, and
 * the IDE talks to it over sockets. The IDE also tears it down by mistake (JBR-10027, open as of
 * 2026.2): a callback thread of its own that sits idle for a minute and retires is taken for "the
 * browser went away", and the server is shut down. Reproduced in the sandbox on WebStorm 262.8665 (the
 * same code ships in 262.10968): one extra connection to the callback port, closed again, and sixty
 * seconds later the server was gone.
 *
 * Nothing in the IDE notices. idea.log stays silent, the platform keeps reporting the browser as
 * initialized, and there is no way back short of restarting the IDE. What the person saw was the panel
 * freezing on its last frame and then turning white the next time it was resized or shown - "the window
 * goes completely white and I have to restart the IDE", a marketplace review of 2026-10-29.
 *
 * The one signal there is, is the server's disconnection callback: a single slot, which the IDE itself
 * never fills (checked across every jar of the 2026.2 distribution). We take it, and every open panel is
 * told, so that a white rectangle becomes words and a restart button.
 */
internal object BrowserLoss {

    private val LOG = logger<BrowserLoss>()

    private val installed = AtomicBoolean(false)

    /** Whether the browser has stopped since the IDE started. There is no coming back from it. */
    @Volatile
    var happened = false
        private set

    private val watchers = CopyOnWriteArrayList<() -> Unit>()

    /**
     * Start listening. Once per IDE process, and only after the browser exists: the slot belongs to the
     * running server, which there is no asking for before the first page is built.
     *
     * A browser running inside the IDE's own process has no server to lose - its failures are a page's
     * own, and the page reports those itself (see WebviewHost.onRenderProcessTerminated).
     */
    fun install() {
        if (!installed.compareAndSet(false, true)) return

        runCatching {
            val app = CefApp.getInstance()
            if (app.server == null) return
            app.setDisconnectionCallback(::stopped)
        }.onFailure { LOG.warn("Could not listen for the embedded browser going away", it) }
    }

    /**
     * Hear about it on the IDE's own thread - at once, if it has already happened. A panel opened after
     * the fact would otherwise sit waiting for news that came before it.
     */
    fun watch(parent: Disposable, onStopped: () -> Unit) {
        watchers.add(onStopped)
        Disposer.register(parent) { watchers.remove(onStopped) }
        if (happened) tell(listOf(onStopped))
    }

    /**
     * The server went away while the IDE was not shutting down - the platform calls this only then.
     *
     * It arrives on the very thread whose retirement caused it, and that thread is about to tear the
     * connection down: the news is handed to the IDE's thread rather than acted upon here.
     */
    internal fun stopped() {
        if (happened) return
        happened = true

        LOG.warn("The IDE's embedded browser has stopped (cef_server disconnected, see JBR-10027)")
        DiagnosticsLog.note(DiagnosticsLog.PANEL, "embedded browser stopped: cef_server disconnected")
        tell(watchers.toList())
    }

    private fun tell(whom: List<() -> Unit>) {
        if (whom.isEmpty()) return
        val application = ApplicationManager.getApplication() ?: return
        application.invokeLater(
            {
                for (watcher in whom) {
                    runCatching(watcher).onFailure { LOG.warn("A panel could not take the news of the browser stopping", it) }
                }
            },
            ModalityState.any(),
        )
    }
}

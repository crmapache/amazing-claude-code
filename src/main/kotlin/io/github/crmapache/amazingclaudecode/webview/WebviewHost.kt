package io.github.crmapache.amazingclaudecode.webview

import com.intellij.openapi.Disposable
import com.intellij.openapi.diagnostic.thisLogger
import com.intellij.openapi.util.Disposer
import com.intellij.ui.jcef.JBCefBrowser
import com.intellij.ui.jcef.JBCefBrowserBase
import com.intellij.ui.jcef.JBCefJSQuery
import javax.swing.JComponent
import kotlinx.serialization.builtins.serializer
import kotlinx.serialization.json.Json
import org.cef.browser.CefBrowser
import org.cef.browser.CefFrame
import org.cef.handler.CefLoadHandlerAdapter

/**
 * Встроенный браузер плюс канал сообщений между интерфейсом и оболочкой.
 *
 * Наружу отдаёт две вещи: компонент для панели и пару «отправить в интерфейс» /
 * «принять из интерфейса». Про агента здесь ничего не знают: сюда приходят уже
 * готовые строки JSON.
 */
internal class WebviewHost(
    parentDisposable: Disposable,
    private val onMessage: (String) -> Unit,
) : Disposable {

    private val browser = JBCefBrowser.createBuilder()
        .setOffScreenRendering(false)
        .build()

    private val fromWebview = JBCefJSQuery.create(browser as JBCefBrowserBase)

    /**
     * Сообщения, накопленные до готовности страницы. Без этой очереди первые
     * события агента улетают в пустоту: страница ещё не успела объявить приёмник.
     */
    private val pending = ArrayDeque<String>()
    private var pageReady = false

    val component: JComponent get() = browser.component

    init {
        Disposer.register(parentDisposable, this)
        Disposer.register(this, browser)
        Disposer.register(this, fromWebview)

        fromWebview.addHandler { payload: String ->
            onMessage(payload)
            null
        }

        browser.jbCefClient.addLoadHandler(
            object : CefLoadHandlerAdapter() {
                override fun onLoadEnd(browser: CefBrowser, frame: CefFrame, httpStatusCode: Int) {
                    if (!frame.isMain) return
                    thisLogger().info("Webview loaded: ${browser.url} (HTTP $httpStatusCode)")
                    installBridge()
                }
            },
            browser.cefBrowser,
        )

        WebviewResources.register()
        browser.loadURL(startUrl())
    }

    /** Отправить сообщение в интерфейс. Порядок сохраняется, даже если страница ещё грузится. */
    fun send(json: String) {
        synchronized(pending) {
            if (!pageReady) {
                pending.addLast(json)
                return
            }
        }
        deliver(json)
    }

    /** Открыть инструменты разработчика браузера — иначе интерфейс не отладить. */
    fun openDevTools() = browser.openDevtools()

    override fun dispose() = Unit

    private fun installBridge() {
        // Интерфейс отправляет через window.__accSend, а получает через window.__accReceive,
        // который объявляет сам. О готовности сообщаем событием: страница могла
        // отрисоваться раньше, чем мост встал на место.
        val bridge = """
            window.__accSend = function (payload) {
                ${fromWebview.inject("payload")}
            };
            window.dispatchEvent(new Event('acc:ready'));
        """.trimIndent()

        browser.cefBrowser.executeJavaScript(bridge, browser.cefBrowser.url, 0)

        val queued = synchronized(pending) {
            pageReady = true
            pending.toList().also { pending.clear() }
        }
        queued.forEach(::deliver)
    }

    private fun deliver(json: String) {
        // Строку в JS безопасно вносить только как литерал, поэтому кодируем её
        // сериализатором, а на странице разбираем обратно.
        val literal = Json.encodeToString(String.serializer(), json)
        val call = "window.__accReceive && window.__accReceive(JSON.parse($literal));"
        browser.cefBrowser.executeJavaScript(call, browser.cefBrowser.url, 0)
    }

    private fun startUrl(): String {
        val devUrl = System.getProperty("acc.webview.devUrl").orEmpty()
        if (devUrl.isNotBlank()) {
            thisLogger().info("Loading webview from dev server: $devUrl")
            return devUrl
        }
        return "${WebviewResources.ORIGIN}/index.html"
    }
}

package io.github.crmapache.amazingclaudecode.webview

import com.intellij.ide.BrowserUtil
import com.intellij.openapi.Disposable
import com.intellij.openapi.application.ApplicationManager
import com.intellij.openapi.diagnostic.thisLogger
import com.intellij.openapi.util.Disposer
import java.awt.Cursor
import java.net.URI
import com.intellij.ui.jcef.JBCefBrowser
import com.intellij.ui.jcef.JBCefBrowserBase
import com.intellij.ui.jcef.JBCefJSQuery
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
                /**
                 * Страница грузится заново — например, её перезагрузил сам человек
                 * с экрана краха. Приёмник сообщений живёт в этой странице и
                 * пропадает вместе с ней, поэтому готовность снимаем: пока новая
                 * не встанет, всё уходит в очередь. Иначе события идущего хода
                 * (и его итог) отправлялись бы в пустоту и терялись навсегда —
                 * панель возвращалась бы с простаивающим вводом посреди работы.
                 */
                override fun onLoadStart(browser: CefBrowser?, frame: CefFrame?, transitionType: CefRequest.TransitionType?) {
                    if (frame?.isMain != true) return
                    synchronized(pending) { pageReady = false }
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
     * Панель — это интерфейс, а не браузер: любой уход со своей страницы отдаём
     * системному браузеру.
     *
     * Сами карточки ленты и так открывают ссылки наружу (см. openExternal), но
     * дойти до навигации можно и мимо них: средней кнопкой мыши, ссылкой в
     * неожиданном месте, редиректом, `target="_blank"`. Один раз это и случилось:
     * клик по ссылке увёл всю панель на страницу GitHub — с интерфейсом чата,
     * замещённым чужим сайтом, и без единой кнопки «назад».
     *
     * Перехватываем на уровне самого браузера: здесь мимо не пройдёт ни один путь.
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
                    // true — «навигацию отменить»: страница панели остаётся на месте.
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
                    // Отдельного окна встроенный браузер не открывает никогда.
                    return true
                }
            },
            browser.cefBrowser,
        )
    }

    /**
     * Своя страница — та, что мы сами и загрузили: ресурсы плагина или dev-сервер
     * Vite. Служебные адреса (`about:blank`, инструменты разработчика) тоже наши:
     * отдавать их системному браузеру бессмысленно.
     *
     * Сравниваем разобранный адрес, а не начало строки. По началу строки своим
     * оказывался бы и `http://acc-webview.example.com` — чужой сайт, которому
     * достаточно совпасть первыми буквами, чтобы увести всю панель на себя;
     * `http://localhost:5173` точно так же принимал бы за себя `:51730`.
     */
    private fun isOwnPage(url: String): Boolean {
        if (url.startsWith("about:") || url.startsWith("devtools://") || url.startsWith("chrome-devtools://")) return true

        val origin = originOf(url) ?: return false
        if (origin == originOf(WebviewResources.ORIGIN)) return true

        return devUrl.isNotBlank() && origin == originOf(devUrl)
    }

    /** Схема, хост и порт — то, что и делает страницу своей. Путь для этого не важен. */
    private fun originOf(url: String): String? = runCatching {
        val uri = URI(url)
        val host = uri.host ?: return@runCatching null
        "${uri.scheme.orEmpty().lowercase()}://${host.lowercase()}:${uri.port}"
    }.getOrNull()

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

    /**
     * Поставить курсор, который просит страница.
     *
     * Обычно это забота самого браузера, но здесь он рисуется офскрин, в
     * отдельном процессе (платформа включает такой режим сама, игнорируя просьбу
     * об окне — см. предупреждение в логе), и курсор оттуда до окна IDE не
     * доходит: над кнопками панели оставалась бы обычная стрелка. Имена приходят
     * такие же, как в CSS.
     */
    fun setCursor(cursor: String) {
        val type = when (cursor) {
            "pointer" -> Cursor.HAND_CURSOR
            "text" -> Cursor.TEXT_CURSOR
            // Перетаскивание: своей руки-с-хваткой в AWT нет, ближайшее по смыслу —
            // курсор перемещения.
            "grab", "grabbing", "move" -> Cursor.MOVE_CURSOR
            "col-resize", "ew-resize" -> Cursor.E_RESIZE_CURSOR
            "row-resize", "ns-resize" -> Cursor.N_RESIZE_CURSOR
            "wait", "progress" -> Cursor.WAIT_CURSOR
            "crosshair" -> Cursor.CROSSHAIR_CURSOR
            else -> Cursor.DEFAULT_CURSOR
        }

        val component = browser.component
        ApplicationManager.getApplication().invokeLater { component.cursor = Cursor.getPredefinedCursor(type) }
    }

    /**
     * Отдать панели фокус клавиатуры.
     *
     * Нужно после перетаскивания файла: тащат его из дерева проекта, там фокус и
     * остаётся, и печатать в поле ввода без клика мышью было бы некуда. Двумя
     * шагами, потому что фокус тут двойной: сперва его получает компонент IDE, а
     * уже внутри него — сама страница, о которой Swing ничего не знает.
     */
    fun focus() {
        browser.component.requestFocusInWindow()
        browser.cefBrowser.setFocus(true)
    }

    /**
     * Увеличить страницу целиком — так панель следует за размером шрифта в
     * настройках IDE, не переписывая размеры в стилях (см. IdeTypography).
     *
     * Здесь именно множитель, а не уровень зума: сам браузер считает зум шагами
     * по 1.2, но платформа принимает разы (1.0 — сто процентов) и переводит их в
     * шаги за нас. Своего логарифма тут быть не должно — он применился бы вторым
     * и сплющил страницу до минимально возможного масштаба.
     */
    fun setZoom(scale: Double) {
        if (scale <= 0) return
        browser.zoomLevel = scale
    }

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

    /** Адрес dev-сервера Vite, если панель просили грузить с него, а не из ресурсов плагина. */
    private val devUrl: String get() = System.getProperty("acc.webview.devUrl").orEmpty()

    private fun startUrl(): String {
        if (devUrl.isNotBlank()) {
            thisLogger().info("Loading webview from dev server: $devUrl")
            return devUrl
        }
        return "${WebviewResources.ORIGIN}/index.html"
    }
}

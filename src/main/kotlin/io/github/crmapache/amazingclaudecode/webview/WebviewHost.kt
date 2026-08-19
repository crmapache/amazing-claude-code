package io.github.crmapache.amazingclaudecode.webview

import com.intellij.ide.BrowserUtil
import com.intellij.openapi.Disposable
import com.intellij.openapi.application.ApplicationManager
import com.intellij.openapi.diagnostic.thisLogger
import com.intellij.openapi.util.Disposer
import com.intellij.openapi.wm.IdeGlassPaneUtil
import com.intellij.util.Alarm
import java.awt.Cursor
import java.net.URI
import com.intellij.ui.jcef.JBCefApp
import com.intellij.ui.jcef.JBCefBrowser
import com.intellij.ui.jcef.JBCefBrowserBase
import com.intellij.ui.jcef.JBCefJSQuery
import com.intellij.ui.jcef.JBCefProxySettings
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
 * Вызовы приёмника на странице для целой пачки сообщений.
 *
 * Каждое сообщение — уже готовый JSON, поэтому массив из них собирается склейкой.
 * Саму строку в JS безопасно вносить только как литерал, поэтому кодируем её
 * сериализатором, а на странице разбираем обратно: иначе первая же кавычка или
 * перенос строки в тексте ответа рвали бы весь вызов, и канал замолкал бы целиком.
 *
 * Длинную пачку отдаём частями, а не одним вызовом. Каждый заход в страницу — это
 * сообщение между процессами, и слишком большое до неё просто не доходит: молча,
 * без исключения и без записи в лог. Терялась при этом не одна карточка, а весь
 * кусок разговора вместе с итогом хода — панель навсегда оставалась «думающей»
 * над ответом, который давно пришёл. Ходом ревью с десятком субагентов, где
 * каждое событие несёт готовый отчёт, такую пачку набрать проще всего.
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

/** Строка как литерал JavaScript: экранирование берём у сериализатора, а не своё. */
private fun literal(text: String): String = Json.encodeToString(String.serializer(), text)

/**
 * Нарезка по длине, не разрывающая пару суррогатов.
 *
 * Эмодзи и прочее за пределами основной плоскости живёт в строке двумя половинками, и половинка
 * сама по себе — не символ: до страницы она доедет заменяющим знаком, а склеенная
 * обратно строка перестанет разбираться как JSON. Поэтому границу сдвигаем.
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
 * Сколько ждём, прежде чем отдать накопившееся странице. Кадр примерно столько и
 * длится: чаще перерисовывать интерфейс всё равно некуда, а задержка в одну
 * шестидесятую секунды на глаз неотличима от мгновенной.
 */
private const val FLUSH_DELAY_MS = 16

/** Предел одной пачки по числу сообщений — см. flush. */
private const val MAX_BATCH = 200

/**
 * Сколько букв разом заносим в страницу — см. receiveCalls. Четверть мегабайта
 * проходит с запасом, а пачка длиннее уезжает несколькими частями.
 */
private const val MAX_CHUNK_CHARS = 256 * 1024

/** Как часто просим полный кадр, пока сообщения идут потоком. */
private const val HEAL_PERIOD_MS = 1000L

/** Через сколько после последней пачки просим полный кадр ещё раз — уже начисто. */
private const val HEAL_SETTLE_MS = 250

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

    private val browser = createBrowser()

    private val fromWebview = JBCefJSQuery.create(browser as JBCefBrowserBase)

    /**
     * Сообщения, ещё не уехавшие в страницу: и накопленные до её готовности
     * (иначе первые события агента улетают в пустоту — приёмник ещё не объявлен),
     * и собранные в пачку за последний кадр.
     */
    private val outbox = ArrayDeque<String>()
    private var pageReady = false
    private var flushScheduled = false

    /**
     * Разбирать очередь можно только одному потоку за раз. Их тут двое: таймер и
     * тот, что объявляет страницу готовой, — и без этого замка они могли бы
     * разобрать очередь одновременно и занести свои пачки в странице в обратном
     * порядке. Событие агента, приехавшее раньше своего предшественника, — это уже
     * не подтормаживание, а перепутанная лента.
     */
    private val flushLock = Any()

    // Заводятся не здесь, а в init: своим родителем они берут этот же объект, а он
    // до init ещё не встал в дерево disposable-ов.
    private val flushAlarm: Alarm
    private val healAlarm: Alarm

    /** Когда в последний раз просили перерисовать кадр целиком — см. heal. */
    @Volatile
    private var lastHealAt = 0L

    /**
     * Хоста больше нет: панель закрыли вместе с проектом — см. [dispose].
     *
     * Volatile, потому что спрашивают об этом с чужих потоков: событие агента
     * приезжает с фонового, а закрывают панель в интерфейсном.
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
                 * Страница грузится заново — например, её перезагрузил сам человек
                 * с экрана краха. Приёмник сообщений живёт в этой странице и
                 * пропадает вместе с ней, поэтому готовность снимаем: пока новая
                 * не встанет, всё уходит в очередь. Иначе события идущего хода
                 * (и его итог) отправлялись бы в пустоту и терялись навсегда —
                 * панель возвращалась бы с простаивающим вводом посреди работы.
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

    /**
     * Отправить сообщение в интерфейс. Порядок сохраняется, даже если страница ещё
     * грузится.
     *
     * Уходит не сразу: сообщения копятся и отдаются пачкой раз в кадр. Агент
     * запущен с частичными сообщениями, то есть во время ответа события сыплются
     * десятками в секунду, а каждый отдельный заход в страницу — это и вызов через
     * границу процессов, и своя задача в браузере, которую тот уже не может слить
     * с соседними: сколько сообщений, столько и полных перерисовок интерфейса.
     * Пачкой они превращаются в одну.
     */
    fun send(json: String) {
        // Событие агента может прилететь с фонового потока (например,
        // processTerminated) уже после того, как панель закрыли и этот хост
        // задиспоузили вместе со своим flushAlarm — тогда планировать в него
        // запрос нечего, иначе платформа заругается «Already disposed».
        if (disposed) return

        synchronized(outbox) {
            outbox.addLast(json)
            if (!pageReady || flushScheduled) return
            flushScheduled = true
        }
        flushAlarm.addRequest(::flush, FLUSH_DELAY_MS)
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
        val predefined = Cursor.getPredefinedCursor(type)
        ApplicationManager.getApplication().invokeLater {
            component.cursor = predefined
            // Тем же приёмом, что и делитель ThreeComponentsSplitter в самой
            // платформе: одного component.cursor поверх стеклянной панели окна не
            // всегда достаточно — она отвечает за то, что видно поверх компонента,
            // пока по нему двигают мышью.
            IdeGlassPaneUtil.find(component)?.setCursor(predefined, this)
        }
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

    /**
     * Хост закрыли. Отмечаемся сами, а не спрашиваем потом у платформы: спросить
     * её об этом можно только устаревшим способом, а свой ответ на вопрос «я ещё
     * жив?» у объекта и так есть — он же и узнаёт об этом первым.
     */
    override fun dispose() {
        disposed = true
    }

    private fun installBridge() {
        // Интерфейс отправляет через window.__accSend, а получает через window.__accReceive,
        // который объявляет сам. О готовности сообщаем событием: страница могла
        // отрисоваться раньше, чем мост встал на место.
        // __accChunk собирает пачку, приехавшую частями (см. receiveCalls): части
        // приходят по очереди тем же каналом, поэтому склеиваются в порядке
        // прихода, без номеров. Буфер живёт в самой странице и пропадает вместе с
        // ней — недосланный хвост после перезагрузки ни с чем не склеится.
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
     * Отдать странице всё, что накопилось.
     *
     * Пачку ограничиваем по числу сообщений: перепись прошлого разговора приходит
     * сразу целиком, и разбирать её интерфейсу удобнее порциями, а не всю сразу.
     * Остаток уезжает следующей пачкой в том же заходе, без лишнего ожидания. За
     * длину самой строки отвечает receiveCalls — она же и режет её на части.
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
     * Попросить браузер перерисовать кадр целиком.
     *
     * Панель рисуется офскрин (режим окна платформа не даёт — см. setCursor), то
     * есть готовый кадр едет из отдельного процесса через общую память, а IDE
     * обновляет у себя только изменившиеся куски. Под потоком событий кадры
     * наезжают друг на друга, и на панели остаётся полоса от старого: слева одно
     * состояние, справа другое. Само это не проходит — следующие кадры трогают
     * только мелочь вроде бегущего счётчика, а полосу никто не перерисовывает.
     *
     * Полный кадр эту полосу стирает. Просим его не чаще раза в секунду, пока идёт
     * поток, и ещё раз — когда поток стих: так разрыв живёт доли секунды вместо
     * «пока не потрогаешь панель», а на спокойной панели этой работы нет вовсе.
     */
    private fun heal() {
        if (disposed) return

        val now = System.currentTimeMillis()
        if (now - lastHealAt >= HEAL_PERIOD_MS) repaintWhole()

        healAlarm.cancelAllRequests()
        healAlarm.addRequest(::repaintWhole, HEAL_SETTLE_MS)
    }

    /**
     * То же самое, но по внешнему поводу: вернулись в окно IDE — а кадр там мог
     * остаться разорванным ещё с прошлого раза.
     */
    fun repaintWhole() {
        lastHealAt = System.currentTimeMillis()
        if (browser.isOffScreenRendering) browser.cefBrowser.invalidate()
        // Один invalidate чинит не всё: полоса могла остаться и в том кадре,
        // который IDE уже держит у себя. repaint() из любого потока безопасен.
        browser.component.repaint()
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

    internal companion object {

        /**
         * Умеет ли эта IDE показывать встроенный браузер, в котором живёт панель.
         *
         * Спрашиваем через себя, а не у JCEF напрямую: любое касание браузера — и
         * проверка в том числе — должно идти после чтения настроек прокси, см.
         * loadProxySettings.
         */
        fun isSupported(): Boolean {
            loadProxySettings()
            return JBCefApp.isSupported()
        }

        private fun createBrowser(): JBCefBrowser {
            loadProxySettings()
            return JBCefBrowser.createBuilder()
                .setOffScreenRendering(false)
                .build()
        }

        /**
         * Настройки прокси, прочитанные заранее и обычным путём.
         *
         * Поднимая встроенный браузер, JCEF читает прокси IDE в статическом
         * инициализаторе своего класса, а платформа запрещает создавать в таких
         * инициализаторах сервисы — и на первое же чтение отвечает ошибкой в «IDE
         * Internal Errors», с нашим плагином в заголовке, хотя код там не наш.
         *
         * Достаётся она тому, кто первым в процессе поднимает браузер: запрещено
         * именно создание сервиса, а живёт он от первого обращения до закрытия
         * IDE, и следующим достаётся уже готовый. Поэтому ошибка и приходила
         * через раз — панель, восстановленная из прошлой сессии, открывается на
         * самом старте и обгоняет тут саму IDE.
         *
         * Читаем те же настройки тем же способом, но из обычного кода: к моменту
         * инициализатора создавать ему уже нечего, и жаловаться не на что.
         */
        private fun loadProxySettings() {
            // Класс лежит в том же bundled-плагине, что и сам браузер, так что
            // просто так не пропадёт. Но панель важнее прогрева: если он однажды
            // не пройдёт, вернётся ровно та безобидная запись в лог, которую он и
            // убирает, а браузер поднимется как раньше.
            runCatching { JBCefProxySettings.getInstance() }
                .onFailure { thisLogger().warn("Could not read the IDE proxy settings up front", it) }
        }
    }
}

package io.github.crmapache.amazingclaudecode.toolwindow

import com.intellij.ide.BrowserUtil
import com.intellij.openapi.Disposable
import com.intellij.openapi.application.ApplicationManager
import com.intellij.ide.ui.LafManagerListener
import com.intellij.openapi.diagnostic.thisLogger
import com.intellij.openapi.editor.colors.EditorColorsListener
import com.intellij.openapi.editor.colors.EditorColorsManager
import com.intellij.openapi.project.Project
import com.intellij.openapi.util.Disposer
import com.intellij.openapi.wm.ToolWindow
import com.intellij.openapi.wm.ToolWindowAnchor
import com.intellij.openapi.wm.ToolWindowManager
import com.intellij.openapi.wm.ex.ToolWindowManagerListener
import com.intellij.ui.components.JBLabel
import com.intellij.ui.components.JBPanel
import com.intellij.ui.jcef.JBCefApp
import com.intellij.util.concurrency.AppExecutorUtil
import com.intellij.util.ui.JBUI
import io.github.crmapache.amazingclaudecode.AccBundle
import io.github.crmapache.amazingclaudecode.claude.ClaudeAuth
import io.github.crmapache.amazingclaudecode.claude.ClaudeCommandHints
import io.github.crmapache.amazingclaudecode.claude.ClaudeHistory
import io.github.crmapache.amazingclaudecode.claude.ClaudeLogin
import io.github.crmapache.amazingclaudecode.claude.ClaudeMcp
import io.github.crmapache.amazingclaudecode.claude.McpServer
import io.github.crmapache.amazingclaudecode.claude.AvailablePlugin
import io.github.crmapache.amazingclaudecode.claude.ClaudeFileSearch
import io.github.crmapache.amazingclaudecode.claude.ClaudePlugin
import io.github.crmapache.amazingclaudecode.claude.InstalledPlugin
import io.github.crmapache.amazingclaudecode.claude.PluginMarketplace
import io.github.crmapache.amazingclaudecode.claude.ClaudePreferences
import io.github.crmapache.amazingclaudecode.claude.ClaudeSessions
import io.github.crmapache.amazingclaudecode.claude.ClaudeTokenUsage
import io.github.crmapache.amazingclaudecode.claude.ClaudeUsagePing
import io.github.crmapache.amazingclaudecode.claude.ImageAttachment
import io.github.crmapache.amazingclaudecode.claude.ClaudeSettings
import io.github.crmapache.amazingclaudecode.claude.PermissionBypass
import io.github.crmapache.amazingclaudecode.claude.PermissionChannel
import io.github.crmapache.amazingclaudecode.claude.PermissionModes
import io.github.crmapache.amazingclaudecode.claude.PermissionPrompt
import io.github.crmapache.amazingclaudecode.claude.PermissionRules
import io.github.crmapache.amazingclaudecode.claude.PermissionServer
import io.github.crmapache.amazingclaudecode.editor.SelectionReference
import io.github.crmapache.amazingclaudecode.project.ProjectFacts
import io.github.crmapache.amazingclaudecode.webview.FilePicker
import io.github.crmapache.amazingclaudecode.webview.IdeTypography
import io.github.crmapache.amazingclaudecode.webview.WebviewFileDrop
import io.github.crmapache.amazingclaudecode.webview.WebviewHost
import java.awt.BorderLayout
import java.util.concurrent.ConcurrentHashMap
import java.util.concurrent.ScheduledFuture
import java.util.concurrent.TimeUnit
import javax.swing.JComponent
import kotlinx.serialization.json.Json
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.add
import kotlinx.serialization.json.addJsonObject
import kotlinx.serialization.json.buildJsonObject
import kotlinx.serialization.json.contentOrNull
import kotlinx.serialization.json.jsonArray
import kotlinx.serialization.json.jsonObject
import kotlinx.serialization.json.jsonPrimitive
import kotlinx.serialization.json.put
import kotlinx.serialization.json.putJsonArray
import kotlinx.serialization.json.putJsonObject

/**
 * Содержимое панели: интерфейс в браузере и разговоры с агентом под ним.
 *
 * Здесь же живёт весь разбор сообщений между ними. События агента наверх уходят
 * нетронутыми: разбирать их удобнее на стороне интерфейса, где и рисуются, а
 * дублировать модели в двух языках смысла нет.
 */
internal class ClaudePanel(
    private val project: Project,
    private val toolWindow: ToolWindow,
    private val parentDisposable: Disposable,
) {

    val component: JComponent

    private var webview: WebviewHost? = null
    private var sessions: ClaudeSessions? = null
    private var permissions: PermissionServer? = null

    /**
     * Пока вход не подтверждён, процессы не поднимаем: без него агент отвечает на
     * любой вопрос одной строкой про /login, а панель показывает экран входа.
     */
    @Volatile
    private var loggedIn = false

    /** Опрос состояния входа, пока пользователь проходит его в терминале. */
    private var loginPolling: ScheduledFuture<*>? = null

    /** Какого исхода ждём от опроса: вошёл или, наоборот, вышел. */
    @Volatile
    private var awaitedAuth: Boolean? = null

    /** Запросы, на которые ждём ответа: по ним же вспоминаем правило для «всегда». */
    private val awaiting = ConcurrentHashMap<String, PermissionServer.Request>()

    /**
     * То же, но спрошенное самим агентом по управляющему каналу, а не хуком:
     * отвечать на такой вопрос надо тому разговору, который его задал.
     */
    private val channelPermissions = ConcurrentHashMap<String, ChannelPermission>()

    /**
     * Планы, ждущие решения человека, по идентификатору вызова ExitPlanMode — то
     * есть по идентификатору карточки плана в ленте. Отдельно от остальных
     * разрешений: спрашивает про план не карточка разрешения, а сама карточка
     * плана с её кнопками, которую панель уже нарисовала по вызову инструмента.
     */
    private val plans = ConcurrentHashMap<String, ChannelPermission>()

    private data class ChannelPermission(
        val sessionId: String,
        val requestId: String,
        val toolName: String,
        val command: String,
    )

    /** Когда в панель последний раз что-то бросили мышью — см. attachDropped. */
    @Volatile
    private var lastDropAt = 0L

    init {
        component = if (JBCefApp.isSupported()) {
            buildWebview(parentDisposable)
        } else {
            buildUnsupportedNotice()
        }

        ClaudePanels.getInstance(project).register(this, parentDisposable)
        Disposer.register(parentDisposable) { loginPolling?.cancel(false) }
        watchDockAnchor()
        watchTypography()
    }

    private fun buildWebview(parentDisposable: Disposable): JComponent {
        val host = WebviewHost(parentDisposable) { message -> handleWebviewMessage(message) }
        webview = host

        val server = if (ClaudeSettings.canHook()) {
            PermissionServer { request -> askPermission(request) }.also {
                Disposer.register(parentDisposable, it)
                permissions = it
            }
        } else {
            thisLogger().warn("curl not found: the panel will not be able to ask for permissions")
            null
        }

        sessions = ClaudeSessions(
            workingDirectory = project.basePath,
            settingsJson = { sessionId ->
                server?.let { ClaudeSettings.withPermissionHook(it.port, it.token, sessionId) }
            },
            parentDisposable = parentDisposable,
            onEvent = { sessionId, line -> forwardAgentEvent(sessionId, line) },
            onError = { sessionId, text -> sendError(sessionId, text) },
            onFinished = { sessionId -> sendStatus(sessionId, "idle") },
            onCrashed = { sessionId, exitCode -> sendProcessExited(sessionId, exitCode) },
            onToolPermission = { sessionId, request -> askToolPermission(sessionId, request) },
        )

        // Перетаскивание файлов в панель: внутри IDE оно идёт мимо встроенного
        // браузера, поэтому принимаем его здесь — см. WebviewFileDrop.
        WebviewFileDrop.install(host.component, parentDisposable) { files ->
            attachDropped(files.map { it.path })
        }

        scheduleUsageUpdates(parentDisposable)
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

            "stop" -> {
                // Прерываем ход, а не рубим процесс: разговор должен остаться. В idle
                // не спешим — статус покажет настоящее result-событие, а если агент
                // даже не подтвердит прерывание, честно скажем, что дело плохо.
                sessions?.interrupt(sessionId) {
                    sendError(sessionId, "Claude didn't confirm the stop - the process may be stuck.")
                }
            }

            // Насильная остановка: пользователь уже видел, что штатный Stop не
            // подтвердился, и явно попросил прибить процесс.
            "kill" -> {
                sessions?.stop(sessionId)
                sendStatus(sessionId, "idle")
            }

            "newSession" -> {
                // Ветка наследует переписку того разговора, из которого её открыли.
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

            "permissionDecision" -> decidePermission(field("id"), field("decision"))

            "planDecision" -> decidePlan(field("id"), field("decision"))

            "setMode" -> changeMode(sessionId, field("mode"))

            "setModel" -> sessions?.setModel(sessionId, field("model"))

            "setEffort" -> sessions?.setEffort(sessionId, field("effort"))

            "refreshUsage" -> refreshUsage()

            "login" -> startLogin()

            "logout" -> {
                ClaudeLogin.logout(project)
                pollAuth(expected = false)
            }

            "history" -> sendHistory()

            "resumeSession" -> resumeConversation(sessionId, field("conversationId"))

            "checkAuth" -> checkAuth()

            "openDevTools" -> webview?.openDevTools()

            // Курсор ставит оболочка: офскрин-браузер свой до окна IDE не доносит.
            "cursor" -> webview?.setCursor(field("cursor"))

            // Номер PR в статус-баре — ссылка: открываем её в системном браузере,
            // а не внутри JCEF, чтобы не заводить внутри панели полноценный веб-вьюпорт.
            "openExternal" -> field("url").takeIf { it.isNotBlank() }?.let { BrowserUtil.browse(it) }

            "mcpList" -> ClaudeMcp.list(
                project.basePath,
                onResult = { servers -> sendMcpServers(servers) },
                onError = { error -> sendMcpActionResult(false, error) },
            )

            "mcpAdd" -> ClaudeMcp.add(
                project.basePath,
                name = field("name"),
                commandOrUrl = field("command"),
                transport = field("transport").ifBlank { null },
                onResult = { message ->
                    sendMcpActionResult(true, message)
                    ClaudeMcp.list(project.basePath, onResult = ::sendMcpServers, onError = {})
                },
                onError = { error -> sendMcpActionResult(false, error) },
            )

            "mcpReconnect" -> reconnectMcp(sessionId)

            "mcpRemove" -> ClaudeMcp.remove(
                project.basePath,
                name = field("name"),
                onResult = { message ->
                    sendMcpActionResult(true, message)
                    ClaudeMcp.list(project.basePath, onResult = ::sendMcpServers, onError = {})
                },
                onError = { error -> sendMcpActionResult(false, error) },
            )

            "pluginList" -> ClaudePlugin.list(
                project.basePath,
                onResult = { installed, available -> sendPlugins(installed, available) },
                onError = { error -> sendPluginActionResult(false, error) },
            )

            "pluginInstall" -> ClaudePlugin.install(
                project.basePath,
                plugin = field("plugin"),
                onResult = { message ->
                    sendPluginActionResult(true, message)
                    ClaudePlugin.list(project.basePath, onResult = ::sendPlugins, onError = {})
                },
                onError = { error -> sendPluginActionResult(false, error) },
            )

            "pluginUninstall" -> ClaudePlugin.uninstall(
                project.basePath,
                plugin = field("plugin"),
                onResult = { message ->
                    sendPluginActionResult(true, message)
                    ClaudePlugin.list(project.basePath, onResult = ::sendPlugins, onError = {})
                },
                onError = { error -> sendPluginActionResult(false, error) },
            )

            "pluginEnable" -> ClaudePlugin.enable(
                project.basePath,
                plugin = field("plugin"),
                onResult = { message ->
                    sendPluginActionResult(true, message)
                    ClaudePlugin.list(project.basePath, onResult = ::sendPlugins, onError = {})
                },
                onError = { error -> sendPluginActionResult(false, error) },
            )

            "pluginDisable" -> ClaudePlugin.disable(
                project.basePath,
                plugin = field("plugin"),
                onResult = { message ->
                    sendPluginActionResult(true, message)
                    ClaudePlugin.list(project.basePath, onResult = ::sendPlugins, onError = {})
                },
                onError = { error -> sendPluginActionResult(false, error) },
            )

            "marketplaceList" -> ClaudePlugin.marketplaces(
                project.basePath,
                onResult = { marketplaces -> sendMarketplaces(marketplaces) },
                onError = { error -> sendPluginActionResult(false, error) },
            )

            "marketplaceAdd" -> ClaudePlugin.addMarketplace(
                project.basePath,
                source = field("source"),
                onResult = { message ->
                    sendPluginActionResult(true, message)
                    ClaudePlugin.marketplaces(project.basePath, onResult = ::sendMarketplaces, onError = {})
                },
                onError = { error -> sendPluginActionResult(false, error) },
            )

            "marketplaceRemove" -> ClaudePlugin.removeMarketplace(
                project.basePath,
                name = field("name"),
                onResult = { message ->
                    sendPluginActionResult(true, message)
                    ClaudePlugin.marketplaces(project.basePath, onResult = ::sendMarketplaces, onError = {})
                },
                onError = { error -> sendPluginActionResult(false, error) },
            )

            else -> thisLogger().warn("Unknown message from webview: $message")
        }
    }

    // --- Разрешения ---------------------------------------------------------

    private fun askPermission(request: PermissionServer.Request) {
        awaiting[request.id] = request

        webview?.send(
            buildJsonObject {
                put("type", "permission")
                put("id", request.id)
                put("sessionId", request.sessionId.ifEmpty { MAIN_SESSION })
                put("toolName", request.toolName)
                put("target", request.target)
                put("command", request.command)
                put("mode", request.mode)
                request.agentId?.let { put("agentId", it) }
            }.toString(),
        )
    }

    /**
     * Разрешения спрашивает и сам агент — встречным управляющим запросом по потоку
     * разговора (см. ClaudeLaunch.PERMISSION_CHANNEL_FLAG). До хука такие вызовы не
     * доходят: либо инструмент не из тех, что хук стережёт, либо человек нужен
     * инструменту по самой его природе.
     *
     * План — как раз второй случай, и карточка для него в ленте уже есть: её
     * нарисовал сам вызов ExitPlanMode. Спрашивать поверх неё второй раз нечего,
     * нужно лишь запомнить, куда отправить ответ её кнопок.
     */
    private fun askToolPermission(sessionId: String, request: PermissionChannel.ToolPermission) {
        val pending = ChannelPermission(
            sessionId = sessionId,
            requestId = request.requestId,
            toolName = request.toolName,
            command = PermissionPrompt.command(request.toolName, request.input),
        )

        if (request.toolName == PLAN_TOOL) {
            val itemId = request.toolUseId
            if (itemId == null) {
                // Без идентификатора вызова карточку в ленте не найти, а значит и
                // кнопкам её не ответить — честнее отказать сразу, чем молча
                // остановить ход навсегда.
                thisLogger().warn("Plan permission without a tool_use_id: nothing to attach it to")
                sessions?.answerPermission(sessionId, request.requestId, allow = false, message = PLAN_LOST)
                return
            }

            plans[itemId] = pending
            return
        }

        channelPermissions[request.requestId] = pending

        webview?.send(
            buildJsonObject {
                put("type", "permission")
                put("id", request.requestId)
                put("sessionId", sessionId.ifEmpty { MAIN_SESSION })
                put("toolName", request.toolName)
                put("target", PermissionPrompt.target(request.toolName, request.input))
                put("command", pending.command)
                put("mode", PermissionModes.resolve(ClaudePreferences.mode))
            }.toString(),
        )
    }

    private fun decidePermission(id: String, decision: String) {
        val channel = channelPermissions.remove(id)
        val request = awaiting.remove(id)
        val toolName = request?.toolName ?: channel?.toolName
        val command = request?.command ?: channel?.command

        if (decision == "always" && toolName != null && command != null) {
            project.basePath?.let { path -> PermissionRules.allowAlways(path, toolName, command) }
        }

        if (channel != null) {
            sessions?.answerPermission(channel.sessionId, id, allow = decision != "deny")
            return
        }

        permissions?.resolve(
            id,
            when (decision) {
                "deny" -> PermissionServer.Decision.DENY
                else -> PermissionServer.Decision.ALLOW
            },
        )
    }

    /**
     * Кнопки под планом. «Approve & run» — это разрешение на выход из режима плана:
     * агент получает «план одобрен» и тут же продолжает работу тем же ходом. «Keep
     * planning» — отказ с объяснением: для агента это сигнал доработать план и
     * показать его снова.
     *
     * Сам по себе выход из plan возвращает CLI не во вседозволенность, а в обычное
     * «спрашивать всегда» — тогда каждый следующий шаг одобренного плана снова
     * упирался бы в разрешение, вопрос за вопросом, хотя человек уже согласился на
     * план целиком. Поэтому одобрение переключает режим в bypass следом: карточка
     * плана и была тем единственным вопросом, который стоило задать.
     */
    private fun decidePlan(itemId: String, decision: String) {
        val pending = plans.remove(itemId) ?: run {
            // Карточка старше нынешнего процесса: разговор с тех пор перезапускали
            // (или это чужая вкладка), и отвечать давно некому.
            thisLogger().info("No plan waiting for a decision: $itemId")
            return
        }

        sessions?.answerPermission(
            pending.sessionId,
            pending.requestId,
            allow = decision == "approve",
            message = KEEP_PLANNING,
        )

        if (decision == "approve") changeMode(pending.sessionId, "bypassPermissions")
    }

    // --- Вход ---------------------------------------------------------------

    /** Спрашиваем CLI в фоне: это запуск процесса, в потоке интерфейса ему не место. */
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

            if (status.loggedIn) refreshUsage()
        }
    }

    /**
     * Вход идёт во встроенном терминале: там открывается браузер и ждётся возврат.
     * Когда он закончится, нам никто не сообщит, поэтому просто переспрашиваем CLI,
     * пока не увидим вход — или пока не надоест.
     */
    private fun startLogin() {
        ClaudeLogin.login(project)
        pollAuth(expected = true)
    }

    /**
     * Ждём, пока человек закончит в терминале: сообщить об этом нам некому. Ждём
     * именно нужного исхода — после выхода опрос должен остановиться на «вышел»,
     * а не молотить до самого предела.
     */
    private fun pollAuth(expected: Boolean) {
        awaitedAuth = expected
        loginPolling?.cancel(false)
        loginPolling = AppExecutorUtil.getAppScheduledExecutorService().scheduleWithFixedDelay(
            { checkAuth() },
            LOGIN_POLL_SECONDS,
            LOGIN_POLL_SECONDS,
            TimeUnit.SECONDS,
        )

        AppExecutorUtil.getAppScheduledExecutorService().schedule(
            { loginPolling?.cancel(false) },
            LOGIN_POLL_LIMIT_MINUTES,
            TimeUnit.MINUTES,
        )
    }

    /**
     * Разрешён ли режим «без вопросов» — от этого зависит круг Shift+Tab в панели.
     * Ответ требует расспросить сам CLI, поэтому уходит в фон и приезжает отдельным
     * сообщением: держать из-за него первую отрисовку панели незачем.
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
            }.toString(),
        )
    }

    /**
     * Агент отвечает про вход обычным текстом, а не ошибкой запуска, поэтому ловим
     * его в потоке: иначе панель осталась бы с полем ввода, в которое бессмысленно
     * писать.
     */
    private fun noteLoggedOut(text: String) {
        if (!loggedIn || !text.contains(NOT_LOGGED_IN)) return

        loggedIn = false
        checkAuth()
    }

    // --- Режим разрешений ---------------------------------------------------

    /**
     * Панель показывает применённый режим, а не выбранный: если агент откажется,
     * интерфейс должен вернуться к прежнему, а не врать галочкой в меню.
     */
    private fun changeMode(sessionId: String, mode: String) {
        sessions?.setPermissionMode(sessionId, mode) { change ->
            webview?.send(
                buildJsonObject {
                    put("type", "mode")
                    put("sessionId", sessionId)
                    put("mode", change.mode)
                    put("applied", change.applied)
                    // Отказ без причины выглядит поломкой панели, хотя дело обычно
                    // в модели: «auto» доступен не всякой.
                    if (change.error.isNotEmpty()) put("error", change.error)
                }.toString(),
            )
        }
    }

    // --- Прошлые разговоры --------------------------------------------------

    /** Чтение папки с историей — обращение к диску, поэтому в фоне. */
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
     * Открываем прошлый разговор: процесс поднимется с его переписью, а панель
     * проигрывает сохранённые события в ленту — иначе вкладка выглядела бы пустой,
     * хотя агент всё помнит.
     */
    private fun resumeConversation(sessionId: String, conversationId: String) {
        if (conversationId.isEmpty()) return

        sessions?.resume(sessionId, conversationId)

        ApplicationManager.getApplication().executeOnPooledThread {
            for (line in ClaudeHistory.replay(project.basePath, conversationId)) {
                forwardAgentEvent(sessionId, line)
            }
        }
    }

    // --- Ссылка из редактора ------------------------------------------------

    /** Кусок файла из редактора: в поле ввода он станет ссылкой, а не текстом. */
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
                put("asPlainText", reference.asPlainText)
            }.toString(),
        )
    }

    // --- Расход по окнам ----------------------------------------------------

    /** Опрос не бесплатный (отдельный процесс), поэтому редкий и в фоне. */
    private fun scheduleUsageUpdates(parentDisposable: Disposable) {
        val task = AppExecutorUtil.getAppScheduledExecutorService().scheduleWithFixedDelay(
            {
                refreshUsage()
                // PR спрашивает GitHub отдельным процессом — та же редкая
                // периодичность, что у расхода. Ветку сюда не тащим: она обновляется
                // своим отдельным, куда более частым кругом (см. scheduleBranchUpdates).
                refreshPullRequest()
                // Список файлов для подсказки "@" тоже стареет — агент мог создать
                // новые за это время, ту же редкую периодичность, что у остального.
                refreshFiles()
                // Плагины и скиллы могли поставить/обновить за это время — та же
                // периодичность, что и у остального фонового обновления.
                refreshCommandHints()
            },
            USAGE_PERIOD_MINUTES,
            USAGE_PERIOD_MINUTES,
            TimeUnit.MINUTES,
        )

        Disposer.register(parentDisposable) { task.cancel(false) }
    }

    /**
     * Ветка — это просто чтение маленького файла на диске, не поход к GitHub, как
     * у PR (см. scheduleUsageUpdates). Гонять её тем же редким кругом было ошибкой:
     * после `git checkout` в терминале панель показывала старую ветку заметное
     * время. Здесь круг короткий — тот же расход почти нулевой.
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

    /** Обход диска — не мгновенный на большом репозитории, поэтому в фоне. */
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
     * Описание и синтаксис аргумента слэш-команд — из фронтматтера файлов на
     * диске (см. ClaudeCommandHints). Список установленных плагинов нужен только
     * ради их installPath, поэтому берём лёгкий `plugin list` без `--available`.
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
     * Расход по окнам подписки. Пока разговор уже живёт, спрашиваем его самого
     * по управляющему каналу — бесплатно, процесс и так поднят. До первого
     * сообщения процесса нет, а поднимать полноценную сессию с MCP и хуками
     * только за этой цифрой не стоит — вместо этого разовый лёгкий пинг
     * (--safe-mode, без customizations) через [ClaudeUsagePing].
     */
    private fun refreshUsage() {
        // Спрашивать расход до входа нечего: процесс поднимется только затем, чтобы
        // ответить, что пользователь не вошёл.
        if (!loggedIn) return

        if (sessions?.isRunning(MAIN_SESSION) == true) {
            sessions?.requestUsage(MAIN_SESSION, ::sendUsage)
        } else {
            ClaudeUsagePing.request(
                project.basePath,
                onResult = ::sendUsage,
                onError = { error -> thisLogger().info("Usage ping skipped: $error") },
            )
        }

        // Отдельно и в фоне: это скан транскриптов ВСЕХ проектов, а не спрос у
        // текущего разговора — своя цена, поэтому не ждём и не блокируем ответ выше.
        AppExecutorUtil.getAppExecutorService().submit {
            webview?.send(
                buildJsonObject {
                    put("type", "usage")
                    put("todayTokens", ClaudeTokenUsage.today())
                }.toString(),
            )
        }
    }

    /** Общий разбор ответа get_usage — не важно, от живого разговора он или от пинга. */
    private fun sendUsage(usage: JsonObject) {
        val limits = usage["rate_limits"]?.jsonObject

        webview?.send(
            buildJsonObject {
                put("type", "usage")
                limits?.let { window(it, "five_hour")?.let { w -> put("session", w) } }
                limits?.let { window(it, "seven_day")?.let { w -> put("week", w) } }
                contextWindow(usage)?.let { put("contextWindow", it) }
            }.toString(),
        )
    }

    /**
     * Размер окна контекста зависит от модели: у больших он миллион, а не двести
     * тысяч. Берём его из ответа, иначе доля на датчике будет втрое заниженной.
     */
    private fun contextWindow(usage: JsonObject): Int? {
        val models = usage["session"]?.jsonObject?.get("model_usage")?.jsonObject ?: return null

        return models.values
            .mapNotNull { it.jsonObject["contextWindow"]?.jsonPrimitive?.contentOrNull?.toIntOrNull() }
            // 0 отсекаем наравне с null: на стороне вебвью его девать некуда —
            // `?? current` не срабатывает на 0 (это не nullish), он застревает
            // в state панели навсегда, и датчик контекста делится на ноль.
            .filter { it > 0 }
            .maxOrNull()
    }

    private fun window(limits: JsonObject, name: String): JsonObject? {
        val window = limits[name]?.jsonObject ?: return null
        val percent = window["utilization"]?.jsonPrimitive?.contentOrNull?.toDoubleOrNull() ?: return null

        return buildJsonObject {
            put("percent", percent.toInt())
            put("resets", window["resets_at"]?.jsonPrimitive?.contentOrNull.orEmpty())
        }
    }

    // --- Прочее -------------------------------------------------------------

    /** Диалог выбора живёт в потоке интерфейса IDE, поэтому уходим туда явно. */
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
     * Переподключение MCP-серверов — перезапуском процесса разговора.
     *
     * Другого способа нет: подкоманды у `claude mcp` для этого не существует, а
     * слэш-команда `/mcp` доступна только интерактивному терминалу — в потоковом
     * режиме CLI на неё честно отвечает отказом (именно это и видел пользователь
     * вместо переподключения). Переписка при перезапуске сохраняется: процесс
     * поднимается тем же разговором.
     */
    private fun reconnectMcp(sessionId: String) {
        val restarted = sessions?.restart(sessionId) == true

        sendMcpActionResult(
            true,
            if (restarted) {
                "Restarted the conversation to reconnect MCP servers — your chat continues where it left off."
            } else {
                "Nothing to reconnect yet: servers connect when this chat starts."
            },
        )

        // Список спрашиваем заново, но не сразу: свежеподнятому процессу нужно
        // время на рукопожатие с серверами, иначе увидим прежние статусы.
        AppExecutorUtil.getAppScheduledExecutorService().schedule(
            {
                ClaudeMcp.list(
                    project.basePath,
                    onResult = { servers -> sendMcpServers(servers) },
                    onError = { error -> sendMcpActionResult(false, error) },
                )
            },
            MCP_RECONNECT_REFRESH_SECONDS,
            TimeUnit.SECONDS,
        )
    }

    /**
     * Файлы и папки, брошенные в поле ввода. Отвечаем тем же picked, что и на
     * диалог выбора: для панели это одно и то же вложение, разница лишь в том,
     * каким жестом его позвали.
     */
    private fun attachDropped(paths: List<String>) {
        if (paths.isEmpty()) return

        // Один и тот же бросок теоретически может дойти обоими путями сразу —
        // и от IDE, и от самой страницы. Плашки тогда задвоились бы, поэтому
        // второй за тот же жест отбрасываем.
        val now = System.currentTimeMillis()
        if (now - lastDropAt < DROP_ECHO_MS) return
        lastDropAt = now

        ApplicationManager.getApplication().executeOnPooledThread {
            // Виртуальную файловую систему трогаем не из потока интерфейса: путь
            // может указывать куда угодно, вплоть до неподмонтированного диска.
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

            // Файл тащат из дерева проекта — там фокус и остаётся, и печатать в
            // поле ввода пришлось бы после отдельного клика мышью. Возвращаем
            // его панели сами; курсор внутри неё встаёт за плашкой (см. Composer).
            if (attachments.isNotEmpty()) {
                ApplicationManager.getApplication().invokeLater { webview?.focus() }
            }
        }
    }

    /** Ветка для нижней строки. Дешёвое чтение файла — можно спрашивать часто. */
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
     * Pull request текущей ветки для нижней строки. Шлём поле даже когда PR нет
     * (пустой строкой), а не молчим — иначе сторона вебвью не отличит «сейчас
     * закрыли/смержили PR» от «это сообщение вообще не про PR», см. reducePanel.
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

    /** Событие агента — уже готовый JSON, поэтому вкладываем его в конверт как есть. */
    private fun forwardAgentEvent(sessionId: String, line: String) {
        if (!line.startsWith("{")) {
            sendError(sessionId, line)
            return
        }

        noteLoggedOut(line)
        webview?.send("""{"type":"agent","sessionId":"$sessionId","event":$line}""")
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
     * Процесс разговора умер сам, а не по нашей просьбе. Панели есть что закрыть:
     * любая карточка, которая была «выполняется» в этот момент, иначе так и
     * останется висеть вечно — сказать честно сейчас дешевле, чем потом гадать.
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

    private fun sendMcpServers(servers: List<McpServer>) {
        webview?.send(
            buildJsonObject {
                put("type", "mcpServers")
                putJsonArray("servers") {
                    servers.forEach { server ->
                        addJsonObject {
                            put("name", server.name)
                            put("command", server.command)
                            put("connected", server.connected)
                            put("status", server.status)
                        }
                    }
                }
            }.toString(),
        )
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

    private fun sendStatus(sessionId: String, state: String) {
        webview?.send(
            buildJsonObject {
                put("type", "status")
                put("sessionId", sessionId)
                put("state", state)
            }.toString(),
        )
    }

    private fun sendInit() {
        val preferences = ClaudePreferences.snapshot()

        webview?.send(
            buildJsonObject {
                put("type", "init")
                put("projectName", project.name)
                put("workingDirectory", project.basePath.orEmpty())
                put("canAskPermissions", permissions != null)
                ProjectFacts.gitBranch(project)?.let { put("gitBranch", it) }
                // Выбор модели и остального переживает перезапуск IDE: искать его
                // заново после каждого открытия — то же, что не сохранять вовсе.
                putJsonObject("preferences") {
                    put("model", preferences.model)
                    put("effort", preferences.effort)
                    // Тем же значением, с которым реально поднимется процесс:
                    // селектор в панели обязан показывать правду с первой секунды.
                    put("mode", PermissionModes.resolve(preferences.mode))
                }
            }.toString(),
        )
    }

    /**
     * Панель может быть прижата к любому краю экрана, и только сторона, что
     * граничит с редактором, должна получить разделительную рамку — как у
     * нативных тулвиндоу (терминал, проект и т.д.). Анкор меняется на лету,
     * когда пользователь перетаскивает панель на другую сторону, поэтому
     * подписываемся на смену, а не спрашиваем один раз при старте.
     */
    private fun watchDockAnchor() {
        project.messageBus.connect(parentDisposable).subscribe(
            ToolWindowManagerListener.TOPIC,
            object : ToolWindowManagerListener {
                override fun stateChanged(
                    toolWindowManager: ToolWindowManager,
                    changedToolWindow: ToolWindow,
                    changeType: ToolWindowManagerListener.ToolWindowManagerEventType,
                ) {
                    if (changedToolWindow.id != toolWindow.id) return
                    if (changeType != ToolWindowManagerListener.ToolWindowManagerEventType.SetToolWindowAnchor &&
                        changeType != ToolWindowManagerListener.ToolWindowManagerEventType.SetSideToolAndAnchor
                    ) {
                        return
                    }
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
     * Шрифты панель не выбирает сама — их задаёт IDE, и меняются они прямо во
     * время работы: человек правит размер консольного шрифта или переключает
     * тему и ждёт, что панель поедет следом, как терминал рядом. Схема цветов
     * несёт консольный шрифт, смена оформления — интерфейсный, поэтому слушаем
     * оба события.
     */
    private fun watchTypography() {
        val connection = ApplicationManager.getApplication().messageBus.connect(parentDisposable)
        connection.subscribe(EditorColorsManager.TOPIC, EditorColorsListener { sendTypography() })
        connection.subscribe(LafManagerListener.TOPIC, LafManagerListener { sendTypography() })
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
        const val MAIN_SESSION = "main"
        const val USAGE_PERIOD_MINUTES = 1L
        const val BRANCH_PERIOD_SECONDS = 5L
        const val LOGIN_POLL_SECONDS = 3L
        const val LOGIN_POLL_LIMIT_MINUTES = 10L

        /** Сколько ждём после перезапуска, прежде чем спросить статусы MCP заново. */
        const val MCP_RECONNECT_REFRESH_SECONDS = 3L

        /** В пределах этого окна повторный бросок считаем эхом первого, а не вторым файлом. */
        const val DROP_ECHO_MS = 700L
        const val NOT_LOGGED_IN = "Not logged in"

        /** Выход из режима плана: тот самый вызов, под которым в ленте кнопки. */
        const val PLAN_TOOL = "ExitPlanMode"

        /** Что агент услышит в ответ на «Keep planning». */
        const val KEEP_PLANNING = "The user wants to keep planning: refine the plan and show it again."

        const val PLAN_LOST = "The panel could not attach this plan to its card."
    }
}

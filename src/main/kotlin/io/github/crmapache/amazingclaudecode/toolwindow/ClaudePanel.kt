package io.github.crmapache.amazingclaudecode.toolwindow

import com.intellij.ide.BrowserUtil
import com.intellij.openapi.Disposable
import com.intellij.openapi.application.ApplicationManager
import com.intellij.openapi.application.ModalityState
import com.intellij.ide.ui.LafManagerListener
import com.intellij.openapi.diagnostic.thisLogger
import com.intellij.openapi.editor.colors.EditorColorsListener
import com.intellij.openapi.editor.colors.EditorColorsManager
import com.intellij.openapi.project.Project
import com.intellij.openapi.util.Disposer
import com.intellij.openapi.wm.ToolWindow
import com.intellij.openapi.wm.ToolWindowAnchor
import com.intellij.openapi.wm.WindowManager
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
import io.github.crmapache.amazingclaudecode.claude.ClaudeExecutable
import io.github.crmapache.amazingclaudecode.claude.ClaudeHistory
import io.github.crmapache.amazingclaudecode.claude.ClaudeLaunch
import io.github.crmapache.amazingclaudecode.claude.ClaudeLogin
import io.github.crmapache.amazingclaudecode.claude.ClaudeMcp
import io.github.crmapache.amazingclaudecode.claude.AvailablePlugin
import io.github.crmapache.amazingclaudecode.claude.ClaudeFileSearch
import io.github.crmapache.amazingclaudecode.claude.ClaudePlugin
import io.github.crmapache.amazingclaudecode.claude.InstalledPlugin
import io.github.crmapache.amazingclaudecode.claude.PluginMarketplace
import io.github.crmapache.amazingclaudecode.claude.ClaudePreferences
import io.github.crmapache.amazingclaudecode.claude.ClaudeSessions
import io.github.crmapache.amazingclaudecode.claude.ClaudeTokenUsage
import io.github.crmapache.amazingclaudecode.claude.ClaudeControlPing
import io.github.crmapache.amazingclaudecode.claude.ImageAttachment
import io.github.crmapache.amazingclaudecode.claude.PermissionBypass
import io.github.crmapache.amazingclaudecode.claude.PermissionChannel
import io.github.crmapache.amazingclaudecode.claude.PermissionModes
import io.github.crmapache.amazingclaudecode.claude.PermissionPrompt
import io.github.crmapache.amazingclaudecode.claude.ShellCommand
import io.github.crmapache.amazingclaudecode.editor.SelectionReference
import io.github.crmapache.amazingclaudecode.project.ProjectFacts
import io.github.crmapache.amazingclaudecode.sound.AlertSounds
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
import kotlinx.serialization.json.JsonArray
import kotlinx.serialization.json.JsonObject
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

    /** Каталог моделей спрашиваем один раз за жизнь панели — см. checkAuth. */
    private val modelsRequested = java.util.concurrent.atomic.AtomicBoolean(false)

    /**
     * Запросы, на которые ждём ответа человека: отвечать надо тому разговору,
     * который спросил, — вкладок много, и чужой ответ никого не разблокирует.
     */
    private val channelPermissions = ConcurrentHashMap<String, ChannelPermission>()

    /**
     * Планы, ждущие решения человека, по идентификатору вызова ExitPlanMode — то
     * есть по идентификатору карточки плана в ленте. Отдельно от остальных
     * разрешений: спрашивает про план не карточка разрешения, а сама карточка
     * плана с её кнопками, которую панель уже нарисовала по вызову инструмента.
     */
    private val plans = ConcurrentHashMap<String, ChannelPermission>()

    /**
     * Вопросы с вариантами ответа, ждущие человека, — по идентификатору вызова
     * AskUserQuestion, то есть по идентификатору карточки вопроса в ленте.
     *
     * Устроено как планы, и по той же причине: карточку рисует сам вызов
     * инструмента, спрашивать поверх неё разрешение «можно ли задать вопрос»
     * было бы вторым вопросом об одном и том же. Ответ возвращается тем же
     * запросом — выбранные варианты уезжают в updatedInput (см. answerAsk).
     */
    private val asks = ConcurrentHashMap<String, ChannelPermission>()

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

        sessions = ClaudeSessions(
            workingDirectory = project.basePath,
            parentDisposable = parentDisposable,
            onEvent = { sessionId, line -> forwardAgentEvent(sessionId, line) },
            onError = { sessionId, text -> sendError(sessionId, text) },
            onFinished = { sessionId -> sendStatus(sessionId, "idle") },
            onCrashed = { sessionId, exitCode -> sendProcessExited(sessionId, exitCode) },
            onToolPermission = { sessionId, request -> askToolPermission(sessionId, request) },
            onTitle = { sessionId, title -> sendSessionTitle(sessionId, title) },
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

            // Команда через «!» — bash-режим панели, см. runShellCommand.
            "bash" -> runShellCommand(sessionId, field("id"), field("command"))

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

            // Крестик на чипе: прибиваем одну задачу — субагента или фоновую
            // команду, — а ход продолжается. Своего ответа панели не нужно: о
            // конце задачи CLI скажет обычным уведомлением, тем же, каким
            // сообщает о её естественном конце.
            "stopTask" -> sessions?.stopTask(sessionId, field("taskId")) { error ->
                sendError(sessionId, "Couldn't stop the task: $error")
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

            "planDecision" -> decidePlan(sessionId, field("id"), field("decision"), field("message"))

            "askAnswer" -> answerAsk(
                sessionId,
                itemId = field("id"),
                answers = payload["answers"]?.jsonObject ?: JsonObject(emptyMap()),
                fallbackText = field("text"),
            )

            "askDismiss" -> dismissAsk(field("id"))

            "setMode" -> changeMode(sessionId, field("mode"))

            // Окно контекста у другой модели своего размера — спрашиваем его заново,
            // не дожидаясь конца следующего хода.
            "setModel" -> changeModel(sessionId, field("model"))

            "setEffort" -> sessions?.setEffort(sessionId, field("effort"))

            "setComposerLayout" -> ClaudePreferences.composerLayout = field("layout")

            "setComposerWidth" -> payload["width"]?.jsonPrimitive?.intOrNull?.let { ClaudePreferences.composerWidth = it }

            "refreshUsage" -> refreshUsage()

            "login" -> startLogin()

            "logout" -> {
                ClaudeLogin.logout(project)
                pollAuth(expected = false)
            }

            "history" -> sendHistory()

            "resumeSession" -> resumeConversation(sessionId, field("conversationId"))

            "checkAuth" -> checkAuth()

            // Панель зовёт человека. Решает она сама (только там известно, чем
            // именно занят ход), а звучит здесь — см. AlertSounds.
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

            // Строка из самой панели — см. protocol, сообщение trace.
            "trace" -> thisLogger().info("Webview: ${field("message")}")

            // Автоматический поиск промахнулся — человек показал файл сам.
            "setExecutablePath" -> {
                ClaudePreferences.executablePath = field("path").trim()
                checkAuth()
            }

            "openDevTools" -> webview?.openDevTools()

            // Курсор ставит оболочка: офскрин-браузер свой до окна IDE не доносит.
            "cursor" -> webview?.setCursor(field("cursor"))

            // Номер PR в статус-баре — ссылка: открываем её в системном браузере,
            // а не внутри JCEF, чтобы не заводить внутри панели полноценный веб-вьюпорт.
            "openExternal" -> field("url").takeIf { it.isNotBlank() }?.let { BrowserUtil.browse(it) }

            "mcpList" -> refreshMcp(sessionId)

            "mcpAdd" -> ClaudeMcp.add(
                project.basePath,
                name = field("name"),
                commandOrUrl = field("command"),
                transport = field("transport").ifBlank { null },
                onResult = { message ->
                    sendMcpActionResult(true, message)
                    // Добавленный сервер поднимется только в новом процессе: конфиг
                    // читается при запуске, живому разговору его не подсунуть.
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

    /**
     * Агент спрашивает разрешение встречным управляющим запросом по потоку
     * разговора (см. ClaudeLaunch.PERMISSION_CHANNEL_FLAG) — единственным путём,
     * которым разрешения вообще доходят до панели.
     *
     * Часть вопросов рисовать карточкой не надо: у плана и у вопроса с вариантами
     * карточка в ленте уже есть, её нарисовал сам вызов инструмента. Спрашивать
     * поверх неё второй раз нечего, нужно лишь запомнить, куда отправить ответ её
     * кнопок.
     */
    private fun askToolPermission(sessionId: String, request: PermissionChannel.ToolPermission) {
        val pending = ChannelPermission(
            sessionId = sessionId,
            requestId = request.requestId,
            toolName = request.toolName,
            command = PermissionPrompt.command(request.toolName, request.input),
        )

        if (request.toolName == PLAN_TOOL || request.toolName == ClaudeLaunch.ASK_TOOL) {
            val itemId = request.toolUseId
            if (itemId == null) {
                // Без идентификатора вызова карточку в ленте не найти, а значит и
                // кнопкам её не ответить — честнее отказать сразу, чем молча
                // остановить ход навсегда.
                thisLogger().warn("${request.toolName} permission without a tool_use_id: nothing to attach it to")
                sessions?.answerPermission(sessionId, request.requestId, allow = false, message = CARD_LOST)
                return
            }

            // Вопрос без единого вопроса лента не рисует (сбойный вызов бывает), и
            // ждать тогда нечего: разрешение осталось бы висеть под карточкой,
            // которой нет, а ход — стоять до закрытия вкладки. Отказ агент
            // переживёт: спросит то же самое обычным текстом.
            if (request.toolName == ClaudeLaunch.ASK_TOOL && !hasQuestions(request.input)) {
                thisLogger().warn("${request.toolName} permission without questions: the feed has no card to answer it")
                sessions?.answerPermission(sessionId, request.requestId, allow = false, message = CARD_LOST)
                return
            }

            if (request.toolName == PLAN_TOOL) plans[itemId] = pending else asks[itemId] = pending
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
                // Спрашивает инструмент внутри субагента — карточке место в его
                // ветке ленты, а не в общем разговоре.
                request.agentId?.let { put("agentId", it) }
            }.toString(),
        )
    }

    /**
     * Жив ли ещё вопрос, под который кладут ответ.
     *
     * Записи в `plans`/`asks` переживают процесс: карточка в ленте остаётся, а
     * разговор за это время могли перезапустить (переподключение MCP, Stop с
     * последующим ходом). Новый процесс о старом запросе не знает и ответ на него
     * молча выбросит — карточка при этом уже переключилась в «решено», и
     * написанное человеком пропадёт совсем. Поэтому спрашиваем разговор, ждёт ли
     * он ещё этого ответа, и если нет — уходим тем же запасным путём, что и для
     * карточки без записи: обычным сообщением.
     */
    private fun awaited(pending: ChannelPermission): Boolean =
        sessions?.isAwaitingPermission(pending.sessionId, pending.requestId) == true

    /**
     * Есть ли в вызове хоть один вопрос — ровно то же условие, по которому лента
     * решает, рисовать ли карточку (см. build.ts, AskUserQuestion). Условия должны
     * совпадать: карточка без ожидания ответа — просто мусор в ленте, а ожидание
     * без карточки — намертво вставший ход.
     */
    private fun hasQuestions(input: JsonObject): Boolean =
        (input["questions"] as? JsonArray)?.isNotEmpty() == true

    /**
     * Ответ человека на карточку разрешения.
     *
     * «Всегда» уходит тем же ответом, а не записью в настройки своими руками: CLI
     * прикладывает к вопросу готовое правило и сам решает, куда его положить —
     * см. PermissionChannel.rememberRules. Дописывать файл настроек мимо него
     * незачем: правило приходится сочинять по команде наугад, а сам CLI разбирает
     * её точно и знает, какая часть значимая.
     */
    private fun decidePermission(id: String, decision: String) {
        val channel = channelPermissions.remove(id) ?: run {
            thisLogger().info("No permission waiting for a decision: $id")
            return
        }

        sessions?.answerPermission(
            channel.sessionId,
            id,
            allow = decision != "deny",
            remember = decision == "always",
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
    private fun decidePlan(sessionId: String, itemId: String, decision: String, message: String = "") {
        val pending = plans.remove(itemId)?.takeIf { awaited(it) } ?: run {
            // Карточка старше нынешнего процесса: разговор с тех пор перезапускали
            // (или это чужая вкладка), и отвечать давно некому. Замечание к плану
            // тогда уходит обычным сообщением — потерять написанное человеком
            // хуже, чем ответить не тем способом. Уходит именно в ту вкладку, где
            // его писали: разговоров много, и чужой ответ в чужой ленте — не
            // спасение, а вторая поломка.
            thisLogger().info("No plan waiting for a decision: $itemId")
            if (message.isNotBlank()) {
                sendStatus(sessionId, "running")
                sessions?.prompt(sessionId, message)
            }
            return
        }

        sessions?.answerPermission(
            pending.sessionId,
            pending.requestId,
            allow = decision == "approve",
            // Написанное человеком при живой карточке плана — это и есть его
            // замечание: агент прочитает именно его, а не общее «доработай».
            message = message.ifBlank { KEEP_PLANNING },
        )

        if (decision == "approve") changeMode(pending.sessionId, "bypassPermissions")
    }

    /**
     * Ответ на вопрос с вариантами.
     *
     * Уходит тем же запросом, которым вопрос и пришёл: выбранное кладём в
     * `answers` рядом с исходными аргументами вызова — ключом служит текст
     * вопроса, значением подпись выбранного варианта (или свой ответ, если его
     * напечатали). Дальше CLI сам собирает из этого результат инструмента, и ход
     * продолжается с того же места.
     *
     * Вопрос мог остаться от прежнего процесса — тогда отвечать некому, и ответ
     * уходит обычным следующим сообщением: так вёл себя панельный ответ и до
     * того, как вопросы вообще стали доходить до агента.
     */
    private fun answerAsk(sessionId: String, itemId: String, answers: JsonObject, fallbackText: String) {
        val pending = asks.remove(itemId)?.takeIf { awaited(it) }

        if (pending == null) {
            thisLogger().info("No question waiting for an answer: $itemId")
            if (fallbackText.isNotBlank()) {
                sendStatus(sessionId, "running")
                sessions?.prompt(sessionId, fallbackText)
            }
            return
        }

        sessions?.answerPermission(
            pending.sessionId,
            pending.requestId,
            allow = true,
            extraInput = buildJsonObject { put("answers", answers) },
        )
    }

    /**
     * Вопрос закрыли крестиком: вариантов человек не выбрал и скажет своими
     * словами. Агенту это уходит отказом на его вызов — так он узнаёт, что
     * ждать выбора больше незачем, и продолжает ход. Молчание оставило бы его
     * стоять на вопросе, которого на экране уже нет.
     */
    private fun dismissAsk(itemId: String) {
        val pending = asks.remove(itemId)?.takeIf { awaited(it) } ?: return

        sessions?.answerPermission(
            pending.sessionId,
            pending.requestId,
            allow = false,
            message = ASK_DISMISSED,
        )
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

            // Каталог моделей — только после подтверждённого входа: без него CLI
            // ответит не списком, а «вы не вошли». И один раз: список не меняется
            // от того, что мы лишний раз спросили, а стоит запрос запуска процесса.
            if (status.loggedIn) {
                refreshUsage()
                if (modelsRequested.compareAndSet(false, true)) refreshModels()
            }
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
                put("executablePath", ClaudePreferences.executablePath)
                // Не нашли — показываем, где искали и что ответила сама система.
                // По этим двум спискам видно, почему промахнулись, даже если
                // машина чужая и посмотреть на неё нельзя.
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

    /**
     * Панель показывает применённую модель, а не выбранную — по той же причине,
     * что и с режимом: отказать агент может по-настоящему (модель запрещена
     * организацией или недоступна тарифу), и тогда интерфейс обязан вернуться к
     * прежней и сказать почему, а не сообщать о смене, которой не было.
     *
     * Окно контекста спрашиваем заново только у настоящей смены: у другой модели
     * оно своего размера, и ждать конца хода ради этой цифры незачем.
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

            if (change.applied) refreshContext(sessionId)
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
                forwardAgentEvent(sessionId, line, replay = true)
            }

            // Занятое окно спрашиваем у самого разговора — и ради этого поднимаем
            // его, не дожидаясь первого сообщения. Перепись этой цифры не знает
            // вовсе: в транскрипте нет ни системного промпта с инструментами, ни
            // размера окна модели, и разговор на «1M»-модели выглядел по ней
            // переполненным с первой же секунды. Процесс всё равно нужен — в нём
            // и будут продолжать разговор, — просто он готов чуть раньше.
            sessions?.wake(sessionId)
            refreshContext(sessionId)
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
     * (--safe-mode, без customizations) через [ClaudeControlPing].
     */
    private fun refreshUsage() {
        // Спрашивать расход до входа нечего: процесс поднимется только затем, чтобы
        // ответить, что пользователь не вошёл.
        if (!loggedIn) return

        if (sessions?.isRunning(MAIN_SESSION) == true) {
            sessions?.requestUsage(MAIN_SESSION, ::sendUsage)
        } else {
            ClaudeControlPing.request(
                project.basePath,
                subtype = "get_usage",
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

    /**
     * Каталог моделей — тот же, что показывает `/model` в терминале.
     *
     * Список нельзя держать у себя: какие модели доступны, решают учётная запись,
     * провайдер и политика организации, а имена и подписи меняются с версиями CLI.
     * Спрашиваем у живого разговора, а до первого сообщения — разовым пингом.
     */
    private fun refreshModels() {
        if (!loggedIn) return

        val onError = { error: String ->
            thisLogger().info("Model catalog unavailable: $error")
            // Осечка — не повод закрыть тему навсегда: снимаем защёлку, и следующая
            // проверка входа спросит каталог заново. Иначе один неудачный пинг
            // (холодный старт CLI не уложился в таймаут, процесс прибили) оставлял
            // бы панель с зашитым списком моделей до самого закрытия проекта — вместе
            // с моделями, которые в этой организации давно запрещены.
            modelsRequested.set(false)
        }

        if (sessions?.isRunning(MAIN_SESSION) == true) {
            sessions?.requestModels(MAIN_SESSION, onResult = ::sendModels, onFailure = onError)
        } else {
            ClaudeControlPing.request(
                project.basePath,
                subtype = "list_models",
                onResult = ::sendModels,
                onError = onError,
            )
        }
    }

    private fun sendModels(payload: JsonObject) {
        val models = payload["models"]?.jsonArray ?: run {
            // Ответ без списка — тот же промах, что и ошибка: каталога у нас нет,
            // и спросить его ещё раз должно быть можно.
            modelsRequested.set(false)
            return
        }
        thisLogger().info("Model catalog from CLI: ${models.size} entries")

        webview?.send(
            buildJsonObject {
                put("type", "models")
                putJsonArray("models") {
                    for (element in models) {
                        val model = element as? JsonObject ?: continue
                        val value = model["value"]?.jsonPrimitive?.contentOrNull ?: continue

                        addJsonObject {
                            put("value", value)
                            put("label", model["displayName"]?.jsonPrimitive?.contentOrNull.orEmpty())
                            put("description", model["description"]?.jsonPrimitive?.contentOrNull.orEmpty())
                            put("resolved", model["resolvedModel"]?.jsonPrimitive?.contentOrNull.orEmpty())
                            model["disabled"]?.jsonPrimitive?.booleanOrNull?.let { put("disabled", it) }
                        }
                    }
                }
            }.toString(),
        )
    }

    /**
     * Занятое окно контекста — цифрой от самого CLI (та же, что печатает
     * `/context`), а не подсчётом по usage хода: размер окна зависит от модели —
     * у «1M»-моделей он впятеро больше обычного, — и своя арифметика на стороне
     * панели показывала бы «контекст полон» на почти пустом разговоре.
     *
     * Спрашиваем только у живого разговора: у спящего контекст пуст по
     * определению, а разовый пинг ответил бы про свой собственный процесс.
     */
    private fun refreshContext(sessionId: String) {
        sessions?.requestContextUsage(
            sessionId,
            onResult = { usage -> sendContext(sessionId, usage) },
            onFailure = { error -> thisLogger().debug("Context usage unavailable: $error") },
        )
    }

    private fun sendContext(sessionId: String, usage: JsonObject) {
        val used = usage["totalTokens"]?.jsonPrimitive?.contentOrNull?.toIntOrNull() ?: return
        val max = usage["maxTokens"]?.jsonPrimitive?.contentOrNull?.toIntOrNull() ?: return
        if (max <= 0) return

        webview?.send(
            buildJsonObject {
                put("type", "context")
                put("sessionId", sessionId)
                put("used", used)
                put("max", max)
            }.toString(),
        )
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

    /**
     * Команда из поля ввода, набранная через «!»: выполняем сами, в рабочей
     * директории проекта, и возвращаем панели её вывод (см. [ShellCommand]).
     *
     * На пуле, а не в потоке интерфейса: команда может идти минуты, а панель всё
     * это время обязана оставаться живой — карточка в ленте уже нарисована и
     * ждёт результата.
     */
    private fun runShellCommand(sessionId: String, id: String, command: String) {
        // Без номера отвечать некому: карточку в ленте ищут именно по нему.
        if (id.isBlank()) return

        // А вот на пустую команду отвечаем, а не молчим: карточка в ленте уже
        // стоит и без ответа осталась бы «выполняется» до конца разговора —
        // остановить или убрать её нечем.
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
     * Что панель знает об MCP — то же, что показывает `/mcp` в терминале: кто
     * подключён, кому нужен вход, кто упал и почему, откуда каждый взялся.
     *
     * Спрашиваем у разговора, а не разбираем вывод `claude mcp list`: серверы
     * поднимает и держит именно процесс разговора, и только он знает их живое
     * состояние. Разговор ради этого поднимается — как и в терминале, где `/mcp`
     * спрашивают у запущенной сессии (см. ClaudeSessions.mcpStatus).
     */
    private fun refreshMcp(sessionId: String) {
        sessions?.mcpStatus(
            sessionId,
            onResult = { status -> sendMcpServers(status) },
            onFailure = { error -> sendMcpActionResult(false, error) },
        )
    }

    /**
     * Переподключение одного сервера. Заодно это и «попробовать ещё раз» для
     * упавшего: CLI поднимает его заново тем же запросом.
     */
    private fun reconnectMcp(sessionId: String, server: String) {
        if (server.isEmpty()) return

        sessions?.mcpReconnect(
            sessionId,
            server,
            onResult = {
                sendMcpActionResult(true, "Reconnecting $server…")
                // Не сразу: рукопожатие с сервером занимает секунды, и спрошенный
                // тут же статус показал бы прежний.
                scheduleMcpRefresh(sessionId, MCP_RECONNECT_REFRESH_SECONDS)
            },
            onFailure = { error -> sendMcpActionResult(false, error) },
        )
    }

    /**
     * Вход в сервер, который его требует, — то же, что «Authenticate» в
     * терминальном `/mcp`.
     *
     * CLI отдаёт адрес, открывает его человеку панель, а код от браузера ловит
     * сам CLI: он поднял для этого локальный обработчик в процессе разговора.
     * Поэтому дальше остаётся только переспрашивать статус — о конце входа он
     * отдельным событием не сообщает.
     */
    private fun authenticateMcp(sessionId: String, server: String) {
        if (server.isEmpty()) return

        sessions?.mcpAuthenticate(
            sessionId,
            server,
            onResult = { response ->
                val url = response["authUrl"]?.jsonPrimitive?.contentOrNull.orEmpty()

                if (url.isEmpty()) {
                    // Вход не потребовался — сервер уже пустили, статус это и покажет.
                    sendMcpActionResult(true, "$server is signed in.")
                    scheduleMcpRefresh(sessionId, MCP_AUTH_FIRST_REFRESH_SECONDS)
                    return@mcpAuthenticate
                }

                BrowserUtil.browse(url)
                sendMcpActionResult(true, "Finish signing in to $server in the browser — the list updates itself.")
                for (delay in MCP_AUTH_REFRESH_SECONDS) scheduleMcpRefresh(sessionId, delay)
            },
            onFailure = { error -> sendMcpActionResult(false, error) },
        )
    }

    /**
     * Конфиг серверов читается при запуске процесса, поэтому добавленный или
     * удалённый сервер виден только новому: перезапускаем разговор — переписка
     * при этом остаётся, поднимается тот же самый.
     */
    private fun refreshMcpAfterRestart(sessionId: String) {
        sessions?.restart(sessionId)
        scheduleMcpRefresh(sessionId, MCP_RECONNECT_REFRESH_SECONDS)
    }

    private fun scheduleMcpRefresh(sessionId: String, delaySeconds: Long) {
        AppExecutorUtil.getAppScheduledExecutorService().schedule(
            { refreshMcp(sessionId) },
            delaySeconds,
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

    /**
     * Событие агента — уже готовый JSON, поэтому вкладываем его в конверт как есть.
     *
     * [replay] отличает перепись прошлого разговора от живого хода: событие то же
     * самое, но случилось оно давно, и всё, что панель считает «прямо сейчас»
     * (занятое окно контекста в первую очередь), из него брать нельзя.
     */
    private fun forwardAgentEvent(sessionId: String, line: String, replay: Boolean = false) {
        if (!line.startsWith("{")) {
            sendError(sessionId, line)
            return
        }

        noteLoggedOut(line)
        val replayFlag = if (replay) ""","replay":true""" else ""
        webview?.send("""{"type":"agent","sessionId":"$sessionId"$replayFlag,"event":$line}""")

        // Конец хода — единственный момент, когда занятое окно контекста реально
        // поменялось: спрашиваем свежую цифру у того же процесса, который только
        // что закончил (см. refreshContext).
        if (line.contains("\"type\":\"result\"")) refreshContext(sessionId)
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

    /**
     * Ответ CLI как есть, только разложенный по полям, которые рисует панель.
     * Свои статусы не выдумываем: их набор («connected», «needs-auth»,
     * «failed», «pending», «disabled») задаёт сам CLI, и панель обязана звать
     * состояние сервера тем же словом, что и терминал.
     */
    private fun sendMcpServers(status: JsonObject) {
        val servers = status["mcpServers"]?.jsonArray ?: JsonArray(emptyList())

        webview?.send(
            buildJsonObject {
                put("type", "mcpServers")
                putJsonArray("servers") {
                    for (element in servers) {
                        val server = element as? JsonObject ?: continue
                        val config = server["config"]?.jsonObject

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

    /** Чем сервер запускается: командой с аргументами или адресом. */
    private fun commandOf(config: JsonObject?): String {
        if (config == null) return ""

        config["url"]?.jsonPrimitive?.contentOrNull?.takeIf { it.isNotBlank() }?.let { return it }

        val command = config["command"]?.jsonPrimitive?.contentOrNull.orEmpty()
        val arguments = config["args"]?.jsonArray.orEmpty()
            .mapNotNull { it.jsonPrimitive.contentOrNull }
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
     * Название вкладки, которое подобрала LLM по первому сообщению (см.
     * ClaudeTitleGenerator). Пока панель ждёт этот ответ, вкладка уже носит
     * эвристический заголовок — вебвью решает сам, применять ли этот ответ
     * (вкладку могли успеть закрыть или очистить разговор заново).
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
     * Проиграть оповещение — если человек и правда не смотрит.
     *
     * `onlyIfAway` приходит от повода, случившегося в открытой вкладке: звать
     * к тому, что и так перед глазами, незачем. Но «открытая вкладка» ещё не
     * значит «на неё смотрят»: панель бывает свёрнута в полоску сбоку или
     * перекрыта соседним тулвиндоу, а окно IDE — убрано за браузер или свёрнуто
     * вовсе. Знает об этом только оболочка, поэтому последнее слово здесь.
     *
     * Спрашиваем в потоке интерфейса: состояние окон живёт в нём, а сообщение
     * приезжает из встроенного браузера своим.
     */
    private fun playAlert(sound: String, volume: Int, onlyIfAway: Boolean) {
        if (!onlyIfAway) {
            AlertSounds.play(sound, volume)
            return
        }

        // Поверх IDE может стоять модальное окно — настройки, коммит, рефакторинг.
        // Обычная очередь дождалась бы его закрытия, то есть промолчала бы ровно
        // тогда, когда человек занят чем-то другим и звук нужнее всего, а потом
        // выпустила бы всё накопившееся разом.
        ApplicationManager.getApplication().invokeLater(
            {
                // Пока сигнал ждал очереди, проект могли закрыть, а панель —
                // уничтожить: спрашивать у них, смотрят ли на панель, уже нельзя,
                // да и звать больше некого.
                if (!project.isDisposed && !Disposer.isDisposed(parentDisposable) && !isPanelWatched()) {
                    AlertSounds.play(sound, volume)
                }
            },
            ModalityState.any(),
        )
    }

    /**
     * Панель на виду, и окно IDE — то, с которым человек сейчас работает.
     *
     * Спрашиваем осторожно: к моменту ответа окно проекта могло начать
     * закрываться, а тулвиндоу — уничтожиться. Ронять IDE отчётом об ошибке
     * из-за звука нельзя; неизвестность толкуем как «не смотрят» — промолчать
     * зря хуже, чем позвать зря.
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
                // Выбор модели и остального переживает перезапуск IDE: искать его
                // заново после каждого открытия — то же, что не сохранять вовсе.
                putJsonObject("preferences") {
                    put("model", preferences.model)
                    put("effort", preferences.effort)
                    // Тем же значением, с которым реально поднимется процесс:
                    // селектор в панели обязан показывать правду с первой секунды.
                    put("mode", PermissionModes.resolve(preferences.mode))
                    if (preferences.composerLayout.isNotEmpty()) put("composerLayout", preferences.composerLayout)
                    if (preferences.composerWidth > 0) put("composerWidth", preferences.composerWidth)
                }
                // Настройка звуков — тоже выбор, который делают один раз.
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
     * Панель может быть прижата к любому краю экрана, и только сторона, что
     * граничит с редактором, должна получить разделительную рамку — как у
     * нативных тулвиндоу (терминал, проект и т.д.). Анкор меняется на лету,
     * когда пользователь перетаскивает панель на другую сторону, поэтому
     * подписываемся на смену, а не спрашиваем один раз при старте.
     */
    private fun watchDockAnchor() {
        // Перегрузка stateChanged с ToolWindowManagerEventType помечена
        // @ApiStatus.Internal (не пропускает Plugin Verifier) - используем
        // публичную перегрузку без типа события и сравниваем анкор сами.
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

        /** Сервер уже пустил без входа — статус обновится почти сразу. */
        const val MCP_AUTH_FIRST_REFRESH_SECONDS = 2L

        /**
         * Когда переспрашивать статус, пока человек входит в браузере. О конце
         * входа CLI не сообщает, поэтому смотрим сами — редко и не вечно:
         * секунд через десять вход обычно уже позади, а к минуте становится
         * ясно, что окно просто закрыли.
         */
        val MCP_AUTH_REFRESH_SECONDS = listOf(10L, 25L, 60L)

        /** В пределах этого окна повторный бросок считаем эхом первого, а не вторым файлом. */
        const val DROP_ECHO_MS = 700L
        const val NOT_LOGGED_IN = "Not logged in"

        /** Выход из режима плана: тот самый вызов, под которым в ленте кнопки. */
        const val PLAN_TOOL = "ExitPlanMode"

        /** Что агент услышит, когда вопрос закрыли, не выбрав вариантов. */
        const val ASK_DISMISSED =
            "The user closed the question without picking an option and will answer in their own words. " +
                "Don't ask it again — wait for their message."

        /** Что агент услышит в ответ на «Keep planning». */
        const val KEEP_PLANNING = "The user wants to keep planning: refine the plan and show it again."

        const val CARD_LOST = "The panel could not attach this request to its card."
    }
}

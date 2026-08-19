package io.github.crmapache.amazingclaudecode.claude

import com.intellij.openapi.Disposable
import com.intellij.openapi.util.Disposer
import java.util.concurrent.ConcurrentHashMap
import kotlinx.serialization.json.JsonObject

/**
 * Набор разговоров одной панели.
 *
 * Их несколько по двум причинам: вкладки сессий и боковые ветки. У каждой ветки
 * свой процесс, поэтому её контекст физически не может протечь в основной разговор —
 * именно это панель и обещает пользователю.
 */
internal class ClaudeSessions(
    private val workingDirectory: String?,
    private val parentDisposable: Disposable,
    private val onEvent: (sessionId: String, line: String) -> Unit,
    private val onError: (sessionId: String, message: String) -> Unit,
    /** Процесс сказал что-то мимо потока событий — см. ClaudeSession.onDiagnostic. */
    private val onDiagnostic: (sessionId: String, message: String) -> Unit = { _, _ -> },
    private val onFinished: (sessionId: String) -> Unit,
    /** Процесс разговора умер сам — панели есть что закрыть и объяснить. */
    private val onCrashed: (sessionId: String, exitCode: Int) -> Unit = { _, _ -> },
    /** Агент спрашивает разрешение у панели: пока никто не ответил, ход стоит. */
    private val onToolPermission: (sessionId: String, request: PermissionChannel.ToolPermission) -> Unit = { _, _ -> },
    /** Название разговора подобрала LLM по первому сообщению — см. ClaudeSession.onTitle. */
    private val onTitle: (sessionId: String, title: String) -> Unit = { _, _ -> },
    /** Ход кончился — панели пора гасить работу; см. ClaudeSession.onTurnEnded. */
    private val onTurnEnded: (sessionId: String) -> Unit = {},
) : Disposable {

    private val sessions = ConcurrentHashMap<String, ClaudeSession>()

    init {
        Disposer.register(parentDisposable, this)
    }

    fun prompt(sessionId: String, text: String, images: List<ImageAttachment> = emptyList()) {
        session(sessionId).sendPrompt(text, images)
    }

    /**
     * Ответвление от другого разговора: ветка получает всю его переписку и свой
     * идентификатор. Продолжение в ветке родителя не трогает, а если родитель ещё
     * ни разу не отвечал, ответвляться не от чего — заводим обычный разговор.
     */
    fun branchFrom(parentId: String, branchId: String) {
        if (sessions.containsKey(branchId)) return

        val parent = sessions[parentId]?.conversationId
        sessions[branchId] = newSession(branchId, forkFrom = parent).also {
            Disposer.register(this, it)
        }
    }

    /**
     * Продолжение прошлого разговора: он поднимется со своей перепиской.
     *
     * Прошлый разговор открывается в той вкладке, из которой его выбрали (см.
     * App.resume), а значит на её месте уже может быть свой процесс — с чужой
     * перепиской, которую этой вкладке продолжать больше не нужно. Продолжить
     * выбранный разговор в нём нельзя: разговор процессу задаётся при запуске.
     * Поэтому прежний закрываем и поднимаем новый, ровно как при закрытии
     * вкладки.
     */
    fun resume(sessionId: String, conversationId: String) {
        close(sessionId)

        sessions[sessionId] = newSession(sessionId, forkFrom = null, resumeFrom = conversationId).also {
            Disposer.register(this, it)
        }
    }

    /**
     * Поднять разговор, ничего в него не отправляя — см. [ClaudeSession.wake].
     * Нужно продолженному разговору: у него есть что рассказать о себе с первой
     * секунды, и рассказать это может только живой процесс с его перепиской.
     */
    fun wake(sessionId: String) {
        sessions[sessionId]?.wake()
    }

    /**
     * Ответ человека на вопрос агента о разрешении. Разговора может уже не быть —
     * тогда отвечать некому, и вопрос умер вместе с процессом.
     */
    fun answerPermission(
        sessionId: String,
        requestId: String,
        allow: Boolean,
        message: String = "",
        extraInput: kotlinx.serialization.json.JsonObject? = null,
        remember: Boolean = false,
    ) {
        sessions[sessionId]?.answerPermission(requestId, allow, message, extraInput, remember)
    }

    /**
     * Ждёт ли разговор ответа именно на этот запрос.
     *
     * Карточка в ленте живёт дольше процесса: разговор могли перезапустить
     * (переподключение MCP, смена режима), и тогда старый вопрос умер вместе с
     * прежним процессом — ответ на него новый уже не узнает и молча выбросит.
     * Спрашиваем заранее, чтобы вместо тихой потери уйти запасным путём.
     */
    fun isAwaitingPermission(sessionId: String, requestId: String): Boolean =
        sessions[sessionId]?.isAwaitingPermission(requestId) == true

    /** Прибить одну задачу разговора — см. [ClaudeSession.stopTask]. */
    fun stopTask(sessionId: String, taskId: String, onFailure: (String) -> Unit = {}) {
        if (taskId.isEmpty()) return
        // Разговора уже нет — прибивать нечего: его задачи ушли вместе с ним.
        sessions[sessionId]?.stopTask(taskId, onFailure)
    }

    /**
     * MCP этого разговора — статус, вход, переподключение (см. [ClaudeSession]).
     *
     * Разговор для этого поднимаем, если он ещё спит: MCP-серверы живут внутри
     * процесса, и у спящего их попросту нет — ни статуса, ни того, к чему
     * подключаться. Ровно так же ведёт себя и терминал: `/mcp` там спрашивают у
     * запущенной сессии.
     */
    fun mcpStatus(sessionId: String, onResult: (JsonObject) -> Unit, onFailure: (String) -> Unit = {}) {
        awake(sessionId).requestMcpStatus(onResult, onFailure)
    }

    fun mcpAuthenticate(
        sessionId: String,
        server: String,
        onResult: (JsonObject) -> Unit,
        onFailure: (String) -> Unit = {},
    ) {
        awake(sessionId).authenticateMcp(server, onResult, onFailure)
    }

    fun mcpReconnect(
        sessionId: String,
        server: String,
        onResult: (JsonObject) -> Unit,
        onFailure: (String) -> Unit = {},
    ) {
        awake(sessionId).reconnectMcp(server, onResult, onFailure)
    }

    /** Разговор, у которого точно есть процесс: заводим и будим, если надо. */
    private fun awake(sessionId: String): ClaudeSession = session(sessionId).also { it.wake() }

    /** Прерывание хода: разговор остаётся живым, в отличие от закрытия сессии. */
    fun interrupt(sessionId: String, onTimeout: () -> Unit = {}) {
        // Разговора уже нет — панель и так покажет его свободным, объяснять нечего.
        sessions[sessionId]?.interrupt(onTimeout)
    }

    fun stop(sessionId: String) {
        sessions[sessionId]?.stop()
    }

    /**
     * Перезапуск процесса разговора без потери переписки — им и переподключаются
     * MCP-серверы (см. ClaudeSession.restart). Ложь означает, что процесса не
     * было: подключаться пока нечему.
     */
    fun restart(sessionId: String): Boolean = sessions[sessionId]?.restart() ?: false

    /** Живой ли сейчас процесс — не создавая его, в отличие от [session]. */
    fun isRunning(sessionId: String): Boolean = sessions[sessionId]?.isRunning == true

    /**
     * Режим применяется сразу, к следующим же вызовам инструментов. Разговор при
     * этом заводим, даже если его ещё нет: выбранный режим должен пережить момент
     * до первого вопроса, иначе процесс поднимется с обычным.
     */
    fun setPermissionMode(sessionId: String, mode: String, onApplied: (ClaudeSession.ModeChange) -> Unit) {
        session(sessionId).setPermissionMode(mode) { change ->
            // Запоминаем только то, что агент правда применил, и уже приведённым к
            // имени, которое понимает CLI: сохранённый выбор достаётся новым
            // вкладкам и переживает перезапуск IDE. Записав желаемое сразу, мы
            // оставляли бы отвергнутый режим там навсегда — панель откатывалась
            // к прежнему, а каждая следующая вкладка поднималась с тем, что уже
            // один раз не сработало.
            if (change.applied) ClaudePreferences.mode = PermissionModes.normalize(change.mode)
            onApplied(change)
        }
    }

    /**
     * Модель и усилие. Выбор запоминаем: новые разговоры начнутся с него.
     *
     * Разговор при этом заводим, даже если его ещё нет — как и у режима разрешений:
     * выбор на пустой панели, до первого сообщения, обязан пережить момент запуска,
     * а не потеряться молча только потому, что процесс ещё не поднят. Поднимать
     * ради этого процесс не нужно: спящий разговор просто запоминает выбор и
     * стартует уже с ним (см. ClaudeSession.setModel).
     */
    fun setModel(sessionId: String, model: String, onApplied: (ClaudeSession.ModelChange) -> Unit = {}) {
        session(sessionId).setModel(model) { change ->
            // Запоминаем только то, что агент правда взял — как и с режимом
            // разрешений. Записав желаемое сразу, мы оставляли бы отвергнутую
            // модель в настройках навсегда: каждая следующая вкладка уходила бы
            // в запуск с флагом, на котором CLI отказывает ещё до первого хода.
            if (change.applied) ClaudePreferences.model = change.model
            onApplied(change)
        }
    }

    fun setEffort(sessionId: String, effort: String) {
        ClaudePreferences.effort = effort
        session(sessionId).setEffort(effort)
    }

    /**
     * Каталог моделей у живого разговора. Спящий спрашивать бессмысленно: ответ
     * даёт сам процесс, и поднимать его ради списка незачем — на этот случай есть
     * разовый лёгкий пинг (см. ClaudeControlPing).
     */
    fun requestModels(sessionId: String, onResult: (kotlinx.serialization.json.JsonObject) -> Unit, onFailure: (String) -> Unit = {}) {
        val session = sessions[sessionId]
        if (session == null || !session.isRunning) {
            onFailure("no live session")
            return
        }
        session.requestModels(onResult, onFailure)
    }

    /** Занятое окно контекста живого разговора — у спящего оно пусто по определению. */
    fun requestContextUsage(
        sessionId: String,
        onResult: (kotlinx.serialization.json.JsonObject) -> Unit,
        onFailure: (String) -> Unit = {},
    ) {
        val session = sessions[sessionId]
        if (session == null || !session.isRunning) {
            onFailure("no live session")
            return
        }
        session.requestContextUsage(onResult, onFailure)
    }

    /**
     * Расход спрашиваем у разговора, поднимая его при необходимости: иначе цифры
     * появятся только после первого сообщения, а видеть их хочется сразу.
     */
    fun requestUsage(sessionId: String, onUsage: (kotlinx.serialization.json.JsonObject) -> Unit) {
        session(sessionId).requestUsage(onUsage)
    }

    fun close(sessionId: String) {
        sessions.remove(sessionId)?.let { session ->
            session.stop()
            Disposer.dispose(session)
        }
    }

    override fun dispose() {
        sessions.keys.toList().forEach(::close)
    }

    /** Процесс поднимается лениво: пустая вкладка не должна ничего запускать. */
    private fun session(sessionId: String): ClaudeSession = sessions.getOrPut(sessionId) {
        newSession(sessionId, forkFrom = null).also { Disposer.register(this, it) }
    }

    private fun newSession(
        sessionId: String,
        forkFrom: String?,
        resumeFrom: String? = null,
    ): ClaudeSession = ClaudeSession(
        workingDirectory = workingDirectory,
        forkFrom = forkFrom,
        resumeFrom = resumeFrom,
        // Новый разговор начинается с того же, что выбрано сейчас: перевыбирать
        // модель в каждой вкладке — работа на ровном месте.
        model = ClaudePreferences.model,
        effort = ClaudePreferences.effort,
        // Не выбирали ни разу — начинаем с того же режима, с какого начал бы
        // терминал в этом каталоге (см. PermissionDefaultMode).
        permissionMode = PermissionModes.resolve(
            ClaudePreferences.mode,
            fallback = PermissionDefaultMode.of(workingDirectory),
        ),
        onEvent = { line -> onEvent(sessionId, line) },
        onError = { message -> onError(sessionId, message) },
        onDiagnostic = { message -> onDiagnostic(sessionId, message) },
        onFinished = { onFinished(sessionId) },
        onCrashed = { exitCode -> onCrashed(sessionId, exitCode) },
        onToolPermission = { request -> onToolPermission(sessionId, request) },
        onTitle = { title -> onTitle(sessionId, title) },
        onTurnEnded = { onTurnEnded(sessionId) },
    )
}

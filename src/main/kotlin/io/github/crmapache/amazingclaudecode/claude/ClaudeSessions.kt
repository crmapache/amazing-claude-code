package io.github.crmapache.amazingclaudecode.claude

import com.intellij.openapi.Disposable
import com.intellij.openapi.util.Disposer
import java.util.concurrent.ConcurrentHashMap

/**
 * Набор разговоров одной панели.
 *
 * Их несколько по двум причинам: вкладки сессий и боковые ветки. У каждой ветки
 * свой процесс, поэтому её контекст физически не может протечь в основной разговор —
 * именно это панель и обещает пользователю.
 */
internal class ClaudeSessions(
    private val workingDirectory: String?,
    /**
     * Настройки запуска строятся под каждый разговор: в хук разрешений зашит
     * идентификатор его вкладки, иначе ответ на вопрос некуда возвращать.
     */
    private val settingsJson: (sessionId: String) -> String?,
    private val parentDisposable: Disposable,
    private val onEvent: (sessionId: String, line: String) -> Unit,
    private val onError: (sessionId: String, message: String) -> Unit,
    private val onFinished: (sessionId: String) -> Unit,
    /** Процесс разговора умер сам — панели есть что закрыть и объяснить. */
    private val onCrashed: (sessionId: String, exitCode: Int) -> Unit = { _, _ -> },
    /** Агент спрашивает разрешение у панели: пока никто не ответил, ход стоит. */
    private val onToolPermission: (sessionId: String, request: PermissionChannel.ToolPermission) -> Unit = { _, _ -> },
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

    /** Продолжение прошлого разговора: он поднимется со своей перепиской. */
    fun resume(sessionId: String, conversationId: String) {
        if (sessions.containsKey(sessionId)) return

        sessions[sessionId] = newSession(sessionId, forkFrom = null, resumeFrom = conversationId).also {
            Disposer.register(this, it)
        }
    }

    /**
     * Ответ человека на вопрос агента о разрешении. Разговора может уже не быть —
     * тогда отвечать некому, и вопрос умер вместе с процессом.
     */
    fun answerPermission(sessionId: String, requestId: String, allow: Boolean, message: String = "") {
        sessions[sessionId]?.answerPermission(requestId, allow, message)
    }

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
     * Модель и усилие живой сессии меняются слэш-командой — своего управляющего
     * запроса для них нет. Выбор запоминаем: новые разговоры начнутся с него.
     * Ответ агента на саму команду в ленту не пускаем: он говорит «только для
     * этой сессии», что здесь неправда — выбор мы только что сохранили и на
     * будущее.
     *
     * Разговор при этом заводим, даже если его ещё нет — как и у режима разрешений:
     * выбор на пустой панели, до первого сообщения, обязан пережить момент запуска,
     * а не потеряться молча только потому, что процесс ещё не поднят.
     */
    fun setModel(sessionId: String, model: String) {
        ClaudePreferences.model = model
        session(sessionId).applyPreference("/model $model")
    }

    fun setEffort(sessionId: String, effort: String) {
        ClaudePreferences.effort = effort
        session(sessionId).applyPreference("/effort $effort")
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
        settingsJson = settingsJson(sessionId),
        forkFrom = forkFrom,
        resumeFrom = resumeFrom,
        // Новый разговор начинается с того же, что выбрано сейчас: перевыбирать
        // модель в каждой вкладке — работа на ровном месте.
        model = ClaudePreferences.model,
        effort = ClaudePreferences.effort,
        permissionMode = PermissionModes.resolve(ClaudePreferences.mode),
        onEvent = { line -> onEvent(sessionId, line) },
        onError = { message -> onError(sessionId, message) },
        onFinished = { onFinished(sessionId) },
        onCrashed = { exitCode -> onCrashed(sessionId, exitCode) },
        onToolPermission = { request -> onToolPermission(sessionId, request) },
    )
}

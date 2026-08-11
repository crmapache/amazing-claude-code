package io.github.crmapache.amazingclaudecode.claude

import com.intellij.execution.configurations.GeneralCommandLine
import com.intellij.execution.process.OSProcessHandler
import com.intellij.execution.process.ProcessEvent
import com.intellij.execution.process.ProcessListener
import com.intellij.execution.process.ProcessOutputTypes
import com.intellij.openapi.Disposable
import com.intellij.openapi.diagnostic.thisLogger
import com.intellij.openapi.util.Key
import com.intellij.util.concurrency.AppExecutorUtil
import java.util.UUID
import java.util.concurrent.ConcurrentHashMap
import java.util.concurrent.TimeUnit
import kotlinx.serialization.json.JsonArray
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.JsonObjectBuilder
import kotlinx.serialization.json.addJsonObject
import kotlinx.serialization.json.booleanOrNull
import kotlinx.serialization.json.buildJsonObject
import kotlinx.serialization.json.contentOrNull
import kotlinx.serialization.json.jsonObject
import kotlinx.serialization.json.jsonPrimitive
import kotlinx.serialization.json.put
import kotlinx.serialization.json.putJsonArray
import kotlinx.serialization.json.putJsonObject

/** Картинка, вставленная в поле ввода из буфера обмена: байты, а не путь на диске. */
internal data class ImageAttachment(val mediaType: String, val data: String)

/**
 * Один разговор с агентом = один долгоживущий процесс claude в потоковом режиме.
 *
 * Процесс поднимается лениво, при первом промпте: открытая панель сама по себе
 * не должна ничего запускать. Пока процесс жив, контекст разговора сохраняется,
 * поэтому продолжать беседу можно без флагов возобновления сессии.
 *
 * Кроме обычных сообщений у процесса есть управляющий канал: тем же потоком ходят
 * запросы вроде смены режима разрешений и расхода по окнам подписки. Без него
 * режим можно было бы поменять только перезапуском.
 */
internal class ClaudeSession(
    private val workingDirectory: String?,
    /**
     * Разговор, от которого ответвляется этот. Ветка получает всю переписку
     * родителя и свой идентификатор, поэтому продолжение в ней родителя не трогает.
     */
    private val forkFrom: String? = null,
    /** Прошлый разговор, который продолжаем: он поднимется со своей перепиской. */
    resumeFrom: String? = null,
    /**
     * Модель и усилие достаются разговору при запуске. Их выбирают один раз, и
     * каждая новая вкладка должна начинаться с того же, а не с умолчаний.
     *
     * var, а не val: выбор меняют и до первого сообщения — тогда процесса ещё
     * нет, и запоминать новое значение обязан сам разговор, иначе он поднимется
     * с тем, что было выбрано в момент, когда вкладку только открыли.
     */
    private var model: String = "",
    private var effort: String = "",
    permissionMode: String = "",
    private val onEvent: (String) -> Unit,
    private val onError: (String) -> Unit,
    private val onFinished: () -> Unit,
    /**
     * Агент спрашивает разрешение у самой панели — по тому же потоку, которым идёт
     * разговор (см. [PermissionChannel]). Пока никто не ответил, ход стоит.
     */
    private val onToolPermission: (PermissionChannel.ToolPermission) -> Unit = {},
    /**
     * Процесс умер сам — не потому что мы его остановили. Разговор в этот момент
     * мог стоять посреди инструмента: карточки, которые остались «выполняется»,
     * так и останутся висеть навсегда, если никого не предупредить.
     */
    private val onCrashed: (Int) -> Unit = {},
) : Disposable {

    private var handler: OSProcessHandler? = null

    /** Правда ли, что смерть процесса — наша просьба, а не крах. */
    @Volatile
    private var stopRequested = false

    /**
     * Режим разрешений этого разговора. Живому процессу он уходит управляющим
     * сообщением, но помнить его надо и до запуска: выбранный на пустой панели
     * режим иначе потеряется, а процесс поднимется с обычным.
     */
    private var permissionMode: String? = permissionMode.ifEmpty { null }

    /** Ответы на управляющие запросы приходят вперемешку с событиями разговора. */
    private val awaitingControl = ConcurrentHashMap<String, Control>()

    /**
     * Идёт ход, которым панель сама сменила модель или усилие через /model и
     * /effort — а не человек. У этой команды нет управляющего канала, только
     * обычный ход в общем потоке, поэтому агент отвечает ей тем же текстом, что
     * и в терминале: «только для этой сессии». У панели своя правда — выбор
     * переживает и новые вкладки, и перезапуск IDE, — и это разночтение сбивает
     * с толку. Текст и итог этого хода в ленту не пускаем; системные события
     * пропускаем как обычно — по ним живёт строка состояния.
     */
    @Volatile
    private var suppressingPreferenceReply = false

    private class Control(val onResult: (JsonObject) -> Unit, val onFailure: (String) -> Unit)

    /**
     * Чем ответить агенту, пока человек думает: вопрос ждёт своего часа целиком.
     * Не только аргументы вызова — в ответ может уйти ещё и правило «больше не
     * спрашивать», а его CLI предлагает в самом вопросе (см. PermissionChannel).
     */
    private val awaitingPermission = ConcurrentHashMap<String, PermissionChannel.ToolPermission>()

    private val lines = StreamLines(onLine = ::consume)

    val isRunning: Boolean get() = handler?.isProcessTerminated == false

    fun sendPrompt(text: String, images: List<ImageAttachment> = emptyList()) {
        val process = handler ?: start() ?: return
        write(process, userMessage(text, images))
    }

    /**
     * Поднять разговор, ничего в него не отправляя.
     *
     * Нужно ровно там, где панели нужна правда о самом разговоре, а не о машине:
     * занятое окно контекста у продолженного разговора знает только процесс,
     * загрузивший его переписку (см. [requestContextUsage]). Поднимаем тот же
     * процесс, которым разговор потом и продолжится, а не второй такой же рядом:
     * два процесса на одном разговоре пишут в один и тот же транскрипт и делят
     * очередь его отложенных сообщений.
     */
    fun wake(): Boolean = handler != null || start() != null

    /**
     * /effort панель шлёт сама, не человек: показывать в ленте ответ агента на
     * него незачем, и он к тому же вводит в заблуждение (см. комментарий у
     * [suppressingPreferenceReply]).
     */
    fun applyPreference(command: String) {
        val process = handler ?: start() ?: return
        suppressingPreferenceReply = true
        write(process, userMessage(command, emptyList()))
    }

    /**
     * Чем закончилась смена модели. Ответить «нет» агент может по-настоящему:
     * модель бывает запрещена организацией или недоступна тарифу, и такую он не
     * возьмёт. [model] — та, что в итоге работает: новая при согласии и прежняя
     * при отказе, чтобы панели было что показывать, не гадая.
     */
    data class ModelChange(val applied: Boolean, val model: String, val error: String = "")

    /**
     * Смена модели. У живого разговора — управляющим запросом (`set_model`), а не
     * слэш-командой: команда стоит целого хода в ленте и отвечает на него текстом
     * про «только для этой сессии», хотя выбор мы храним и на будущее.
     *
     * Спящему разговору менять нечего: модель уедет флагом при запуске — важно
     * лишь запомнить её здесь, иначе процесс поднимется с той, что была выбрана в
     * момент открытия вкладки.
     *
     * Об исходе сообщаем наверх, как и о смене режима: отвергнутая модель не
     * должна ни остаться в подписи под панелью, ни уехать флагом в следующую
     * вкладку — с ней процесс не поднимется вовсе.
     */
    fun setModel(model: String, onApplied: (ModelChange) -> Unit = {}) {
        // Прежнюю держим под рукой: при отказе к ней и возвращаемся, иначе
        // перезапуск процесса поднял бы разговор с той, что уже не сработала.
        val previous = this.model
        this.model = model

        if (handler == null) {
            // Процесса ещё нет: модель уедет флагом при запуске, менять нечего.
            onApplied(ModelChange(applied = true, model = model))
            return
        }

        // "default" — то же имя, которым его зовёт сам CLI: сброс к модели по умолчанию.
        control(
            "set_model",
            onResult = { onApplied(ModelChange(applied = true, model = model)) },
            onFailure = { message ->
                thisLogger().warn("Agent refused model $model: $message")
                this.model = previous
                onApplied(ModelChange(applied = false, model = previous, error = message))
            },
        ) {
            put("model", model.ifEmpty { "default" })
        }
    }

    /** Усилие меняется слэш-командой: своего управляющего запроса у CLI для него нет. */
    fun setEffort(effort: String) {
        this.effort = effort
        if (handler == null) return
        applyPreference("/effort $effort")
    }

    /**
     * Каталог моделей — тот же, что показывает `/model` в терминале: его собирает
     * сам CLI по учётной записи, провайдеру и политике организации, поэтому
     * выдумывать список на своей стороне нельзя (см. ClaudeModels).
     */
    fun requestModels(onResult: (JsonObject) -> Unit, onFailure: (String) -> Unit = {}) {
        control("list_models", onResult = onResult, onFailure = onFailure)
    }

    /**
     * MCP-серверы этого разговора: кто подключён, кто ждёт входа, кто упал и
     * почему, откуда взялся каждый (проект, личный конфиг, claude.ai, плагин).
     *
     * Спрашиваем у самого разговора, а не разбираем вывод `claude mcp list`:
     * в списке нет ни причины отказа, ни того, что серверу нужен вход, — а
     * подключены серверы всё равно к процессу разговора, а не к какому-то
     * отдельному «состоянию MCP» на диске.
     */
    fun requestMcpStatus(onResult: (JsonObject) -> Unit, onFailure: (String) -> Unit = {}) {
        control("mcp_status", onResult = onResult, onFailure = onFailure)
    }

    /**
     * Вход в MCP-сервер, который его требует. CLI отвечает адресом, который надо
     * открыть человеку, и сам поднимает у себя локальный обработчик, куда
     * браузер вернётся с кодом, — поэтому запрос обязан идти в живой процесс
     * разговора, а не в разовый: с его смертью умрёт и обработчик.
     */
    fun authenticateMcp(server: String, onResult: (JsonObject) -> Unit, onFailure: (String) -> Unit = {}) {
        control("mcp_authenticate", onResult = onResult, onFailure = onFailure) { put("serverName", server) }
    }

    /** Переподключение одного сервера — без перезапуска разговора. */
    fun reconnectMcp(server: String, onResult: (JsonObject) -> Unit, onFailure: (String) -> Unit = {}) {
        control("mcp_reconnect", onResult = onResult, onFailure = onFailure) { put("serverName", server) }
    }

    /**
     * Прибить одну задачу разговора — субагента или фоновую команду, — не трогая
     * сам ход: тем же управляющим запросом, которым это делает и терминал.
     *
     * Задачи, которой уже нет, CLI не пугается и отвечает успехом: к моменту
     * нажатия она могла закончиться сама. Наверх сообщаем только настоящий отказ
     * — иначе крестик молча ничего не делал бы.
     */
    fun stopTask(taskId: String, onFailure: (String) -> Unit = {}) {
        control(
            "stop_task",
            onFailure = { message ->
                thisLogger().warn("Agent refused to stop task $taskId: $message")
                onFailure(message)
            },
        ) { put("task_id", taskId) }
    }

    /**
     * Сколько занято окна контекста прямо сейчас — цифра от самого CLI, та же,
     * что печатает `/context`. Считать её самим по usage нельзя: размер окна
     * зависит от модели (у «1M»-моделей он впятеро больше обычного), а в занятое
     * входит и то, чего в usage хода не видно вовсе.
     */
    fun requestContextUsage(onResult: (JsonObject) -> Unit, onFailure: (String) -> Unit = {}) {
        control("get_context_usage", onResult = onResult, onFailure = onFailure)
    }

    /**
     * Чем закончилась смена режима. Агент отвечает не только да или нет: он может
     * применить не то, что просили (устаревшее имя режима), а может и отказать —
     * например, режим «auto» доступен не всякой модели.
     */
    data class ModeChange(val applied: Boolean, val mode: String, val error: String = "")

    /**
     * Смена режима разрешений на лету: агент применяет её к следующим же вызовам
     * инструментов, перезапускать процесс не нужно. Об исходе сообщаем наверх —
     * панель показывает режим, и показывать она должна применённый, а не желаемый.
     */
    fun setPermissionMode(requested: String, onApplied: (ModeChange) -> Unit) {
        // Наружу отвечаем тем же именем, что понимает CLI: панель показывает
        // применённый режим, а не тот, которым его звали в старой переписке.
        val mode = PermissionModes.normalize(requested)

        // Прежний режим держим под рукой: при отказе к нему и возвращаемся, иначе
        // перезапуск процесса поднял бы разговор с обычными разрешениями.
        val previous = permissionMode
        permissionMode = mode

        if (handler == null) {
            // Процесса ещё нет: режим уйдёт флагом при запуске, менять нечего.
            onApplied(ModeChange(applied = true, mode = mode))
            return
        }

        control(
            "set_permission_mode",
            onResult = { response ->
                // Верим ответу, а не своей просьбе: агент возвращает применённое.
                val applied = response["mode"]?.jsonPrimitive?.contentOrNull ?: mode
                permissionMode = applied
                onApplied(ModeChange(applied = true, mode = applied))
            },
            onFailure = { message ->
                thisLogger().warn("Agent refused permission mode $mode: $message")
                permissionMode = previous
                onApplied(ModeChange(applied = false, mode = mode, error = message))
            },
        ) { put("mode", mode) }
    }

    /**
     * Расход спрашиваем, только если процесс уже живёт сам по себе — control()
     * и так тихо пропустит запрос, если живой сессии нет. Раньше ради этой
     * цифры поднимали процесс даже без единого сообщения, но это полноценный
     * запуск claude со всеми его MCP-серверами и хуками, который конкурирует за
     * ресурсы с реально работающим разговором в другой вкладке — разовый расход
     * того не стоит. До первого сообщения панель просто ничего не показывает.
     */
    fun requestUsage(onUsage: (JsonObject) -> Unit) {
        control("get_usage", onResult = onUsage)
    }

    /**
     * Прерывание хода. В отличие от остановки процесса разговор остаётся живым.
     *
     * Само по себе согласие агента прервать ход — это ещё не «ход закончен»: об
     * этом панель узнает по обычному result-событию в потоке. А вот если агент
     * не подтвердил и это — явный сигнал, что с процессом что-то не так, и стоит
     * предложить убить его насильно, а не просто тихо стоять с крутящимся Stop.
     */
    fun interrupt(onTimeout: () -> Unit = {}) {
        control("interrupt", onFailure = { onTimeout() })
    }

    /**
     * Перезапуск процесса разговора с сохранением переписки.
     *
     * Ради MCP: заново подключить сервер иначе нечем — отдельной подкоманды у CLI
     * нет (`claude mcp` умеет только list/add/remove), а слэш-команда `/mcp` в
     * потоковом режиме не выполняется вовсе, она есть лишь у интерактивного
     * терминала. Зато при старте процесс подключается ко всем серверам сам, а
     * разговор поднимается тем же conversationId (см. ClaudeLaunch) — для
     * человека это и выглядит переподключением, а не потерей контекста.
     *
     * Возвращает ложь, если поднимать было нечего: разговор ещё не начинался, и
     * серверы подключатся сами при первом же сообщении.
     */
    fun restart(): Boolean {
        if (handler == null) return false

        stop()
        return start() != null
    }

    /** Остановка разговора целиком: процесс снимаем, контекст теряем. */
    fun stop() {
        val process = handler ?: return
        stopRequested = true
        handler = null
        lines.reset()
        awaitingControl.clear()
        // Отвечать на висящие вопросы уже некому и нечем: процесса, который их
        // задал, сейчас не станет.
        awaitingPermission.clear()
        process.destroyProcess()
    }

    override fun dispose() = stop()

    // --- Управляющий канал --------------------------------------------------

    private fun control(
        subtype: String,
        onResult: (JsonObject) -> Unit = {},
        onFailure: (String) -> Unit = {},
        request: JsonObjectBuilder.() -> Unit = {},
    ) {
        val process = handler ?: run {
            thisLogger().info("Control request $subtype skipped: no live session")
            onFailure("no live session")
            return
        }

        val id = UUID.randomUUID().toString()
        awaitingControl[id] = Control(onResult, onFailure)

        // Без своего таймаута забытый ответ вешает этот кусок панели навсегда —
        // тот же риск, что мы уже чинили для разрешений, но здесь он касается
        // любого управляющего запроса: расхода лимитов, смены режима, Stop.
        AppExecutorUtil.getAppScheduledExecutorService().schedule(
            { awaitingControl.remove(id)?.onFailure?.invoke("$subtype timed out") },
            CONTROL_TIMEOUT_SECONDS,
            TimeUnit.SECONDS,
        )

        write(
            process,
            buildJsonObject {
                put("request_id", id)
                put("type", "control_request")
                putJsonObject("request") {
                    put("subtype", subtype)
                    request()
                }
            }.toString(),
        )
    }

    /**
     * Ответы управляющего канала наверх не отдаём: панель рисует разговор, а это
     * служебная переписка с процессом.
     */
    private fun consume(line: String) {
        // Встречный запрос: не ответ на нашу просьбу, а вопрос агента к панели.
        if (line.contains("\"control_request\"")) {
            val payload = runCatching {
                kotlinx.serialization.json.Json.parseToJsonElement(line).jsonObject
            }.getOrNull()

            if (payload?.get("type")?.jsonPrimitive?.contentOrNull == "control_request") {
                askPermission(payload)
                return
            }
        }

        if (line.contains("\"control_response\"")) {
            val response = runCatching {
                kotlinx.serialization.json.Json.parseToJsonElement(line).jsonObject["response"]?.jsonObject
            }.getOrNull()

            val id = response?.get("request_id")?.jsonPrimitive?.contentOrNull
            val control = id?.let { awaitingControl.remove(it) } ?: return

            if (response?.get("subtype")?.jsonPrimitive?.contentOrNull == "success") {
                control.onResult(response["response"]?.jsonObject ?: JsonObject(emptyMap()))
            } else {
                control.onFailure(response?.get("error")?.jsonPrimitive?.contentOrNull.orEmpty())
            }
            return
        }

        if (suppressingPreferenceReply) {
            // Системные события пропускаем как всегда — по ним живёт строка
            // состояния (модель, режим). Сам ход помечаем прошедшим по result:
            // он всегда один и без него это разночтение никогда не кончится.
            if (line.contains("\"type\":\"result\"")) suppressingPreferenceReply = false
            if (!line.contains("\"type\":\"system\"")) return
        }

        rememberConversation(line)
        onEvent(line)
    }

    /**
     * Агент просит разрешения на вызов инструмента. Отдаём вопрос наверх и ждём
     * человека: ответить обязаны мы, иначе ход стоит до самого конца разговора.
     */
    private fun askPermission(payload: JsonObject) {
        when (val incoming = PermissionChannel.parse(payload)) {
            is PermissionChannel.Incoming.Permission -> {
                awaitingPermission[incoming.request.requestId] = incoming.request
                onToolPermission(incoming.request)
            }

            is PermissionChannel.Incoming.Unsupported -> {
                // Чего не понимаем — отклоняем сразу и вслух: молчание здесь не
                // «пропустил мимо ушей», а остановка хода навсегда.
                thisLogger().info("Unsupported control request from claude: ${incoming.subtype}")
                answerPermission(
                    incoming.requestId,
                    allow = false,
                    message = "The panel does not handle '${incoming.subtype}' requests.",
                )
            }

            null -> Unit
        }
    }

    /**
     * Ответ человека агенту: разговор стоит на этом месте, пока он не придёт.
     *
     * [extraInput] дописывается к аргументам вызова — так возвращаются ответы на
     * вопрос с вариантами: CLI ждёт их в том же `updatedInput`, поле `answers`
     * (см. ClaudeLaunch.ASK_TOOL).
     *
     * [remember] — это «Always allow»: вместе с разрешением уходит правило, после
     * которого про такую же команду CLI больше не спросит ни панель, ни терминал.
     */
    fun answerPermission(
        requestId: String,
        allow: Boolean,
        message: String = "",
        extraInput: JsonObject? = null,
        remember: Boolean = false,
    ) {
        val process = handler ?: return
        val request = awaitingPermission.remove(requestId)
        val input = request?.input ?: JsonObject(emptyMap())
        val updated = if (extraInput == null) input else JsonObject(input + extraInput)

        write(
            process,
            if (allow) {
                val rules = if (remember && request != null) {
                    PermissionChannel.rememberRules(request)
                } else {
                    JsonArray(emptyList())
                }
                PermissionChannel.allow(requestId, updated, rules)
            } else {
                PermissionChannel.deny(requestId, message)
            },
        )
    }

    /** Ждёт ли этот разговор ответа на такой запрос — иначе отвечать некому. */
    fun isAwaitingPermission(requestId: String): Boolean = awaitingPermission.containsKey(requestId)

    private fun write(process: OSProcessHandler, payload: String) {
        runCatching {
            process.processInput.write((payload + "\n").toByteArray())
            process.processInput.flush()
        }.onFailure {
            onError("Failed to talk to claude: ${it.message}")
        }
    }

    // --- Процесс ------------------------------------------------------------

    private fun start(): OSProcessHandler? {
        stopRequested = false
        suppressingPreferenceReply = false
        val executable = ClaudeExecutable.find()

        if (executable == null) {
            onError("CLAUDE_NOT_FOUND")
            return null
        }

        val commandLine = GeneralCommandLine(executable.absolutePath)
            .withParameters(
                ClaudeLaunch.arguments(
                    model = model,
                    effort = effort,
                    permissionMode = permissionMode,
                    conversationId = conversationId,
                    forkFrom = forkFrom,
                    allowBypassSwitch = ClaudeExecutable.supportsFlag(
                        executable,
                        ClaudeLaunch.ALLOW_BYPASS_FLAG,
                    ),
                ),
            )
            .withWorkingDirectory(workingDirectory?.let { java.nio.file.Path.of(it) })
            .withEnvironment(ClaudeExecutable.environment())
            .withCharset(Charsets.UTF_8)

        val process = runCatching { OSProcessHandler(commandLine) }
            .onFailure {
                thisLogger().warn("Failed to start claude", it)
                onError("Failed to start claude: ${it.message}")
            }
            .getOrNull() ?: return null

        process.addProcessListener(
            object : ProcessListener {
                override fun onTextAvailable(event: ProcessEvent, outputType: Key<*>) {
                    when (outputType) {
                        ProcessOutputTypes.STDOUT -> lines.append(event.text)
                        ProcessOutputTypes.STDERR -> onError(event.text.trim())
                    }
                }

                override fun processTerminated(event: ProcessEvent) {
                    handler = null
                    // Мы сами его остановили — это не крах, объяснять пользователю
                    // нечего. А вот если процесс умер сам, любая карточка, которая
                    // была «выполняется» в этот момент, иначе зависнет так навсегда.
                    if (!stopRequested) onCrashed(event.exitCode)
                    onFinished()
                }
            },
        )

        process.startNotify()
        handler = process
        return process
    }

    /** Идентификатор разговора: без него не возобновить его после перезапуска. */
    var conversationId: String? = resumeFrom
        private set

    /**
     * Идентификатор разговора агент присылает в служебном событии. Разбирать поток
     * целиком ради одного поля незачем — достаточно заметить его в строке.
     */
    private fun rememberConversation(line: String) {
        if (conversationId != null && !line.contains("\"subtype\":\"init\"")) return

        val match = SESSION_ID.find(line) ?: return
        conversationId = match.groupValues[1]
    }

    private fun userMessage(text: String, images: List<ImageAttachment>): String = buildJsonObject {
        put("type", "user")
        putJsonObject("message") {
            put("role", "user")
            putJsonArray("content") {
                addJsonObject {
                    put("type", "text")
                    put("text", text)
                }
                // Порядок как у самого CLI: текст с плейсхолдерами [Image #N] идёт первым,
                // а дальше — байты картинок в том же порядке, в каком их вставили.
                for (image in images) {
                    addJsonObject {
                        put("type", "image")
                        putJsonObject("source") {
                            put("type", "base64")
                            put("media_type", image.mediaType)
                            put("data", image.data)
                        }
                    }
                }
            }
        }
    }.toString()

    private companion object {
        val SESSION_ID = Regex("\"session_id\"\\s*:\\s*\"([^\"]+)\"")

        /** Сколько ждём ответа на любой управляющий запрос, прежде чем сдаться сами. */
        const val CONTROL_TIMEOUT_SECONDS = 20L
    }
}

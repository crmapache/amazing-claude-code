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
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.JsonObjectBuilder
import kotlinx.serialization.json.addJsonObject
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
    /** Настройки запуска: через них подключается хук разрешений. */
    private val settingsJson: String?,
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
     */
    private val model: String = "",
    private val effort: String = "",
    permissionMode: String = "",
    private val onEvent: (String) -> Unit,
    private val onError: (String) -> Unit,
    private val onFinished: () -> Unit,
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

    private val lines = StreamLines(onLine = ::consume)

    val isRunning: Boolean get() = handler?.isProcessTerminated == false

    fun sendPrompt(text: String, images: List<ImageAttachment> = emptyList()) {
        val process = handler ?: start() ?: return
        write(process, userMessage(text, images))
    }

    /**
     * /model и /effort панель шлёт сама, не человек: показывать в ленте ответ
     * агента на них незачем, и он к тому же вводит в заблуждение (см. комментарий
     * у [suppressingPreferenceReply]).
     */
    fun applyPreference(command: String) {
        val process = handler ?: start() ?: return
        suppressingPreferenceReply = true
        write(process, userMessage(command, emptyList()))
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

    /** Остановка разговора целиком: процесс снимаем, контекст теряем. */
    fun stop() {
        val process = handler ?: return
        stopRequested = true
        handler = null
        lines.reset()
        awaitingControl.clear()
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
                    settingsJson = settingsJson,
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

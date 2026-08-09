package io.github.crmapache.amazingclaudecode.claude

import com.intellij.execution.configurations.GeneralCommandLine
import com.intellij.execution.process.OSProcessHandler
import com.intellij.execution.process.ProcessEvent
import com.intellij.execution.process.ProcessListener
import com.intellij.execution.process.ProcessOutputTypes
import com.intellij.openapi.diagnostic.thisLogger
import com.intellij.openapi.util.Key
import com.intellij.util.concurrency.AppExecutorUtil
import java.nio.file.Path
import java.util.UUID
import java.util.concurrent.TimeUnit
import java.util.concurrent.atomic.AtomicBoolean
import kotlinx.serialization.json.Json
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.buildJsonObject
import kotlinx.serialization.json.contentOrNull
import kotlinx.serialization.json.jsonObject
import kotlinx.serialization.json.jsonPrimitive
import kotlinx.serialization.json.put
import kotlinx.serialization.json.putJsonObject

/**
 * Разовый управляющий запрос к CLI, когда живого разговора ещё нет.
 *
 * Так спрашиваются вещи, которые нужны панели сразу при открытии, а не после
 * первого сообщения: окна расхода подписки (`get_usage`) и каталог моделей
 * (`list_models`). У живого [ClaudeSession] их спросить нельзя до первого
 * промпта — процесса ещё нет, а поднимать полноценный разговор заранее ради
 * одной цифры раньше уже пробовали и убрали: это запуск со всеми MCP-серверами
 * и хуками, конкурирующий за ресурсы с реально работающей вкладкой.
 *
 * `--safe-mode` отключает ровно эти тяжёлые части (хуки, MCP, скиллы, проектные
 * настройки), но не вход, не лимиты и не каталог моделей — ответ приходит за
 * секунду-две вместо трёх с обычным запуском (проверено напрямую). Процесс
 * разовый: один control_request, один ответ, и сразу гасим.
 */
internal object ClaudeControlPing {

    private const val TIMEOUT_MS = 15_000L

    fun request(
        workingDirectory: String?,
        subtype: String,
        onResult: (JsonObject) -> Unit,
        onError: (String) -> Unit,
    ) {
        val executable = ClaudeExecutable.find()
        if (executable == null) {
            onError("Claude Code executable not found.")
            return
        }

        AppExecutorUtil.getAppExecutorService().submit {
            val commandLine = GeneralCommandLine(executable.absolutePath)
                .withParameters(
                    "--print",
                    "--verbose",
                    "--output-format", "stream-json",
                    "--input-format", "stream-json",
                    "--include-partial-messages",
                    "--safe-mode",
                    "--permission-mode", "bypassPermissions",
                )
                .withEnvironment(ClaudeExecutable.environment())
                .withCharset(Charsets.UTF_8)
                .apply { workingDirectory?.let { withWorkingDirectory(Path.of(it)) } }

            val process = runCatching { OSProcessHandler(commandLine) }
                .onFailure {
                    thisLogger().warn("Failed to start $subtype ping", it)
                    onError(it.message ?: "Failed to start claude.")
                }
                .getOrNull() ?: return@submit

            val done = AtomicBoolean(false)

            val timeoutTask = AppExecutorUtil.getAppScheduledExecutorService().schedule(
                {
                    if (done.compareAndSet(false, true)) {
                        process.destroyProcess()
                        onError("$subtype timed out")
                    }
                },
                TIMEOUT_MS,
                TimeUnit.MILLISECONDS,
            )

            val lines = StreamLines(
                onLine = { line ->
                    if (!line.contains("\"control_response\"") || !done.compareAndSet(false, true)) return@StreamLines

                    timeoutTask.cancel(false)

                    val response = runCatching {
                        Json.parseToJsonElement(line).jsonObject["response"]?.jsonObject
                    }.getOrNull()

                    when {
                        response == null -> onError("Malformed $subtype response")
                        response["subtype"]?.jsonPrimitive?.contentOrNull == "success" ->
                            onResult(response["response"]?.jsonObject ?: JsonObject(emptyMap()))
                        else -> onError(response["error"]?.jsonPrimitive?.contentOrNull.orEmpty())
                    }

                    process.destroyProcess()
                },
            )

            process.addProcessListener(
                object : ProcessListener {
                    override fun onTextAvailable(event: ProcessEvent, outputType: Key<*>) {
                        if (outputType == ProcessOutputTypes.STDOUT) lines.append(event.text)
                    }

                    override fun processTerminated(event: ProcessEvent) {
                        if (done.compareAndSet(false, true)) {
                            timeoutTask.cancel(false)
                            onError("claude exited before answering $subtype")
                        }
                    }
                },
            )

            process.startNotify()

            runCatching {
                val requestId = UUID.randomUUID().toString()
                val payload = buildJsonObject {
                    put("request_id", requestId)
                    put("type", "control_request")
                    putJsonObject("request") { put("subtype", subtype) }
                }.toString()

                process.processInput.write((payload + "\n").toByteArray(Charsets.UTF_8))
                process.processInput.flush()
            }.onFailure {
                if (done.compareAndSet(false, true)) {
                    timeoutTask.cancel(false)
                    onError("Failed to talk to claude: ${it.message}")
                }
            }
        }
    }
}

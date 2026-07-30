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
 * Пятичасовое и недельное окно расхода сразу при открытии панели, а не только
 * после первого сообщения. У живого [ClaudeSession] эту цифру спросить нельзя
 * до первого промпта — процесса ещё нет, а поднимать его заранее ради одной
 * цифры раньше уже пробовали и убрали: это полноценный запуск со всеми MCP-
 * серверами и хуками, конкурирующий за ресурсы с реально работающей вкладкой.
 *
 * `--safe-mode` отключает ровно эти тяжёлые части (хуки, MCP, скиллы, проектные
 * настройки), но не вход и не лимиты — get_usage отвечает за секунду-две вместо
 * трёх с обычным запуском (проверено напрямую). Процесс разовый: один
 * control_request, один ответ, и сразу гасим.
 */
internal object ClaudeUsagePing {

    private const val TIMEOUT_MS = 15_000L

    fun request(workingDirectory: String?, onResult: (JsonObject) -> Unit, onError: (String) -> Unit) {
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
                    thisLogger().warn("Failed to start usage ping", it)
                    onError(it.message ?: "Failed to start claude.")
                }
                .getOrNull() ?: return@submit

            val done = AtomicBoolean(false)

            val timeoutTask = AppExecutorUtil.getAppScheduledExecutorService().schedule(
                {
                    if (done.compareAndSet(false, true)) {
                        process.destroyProcess()
                        onError("get_usage timed out")
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
                        response == null -> onError("Malformed get_usage response")
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
                            onError("claude exited before answering get_usage")
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
                    putJsonObject("request") { put("subtype", "get_usage") }
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

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
 * A one-off control request to the CLI when there is no live conversation yet.
 *
 * This is how the panel asks for the things it needs the moment it opens rather than after the first
 * message: the subscription usage windows (`get_usage`) and the model catalogue (`list_models`). A live
 * [ClaudeSession] cannot be asked before the first prompt - there is no process yet - and raising a
 * full conversation in advance for one figure was tried and removed: that is a launch with all the MCP
 * servers and hooks, competing for resources with a tab genuinely at work.
 *
 * `--safe-mode` switches off exactly those heavy parts (hooks, MCP, skills, project settings) but not
 * the sign-in, the limits or the model catalogue - the answer comes back in a second or two instead of
 * three with an ordinary launch (verified directly). The process is single-use: one control_request,
 * one answer, and down it goes.
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
                        Json.parseToJsonElement(line).jsonObject["response"] as? JsonObject
                    }.getOrNull()

                    // A slip inside the handler must not leave the process hanging: it is single-use,
                    // and there is nobody else to take it down - see destroyProcess below.
                    runCatching {
                        when {
                            response == null -> onError("Malformed $subtype response")
                            response["subtype"]?.jsonPrimitive?.contentOrNull == "success" ->
                                onResult(response["response"] as? JsonObject ?: JsonObject(emptyMap()))
                            else -> onError(response["error"]?.jsonPrimitive?.contentOrNull.orEmpty())
                        }
                    }.onFailure { thisLogger().warn("Handler for $subtype ping failed", it) }

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

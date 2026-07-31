package io.github.crmapache.amazingclaudecode.claude

import com.intellij.openapi.Disposable
import com.intellij.openapi.diagnostic.thisLogger
import com.sun.net.httpserver.HttpExchange
import com.sun.net.httpserver.HttpServer
import java.net.InetAddress
import java.net.InetSocketAddress
import java.util.UUID
import java.util.concurrent.CompletableFuture
import java.util.concurrent.ConcurrentHashMap
import java.util.concurrent.Executors
import java.util.concurrent.TimeUnit
import kotlinx.serialization.json.Json
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.buildJsonObject
import kotlinx.serialization.json.contentOrNull
import kotlinx.serialization.json.jsonObject
import kotlinx.serialization.json.jsonPrimitive
import kotlinx.serialization.json.put
import kotlinx.serialization.json.putJsonObject

/**
 * Спрашивает разрешение на вызов инструмента через панель.
 *
 * Агент, запущенный потоком, сам вопросов не задаёт: решение принимает хук, который
 * он вызывает перед каждым опасным инструментом. Хук у нас — обращение к этому
 * серверу, а сервер ждёт, пока человек нажмёт кнопку в панели. Отсюда и блокировка:
 * пока запрос висит, агент стоит и ничего не выполняет.
 */
internal class PermissionServer(
    private val onRequest: (Request) -> Unit,
) : Disposable {

    data class Request(
        val id: String,
        val sessionId: String,
        val toolName: String,
        val target: String,
        val command: String,
        val mode: String,
        /** Заполнено, только если разрешения запросил инструмент внутри субагента. */
        val agentId: String?,
    )

    enum class Decision { ALLOW, DENY }

    private val pending = ConcurrentHashMap<String, CompletableFuture<Decision>>()

    // Слушаем только петлю: наружу порт не выставляем ни при каких обстоятельствах.
    private val server: HttpServer = HttpServer.create(InetSocketAddress(InetAddress.getLoopbackAddress(), 0), 0)

    /** Общий секрет: локальный порт виден другим процессам машины. */
    val token: String = UUID.randomUUID().toString()

    val port: Int get() = server.address.port

    init {
        server.createContext(PATH, ::handle)
        // Каждый запрос ждёт человека, поэтому обработчикам нужен свой поток.
        server.executor = Executors.newCachedThreadPool()
        server.start()
    }

    fun resolve(id: String, decision: Decision) {
        pending.remove(id)?.complete(decision)
    }

    override fun dispose() {
        // DEFER здесь оставил бы вызов зависшим в CLI, которого больше некому решить —
        // явный отказ хотя бы объясняет, что случилось, а не тонет молча.
        pending.values.forEach { it.complete(Decision.DENY) }
        pending.clear()
        server.stop(0)
    }

    private fun handle(exchange: HttpExchange) {
        try {
            if (exchange.requestHeaders.getFirst(TOKEN_HEADER) != token) {
                exchange.sendResponseHeaders(403, -1)
                return
            }

            val body = exchange.requestBody.readBytes().decodeToString()
            val payload = runCatching { Json.parseToJsonElement(body).jsonObject }.getOrNull()

            // DEFER не значит «сам решай» — для CLI это «останови вызов насовсем», и
            // инструмент зависает без единого объяснения, дожидаясь решения, которое
            // никогда не придёт. В нештатных случаях безопаснее явно отказать.
            if (payload == null) {
                respond(exchange, decisionJson(Decision.DENY, "The panel could not read the request."))
                return
            }

            val decision = decide(payload)
            respond(exchange, decisionJson(decision.first, decision.second))
        } catch (error: Exception) {
            thisLogger().warn("Permission request failed", error)
            runCatching { respond(exchange, decisionJson(Decision.DENY, "The panel failed to handle the request.")) }
        } finally {
            exchange.close()
        }
    }

    private fun decide(payload: JsonObject): Pair<Decision, String> {
        val mode = payload.string("permission_mode")
        val toolName = payload.string("tool_name")
        val input = payload["tool_input"]?.jsonObject

        // В режимах без вопросов панель молчит: пользователь уже сказал, чего хочет.
        // Тут нужен именно ALLOW, а не DEFER: "defer" для CLI значит не "промолчал,
        // делай что хочешь", а «останови этот вызов инструмента совсем» — агент
        // получает result с deferred_tool_use и застревает, ничего не выполнив, пока
        // кто-то явно не примет решение. DEFER имел смысл только выглядел безопасным
        // выбором по названию — на практике это и было тем самым необъяснимым
        // зависанием на простейших командах.
        if (mode == "bypassPermissions" || mode == "acceptEdits" && isFileTool(toolName)) {
            return Decision.ALLOW to ""
        }

        val request = Request(
            id = UUID.randomUUID().toString(),
            sessionId = payload.string("session_id"),
            toolName = toolName,
            target = target(toolName, input),
            command = command(toolName, input),
            mode = mode,
            agentId = payload.stringOrNull("agent_id"),
        )

        val answer = CompletableFuture<Decision>()
        pending[request.id] = answer
        onRequest(request)

        return runCatching { answer.get(WAIT_MINUTES, TimeUnit.MINUTES) }
            .map { it to "" }
            .getOrElse {
                pending.remove(request.id)
                Decision.DENY to "The panel did not answer in time."
            }
    }

    private fun respond(exchange: HttpExchange, body: String) {
        val bytes = body.toByteArray()
        exchange.responseHeaders.add("Content-Type", "application/json")
        exchange.sendResponseHeaders(200, bytes.size.toLong())
        exchange.responseBody.use { it.write(bytes) }
    }

    private fun decisionJson(decision: Decision, reason: String): String = buildJsonObject {
        putJsonObject("hookSpecificOutput") {
            put("hookEventName", "PreToolUse")
            put(
                "permissionDecision",
                when (decision) {
                    Decision.ALLOW -> "allow"
                    Decision.DENY -> "deny"
                },
            )
            if (reason.isNotEmpty()) put("permissionDecisionReason", reason)
        }
    }.toString()

    private fun isFileTool(toolName: String): Boolean =
        toolName in setOf("Write", "Edit", "MultiEdit", "NotebookEdit")

    private fun target(toolName: String, input: JsonObject?): String {
        val path = input?.string("file_path").orEmpty().ifEmpty { input?.string("notebook_path").orEmpty() }
        if (path.isNotEmpty()) return "wants to edit ${path.substringAfterLast('/')}"

        return when (toolName) {
            "Bash" -> "wants to run a command"
            "WebFetch", "WebSearch" -> "wants to reach the network"
            else -> "wants to use $toolName"
        }
    }

    private fun command(toolName: String, input: JsonObject?): String {
        if (input == null) return toolName

        return input.string("command").ifEmpty {
            input.string("url").ifEmpty {
                input.string("file_path").ifEmpty { toolName }
            }
        }
    }

    private fun JsonObject.string(key: String): String =
        this[key]?.jsonPrimitive?.contentOrNull.orEmpty()

    /** В отличие от string() — null, если поля нет вовсе или оно пустое, а не "". */
    private fun JsonObject.stringOrNull(key: String): String? =
        this[key]?.jsonPrimitive?.contentOrNull?.takeIf { it.isNotEmpty() }

    companion object {
        const val PATH = "/permission"
        const val TOKEN_HEADER = "x-acc-token"

        /** Сколько ждём человека, прежде чем сами откажем инструменту. */
        const val WAIT_MINUTES = 10L

        /**
         * Внешние таймауты — у curl и у самого хука в настройках CLI — обязаны
         * быть строго больше этого ожидания, а не равны ему: иначе они гонятся
         * с нашим сервером наравне, и при любой мелкой задержке curl или сам
         * Claude Code решают, что хук не ответил, за миг до того, как сервер
         * успевает вежливо отказать. А неответивший хук CLI считает не отказом,
         * а «хук не в счёт» и едет дальше без единого решения — то самое
         * зависание без единой ошибки. Запас в 30 секунд оставляет наш отказ
         * гарантированным победителем этой гонки.
         */
        const val HOOK_TIMEOUT_SECONDS = WAIT_MINUTES * 60 + 30
    }
}

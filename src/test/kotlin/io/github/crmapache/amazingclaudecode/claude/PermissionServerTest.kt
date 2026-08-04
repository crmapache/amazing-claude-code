package io.github.crmapache.amazingclaudecode.claude

import java.net.URI
import java.net.http.HttpClient
import java.net.http.HttpRequest
import java.net.http.HttpResponse
import java.util.concurrent.CopyOnWriteArrayList
import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertTrue
import kotlinx.serialization.json.Json
import kotlinx.serialization.json.buildJsonObject
import kotlinx.serialization.json.contentOrNull
import kotlinx.serialization.json.jsonObject
import kotlinx.serialization.json.jsonPrimitive
import kotlinx.serialization.json.put
import kotlinx.serialization.json.putJsonObject

/**
 * Сервер целиком, тем же путём, каким в него ходит агент: телом хука PreToolUse
 * по HTTP. Проверяем не «функция вернула true», а что до панели вопрос вообще не
 * доехал и что в ответе стоит именно то решение, которое CLI умеет прочитать.
 */
class PermissionServerTest {

    private val client: HttpClient = HttpClient.newHttpClient()

    @Test
    fun `разведка субагента в режиме plan проходит мимо панели`() {
        val asked = CopyOnWriteArrayList<PermissionServer.Request>()
        val server = PermissionServer { asked.add(it) }

        try {
            val decision = post(
                server,
                hookBody(
                    mode = "plan",
                    command = "grep -rniE \"image|attachment|base64|paste\" --include=\"*.ts\" -l . " +
                        "| grep -v node_modules | head -40",
                    agentId = "agent-explore-1",
                ),
            )

            assertEquals("allow", decision)
            assertTrue(asked.isEmpty(), "панель не должна была ничего спрашивать")
        } finally {
            server.dispose()
        }
    }

    // Без этого CLI денаит собственный черновик плана как правку постороннего
    // файла, теряет ExitPlanMode и пересказывает план обычным текстом в чат
    // вместо карточки — тот самый баг, ради которого исключение и заведено.
    @Test
    fun `запись черновика плана в режиме plan проходит мимо панели`() {
        val asked = CopyOnWriteArrayList<PermissionServer.Request>()
        val server = PermissionServer { asked.add(it) }

        try {
            val home = System.getProperty("user.home")
            val decision = post(
                server,
                writeHookBody(mode = "plan", filePath = "$home/.claude/plans/plan-snazzy-bubble.md"),
            )

            assertEquals("allow", decision)
            assertTrue(asked.isEmpty(), "панель не должна была ничего спрашивать")
        } finally {
            server.dispose()
        }
    }

    @Test
    fun `запись обычного файла в режиме plan по-прежнему спрашивает`() {
        val asked = CopyOnWriteArrayList<PermissionServer.Request>()
        val server = PermissionServer { asked.add(it) }

        try {
            val answering = Thread {
                while (asked.isEmpty()) Thread.sleep(10)
                server.resolve(asked.first().id, PermissionServer.Decision.DENY)
            }
            answering.start()

            val decision = post(server, writeHookBody(mode = "plan", filePath = "/Users/max/project/src/App.tsx"))
            answering.join()

            assertEquals("deny", decision)
            assertEquals(1, asked.size)
        } finally {
            server.dispose()
        }
    }

    // Ради этого режима и затевалось одобрение плана: дальше агент работает сам.
    @Test
    fun `в режиме без вопросов панель не спрашивает даже про запись`() {
        val asked = CopyOnWriteArrayList<PermissionServer.Request>()
        val server = PermissionServer { asked.add(it) }

        try {
            val decision = post(server, hookBody(mode = "bypassPermissions", command = "rm -rf build"))

            assertEquals("allow", decision)
            assertTrue(asked.isEmpty(), "в этом режиме вопросов быть не должно")
        } finally {
            server.dispose()
        }
    }

    @Test
    fun `команда с записью в режиме plan доходит до панели вместе с номером агента`() {
        val asked = CopyOnWriteArrayList<PermissionServer.Request>()
        val server = PermissionServer { asked.add(it) }

        try {
            val decision = postAnswering(server, asked, PermissionServer.Decision.ALLOW)

            assertEquals("allow", decision)
            assertEquals(1, asked.size)
            assertEquals("Bash", asked.first().toolName)
            assertEquals("plan", asked.first().mode)
            assertEquals("agent-explore-1", asked.first().agentId)
            assertEquals("tab-7", asked.first().sessionId)
        } finally {
            server.dispose()
        }
    }

    @Test
    fun `отказ панели доезжает до агента отказом, а не молчанием`() {
        val asked = CopyOnWriteArrayList<PermissionServer.Request>()
        val server = PermissionServer { asked.add(it) }

        try {
            val decision = postAnswering(server, asked, PermissionServer.Decision.DENY)

            assertEquals("deny", decision)
        } finally {
            server.dispose()
        }
    }

    @Test
    fun `запрос без общего секрета не обслуживается`() {
        val server = PermissionServer { }

        try {
            val response = client.send(
                HttpRequest.newBuilder(URI.create("http://127.0.0.1:${server.port}${PermissionServer.PATH}"))
                    .header(PermissionServer.TOKEN_HEADER, "someone-elses-token")
                    .header(PermissionServer.SESSION_HEADER, "tab-7")
                    .POST(HttpRequest.BodyPublishers.ofString(hookBody("plan", "ls")))
                    .build(),
                HttpResponse.BodyHandlers.ofString(),
            )

            assertEquals(403, response.statusCode())
        } finally {
            server.dispose()
        }
    }

    @Test
    fun `нечитаемое тело не подвешивает вызов`() {
        val server = PermissionServer { }

        try {
            assertEquals("deny", post(server, "не json"))
        } finally {
            server.dispose()
        }
    }

    // --- Вспомогательное ---------------------------------------------------

    /** Сервер ждёт человека в своём потоке, поэтому кнопку «нажимаем» из другого. */
    private fun postAnswering(
        server: PermissionServer,
        asked: MutableList<PermissionServer.Request>,
        decision: PermissionServer.Decision,
    ): String? {
        val answering = Thread {
            while (asked.isEmpty()) Thread.sleep(10)
            server.resolve(asked.first().id, decision)
        }
        answering.start()

        return post(
            server,
            hookBody(mode = "plan", command = "npm install", agentId = "agent-explore-1"),
        ).also { answering.join() }
    }

    private fun post(server: PermissionServer, body: String): String? {
        val response = client.send(
            HttpRequest.newBuilder(URI.create("http://127.0.0.1:${server.port}${PermissionServer.PATH}"))
                .header(PermissionServer.TOKEN_HEADER, server.token)
                .header(PermissionServer.SESSION_HEADER, "tab-7")
                .POST(HttpRequest.BodyPublishers.ofString(body))
                .build(),
            HttpResponse.BodyHandlers.ofString(),
        )

        assertEquals(200, response.statusCode())

        return Json.parseToJsonElement(response.body())
            .jsonObject["hookSpecificOutput"]
            ?.jsonObject
            ?.get("permissionDecision")
            ?.jsonPrimitive
            ?.contentOrNull
    }

    /** Тело ровно того вида, в котором PreToolUse отдаёт его хуку. */
    private fun hookBody(mode: String, command: String, agentId: String? = null): String = buildJsonObject {
        put("hook_event_name", "PreToolUse")
        put("session_id", "разговор-агента-который-панели-неизвестен")
        put("permission_mode", mode)
        put("tool_name", "Bash")
        putJsonObject("tool_input") {
            put("command", command)
            put("description", "проверка")
        }
        if (agentId != null) put("agent_id", agentId)
    }.toString()

    /** То же самое тело хука, но для Write — тут вместо command важен file_path. */
    private fun writeHookBody(mode: String, filePath: String): String = buildJsonObject {
        put("hook_event_name", "PreToolUse")
        put("session_id", "разговор-агента-который-панели-неизвестен")
        put("permission_mode", mode)
        put("tool_name", "Write")
        putJsonObject("tool_input") {
            put("file_path", filePath)
            put("content", "# черновик")
        }
    }.toString()
}

package io.github.crmapache.amazingclaudecode.claude

import java.io.File
import kotlinx.serialization.json.add
import kotlinx.serialization.json.addJsonObject
import kotlinx.serialization.json.buildJsonObject
import kotlinx.serialization.json.put
import kotlinx.serialization.json.putJsonArray
import kotlinx.serialization.json.putJsonObject

/**
 * Настройки, с которыми панель поднимает агента.
 *
 * Здесь только одно: хук, который перед опасным инструментом стучится в панель и
 * ждёт решения. Спрашиваем не про всё подряд — чтение и поиск не меняют мир, и
 * подтверждать их каждый раз никто не станет.
 */
internal object ClaudeSettings {

    private const val WATCHED_TOOLS = "Bash|Write|Edit|MultiEdit|NotebookEdit|WebFetch|WebSearch|mcp__.*"

    fun withPermissionHook(port: Int, token: String): String = buildJsonObject {
        putJsonObject("hooks") {
            putJsonArray("PreToolUse") {
                addJsonObject {
                    put("matcher", WATCHED_TOOLS)
                    putJsonArray("hooks") {
                        addJsonObject {
                            put("type", "command")
                            // С запасом сверх ожидания на сервере: иначе агент сдастся
                            // на миг раньше, чем сервер успеет вежливо отказать сам.
                            put("timeout", PermissionServer.HOOK_TIMEOUT_SECONDS)
                            put("command", hookCommand(port, token))
                        }
                    }
                }
            }
        }
    }.toString()

    /**
     * Хук отдаёт свой стандартный ввод серверу и печатает ответ обратно — ровно то,
     * что и требуется от него агенту. Отдельный скрипт на диске для этого не нужен.
     */
    private fun hookCommand(port: Int, token: String): String =
        "curl -sS -m ${PermissionServer.HOOK_TIMEOUT_SECONDS} -X POST " +
            "-H '${PermissionServer.TOKEN_HEADER}: $token' " +
            "-H 'content-type: application/json' " +
            "--data-binary @- http://127.0.0.1:$port${PermissionServer.PATH}"

    /** Без curl хук работать не сможет, и тогда панель просто не спрашивает. */
    fun canHook(): Boolean = ClaudeExecutable.environment()["PATH"]
        ?.split(File.pathSeparatorChar)
        ?.any { File(it, curlName()).canExecute() } == true

    private fun curlName(): String =
        if (System.getProperty("os.name").startsWith("Windows")) "curl.exe" else "curl"
}

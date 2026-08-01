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

    /**
     * Настройки строятся под каждый разговор отдельно, потому что в хук зашит
     * идентификатор его вкладки — см. [hookCommand].
     */
    fun withPermissionHook(port: Int, token: String, sessionId: String): String = buildJsonObject {
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
                            put("command", hookCommand(port, token, sessionId))
                        }
                    }
                }
            }
        }
    }.toString()

    /**
     * Хук отдаёт свой стандартный ввод серверу и печатает ответ обратно — ровно то,
     * что и требуется от него агенту. Отдельный скрипт на диске для этого не нужен.
     *
     * Заголовком уходит идентификатор вкладки. В теле запроса лежит только
     * session_id самого агента — номер разговора, который панель ему не давала и
     * по которому не может найти вкладку. Раньше карточка разрешения уезжала
     * именно по нему, то есть в никуда: вызов инструмента вис «выполняется», пока
     * сервер через десять минут не отказывал за него сам, и человек не видел ни
     * вопроса, ни кнопок.
     */
    private fun hookCommand(port: Int, token: String, sessionId: String): String =
        "curl -sS -m ${PermissionServer.HOOK_TIMEOUT_SECONDS} -X POST " +
            "-H '${PermissionServer.TOKEN_HEADER}: $token' " +
            "-H '${PermissionServer.SESSION_HEADER}: ${shellSafe(sessionId)}' " +
            "-H 'content-type: application/json' " +
            "--data-binary @- http://127.0.0.1:$port${PermissionServer.PATH}"

    /**
     * Идентификаторы вкладок панель делает сама и они всегда безобидны, но команда
     * уходит в шелл — пусть даже теоретическая возможность подсунуть туда кавычку
     * закрыта здесь, а не в предположении о вызывающей стороне.
     */
    private fun shellSafe(value: String): String = value.filter { it.isLetterOrDigit() || it == '-' || it == '_' }

    /** Без curl хук работать не сможет, и тогда панель просто не спрашивает. */
    fun canHook(): Boolean = ClaudeExecutable.environment()["PATH"]
        ?.split(File.pathSeparatorChar)
        ?.any { File(it, curlName()).canExecute() } == true

    private fun curlName(): String =
        if (System.getProperty("os.name").startsWith("Windows")) "curl.exe" else "curl"
}

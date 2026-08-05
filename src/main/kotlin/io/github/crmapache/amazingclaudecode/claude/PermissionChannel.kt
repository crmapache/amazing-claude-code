package io.github.crmapache.amazingclaudecode.claude

import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.booleanOrNull
import kotlinx.serialization.json.buildJsonObject
import kotlinx.serialization.json.contentOrNull
import kotlinx.serialization.json.jsonObject
import kotlinx.serialization.json.jsonPrimitive
import kotlinx.serialization.json.put
import kotlinx.serialization.json.putJsonObject

/**
 * Разрешения, которые агент спрашивает у панели сам.
 *
 * Это встречная половина управляющего канала: обычно запросы по нему шлём мы (смена
 * режима, прерывание), а здесь наоборот — CLI спрашивает и ждёт ответа, пока ход
 * стоит. Канал включается ключом ClaudeLaunch.PERMISSION_CHANNEL_FLAG; без него
 * потоковый режим считается безлюдным и инструменты, которым нужен человек, просто
 * выключены — из-за чего кнопки под планом и оказывались пустышкой.
 *
 * Разбор и ответ живут отдельно от [ClaudeSession] нарочно: это чистая работа с
 * текстом протокола, её видно тестом без единого запущенного процесса.
 */
internal object PermissionChannel {

    /**
     * Вопрос агента о вызове инструмента.
     *
     * [toolUseId] — тот же идентификатор, что у вызова инструмента в ленте: по нему
     * панель находит уже нарисованную карточку (карточку плана, например) и не
     * показывает вторую. [requiresUserInteraction] отмечает инструменты, которые без
     * человека не работают в принципе — ExitPlanMode как раз такой.
     */
    data class ToolPermission(
        val requestId: String,
        val toolName: String,
        val toolUseId: String?,
        val input: JsonObject,
        val requiresUserInteraction: Boolean,
    )

    /** Что за запрос пришёл: либо понятный нам вопрос, либо всё остальное. */
    sealed interface Incoming {
        data class Permission(val request: ToolPermission) : Incoming

        /** Чужой или новый вид запроса: ответить всё равно обязаны, иначе ход встанет. */
        data class Unsupported(val requestId: String, val subtype: String) : Incoming
    }

    const val CAN_USE_TOOL = "can_use_tool"

    /** null — строка не про этот канал: обычное событие разговора или наш же ответ. */
    fun parse(payload: JsonObject): Incoming? {
        if (payload["type"]?.jsonPrimitive?.contentOrNull != "control_request") return null

        val requestId = payload["request_id"]?.jsonPrimitive?.contentOrNull ?: return null
        val request = payload["request"]?.jsonObject
        val subtype = request?.get("subtype")?.jsonPrimitive?.contentOrNull.orEmpty()

        if (request == null || subtype != CAN_USE_TOOL) return Incoming.Unsupported(requestId, subtype)

        return Incoming.Permission(
            ToolPermission(
                requestId = requestId,
                toolName = request["tool_name"]?.jsonPrimitive?.contentOrNull.orEmpty(),
                toolUseId = request["tool_use_id"]?.jsonPrimitive?.contentOrNull,
                input = request["input"]?.jsonObject ?: JsonObject(emptyMap()),
                requiresUserInteraction =
                    request["requires_user_interaction"]?.jsonPrimitive?.booleanOrNull ?: false,
            ),
        )
    }

    /**
     * Разрешение возвращает вызов с теми же аргументами, с какими его и задумали:
     * поле обязательное, а менять чужой вызов за агента панель не берётся.
     */
    fun allow(requestId: String, input: JsonObject): String =
        answer(requestId) {
            put("behavior", "allow")
            put("updatedInput", input)
        }

    /**
     * Отказ — с объяснением: для ExitPlanMode это ровно тот способ, которым план
     * отправляют на доработку, и текст агент прочитает как замечание к плану.
     */
    fun deny(requestId: String, message: String): String =
        answer(requestId) {
            put("behavior", "deny")
            put("message", message.ifEmpty { "The user declined." })
        }

    private fun answer(requestId: String, decision: kotlinx.serialization.json.JsonObjectBuilder.() -> Unit): String =
        buildJsonObject {
            put("type", "control_response")
            putJsonObject("response") {
                // «success» здесь про сам ответ, а не про решение: отказ — такой же
                // полноценный ответ, как и разрешение.
                put("subtype", "success")
                put("request_id", requestId)
                putJsonObject("response", decision)
            }
        }.toString()
}

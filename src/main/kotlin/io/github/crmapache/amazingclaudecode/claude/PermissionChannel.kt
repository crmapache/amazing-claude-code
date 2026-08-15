package io.github.crmapache.amazingclaudecode.claude

import kotlinx.serialization.json.JsonArray
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.addJsonObject
import kotlinx.serialization.json.booleanOrNull
import kotlinx.serialization.json.buildJsonArray
import kotlinx.serialization.json.buildJsonObject
import kotlinx.serialization.json.contentOrNull
import kotlinx.serialization.json.jsonPrimitive
import kotlinx.serialization.json.put
import kotlinx.serialization.json.putJsonArray
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
        /** Заполнено, только если разрешения просит инструмент внутри субагента. */
        val agentId: String? = null,
        /**
         * Готовые правила «больше не спрашивать», которые предлагает сам CLI, —
         * то же, что показывает третьим пунктом терминал. Сочинять правило на своей
         * стороне не надо: CLI разбирает команду сам и знает, какая её часть
         * значимая, а какая — случайный аргумент этого вызова.
         */
        val suggestions: JsonArray = JsonArray(emptyList()),
    )

    /** Что за запрос пришёл: либо понятный нам вопрос, либо всё остальное. */
    sealed interface Incoming {
        data class Permission(val request: ToolPermission) : Incoming

        /** Чужой или новый вид запроса: ответить всё равно обязаны, иначе ход встанет. */
        data class Unsupported(val requestId: String, val subtype: String) : Incoming
    }

    const val CAN_USE_TOOL = "can_use_tool"

    /** Вид обновления разрешений, которым добавляют правило: имя из протокола CLI. */
    private const val ADD_RULES = "addRules"

    /** null — строка не про этот канал: обычное событие разговора или наш же ответ. */
    fun parse(payload: JsonObject): Incoming? {
        if (payload["type"]?.jsonPrimitive?.contentOrNull != "control_request") return null

        val requestId = payload["request_id"]?.jsonPrimitive?.contentOrNull ?: return null
        // Здесь и ниже `as?`, а не `jsonObject`: пустое место в ответе CLI — это
        // не всегда отсутствующее поле, туда пишется и честный null, а на нём
        // `jsonObject` бросает исключение прямо в разборе потока.
        val request = payload["request"] as? JsonObject
        val subtype = request?.get("subtype")?.jsonPrimitive?.contentOrNull.orEmpty()

        if (request == null || subtype != CAN_USE_TOOL) return Incoming.Unsupported(requestId, subtype)

        return Incoming.Permission(
            ToolPermission(
                requestId = requestId,
                toolName = request["tool_name"]?.jsonPrimitive?.contentOrNull.orEmpty(),
                toolUseId = request["tool_use_id"]?.jsonPrimitive?.contentOrNull,
                input = request["input"] as? JsonObject ?: JsonObject(emptyMap()),
                requiresUserInteraction =
                    request["requires_user_interaction"]?.jsonPrimitive?.booleanOrNull ?: false,
                agentId = request["agent_id"]?.jsonPrimitive?.contentOrNull?.takeIf { it.isNotEmpty() },
                suggestions = request["permission_suggestions"] as? JsonArray ?: JsonArray(emptyList()),
            ),
        )
    }

    /**
     * Чем ответить на «Always allow»: правилом, которое CLI применит к этой же
     * сессии сразу и заодно запишет в настройки проекта, — второй раз про такую
     * команду он уже не спросит.
     *
     * Берём только предложения вида addRules. Остальное, что CLI кладёт рядом
     * (открыть себе целый каталог, переключить режим на acceptEdits), — это
     * ответы на другие вопросы, а человек нажал именно «разрешать эту команду».
     *
     * Пустой список предложений бывает у инструментов без разбираемых аргументов
     * (MCP, WebFetch): тогда правило — сам инструмент целиком, ровно как его
     * записал бы человек руками в permissions.allow.
     */
    fun rememberRules(request: ToolPermission): JsonArray {
        val offered = request.suggestions.filter { suggestion ->
            (suggestion as? JsonObject)?.get("type")?.jsonPrimitive?.contentOrNull == ADD_RULES
        }

        if (offered.isNotEmpty()) return JsonArray(offered)

        return buildJsonArray {
            addJsonObject {
                put("type", ADD_RULES)
                putJsonArray("rules") {
                    addJsonObject { put("toolName", request.toolName) }
                }
                put("behavior", "allow")
                put("destination", "localSettings")
            }
        }
    }

    /**
     * Разрешение возвращает вызов с теми же аргументами, с какими его и задумали:
     * поле обязательное, а менять чужой вызов за агента панель не берётся.
     *
     * [rules] непусты, когда человек выбрал «разрешать всегда»: CLI применит их
     * к текущей сессии и сам запишет в настройки — см. [rememberRules].
     */
    fun allow(requestId: String, input: JsonObject, rules: JsonArray = JsonArray(emptyList())): String =
        answer(requestId) {
            put("behavior", "allow")
            put("updatedInput", input)
            if (rules.isNotEmpty()) put("updatedPermissions", rules)
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

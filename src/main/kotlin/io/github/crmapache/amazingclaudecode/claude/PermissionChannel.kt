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
        /**
         * Почему спросили — словами самого CLI. Есть не у всякого вопроса: при
         * обычном «режим требует спрашивать» объяснять нечего, а вот проверка
         * безопасности, хук и классификатор приезжают с текстом.
         */
        val reason: String = "",
        /**
         * Разновидность причины: `safetyCheck`, `subcommandResults`, `hook`,
         * `classifier`, `rule`, `mode` и прочие имена из протокола. По ней панель
         * решает, как подать текст, — разбирать сам текст для этого не надо.
         */
        val reasonType: String = "",
        /**
         * Проверка безопасности требует именно человека: правило её не отменит и
         * классификатор `auto` её не пропустит. `null` — проверки безопасности в
         * причине нет вовсе.
         */
        val classifierApprovable: Boolean? = null,
        /**
         * CLI прямо просит не предлагать «разрешать всегда»: правило вышло бы шире
         * самого вопроса (разрешение всему инструменту вместо одного вызова).
         */
        val suppressAlwaysAllow: Boolean = false,
        /** Правило «спрашивать», из-за которого возник вопрос, — если он от правила. */
        val matchedAskRule: AskRule? = null,
    )

    /**
     * Правило `permissions.ask`, поймавшее этот вызов.
     *
     * [source] — имя слоя настроек из протокола (`userSettings`, `projectSettings`
     * и т.д.), [content] — значимая часть правила: у `Bash(git push *)` это
     * `git push *`, а у правила на весь инструмент её нет.
     */
    data class AskRule(val source: String, val toolName: String, val content: String?)

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
                reason = plain(request["decision_reason"]?.jsonPrimitive?.contentOrNull),
                reasonType = request["decision_reason_type"]?.jsonPrimitive?.contentOrNull.orEmpty(),
                classifierApprovable = request["classifier_approvable"]?.jsonPrimitive?.booleanOrNull,
                suppressAlwaysAllow =
                    request["suppress_always_allow_rule"]?.jsonPrimitive?.booleanOrNull ?: false,
                matchedAskRule = askRule(request["matched_ask_rule"] as? JsonObject),
            ),
        )
    }

    private fun askRule(rule: JsonObject?): AskRule? {
        val toolName = rule?.get("tool_name")?.jsonPrimitive?.contentOrNull?.takeIf { it.isNotEmpty() }
            ?: return null

        return AskRule(
            source = rule["source"]?.jsonPrimitive?.contentOrNull.orEmpty(),
            toolName = toolName,
            content = rule["rule_content"]?.jsonPrimitive?.contentOrNull?.takeIf { it.isNotEmpty() },
        )
    }

    /**
     * Текст причины приходит таким, каким его напечатал бы терминал, — то есть
     * может нести управляющие последовательности раскраски. В панели они не
     * раскрашивают ничего, а показались бы мусором посреди фразы, поэтому
     * вырезаются здесь же, при разборе.
     */
    private fun plain(text: String?): String = text.orEmpty().replace(ANSI, "").trim()

    /** Escape, за ним параметры и буква команды: раскраска терминала целиком. */
    private val ANSI = Regex("\u001B\\[[0-9;?]*[ -/]*[@-~]")

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

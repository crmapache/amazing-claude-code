package io.github.crmapache.amazingclaudecode.claude

import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertNull
import kotlin.test.assertTrue
import kotlinx.serialization.json.Json
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.jsonArray
import kotlinx.serialization.json.jsonObject

class PermissionChannelTest {

    private fun parse(line: String) = PermissionChannel.parse(Json.parseToJsonElement(line).jsonObject)

    // Тот самый вопрос, из-за отсутствия которого кнопки под планом ничего не делали:
    // именно им агент и спрашивает разрешение выйти из режима плана.
    @Test
    fun `вопрос про выход из плана разбирается целиком`() {
        val incoming = parse(
            """
            {"type":"control_request","request_id":"запрос-1","request":{
              "subtype":"can_use_tool","tool_name":"ExitPlanMode","display_name":"ExitPlanMode",
              "input":{"plan":"1. Сделать\n2. Проверить","planFilePath":"/tmp/план.md"},
              "tool_use_id":"toolu_1","requires_user_interaction":true}}
            """.trimIndent(),
        )

        val request = (incoming as PermissionChannel.Incoming.Permission).request
        assertEquals("запрос-1", request.requestId)
        assertEquals("ExitPlanMode", request.toolName)
        // По нему панель и находит уже нарисованную карточку плана.
        assertEquals("toolu_1", request.toolUseId)
        assertTrue(request.requiresUserInteraction)
        assertEquals("1. Сделать\n2. Проверить", request.input["plan"]?.toString()?.trim('"')?.replace("\\n", "\n"))
    }

    @Test
    fun `обычный вопрос про инструмент — без пометки про человека`() {
        val incoming = parse(
            """
            {"type":"control_request","request_id":"запрос-2","request":{
              "subtype":"can_use_tool","tool_name":"Write",
              "input":{"file_path":"/проект/файл.txt","content":"привет"},"tool_use_id":"toolu_2"}}
            """.trimIndent(),
        )

        val request = (incoming as PermissionChannel.Incoming.Permission).request
        assertEquals("Write", request.toolName)
        assertTrue(!request.requiresUserInteraction)
    }

    // Неотвеченный запрос останавливает ход навсегда, поэтому даже незнакомый вид
    // обязан дойти до ответа, а не потеряться.
    @Test
    fun `незнакомый запрос не теряется, а доходит до ответа`() {
        val incoming = parse(
            """{"type":"control_request","request_id":"запрос-3","request":{"subtype":"request_user_dialog"}}""",
        )

        val unsupported = incoming as PermissionChannel.Incoming.Unsupported
        assertEquals("запрос-3", unsupported.requestId)
        assertEquals("request_user_dialog", unsupported.subtype)
    }

    @Test
    fun `события разговора и наши собственные ответы каналу не принадлежат`() {
        assertNull(parse("""{"type":"assistant","message":{"role":"assistant","content":[]}}"""))
        assertNull(parse("""{"type":"control_response","response":{"subtype":"success","request_id":"x"}}"""))
    }

    // Разрешение обязано вернуть аргументы вызова: без updatedInput CLI считает
    // ответ неполным, а менять чужой вызов за агента панель не берётся.
    @Test
    fun `разрешение возвращает вызов с теми же аргументами`() {
        val input = Json.parseToJsonElement("""{"plan":"1. Сделать"}""").jsonObject
        val answer = Json.parseToJsonElement(PermissionChannel.allow("запрос-1", input)).jsonObject

        val response = answer["response"]!!.jsonObject
        assertEquals("\"success\"", response["subtype"].toString())
        assertEquals("\"запрос-1\"", response["request_id"].toString())

        val decision = response["response"]!!.jsonObject
        assertEquals("\"allow\"", decision["behavior"].toString())
        assertEquals(input, decision["updatedInput"]?.jsonObject)
    }

    // Вопрос от инструмента внутри субагента: без этой метки карточка ушла бы в
    // общий разговор, хотя ждёт ответа ветка субагента.
    @Test
    fun `запрос из субагента приносит его метку`() {
        val incoming = parse(
            """
            {"type":"control_request","request_id":"запрос-4","request":{
              "subtype":"can_use_tool","tool_name":"Bash","input":{"command":"mkdir -p /tmp/x"},
              "tool_use_id":"toolu_4","agent_id":"a809ed6c3ed130b74"}}
            """.trimIndent(),
        )

        assertEquals("a809ed6c3ed130b74", (incoming as PermissionChannel.Incoming.Permission).request.agentId)
    }

    // «Always allow» отвечается правилом самого CLI: он разбирает команду лучше
    // любой нашей эвристики и знает, какая её часть значимая. Из предложенного
    // берём только правила — открыть себе каталог целиком или переключить режим
    // человек не просил.
    @Test
    fun `разрешать всегда — правилом от CLI, без всего, о чём не просили`() {
        val incoming = parse(
            """
            {"type":"control_request","request_id":"запрос-5","request":{
              "subtype":"can_use_tool","tool_name":"Bash","input":{"command":"rm -f /tmp/x.txt"},
              "permission_suggestions":[
                {"type":"addRules","rules":[{"toolName":"Bash","ruleContent":"rm -f /tmp/x.txt"}],
                 "behavior":"allow","destination":"localSettings"},
                {"type":"addDirectories","directories":["/tmp"],"destination":"session"},
                {"type":"setMode","mode":"acceptEdits","destination":"session"}]}}
            """.trimIndent(),
        )

        val rules = PermissionChannel.rememberRules((incoming as PermissionChannel.Incoming.Permission).request)
        assertEquals(1, rules.size)
        assertEquals("\"addRules\"", rules[0].jsonObject["type"].toString())

        val decision = Json.parseToJsonElement(PermissionChannel.allow("запрос-5", JsonObject(emptyMap()), rules))
            .jsonObject["response"]!!.jsonObject["response"]!!.jsonObject
        assertEquals(rules, decision["updatedPermissions"])
    }

    // У инструментов без разбираемых аргументов (MCP, WebFetch) предложений не
    // бывает вовсе — правилом становится сам инструмент, иначе кнопка «всегда»
    // молча ничего бы не запомнила.
    @Test
    fun `без предложений правилом становится сам инструмент`() {
        val incoming = parse(
            """
            {"type":"control_request","request_id":"запрос-6","request":{
              "subtype":"can_use_tool","tool_name":"mcp__github__create_pr","input":{}}}
            """.trimIndent(),
        )

        val rule = PermissionChannel.rememberRules((incoming as PermissionChannel.Incoming.Permission).request)[0]
            .jsonObject
        assertEquals("\"addRules\"", rule["type"].toString())
        assertEquals("\"allow\"", rule["behavior"].toString())
        assertEquals(
            "\"mcp__github__create_pr\"",
            rule["rules"]!!.jsonArray[0].jsonObject["toolName"].toString(),
        )
    }

    // Разово разрешённое остаётся разовым: правило без спроса поменяло бы
    // настройки проекта, а человек нажал «разрешить», а не «разрешать всегда».
    @Test
    fun `обычное разрешение правил за собой не тянет`() {
        val decision = Json.parseToJsonElement(PermissionChannel.allow("запрос-7", JsonObject(emptyMap())))
            .jsonObject["response"]!!.jsonObject["response"]!!.jsonObject

        assertNull(decision["updatedPermissions"])
    }

    // Отказ по плану — это не ошибка, а замечание: агент читает текст и предлагает
    // план заново.
    @Test
    fun `отказ уходит с объяснением, а без него — с общим`() {
        val explained = Json.parseToJsonElement(PermissionChannel.deny("запрос-1", "Доработай план."))
            .jsonObject["response"]!!.jsonObject["response"]!!.jsonObject
        assertEquals("\"deny\"", explained["behavior"].toString())
        assertEquals("\"Доработай план.\"", explained["message"].toString())

        val bare = Json.parseToJsonElement(PermissionChannel.deny("запрос-1", ""))
            .jsonObject["response"]!!.jsonObject["response"]!!.jsonObject
        assertTrue(bare["message"].toString().length > 2)
    }
}

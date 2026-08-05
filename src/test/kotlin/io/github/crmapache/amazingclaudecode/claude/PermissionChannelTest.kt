package io.github.crmapache.amazingclaudecode.claude

import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertNull
import kotlin.test.assertTrue
import kotlinx.serialization.json.Json
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

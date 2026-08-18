package io.github.crmapache.amazingclaudecode.webview

import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertTrue
import kotlinx.serialization.builtins.serializer
import kotlinx.serialization.json.Json
import kotlinx.serialization.json.jsonArray
import kotlinx.serialization.json.jsonObject
import kotlinx.serialization.json.jsonPrimitive

/**
 * Пачка сообщений уезжает в страницу одной строкой JavaScript — и если эта строка
 * собрана неправильно, канал молчит целиком, без единой жалобы в логе. Поэтому её
 * форма проверяется здесь.
 */
class WebviewHostTest {

    @Test
    fun `собирает пачку в массив`() {
        val messages = parseArgument(single(listOf("""{"type":"a"}""", """{"type":"b"}""")))

        assertEquals(2, messages.size)
        assertEquals("a", messages[0].jsonObject["type"]?.jsonPrimitive?.content)
        assertEquals("b", messages[1].jsonObject["type"]?.jsonPrimitive?.content)
    }

    @Test
    fun `одно сообщение тоже уезжает массивом`() {
        assertEquals(1, parseArgument(single(listOf("""{"type":"a"}"""))).size)
    }

    /**
     * Ответ агента — обычный текст, в нём бывает что угодно: кавычки, переносы
     * строк, обратные слэши из кода, юникод. Ни одно из этого не должно выходить
     * за пределы литерала.
     */
    @Test
    fun `текст с кавычками и переносами не рвёт вызов`() {
        val text = """{"type":"agent","text":"он сказал \"да\"\nи закрыл \\ путь"}"""
        val messages = parseArgument(single(listOf(text)))

        assertEquals("он сказал \"да\"\nи закрыл \\ путь", messages[0].jsonObject["text"]?.jsonPrimitive?.content)
    }

    @Test
    fun `зовёт приёмник страницы и бережётся его отсутствия`() {
        val call = single(listOf("""{"type":"a"}"""))

        assertTrue(call.startsWith("window.__accReceive && window.__accReceive("))
        assertTrue(call.endsWith(");"))
    }

    /**
     * Слишком длинная пачка в страницу одним заходом не проходит — и раньше
     * пропадала молча вместе с итогом хода. Теперь едет частями, и склеенные
     * части обязаны дать ровно ту же пачку.
     */
    @Test
    fun `длинная пачка уезжает частями и склеивается обратно`() {
        val big = """{"type":"agent","text":"${"я".repeat(400_000)}"}"""
        val calls = receiveCalls(listOf(big, """{"type":"result"}"""))

        assertTrue(calls.size > 1, "ожидалась нарезка на части, а вышел один заход")
        assertTrue(calls.dropLast(1).all { it.endsWith(", false);") })
        assertTrue(calls.last().endsWith(", true);"))

        val messages = Json.parseToJsonElement(joinParts(calls)).jsonArray
        assertEquals(2, messages.size)
        assertEquals("result", messages[1].jsonObject["type"]?.jsonPrimitive?.content)
    }

    /**
     * Символ вне основной плоскости живёт в строке двумя половинками. Разрезанная
     * пополам пара до страницы доедет заменяющим знаком, и склеенная пачка
     * перестанет разбираться как JSON — то есть потеряется целиком.
     */
    @Test
    fun `не разрывает пару суррогатов на границе частей`() {
        val emoji = "🙂".repeat(200_000)
        val calls = receiveCalls(listOf("""{"type":"agent","text":"$emoji"}"""))

        assertTrue(calls.size > 1)
        val messages = Json.parseToJsonElement(joinParts(calls)).jsonArray
        assertEquals(emoji, messages[0].jsonObject["text"]?.jsonPrimitive?.content)
    }

    /** Пачка, которая уехала одним заходом: так её отдают почти всегда. */
    private fun single(batch: List<String>): String {
        val calls = receiveCalls(batch)
        assertEquals(1, calls.size, "короткая пачка не должна резаться на части")
        return calls.first()
    }

    /** То же, что делает мост в странице: склеивает части в исходную строку. */
    private fun joinParts(calls: List<String>): String = calls.joinToString("") { call ->
        Json.decodeFromString(
            String.serializer(),
            call.substringAfter("window.__accChunk && window.__accChunk(").substringBeforeLast(", "),
        )
    }

    /** То же, что делает страница: достаёт литерал из вызова и разбирает его обратно. */
    private fun parseArgument(call: String) =
        Json.parseToJsonElement(
            Json.decodeFromString(
                String.serializer(),
                call.substringAfter("JSON.parse(").substringBeforeLast("));"),
            ),
        ).jsonArray
}

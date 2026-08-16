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
        val call = receiveCall(listOf("""{"type":"a"}""", """{"type":"b"}"""))
        val messages = parseArgument(call)

        assertEquals(2, messages.size)
        assertEquals("a", messages[0].jsonObject["type"]?.jsonPrimitive?.content)
        assertEquals("b", messages[1].jsonObject["type"]?.jsonPrimitive?.content)
    }

    @Test
    fun `одно сообщение тоже уезжает массивом`() {
        assertEquals(1, parseArgument(receiveCall(listOf("""{"type":"a"}"""))).size)
    }

    /**
     * Ответ агента — обычный текст, в нём бывает что угодно: кавычки, переносы
     * строк, обратные слэши из кода, юникод. Ни одно из этого не должно выходить
     * за пределы литерала.
     */
    @Test
    fun `текст с кавычками и переносами не рвёт вызов`() {
        val text = """{"type":"agent","text":"он сказал \"да\"\nи закрыл \\ путь"}"""
        val messages = parseArgument(receiveCall(listOf(text)))

        assertEquals("он сказал \"да\"\nи закрыл \\ путь", messages[0].jsonObject["text"]?.jsonPrimitive?.content)
    }

    @Test
    fun `зовёт приёмник страницы и бережётся его отсутствия`() {
        val call = receiveCall(listOf("""{"type":"a"}"""))

        assertTrue(call.startsWith("window.__accReceive && window.__accReceive("))
        assertTrue(call.endsWith(");"))
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

package io.github.crmapache.amazingclaudecode.claude

import kotlinx.serialization.json.Json
import kotlinx.serialization.json.contentOrNull
import kotlinx.serialization.json.jsonArray
import kotlinx.serialization.json.jsonObject
import kotlinx.serialization.json.jsonPrimitive
import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertTrue

class ClaudeHistoryTest {

    // Голая текстовая реплика человека без вложений — Claude Code хранит её в
    // message.content строкой, а не массивом блоков. Живой поток отдаёт панели
    // только массивы, поэтому такая строка обязана превратиться в один текстовый
    // блок, иначе лента падает на .filter вызове (реальный баг: выбор такого
    // разговора из истории гасил всю панель).
    @Test
    fun `голая текстовая реплика оборачивается в текстовый блок`() {
        val line = """{"type":"user","message":{"role":"user","content":"привет"}}"""

        val normalized = Json.parseToJsonElement(ClaudeHistory.normalizeContent(line)).jsonObject
        val content = normalized["message"]!!.jsonObject["content"]!!.jsonArray

        assertEquals(1, content.size)
        assertEquals("text", content[0].jsonObject["type"]?.jsonPrimitive?.contentOrNull)
        assertEquals("привет", content[0].jsonObject["text"]?.jsonPrimitive?.contentOrNull)
    }

    // tool_result и подобные записи уже хранятся массивом блоков — трогать их не нужно.
    @Test
    fun `content уже массивом остаётся без изменений`() {
        val line = """{"type":"user","message":{"role":"user","content":[{"type":"tool_result","tool_use_id":"t1","content":"ok"}]}}"""

        assertEquals(line, ClaudeHistory.normalizeContent(line))
    }

    // Ответы ассистента API отдаёт массивом блоков всегда — тоже не трогаем.
    @Test
    fun `реплика ассистента остаётся без изменений`() {
        val line = """{"type":"assistant","message":{"role":"assistant","content":[{"type":"text","text":"привет"}]}}"""

        assertEquals(line, ClaudeHistory.normalizeContent(line))
    }

    // Строка без валидного JSON или без message.content возвращается как есть —
    // это защита от повреждённого файла истории, а не повод падать при чтении.
    @Test
    fun `битую или неполную строку возвращает без изменений`() {
        assertEquals("not json", ClaudeHistory.normalizeContent("not json"))

        val withoutContent = """{"type":"user","message":{"role":"user"}}"""
        assertEquals(withoutContent, ClaudeHistory.normalizeContent(withoutContent))
    }

    @Test
    fun `null-контент не трогаем`() {
        val line = """{"type":"user","message":{"role":"user","content":null}}"""

        assertEquals(line, ClaudeHistory.normalizeContent(line))
        assertTrue(ClaudeHistory.normalizeContent(line).contains("\"content\":null"))
    }

    // Имя папки разговоров придумываем не мы — оно обязано совпасть с тем, которое
    // делает сам Claude Code, иначе панель и терминал разговоров друг друга не
    // видят. Правило у CLI одно на все символы: не буква и не цифра — дефис.
    @Test
    fun `папка разговоров называется ровно так же, как у CLI`() {
        assertEquals(
            "-Users-max-Documents-Projects-amazing-claude-code",
            ClaudeHistory.slugFor("/Users/max/Documents/Projects/amazing-claude-code"),
        )
    }

    // Ровно те случаи, на которых история и разъезжалась: подчёркивание и пробел
    // в имени папки — и путь Windows, где двоеточие после буквы диска оставалось
    // на месте, из-за чего в панели не было видно вообще ни одного разговора.
    @Test
    fun `подчёркивание, пробел и путь Windows тоже становятся дефисами`() {
        assertEquals("-home-ivan-dev-my-project", ClaudeHistory.slugFor("/home/ivan/dev/my_project"))
        assertEquals("-home-ivan-my-app-v2", ClaudeHistory.slugFor("/home/ivan/my app.v2"))
        assertEquals("C--Users-Ivan-dev-proj", ClaudeHistory.slugFor("C:/Users/Ivan/dev/proj"))
        assertEquals("C--Users-Ivan-dev-proj", ClaudeHistory.slugFor("C:\\Users\\Ivan\\dev\\proj"))
    }
}

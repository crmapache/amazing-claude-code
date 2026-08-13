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

    // Обвязка слэш-команды пишется двумя порядками тегов: у встроенных команд
    // первым идёт имя, у скиллов и плагинов — подпись. Разбор ждал только
    // первого, и разговор, начатый скиллом, назывался в списке сырым тегом —
    // ровно то, что было видно в панели («<command-message>task</command-message>»).
    @Test
    fun `разговор, начатый скиллом, называется самой командой`() {
        val lines = sequenceOf(
            """{"type":"user","isMeta":true,"message":{"role":"user","content":"<local-command-caveat>Caveat: …</local-command-caveat>"}}""",
            """{"type":"user","message":{"role":"user","content":"<command-message>task</command-message>\n<command-name>/task</command-name>\n<command-args>починить историю</command-args>"}}""",
            """{"type":"user","isMeta":true,"message":{"role":"user","content":[{"type":"text","text":"Base directory for this skill: /Users/max/.claude/skills/task"}]}}""",
        )

        assertEquals("/task починить историю", ClaudeHistory.scan(lines).title)
    }

    // Встроенные команды CLI пишут обвязку в обратном порядке — их разбирали и
    // раньше, эта проверка держит оба порядка вместе.
    @Test
    fun `встроенная команда с именем впереди тоже узнаётся`() {
        val lines = sequenceOf(
            """{"type":"user","message":{"role":"user","content":"<command-name>/compact</command-name>\n            <command-message>compact</command-message>\n            <command-args></command-args>"}}""",
        )

        assertEquals("/compact", ClaudeHistory.scan(lines).title)
    }

    // Заголовок — то, что написал человек, а не то, чем оболочка обставила его
    // слова: тело вызванного скилла, уведомление о фоновой задаче и подпись к
    // картинке оказывались в списке вместо самой реплики.
    @Test
    fun `служебные реплики уступают заголовок настоящей`() {
        val lines = sequenceOf(
            """{"type":"user","message":{"role":"user","content":"<task-notification> <task-id>bmkth5kqm</task-id> </task-notification>"}}""",
            """{"type":"user","isMeta":true,"message":{"role":"user","content":"[Image: original 2048x1536]"}}""",
            """{"type":"user","message":{"role":"user","content":[{"type":"text","text":"Разберись, что со временем агента"}]}}""",
        )

        assertEquals("Разберись, что со временем агента", ClaudeHistory.scan(lines).title)
    }

    // Родное название от самого CLI (событие ai-title в транскрипте) читается
    // отдельным полем — entryFor предпочитает его эвристике, когда оно есть.
    @Test
    fun `ai-title читается отдельным полем скана`() {
        val lines = sequenceOf(
            """{"type":"user","message":{"role":"user","content":"Расскажи, что видишь на картинке."}}""",
            """{"type":"ai-title","aiTitle":"Описание содержимого изображения","sessionId":"abc"}""",
        )

        val scan = ClaudeHistory.scan(lines)

        assertEquals("Расскажи, что видишь на картинке.", scan.title)
        assertEquals("Описание содержимого изображения", scan.aiTitle)
    }

    // Событие повторяется по ходу файла — если тема успела смениться, держим
    // последнее увиденное значение, а не то, что CLI подобрал в самом начале.
    @Test
    fun `при нескольких ai-title остаётся последнее`() {
        val lines = sequenceOf(
            """{"type":"user","message":{"role":"user","content":"давай"}}""",
            """{"type":"ai-title","aiTitle":"Первая тема","sessionId":"abc"}""",
            """{"type":"ai-title","aiTitle":"Тема сменилась","sessionId":"abc"}""",
        )

        assertEquals("Тема сменилась", ClaudeHistory.scan(lines).aiTitle)
    }

    // Короткая первая строка не должна становиться всем заголовком — раньше
    // бралась ровно она («Давай»), хотя суть вопроса была строкой ниже.
    @Test
    fun `короткая первая строка склеивается с продолжением`() {
        val lines = sequenceOf(
            """{"type":"user","message":{"role":"user","content":"Давай\nсделаем красивый диалог с кнопками"}}""",
        )

        assertEquals("Давай сделаем красивый диалог с кнопками", ClaudeHistory.scan(lines).title)
    }

    // Композер вставляет `[Image #N]` посреди фразы, а не только отдельной
    // строкой («смотри [Image #1] сюда») — тег должен вырезаться, а не
    // утекать в заголовок целиком вместе со словами.
    @Test
    fun `inline-тег картинки посреди фразы вырезается`() {
        val lines = sequenceOf(
            """{"type":"user","message":{"role":"user","content":[{"type":"text","text":"смотри [Image #1] сюда, что не так"}]}}""",
        )

        assertEquals("смотри сюда, что не так", ClaudeHistory.scan(lines).title)
    }

    // Вывод команд bash-режима панель дописывает в начало следующей реплики
    // человека — в заголовке разговора его быть не должно: список показывал
    // сырые теги вместо вопроса, ради которого разговор и начинали.
    @Test
    fun `вывод команды bash-режима не попадает в заголовок`() {
        val lines = sequenceOf(
            """{"type":"user","message":{"role":"user","content":[{"type":"text","text":"<bash-input>git pull</bash-input>\n<bash-stdout>Already up to date.\nfrom origin/main</bash-stdout>\n\nДавай перейдём к этой задаче"}]}}""",
        )

        assertEquals("Давай перейдём к этой задаче", ClaudeHistory.scan(lines).title)
    }

    // Реплика, в которой кроме команд ничего и нет, разговор не описывает —
    // заголовок обязан достаться следующей, настоящей.
    @Test
    fun `реплика из одних команд уступает заголовок словам человека`() {
        val lines = sequenceOf(
            """{"type":"user","message":{"role":"user","content":"<bash-input>git status</bash-input>\n<bash-stdout>clean</bash-stdout>"}}""",
            """{"type":"user","message":{"role":"user","content":"поднимай песочницу"}}""",
        )

        assertEquals("поднимай песочницу", ClaudeHistory.scan(lines).title)
    }

    // Настоящая реплика человека перебивает команду, даже если команда была
    // первой: /clear в начале разговора не должен становиться его именем.
    @Test
    fun `реплика человека важнее команды, с которой начали`() {
        val lines = sequenceOf(
            """{"type":"user","message":{"role":"user","content":"<command-name>/clear</command-name>"}}""",
            """{"type":"user","message":{"role":"user","content":"поднимай песочницу"}}""",
        )

        val scan = ClaudeHistory.scan(lines)

        assertEquals("поднимай песочницу", scan.title)
        assertEquals(2, scan.messages)
    }

    // Сообщений в карточке столько, сколько человек написал, — а не сколько
    // реплик оказалось в файле. Транскрипт записывает репликами человека и
    // результат каждого вызова инструмента, и обвязку команд: счёт по ним
    // разъезжался с виденным на экране в десять раз.
    @Test
    fun `в счёт идут только сообщения человека`() {
        val lines = sequenceOf(
            """{"type":"user","message":{"role":"user","content":[{"type":"text","text":"поднимай песочницу"}]}}""",
            """{"type":"assistant","message":{"role":"assistant","content":[{"type":"text","text":"поднимаю"}]}}""",
            """{"type":"user","message":{"role":"user","content":[{"tool_use_id":"t1","type":"tool_result","content":"готово"}]}}""",
            """{"type":"user","isMeta":true,"message":{"role":"user","content":"<local-command-caveat>Caveat: …</local-command-caveat>"}}""",
            """{"type":"user","message":{"role":"user","content":"<local-command-stdout>сделано</local-command-stdout>"}}""",
            """{"type":"user","message":{"role":"user","content":"<task-notification>\n<task-id>bmkth5kqm</task-id>\n</task-notification>"}}""",
            """{"type":"user","message":{"role":"user","content":[{"type":"text","text":"спасибо"}]}}""",
        )

        assertEquals(2, ClaudeHistory.scan(lines).messages)
    }

    // Команда — тоже сказанное человеком, и разговор, который весь из неё и
    // состоит, обязан остаться в списке: иначе он пропадёт из истории целиком.
    @Test
    fun `команда считается сообщением`() {
        val lines = sequenceOf(
            """{"type":"user","isMeta":true,"message":{"role":"user","content":"<local-command-caveat>Caveat: …</local-command-caveat>"}}""",
            """{"type":"user","message":{"role":"user","content":"<command-name>/compact</command-name>"}}""",
        )

        val scan = ClaudeHistory.scan(lines)

        assertEquals(1, scan.messages)
        assertEquals("/compact", scan.title)
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

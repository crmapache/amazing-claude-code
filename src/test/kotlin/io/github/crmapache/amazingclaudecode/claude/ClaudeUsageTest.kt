package io.github.crmapache.amazingclaudecode.claude

import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertFalse
import kotlin.test.assertNull
import kotlin.test.assertTrue
import kotlinx.serialization.json.Json
import kotlinx.serialization.json.jsonObject

class ClaudeUsageTest {

    private fun parse(line: String) = ClaudeUsage.parse(Json.parseToJsonElement(line).jsonObject)

    @Test
    fun `окна расхода и размер контекста разбираются целиком`() {
        val snapshot = parse(
            """
            {"session":{"model_usage":{"claude-opus-4":{"contextWindow":200000}}},
             "rate_limits":{
               "five_hour":{"utilization":7,"resets_at":"2026-08-16T01:39:59+00:00"},
               "seven_day":{"utilization":26,"resets_at":"2026-08-20T10:59:59+00:00"}}}
            """.trimIndent(),
        )

        assertEquals(7, snapshot.session?.percent)
        assertEquals("2026-08-16T01:39:59+00:00", snapshot.session?.resets)
        assertEquals(26, snapshot.week?.percent)
        assertEquals(200000, snapshot.contextWindow)
        assertTrue(snapshot.hasLimits)
    }

    // Из-за этого ответа панель и падала: лимитов ещё нет, но поле в ответе есть —
    // с честным null внутри. Разбор обязан пережить его молча.
    @Test
    fun `ответ без лимитов не роняет разбор, а просто остаётся пустым`() {
        val snapshot = parse("""{"rate_limits":null,"rate_limits_available":false,"session":null}""")

        assertNull(snapshot.session)
        assertNull(snapshot.week)
        assertNull(snapshot.contextWindow)
        // Ровно этим панель и решает переспросить через пару секунд.
        assertFalse(snapshot.hasLimits)
    }

    // У окон подписки своя правда: недельное может приехать раньше пятичасового.
    @Test
    fun `пустое окно не мешает соседнему`() {
        val snapshot = parse("""{"rate_limits":{"five_hour":null,"seven_day":{"utilization":26}}}""")

        assertNull(snapshot.session)
        assertEquals(26, snapshot.week?.percent)
        // Про сброс CLI не сказал — пустая строка, а не выдуманное время.
        assertEquals("", snapshot.week?.resets)
        assertTrue(snapshot.hasLimits)
    }

    // Размер окна берём самый большой: разговор на «1M»-модели иначе выглядел бы
    // переполненным с первой секунды.
    @Test
    fun `из разбивки по моделям берётся самое большое окно, а ноль не в счёт`() {
        val snapshot = parse(
            """
            {"session":{"model_usage":{
              "claude-haiku":{"contextWindow":0},
              "claude-sonnet":{"contextWindow":200000},
              "claude-opus-1m":{"contextWindow":1000000}}}}
            """.trimIndent(),
        )

        assertEquals(1000000, snapshot.contextWindow)
    }

    @Test
    fun `разбивки по моделям нет — размер окна не выдумываем`() {
        assertNull(parse("""{"session":{"model_usage":{}}}""").contextWindow)
        assertNull(parse("""{"session":{}}""").contextWindow)
        assertNull(parse("""{}""").contextWindow)
    }
}

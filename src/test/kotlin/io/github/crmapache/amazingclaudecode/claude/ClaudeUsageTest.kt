package io.github.crmapache.amazingclaudecode.claude

import java.time.Instant
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

class ClaudeUsageTrackerTest {

    private val now: Instant = Instant.parse("2026-08-20T12:00:00Z")

    private fun window(percent: Int, resets: String) = ClaudeUsage.Window(percent, resets)

    private fun snapshot(session: ClaudeUsage.Window? = null, week: ClaudeUsage.Window? = null) =
        ClaudeUsage.Snapshot(session = session, week = week, contextWindow = null)

    // Тот самый косяк: панель месяцами показывала долю окна, которого уже нет.
    // Процесс, работавший до сброса, продолжает отвечать своей замершей цифрой —
    // 99% при почти пустом новом окне.
    @Test
    fun `доля из уже сброшенного окна не показывается`() {
        val tracker = ClaudeUsage.Tracker()

        val merged = tracker.merge(snapshot(session = window(99, "2026-08-20T11:30:00Z")), now)

        assertEquals(0, merged.session?.percent)
        assertEquals("", merged.session?.resets)
    }

    // Внутри окна расход только растёт: расхождение путей — это задержка одного
    // из них, а не откат. Иначе кольцо мигало бы туда-сюда каждые полминуты.
    @Test
    fun `внутри одного окна доля не уменьшается`() {
        val tracker = ClaudeUsage.Tracker()
        val future = "2026-08-20T14:00:00Z"

        tracker.merge(snapshot(session = window(20, future)), now)
        val merged = tracker.merge(snapshot(session = window(12, future)), now)

        assertEquals(20, merged.session?.percent)
    }

    // Одно и то же окно приезжает в разных форматах: живой разговор округляет до
    // секунд, сводка от сервера несёт микросекунды. Строкой это разные значения,
    // а окно — одно.
    @Test
    fun `окно узнаётся по времени сброса, а не по строке`() {
        val tracker = ClaudeUsage.Tracker()

        tracker.merge(snapshot(session = window(20, "2026-08-20T14:00:00.000Z")), now)
        val merged = tracker.merge(snapshot(session = window(12, "2026-08-20T14:00:00.464237+00:00")), now)

        assertEquals(20, merged.session?.percent)
    }

    // Новое окно — новый счёт: копилка не должна тащить в него долю прошлого.
    @Test
    fun `со сменой окна счёт начинается заново`() {
        val tracker = ClaudeUsage.Tracker()

        tracker.merge(snapshot(session = window(90, "2026-08-20T14:00:00Z")), now)
        val merged = tracker.merge(snapshot(session = window(4, "2026-08-20T19:00:00Z")), now)

        assertEquals(4, merged.session?.percent)
        assertEquals("2026-08-20T19:00:00Z", merged.session?.resets)
    }

    // Отставший путь может принести снимок прошлого окна уже после того, как
    // приехало новое: держим новое, а не откатываемся на доброе старое.
    @Test
    fun `снимок прошлого окна не перебивает нынешнее`() {
        val tracker = ClaudeUsage.Tracker()

        tracker.merge(snapshot(session = window(4, "2026-08-20T19:00:00Z")), now)
        val merged = tracker.merge(snapshot(session = window(90, "2026-08-20T13:00:00Z")), now)

        assertEquals(4, merged.session?.percent)
        assertEquals("2026-08-20T19:00:00Z", merged.session?.resets)
    }

    // Так отвечает процесс, ещё не сделавший ни одного запроса: окно не открыто,
    // и нуль в нём — правда, а не «нет данных».
    @Test
    fun `нуль без времени сброса — это честное пустое окно`() {
        val tracker = ClaudeUsage.Tracker()

        val merged = tracker.merge(snapshot(session = window(0, "")), now)

        assertEquals(0, merged.session?.percent)
    }

    // А вот долю без окна привязать не к чему — известное окно ею не перебиваем.
    @Test
    fun `доля без времени сброса не перебивает известное окно`() {
        val tracker = ClaudeUsage.Tracker()
        val future = "2026-08-20T14:00:00Z"

        tracker.merge(snapshot(session = window(20, future)), now)
        val merged = tracker.merge(snapshot(session = window(77, "")), now)

        assertEquals(20, merged.session?.percent)
        assertEquals(future, merged.session?.resets)
    }

    // Ответ без лимитов вовсе (так бывает у только что поднятого процесса) не
    // должен ни выдумывать окна, ни забывать уже известные.
    @Test
    fun `пустой ответ не выдумывает окон и не забывает известные`() {
        val tracker = ClaudeUsage.Tracker()

        assertNull(tracker.merge(snapshot(), now).session)

        tracker.merge(snapshot(session = window(20, "2026-08-20T14:00:00Z")), now)
        assertEquals(20, tracker.merge(snapshot(), now).session?.percent)
    }

    // Окна независимы: недельное живёт своей неделей, пятичасовое своими часами.
    @Test
    fun `окна считаются по отдельности`() {
        val tracker = ClaudeUsage.Tracker()

        val merged = tracker.merge(
            snapshot(
                session = window(99, "2026-08-20T11:00:00Z"),
                week = window(52, "2026-08-25T03:00:00Z"),
            ),
            now,
        )

        assertEquals(0, merged.session?.percent)
        assertEquals(52, merged.week?.percent)
    }

    // Время идёт и без новых данных: окно кончилось — доля больше не про сейчас.
    @Test
    fun `известное окно перестаёт показываться, когда время сброса проходит`() {
        val tracker = ClaudeUsage.Tracker()
        val resets = "2026-08-20T14:00:00Z"

        tracker.merge(snapshot(session = window(88, resets)), now)
        val later = tracker.merge(snapshot(session = window(88, resets)), Instant.parse("2026-08-20T14:30:00Z"))

        assertEquals(0, later.session?.percent)
        assertEquals("", later.session?.resets)
    }
}

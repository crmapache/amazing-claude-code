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
    fun `the usage windows and the context size are parsed whole`() {
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

    // This answer is what used to bring the panel down: there are no limits yet, but the field is in
    // the answer - with an honest null inside. The parsing has to survive it silently.
    @Test
    fun `an answer without limits does not break the parsing, it simply stays empty`() {
        val snapshot = parse("""{"rate_limits":null,"rate_limits_available":false,"session":null}""")

        assertNull(snapshot.session)
        assertNull(snapshot.week)
        assertNull(snapshot.contextWindow)
        // This is exactly what makes the panel ask again in a couple of seconds.
        assertFalse(snapshot.hasLimits)
    }

    @Test
    fun `the extra usage settings are read off the same answer`() {
        val snapshot = parse(
            """
            {"rate_limits":{
               "five_hour":{"utilization":100,"resets_at":"2026-08-16T01:39:59+00:00"},
               "extra_usage":{"is_enabled":true,"monthly_limit":50,"used_credits":11.5,"utilization":23}}}
            """.trimIndent(),
        )

        assertEquals(true, snapshot.extra?.enabled)
        assertEquals(23, snapshot.extra?.percent)
    }

    // An account that knows nothing of extra usage is not the same as one with it allowed and untouched:
    // the ring must not be painted for money nobody is spending.
    @Test
    fun `no extra usage block means nothing is known about it`() {
        assertNull(parse("""{"rate_limits":{"five_hour":{"utilization":7}}}""").extra)
        assertNull(parse("""{"rate_limits":{"five_hour":{"utilization":7},"extra_usage":null}}""").extra)
    }

    // The subscription windows have a truth of their own: the weekly one may arrive before the five-hour one.
    @Test
    fun `an empty window does not get in the neighbour's way`() {
        val snapshot = parse("""{"rate_limits":{"five_hour":null,"seven_day":{"utilization":26}}}""")

        assertNull(snapshot.session)
        assertEquals(26, snapshot.week?.percent)
        // The CLI said nothing about the reset - an empty string rather than an invented time.
        assertEquals("", snapshot.week?.resets)
        assertTrue(snapshot.hasLimits)
    }

    // We take the largest window size: a conversation on a "1M" model would otherwise look overflowing
    // from the first second.
    @Test
    fun `the largest window is taken from the per-model breakdown, and a zero does not count`() {
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
    fun `with no per-model breakdown we do not invent a window size`() {
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

    // The very bug this exists for: for months the panel showed the share of a window that was already
    // gone. A process that worked before the reset goes on answering with its frozen figure - 99% on an
    // almost empty new window.
    @Test
    fun `a share from an already reset window is not shown`() {
        val tracker = ClaudeUsage.Tracker()

        val merged = tracker.merge(snapshot(session = window(99, "2026-08-20T11:30:00Z")), now)

        assertEquals(0, merged.session?.percent)
        assertEquals("", merged.session?.resets)
    }

    // Within a window usage only grows: a disagreement between the routes is one of them lagging, not a
    // roll-back. Otherwise the ring would flicker back and forth every half-minute.
    @Test
    fun `within one window the share does not go down`() {
        val tracker = ClaudeUsage.Tracker()
        val future = "2026-08-20T14:00:00Z"

        tracker.merge(snapshot(session = window(20, future)), now)
        val merged = tracker.merge(snapshot(session = window(12, future)), now)

        assertEquals(20, merged.session?.percent)
    }

    // One and the same window arrives in different formats: a live conversation rounds to seconds, the
    // server's summary carries microseconds. As strings those are different values, while the window is
    // one.
    @Test
    fun `a window is recognised by its reset time rather than by its string`() {
        val tracker = ClaudeUsage.Tracker()

        tracker.merge(snapshot(session = window(20, "2026-08-20T14:00:00.000Z")), now)
        val merged = tracker.merge(snapshot(session = window(12, "2026-08-20T14:00:00.464237+00:00")), now)

        assertEquals(20, merged.session?.percent)
    }

    // A new window is a new count: the memory must not drag the previous share into it.
    @Test
    fun `with a window change the count starts afresh`() {
        val tracker = ClaudeUsage.Tracker()

        tracker.merge(snapshot(session = window(90, "2026-08-20T14:00:00Z")), now)
        val merged = tracker.merge(snapshot(session = window(4, "2026-08-20T19:00:00Z")), now)

        assertEquals(4, merged.session?.percent)
        assertEquals("2026-08-20T19:00:00Z", merged.session?.resets)
    }

    // A lagging route may bring a snapshot of the previous window after the new one has arrived: we
    // keep the new one rather than roll back to the good old one.
    @Test
    fun `a snapshot of the previous window does not override the present one`() {
        val tracker = ClaudeUsage.Tracker()

        tracker.merge(snapshot(session = window(4, "2026-08-20T19:00:00Z")), now)
        val merged = tracker.merge(snapshot(session = window(90, "2026-08-20T13:00:00Z")), now)

        assertEquals(4, merged.session?.percent)
        assertEquals("2026-08-20T19:00:00Z", merged.session?.resets)
    }

    // That is how a process that has made no requests yet answers: the window is not open, and a zero
    // in it is the truth rather than "no data".
    @Test
    fun `a zero without a reset time is an honest empty window`() {
        val tracker = ClaudeUsage.Tracker()

        val merged = tracker.merge(snapshot(session = window(0, "")), now)

        assertEquals(0, merged.session?.percent)
    }

    // A share without a window, on the other hand, has nothing to attach to - we do not override a known window with it.
    @Test
    fun `a share without a reset time does not override a known window`() {
        val tracker = ClaudeUsage.Tracker()
        val future = "2026-08-20T14:00:00Z"

        tracker.merge(snapshot(session = window(20, future)), now)
        val merged = tracker.merge(snapshot(session = window(77, "")), now)

        assertEquals(20, merged.session?.percent)
        assertEquals(future, merged.session?.resets)
    }

    // An answer with no limits at all (that happens with a freshly raised process) must neither invent
    // windows nor forget the known ones.
    @Test
    fun `an empty answer invents no windows and forgets no known ones`() {
        val tracker = ClaudeUsage.Tracker()

        assertNull(tracker.merge(snapshot(), now).session)

        tracker.merge(snapshot(session = window(20, "2026-08-20T14:00:00Z")), now)
        assertEquals(20, tracker.merge(snapshot(), now).session?.percent)
    }

    // The windows are independent: the weekly one lives by its week, the five-hour one by its hours.
    @Test
    fun `the windows are counted separately`() {
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

    // Time passes without new data too: the window has ended, and the share is no longer about now.
    @Test
    fun `a known window stops being shown once its reset time has passed`() {
        val tracker = ClaudeUsage.Tracker()
        val resets = "2026-08-20T14:00:00Z"

        tracker.merge(snapshot(session = window(88, resets)), now)
        val later = tracker.merge(snapshot(session = window(88, resets)), Instant.parse("2026-08-20T14:30:00Z"))

        assertEquals(0, later.session?.percent)
        assertEquals("", later.session?.resets)
    }
}

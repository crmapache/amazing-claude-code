package io.github.crmapache.amazingclaudecode.claude

import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertNull
import kotlin.test.assertTrue

class ClaudeRateLimitTest {

    private val now = 1_700_000_000_000L

    /** The same event the CLI sends, with only the fields a case is about spelled out. */
    private fun event(info: String) = """{"type":"rate_limit_event","rate_limit_info":{$info}}"""

    @Test
    fun `a request that got through is neither extra usage nor a stop`() {
        val verdict = ClaudeRateLimit.of(event(""""status":"allowed""""), now)

        assertEquals(false, verdict?.extraUsage)
        assertEquals(false, verdict?.stopped)
    }

    @Test
    fun `a refusal with nothing to soften it is a stop`() {
        val verdict = ClaudeRateLimit.of(event(""""status":"rejected","resetsAt":1700000060"""), now)

        assertEquals(false, verdict?.extraUsage)
        assertTrue(verdict?.stopped == true)
    }

    // The case the whole distinction came from: the limit is used up, the work carries on for money, and
    // the panel used to call that a stop - a red slab and a phone buzzing over work that never paused.
    @Test
    fun `a refusal being paid for is extra usage rather than a stop`() {
        val paid = ClaudeRateLimit.of(event(""""status":"rejected","isUsingOverage":true"""), now)

        assertTrue(paid?.extraUsage == true)
        assertEquals(false, paid?.stopped)

        // The older CLI carries the same fact under the other name.
        val older = ClaudeRateLimit.of(event(""""status":"rejected","overageInUse":true"""), now)

        assertTrue(older?.extraUsage == true)
        assertEquals(false, older?.stopped)
    }

    @Test
    fun `the grace period is not a stop either - the step under way is allowed to finish`() {
        val verdict = ClaudeRateLimit.of(event(""""status":"rejected","rateLimitGraceActive":true"""), now)

        assertEquals(false, verdict?.stopped)
    }

    // A signal whose window has already reset describes a window that no longer exists. The CLI throws
    // such a one away; a panel that does not would announce a limit that has been over for an hour.
    @Test
    fun `a signal about a window that has already reset says nothing`() {
        val verdict = ClaudeRateLimit.of(event(""""status":"rejected","resetsAt":1699999000"""), now)

        assertEquals(false, verdict?.stopped)
    }

    @Test
    fun `lines that are not limit events are passed over rather than guessed at`() {
        assertNull(ClaudeRateLimit.of("""{"type":"assistant","message":{"content":[]}}""", now))
        assertNull(ClaudeRateLimit.of("""{"type":"rate_limit_event"}""", now))
        // Broken JSON must not throw: this runs on the same thread as a conversation's events.
        assertNull(ClaudeRateLimit.of("""{"type":"rate_limit_event","rate_limit_info":{""", now))
    }
}

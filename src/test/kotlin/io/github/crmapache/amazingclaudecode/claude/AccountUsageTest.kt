package io.github.crmapache.amazingclaudecode.claude

import java.time.Duration
import java.time.Instant
import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertFalse
import kotlin.test.assertNull
import kotlin.test.assertTrue
import kotlinx.serialization.json.Json
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.booleanOrNull
import kotlinx.serialization.json.contentOrNull
import kotlinx.serialization.json.int
import kotlinx.serialization.json.jsonObject
import kotlinx.serialization.json.jsonPrimitive

/**
 * One account's usage, one picture for the whole IDE.
 *
 * What breaks here breaks quietly: a panel whose rings stopped moving looks exactly like a panel on an
 * idle account, and that is how one froze on 5% for forty minutes while the account went to 49%.
 */
class AccountUsageTest {

    private val announcements = ExtraUsageAnnouncements()

    private val published = mutableListOf<JsonObject>()

    private val usage = AccountUsage(
        publish = { published += Json.parseToJsonElement(it).jsonObject },
        announcements = { announcements },
    )

    /** The five-hour window running now - the reset is in the future, or the memory drops the share. */
    private val resets = Instant.now().plus(Duration.ofHours(3)).toString()

    private fun session(percent: Int, resets: String = this.resets, extra: ClaudeUsage.Extra? = null) =
        ClaudeUsage.Snapshot(
            session = ClaudeUsage.Window(percent, resets),
            week = null,
            contextWindow = null,
            extra = extra,
        )

    private fun limitEvent(extraUsage: Boolean, window: String = "five_hour") =
        ClaudeRateLimit.Verdict(extraUsage = extraUsage, stopped = false, window = window, resetsAt = null)

    private val JsonObject.sessionPercent: Int?
        get() = (this["session"] as? JsonObject)?.get("percent")?.jsonPrimitive?.int

    private val JsonObject.extra: JsonObject? get() = this["extra"] as? JsonObject

    @Test
    fun `an answer is published as the account's picture`() {
        usage.fold("work", session(41))

        val picture = published.single()
        assertEquals("usage", picture["type"]?.jsonPrimitive?.contentOrNull)
        assertEquals("work", picture["account"]?.jsonPrimitive?.contentOrNull)
        assertEquals(41, picture.sessionPercent)
    }

    /**
     * The failure itself. The project allowed to ask learned 56%; another one, answered out of a cache
     * the CLI keeps for up to an hour, heard 5% about the same window. With a memory per project each
     * showed its own - and the one stuck on the cache showed it for as long as it kept losing the right
     * to ask. With one memory the lagging answer is what it is: behind.
     */
    @Test
    fun `a lagging answer from another project does not take the rings back`() {
        usage.fold("", session(56))
        usage.fold("", session(5, resets = Instant.parse(resets).plusMillis(240).toString()))

        assertEquals(56, published.last().sessionPercent)
    }

    @Test
    fun `accounts keep their own pictures`() {
        usage.fold("work", session(56))
        usage.fold("home", session(3))

        assertEquals(3, published.last().sessionPercent)
        assertEquals("home", published.last()["account"]?.jsonPrimitive?.contentOrNull)
    }

    @Test
    fun `a panel that opens is handed what the IDE already knows`() {
        usage.fold("work", session(41))

        val handed = usage.pictures().map { Json.parseToJsonElement(it).jsonObject }

        assertEquals(41, handed.single().sessionPercent)
        assertEquals("work", handed.single()["account"]?.jsonPrimitive?.contentOrNull)
    }

    // One project's stream says money is being spent; another project's answer to get_usage brings the
    // month's budget. Kept apart, the second one's picture carried "not spending" and put out the ring the
    // first one had lit.
    @Test
    fun `extra usage is one picture, whichever project brought which half`() {
        usage.fold("work", session(100, extra = ClaudeUsage.Extra(enabled = true, percent = 30)))
        usage.noteRateLimit("work", limitEvent(extraUsage = true))
        usage.fold("work", session(100, extra = ClaudeUsage.Extra(enabled = true, percent = 31)))

        val extra = published.last().extra
        assertEquals(true, extra?.get("active")?.jsonPrimitive?.booleanOrNull)
        assertEquals("five_hour", extra?.get("window")?.jsonPrimitive?.contentOrNull)
        assertEquals(31, extra?.get("percent")?.jsonPrimitive?.int)
    }

    @Test
    fun `the first limit event after a launch is a reading, a later switch on is a crossing`() {
        assertFalse(usage.noteRateLimit("work", limitEvent(extraUsage = true)))
        assertFalse(usage.noteRateLimit("work", limitEvent(extraUsage = false)))
        assertTrue(usage.noteRateLimit("work", limitEvent(extraUsage = true)))
    }

    // The CLI repeats the event on every turn while the state holds; a phone across the city is on the
    // other end of every message.
    @Test
    fun `a limit event that changes nothing is not said again`() {
        usage.noteRateLimit("work", limitEvent(extraUsage = true))
        val said = published.size

        assertFalse(usage.noteRateLimit("work", limitEvent(extraUsage = true)))
        assertEquals(said, published.size)
    }

    /**
     * Every open project notices one switch for itself, one after another. Each throwing the figures away
     * again blanked every panel's rings over the answer the first one had already brought.
     */
    @Test
    fun `one switch noticed by every project throws the figures away once`() {
        usage.fold("", session(56))

        assertTrue(usage.forget("", identity = "b@example.com"))
        assertEquals(true, published.last()["reset"]?.jsonPrimitive?.booleanOrNull)

        usage.fold("", session(3))
        val said = published.size

        assertFalse(usage.forget("", identity = "b@example.com"))
        assertEquals(said, published.size)
        assertEquals(3, Json.parseToJsonElement(usage.pictures().single()).jsonObject.sessionPercent)

        // Switching back is a switch.
        assertTrue(usage.forget("", identity = "a@example.com"))
    }

    // An account removed, signed out of or merged into another names nobody: its figures always go.
    @Test
    fun `a forget without an identity always throws the figures away`() {
        usage.fold("work", session(41))

        assertTrue(usage.forget("work"))
        assertTrue(usage.forget("work"))
        assertTrue(usage.pictures().isEmpty())
    }

    @Test
    fun `a forgotten account keeps no extra usage either`() {
        usage.noteRateLimit("work", limitEvent(extraUsage = true))
        usage.forget("work")
        usage.fold("work", session(4))

        assertNull(published.last().extra)
    }
}

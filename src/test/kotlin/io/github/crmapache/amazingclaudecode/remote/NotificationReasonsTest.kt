package io.github.crmapache.amazingclaudecode.remote

import io.github.crmapache.amazingclaudecode.claude.SessionSnapshot
import io.github.crmapache.amazingclaudecode.claude.IdeLanguage
import io.github.crmapache.amazingclaudecode.sound.AlertSounds
import java.io.File
import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertNull
import kotlin.test.assertTrue

/**
 * The same occasions the panel already calls a person about, recognised on this side without a feed to
 * read them from - all but one, which is not a message but a change of state (see EXTRA_USAGE).
 *
 * The order of importance now lives in three places - this file, the panel's sounds.ts, and the sound
 * files in AlertSounds - and all three are checked against each other here. Drifting apart would break
 * nothing visibly; it would only mean that on a day when a turn ends with an error, the phone says the
 * wrong one of the two.
 */
class NotificationReasonsTest {

    private val quiet = SessionSnapshot()

    private fun waiting(permissions: Int = 0, asks: Int = 0, plans: Int = 0) = SessionSnapshot(
        pendingPermissions = (1..permissions).map { "perm-$it" }.toSet(),
        pendingAsks = (1..asks).map { "ask-$it" }.toSet(),
        pendingPlans = (1..plans).map { "plan-$it" }.toSet(),
    )

    @Test
    fun `a new permission is worth a notification`() {
        assertEquals(
            "permission",
            NotificationReasons.of("""{"type":"permission","id":"p1"}""", quiet, waiting(permissions = 1)),
        )
    }

    @Test
    fun `so is a question and a plan`() {
        assertEquals("question", NotificationReasons.of("""{"type":"agent"}""", quiet, waiting(asks = 1)))
        assertEquals("plan", NotificationReasons.of("""{"type":"agent"}""", quiet, waiting(plans = 1)))
    }

    /** A permission that was already waiting is not news - only the moment it started to wait is. */
    @Test
    fun `a permission that was already there is not announced again`() {
        assertNull(NotificationReasons.of("""{"type":"agent"}""", waiting(permissions = 1), waiting(permissions = 1)))
    }

    @Test
    fun `a dead process is trouble`() {
        assertEquals("trouble", NotificationReasons.of("""{"type":"processExited","exitCode":1}""", quiet, quiet))
    }

    // A limit event, and only the kind that means everything has stopped. The same event arrives while a
    // used-up window is being paid for, and that is an occasion of its own rather than this one: it is
    // announced from where the previous state is remembered, because the event repeats on every turn
    // while it holds (see ProjectUsage.noteRateLimit).
    @Test
    fun `a limit that stopped the work calls, one that is being paid for is announced elsewhere`() {
        val stopped =
            """{"type":"agent","sessionId":"main","event":{"type":"rate_limit_event","rate_limit_info":{"status":"rejected","resetsAt":4102444800}}}"""
        assertEquals("rateLimit", NotificationReasons.of(stopped, quiet, quiet))

        val paid =
            """{"type":"agent","sessionId":"main","event":{"type":"rate_limit_event","rate_limit_info":{"status":"rejected","isUsingOverage":true}}}"""
        assertNull(NotificationReasons.of(paid, quiet, quiet))
    }

    @Test
    fun `an ordinary error is trouble and a limit is a limit`() {
        assertEquals("trouble", NotificationReasons.of("""{"type":"error","message":"broke"}""", quiet, quiet))
        assertEquals(
            "rateLimit",
            NotificationReasons.of("""{"type":"error","message":"usage limit reached"}""", quiet, quiet),
        )
    }

    @Test
    fun `the end of a turn is announced`() {
        assertEquals(
            "turnFinished",
            NotificationReasons.of("""{"type":"agent","event":{"type":"result"}}""", quiet, quiet),
        )
    }

    /** Calling someone back to a turn they stopped themselves a moment ago serves nothing. */
    @Test
    fun `a turn the person stopped is not announced`() {
        assertNull(
            NotificationReasons.of(
                """{"type":"agent","event":{"type":"result","result":"Stopped by you"}}""",
                quiet,
                quiet,
            ),
        )
    }

    @Test
    fun `ordinary feed content is not worth waking anybody for`() {
        assertNull(
            NotificationReasons.of(
                """{"type":"agent","event":{"type":"assistant","message":{"content":[]}}}""",
                quiet,
                quiet,
            ),
        )
    }

    /** Two occasions in one moment: the more important speaks, and the other stays quiet. */
    @Test
    fun `the louder of two occasions wins`() {
        assertEquals("trouble", NotificationReasons.louder("turnFinished", "trouble"))
        assertEquals("permission", NotificationReasons.louder("permission", "plan"))
        assertEquals("plan", NotificationReasons.louder(null, "plan"))
        assertNull(NotificationReasons.louder(null, null))
    }

    /**
     * The order lives in three places now. This checks it against the sounds the shell plays, which is
     * the copy that has been documented as a mirror the longest.
     */
    @Test
    fun `the order of importance matches the sounds`() {
        assertEquals(AlertSounds.ids.size, NotificationReasons.PRIORITY.size)
        assertEquals(AlertSounds.ids.toSet(), NotificationReasons.PRIORITY.toSet())
    }

    /** And against the panel's own list, which is where a new occasion would be added first. */
    @Test
    fun `the occasions match the panel's`() {
        val sounds = File("webview/src/sounds.ts")
        assertTrue(sounds.exists(), "sounds.ts not found at ${sounds.absolutePath}")

        val declared = Regex("""const PRIORITY: SoundId\[] = \[([^]]+)]""")
            .find(sounds.readText())
            ?.groupValues
            ?.get(1)
            ?.split(',')
            ?.map { it.trim().trim('\'') }
            ?.filter { it.isNotEmpty() }

        assertEquals(NotificationReasons.PRIORITY, declared)
    }

    /**
     * A phone that buzzes at every finished turn is a phone with notifications switched off by the end
     * of the week - including the ones that mattered.
     */
    @Test
    fun `the end of a turn is off by default`() {
        assertTrue("turnFinished" !in NotificationReasons.DEFAULT_ON)
        assertTrue("permission" in NotificationReasons.DEFAULT_ON)
    }

    /** Money starting to go out is the kind of thing one wants to hear about away from the desk. */
    @Test
    fun `extra usage beginning is on by default`() {
        assertTrue(NotificationReasons.EXTRA_USAGE in NotificationReasons.DEFAULT_ON)
    }

    /**
     * The language is named rather than left to be looked up: the three-argument call reads a
     * machine-wide setting, which asks the platform for a service that a plain unit test has none of.
     * That one line used to take the whole test down with it, so the mapping checked here - a reason to
     * the sentence a lock screen shows - was not in fact being checked at all.
     */
    @Test
    fun `what a notification says names the thing rather than the event`() {
        assertEquals(
            "Permission: src/auth.ts",
            NotificationReasons.title("permission", "demo", "src/auth.ts", IdeLanguage.DEFAULT),
        )
        assertEquals("Something broke in demo", NotificationReasons.title("trouble", "demo", "", IdeLanguage.DEFAULT))
        assertEquals(
            "The plan is used up - the work is now billed",
            NotificationReasons.title(NotificationReasons.EXTRA_USAGE, "demo", "", IdeLanguage.DEFAULT),
        )
    }

    /** And that it does speak the setting's language rather than always the English one. */
    @Test
    fun `a notification is written in the language the panel speaks`() {
        assertEquals("План готов - ждёт вас", NotificationReasons.title("plan", "demo", "", "ru"))
    }
}

package io.github.crmapache.amazingclaudecode.claude.accounts

import io.github.crmapache.amazingclaudecode.claude.ClaudeAuth
import io.github.crmapache.amazingclaudecode.claude.accounts.ClaudeAccounts.Health
import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertFalse
import kotlin.test.assertNull
import kotlin.test.assertTrue

/**
 * Whose answer the accounts screen believes about a drawer, when several askers put the question.
 *
 * The failures this holds shut are quiet: a card saying "No stored credential" over an account that has
 * just been signed in, and the CLI's own sign-in standing on the screen after "Log out" - each because an
 * answer that set out before the change came home after it.
 */
class LatestAnswerTest {

    private val signedIn = ClaudeAuth.Status(installed = true, loggedIn = true, email = "me@example.com")
    private val signedOut = ClaudeAuth.Status(installed = true, loggedIn = false)

    @Test
    fun `an answer to a newer question replaces the older one`() {
        val drawer = LatestAnswer<Health>()

        drawer.record(Health.ABSENT, askedAt = 1_000)
        drawer.record(Health.PRESENT, askedAt = 2_000)

        assertEquals(Health.PRESENT, drawer.current)
    }

    @Test
    fun `an answer to an older question arriving late does not undo a sign-in`() {
        val drawer = LatestAnswer<Health>()

        // The sign-in round saw the credential land...
        drawer.record(Health.PRESENT, askedAt = 2_000)
        // ...and the screen's own round, begun before the sign-in, only now comes back.
        val changed = drawer.record(Health.ABSENT, askedAt = 1_500)

        assertEquals(Health.PRESENT, drawer.current)
        assertFalse(changed)
    }

    @Test
    fun `a sign-in answer asked before the logout does not bring the row back`() {
        val default = LatestAnswer<ClaudeAuth.Status>()

        default.record(signedIn, askedAt = 1_000)
        // The logout has answered...
        default.record(signedOut, askedAt = 3_000)
        // ...and a sign-in round that asked a moment before it comes home afterwards.
        default.record(signedIn, askedAt = 2_500)

        assertEquals(signedOut, default.current)
    }

    @Test
    fun `a sign-in after the logout is believed`() {
        val default = LatestAnswer<ClaudeAuth.Status>()

        default.record(signedOut, askedAt = 3_000)
        default.record(signedIn, askedAt = 4_000)

        assertEquals(signedIn, default.current)
        assertEquals(4_000, default.askedAt)
    }

    @Test
    fun `the row is redrawn only when what it holds changes`() {
        val drawer = LatestAnswer<Health>()

        assertTrue(drawer.record(Health.ABSENT, askedAt = 1_000))
        assertFalse(drawer.record(Health.ABSENT, askedAt = 2_000))
        assertTrue(drawer.record(Health.PRESENT, askedAt = 3_000))
    }

    @Test
    fun `nothing asked yet has neither an answer nor an age`() {
        val drawer = LatestAnswer<Health>()

        assertNull(drawer.current)
        assertNull(drawer.askedAt)
    }

    @Test
    fun `the sign-in round and the screen read one answer the same way`() {
        assertEquals(Health.PRESENT, Health.of(signedIn))
        assertEquals(Health.ABSENT, Health.of(signedOut))
        assertEquals(Health.UNKNOWN, Health.of(ClaudeAuth.Status(installed = false, loggedIn = false)))
    }
}

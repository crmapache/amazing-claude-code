package io.github.crmapache.amazingclaudecode.claude

import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertFalse
import kotlin.test.assertTrue

/**
 * Two rules that keep one account's percentages off another account's row: how often the server may be
 * asked, and what a borrowed answer looks like when it arrives anyway.
 *
 * Both break silently - a wrong percentage looks exactly like a right one - so they are held here
 * rather than by care while reading the diff.
 */
class UsageProbesTest {

    private val hour = 60 * 60 * 1000L

    private fun week(percent: Int, resets: String) =
        ClaudeUsage.Snapshot(session = null, week = ClaudeUsage.Window(percent, resets), contextWindow = null)

    @Test
    fun `an account is asked once and then told how long is left`() {
        val probes = UsageProbes()
        val now = 1_700_000_000_000L

        assertEquals(0, probes.claim("work", 15_000, now))
        assertEquals(15_000 - 4_000, probes.claim("work", 15_000, now + 4_000))
        assertEquals(0, probes.claim("work", 15_000, now + 15_000))
    }

    // The pace is per account because the server counts per account: one account being asked must not
    // stop the row below it from getting a figure at all.
    @Test
    fun `the pace is one account's own`() {
        val probes = UsageProbes()
        val now = 1_700_000_000_000L

        assertEquals(0, probes.claim("work", 15_000, now))
        assertEquals(0, probes.claim("home", 15_000, now))
    }

    // Every caller names its own floor - a question into a running process is cheap, one that raises a
    // process is not - and they share one register, because the server does.
    @Test
    fun `the floor is the caller's, the register is shared`() {
        val probes = UsageProbes()
        val now = 1_700_000_000_000L

        assertEquals(0, probes.claim("work", 15_000, now))
        assertEquals(60_000 - 20_000, probes.claim("work", 60_000, now + 20_000))
    }

    /**
     * The failure this whole file exists for: an account that could not reach the endpoint answers out of
     * the machine's shared cache, so its "own" figures are another account's, to the second.
     */
    @Test
    fun `an answer repeating another account's window is not trusted`() {
        val probes = UsageProbes()
        val now = 1_700_000_000_000L

        assertTrue(probes.trust("work", week(62, "2026-09-08T03:00:00.133527+00:00"), true, now))
        assertFalse(probes.trust("home", week(62, "2026-09-08T03:00:00.400023+00:00"), true, now + 2_000))
    }

    /**
     * The other half of the same rule, and the reason it has a flag at all.
     *
     * A ping is asked with a configuration directory of its own, so the only cache behind it is that
     * account's - it cannot answer with anybody else's figures whatever it says. The comparison, on the
     * other hand, is coarse: whole percentages and reset times matched to within minutes. Applied to a
     * ping it refused two seats of one organisation that had genuinely opened their week together and
     * were both barely used - and a refused answer is a dash where a true figure belongs.
     */
    @Test
    fun `two accounts of one organisation both get their figures`() {
        val probes = UsageProbes()
        val now = 1_700_000_000_000L

        assertTrue(probes.trust("work", week(0, "2026-09-08T03:00:00.133527+00:00"), false, now))
        assertTrue(probes.trust("home", week(0, "2026-09-08T03:00:00.400023+00:00"), false, now + 2_000))
    }

    // The same account answering twice about the same window is the ordinary case - polling - and must
    // not read as a copy of itself.
    @Test
    fun `an account repeating its own window is trusted`() {
        val probes = UsageProbes()
        val now = 1_700_000_000_000L

        assertTrue(probes.trust("work", week(62, "2026-09-08T03:00:00.133527+00:00"), true, now))
        assertTrue(probes.trust("work", week(63, "2026-09-08T03:00:00.400023+00:00"), true, now + 30_000))
    }

    /**
     * A refusal costs the suspect its turn and nothing else.
     *
     * The account it looked like a copy of keeps its record and its figures: the retry that follows goes
     * past the conversations to a ping of its own, which has nothing to borrow, so one refusal settles
     * the question - and making the account that answered honestly first prove itself again only meant
     * two empty rows instead of one.
     */
    @Test
    fun `the twin keeps its own answer`() {
        val probes = UsageProbes()
        val now = 1_700_000_000_000L

        assertTrue(probes.trust("work", week(62, "2026-09-08T03:00:00.133527+00:00"), true, now))
        assertFalse(probes.trust("home", week(62, "2026-09-08T03:00:00.400023+00:00"), true, now + 2_000))
        // And the retry, which goes by a route that cannot borrow, is believed.
        assertTrue(probes.trust("home", week(62, "2026-09-08T03:00:00.900000+00:00"), false, now + 20_000))
    }

    // Same window, different share: two accounts whose weeks happen to line up still say different
    // things, and a copy never does.
    @Test
    fun `a different share in the same window is somebody's own`() {
        val probes = UsageProbes()
        val now = 1_700_000_000_000L

        assertTrue(probes.trust("work", week(62, "2026-09-08T03:00:00+00:00"), true, now))
        assertTrue(probes.trust("home", week(12, "2026-09-08T03:00:00+00:00"), true, now + 2_000))
    }

    // The CLI serves its cached figures for an hour; past that a matching window is a coincidence, not
    // a substitution, and refusing it would leave a row empty for no reason.
    @Test
    fun `a window seen longer ago than the cache lives is no longer a reason to suspect`() {
        val probes = UsageProbes()
        val now = 1_700_000_000_000L

        assertTrue(probes.trust("work", week(62, "2026-09-08T03:00:00+00:00"), true, now))
        assertTrue(probes.trust("home", week(62, "2026-09-08T03:00:00+00:00"), true, now + hour + 1_000))
    }

    // An account that has not opened its week yet answers with no window at all. There is nothing to
    // compare, and refusing it would hide the honest "nothing spent yet".
    @Test
    fun `an answer without a weekly window is taken as it comes`() {
        val probes = UsageProbes()
        val now = 1_700_000_000_000L

        assertTrue(probes.trust("work", week(62, "2026-09-08T03:00:00+00:00"), true, now))
        assertTrue(
            probes.trust(
                "home",
                ClaudeUsage.Snapshot(session = null, week = ClaudeUsage.Window(0, ""), contextWindow = null),
                true,
                now + 2_000,
            ),
        )
    }

    // Signing out of an account leaves its window behind, and the next account to answer with a window
    // of its own would look like a copy of a subscription this machine no longer reaches.
    @Test
    fun `a forgotten account stops being a twin`() {
        val probes = UsageProbes()
        val now = 1_700_000_000_000L

        assertTrue(probes.trust("work", week(62, "2026-09-08T03:00:00+00:00"), true, now))
        probes.forget("work")
        assertTrue(probes.trust("home", week(62, "2026-09-08T03:00:00+00:00"), true, now + 2_000))
    }
}

package io.github.crmapache.amazingclaudecode.claude.accounts

import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertFalse
import kotlin.test.assertNull
import kotlin.test.assertTrue

/**
 * When two rows on the accounts screen are one account, and - far more important - when they only look
 * like it.
 *
 * Both mistakes are expensive and neither announces itself. Missed, one subscription stands on the
 * screen twice with two sets of figures that silence each other. Imagined, an account is deleted off
 * this machine because of a name left in a file by whoever used to be in some other drawer - and on
 * macOS the credential goes out of the keychain with it.
 */
class AccountTwinTest {

    private val asked = 1_000L

    private fun who(email: String, org: String = "org-1") = AccountIdentity.Who(email, org, "")

    private fun probe(email: String, org: String = "org-1", at: Long = asked + 1) =
        AccountIdentity.Probed(who(email, org), at)

    private fun drawer(
        id: String,
        email: String,
        org: String = "org-1",
        at: Long = asked + 1,
        live: Boolean = true,
    ) = AccountTwin.Drawer(id, probe(email, org, at), live)

    private fun idOf(email: String, org: String = "org-1") = AccountStore.idOf(email, org)

    // --- The duplicate itself --------------------------------------------------------

    @Test
    fun `an added drawer holding the account the CLI's own holds is the duplicate`() {
        val twin = AccountTwin.duplicate(
            default = drawer("", "me@example.com"),
            added = listOf(drawer("added-1", "me@example.com"), drawer("added-2", "work@example.com")),
            answeredAfter = asked,
        )

        assertEquals("added-1", twin)
    }

    @Test
    fun `two accounts that merely share an address in different organisations are two accounts`() {
        val twin = AccountTwin.duplicate(
            default = drawer("", "me@example.com", org = "personal"),
            added = listOf(drawer("added-1", "me@example.com", org = "the-company")),
            answeredAfter = asked,
        )

        assertNull(twin)
    }

    // --- What may not be acted on ----------------------------------------------------

    /** A drawer's file keeps whoever was last in it, so an answer older than the question is not one. */
    @Test
    fun `an answer written before the question was asked is not an answer`() {
        val twin = AccountTwin.duplicate(
            default = drawer("", "me@example.com", at = asked - 1),
            added = listOf(drawer("added-1", "me@example.com")),
            answeredAfter = asked,
        )

        assertNull(twin)
    }

    @Test
    fun `a stale answer on the added side is not an answer either`() {
        val twin = AccountTwin.duplicate(
            default = drawer("", "me@example.com"),
            added = listOf(drawer("added-1", "me@example.com", at = asked - 1)),
            answeredAfter = asked,
        )

        assertNull(twin)
    }

    /** Nothing has been asked yet on a freshly started IDE, and every file on disk predates that. */
    @Test
    fun `nothing asked yet merges nothing`() {
        val twin = AccountTwin.duplicate(
            default = drawer("", "me@example.com", at = 5),
            added = listOf(drawer("added-1", "me@example.com", at = 5)),
            answeredAfter = 0,
        )

        assertNull(twin)
    }

    /**
     * A question asked of an empty drawer still rewrites that drawer's file while leaving the previous
     * occupant's name in it: fresh file, stale name. Without the liveness this is the pair that would
     * merge two strangers.
     */
    @Test
    fun `a drawer that is not signed in says nothing about who is in it`() {
        val default = drawer("", "me@example.com")
        val added = drawer("added-1", "me@example.com")

        assertNull(AccountTwin.duplicate(default.copy(live = false), listOf(added), asked))
        assertNull(AccountTwin.duplicate(default, listOf(added.copy(live = false)), asked))
    }

    @Test
    fun `a drawer nobody has ever asked about holds nobody`() {
        val twin = AccountTwin.duplicate(
            default = AccountTwin.Drawer("", probe = null, live = true),
            added = listOf(drawer("added-1", "me@example.com")),
            answeredAfter = asked,
        )

        assertNull(twin)
    }

    @Test
    fun `an answer that named nobody is not a match for another that named nobody`() {
        val blank = AccountIdentity.Probed(AccountIdentity.Who("", "", ""), asked + 1)

        val twin = AccountTwin.duplicate(
            default = AccountTwin.Drawer("", blank, live = true),
            added = listOf(AccountTwin.Drawer("added-1", blank, live = true)),
            answeredAfter = asked,
        )

        assertNull(twin)
    }

    // --- A move within one account ---------------------------------------------------

    /**
     * What a merge leaves a running tab: the row it was on is gone and the choice is the CLI's own
     * sign-in, holding the very same account. The move asks this before stopping the turn, and the turn
     * used to be stopped - "Stopped to switch account" under work nobody had touched.
     */
    @Test
    fun `an added row and the sign-in holding its account are one account in both directions`() {
        val me = idOf("me@example.com")
        val default = probe("me@example.com")

        assertTrue(AccountTwin.sameAccount(me, "", default, asked))
        assertTrue(AccountTwin.sameAccount("", me, default, asked))
    }

    /** Between two subscriptions the turn is still stopped - that is what pressing Select says. */
    @Test
    fun `a sign-in holding somebody else is another account`() {
        assertFalse(AccountTwin.sameAccount(idOf("me@example.com"), "", probe("work@example.com"), asked))
    }

    /** Same address, another organisation: another seat, another bill. */
    @Test
    fun `the same address in another organisation is another account`() {
        val default = probe("me@example.com", org = "the-company")

        assertFalse(AccountTwin.sameAccount(idOf("me@example.com", org = "personal"), "", default, asked))
    }

    /**
     * An added row's id is its account, so two of them are two accounts - whatever the sign-in's answer
     * says, and even when it names one of them.
     */
    @Test
    fun `two added rows are two accounts`() {
        val default = probe("me@example.com")

        assertFalse(AccountTwin.sameAccount(idOf("me@example.com"), idOf("work@example.com"), default, asked))
    }

    @Test
    fun `a row is the account it is`() {
        assertTrue(AccountTwin.sameAccount("", "", defaultProbe = null, answeredAfter = asked))
        assertTrue(AccountTwin.sameAccount("added-1", "added-1", defaultProbe = null, answeredAfter = asked))
    }

    /** A name left in the file from before the window is not somebody the sign-in holds now. */
    @Test
    fun `a stale or missing answer keeps the rows apart`() {
        val me = idOf("me@example.com")

        assertFalse(AccountTwin.sameAccount(me, "", probe("me@example.com", at = asked - 1), asked))
        assertFalse(AccountTwin.sameAccount(me, "", defaultProbe = null, answeredAfter = asked))
    }

    // --- The sign-in's half ----------------------------------------------------------

    /** What a landing sign-in compares its own account against, before a record is written. */
    @Test
    fun `the name in a fresh answer is the account that drawer holds`() {
        assertEquals(idOf("me@example.com"), AccountTwin.named(probe("me@example.com"), asked))
        assertNull(AccountTwin.named(probe("me@example.com", at = asked - 1), asked))
        assertNull(AccountTwin.named(null, asked))
    }
}

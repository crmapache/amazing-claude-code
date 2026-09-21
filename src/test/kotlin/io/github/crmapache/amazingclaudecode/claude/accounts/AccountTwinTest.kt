package io.github.crmapache.amazingclaudecode.claude.accounts

import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertNull

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

    // --- The sign-in's half ----------------------------------------------------------

    /** What a landing sign-in compares its own account against, before a record is written. */
    @Test
    fun `the name in a fresh answer is the account that drawer holds`() {
        assertEquals(idOf("me@example.com"), AccountTwin.named(probe("me@example.com"), asked))
        assertNull(AccountTwin.named(probe("me@example.com", at = asked - 1), asked))
        assertNull(AccountTwin.named(null, asked))
    }
}

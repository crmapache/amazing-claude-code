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
        filedAs: String = keyOf(email, org),
        addedAt: Long = 0L,
    ) = AccountTwin.Drawer(id, probe(email, org, at), live, filedAs, addedAt)

    private fun keyOf(email: String, org: String = "org-1") = AccountStore.keyOf(email, org)

    // --- The duplicate itself --------------------------------------------------------

    @Test
    fun `an added drawer holding the account the CLI's own holds is the duplicate`() {
        val twin = AccountTwin.duplicate(
            default = drawer("", "me@example.com"),
            added = listOf(drawer("added-1", "me@example.com"), drawer("added-2", "work@example.com")),
            answeredAfter = asked,
        )

        assertEquals(AccountTwin.Twin(extra = "added-1", keeper = ""), twin)
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

    // --- Two added rows ----------------------------------------------------------------

    /**
     * What re-filing a mislabelled row can leave behind: it now says the account another added row is
     * already filed under. The row in use stays, so nothing has to move.
     */
    @Test
    fun `two added drawers on one account keep the one in use`() {
        val twin = AccountTwin.duplicate(
            default = drawer("", "home@example.com"),
            added = listOf(
                drawer("old", "work@example.com", addedAt = 1),
                drawer("new", "work@example.com", addedAt = 2),
            ),
            answeredAfter = asked,
            inUse = "old",
        )

        assertEquals(AccountTwin.Twin(extra = "new", keeper = "old"), twin)
    }

    /** Neither in use: the newer stays - the fresher of two credentials that both work. */
    @Test
    fun `two added drawers on one account keep the newer when neither is in use`() {
        val twin = AccountTwin.duplicate(
            default = drawer("", "home@example.com"),
            added = listOf(
                drawer("old", "work@example.com", addedAt = 1),
                drawer("new", "work@example.com", addedAt = 2),
            ),
            answeredAfter = asked,
        )

        assertEquals(AccountTwin.Twin(extra = "old", keeper = "new"), twin)
    }

    /** The same evidence as against the CLI's own sign-in: fresh and live, or the rows stay apart. */
    @Test
    fun `two added drawers merge only on fresh answers from live drawers`() {
        val default = AccountTwin.Drawer("", probe = null, live = true)

        assertNull(
            AccountTwin.duplicate(
                default,
                listOf(drawer("old", "work@example.com", at = asked - 1), drawer("new", "work@example.com")),
                asked,
            ),
        )
        assertNull(
            AccountTwin.duplicate(
                default,
                listOf(drawer("old", "work@example.com", live = false), drawer("new", "work@example.com")),
                asked,
            ),
        )
    }

    // --- A row filed under the wrong account --------------------------------------------

    /**
     * The case that lost an account: a drawer filed under one address holds another. The drawer is the
     * truth, so the record is what is corrected.
     */
    @Test
    fun `a drawer holding somebody other than its label is filed again as who it holds`() {
        val wrong = AccountTwin.mislabelled(
            added = listOf(
                drawer("row-1", "proton@example.com", filedAs = keyOf("work@example.com")),
                drawer("row-2", "home@example.com"),
            ),
            answeredAfter = asked,
        )

        assertEquals(listOf("row-1" to who("proton@example.com")), wrong)
    }

    /** A profile fetched before the question is the drawer's previous occupant as often as not. */
    @Test
    fun `a stale or dead answer files nothing again`() {
        val filedAs = keyOf("work@example.com")

        assertEquals(
            emptyList(),
            AccountTwin.mislabelled(listOf(drawer("row-1", "proton@example.com", at = asked - 1, filedAs = filedAs)), asked),
        )
        assertEquals(
            emptyList(),
            AccountTwin.mislabelled(listOf(drawer("row-1", "proton@example.com", live = false, filedAs = filedAs)), asked),
        )
        assertEquals(
            emptyList(),
            AccountTwin.mislabelled(listOf(drawer("row-1", "proton@example.com", filedAs = filedAs)), answeredAfter = 0),
        )
    }

    /** Same address, another organisation: another account, so the label is wrong. */
    @Test
    fun `the same address in another organisation is filed again too`() {
        val wrong = AccountTwin.mislabelled(
            listOf(drawer("row-1", "me@example.com", org = "the-company", filedAs = keyOf("me@example.com", "personal"))),
            asked,
        )

        assertEquals(listOf("row-1" to who("me@example.com", "the-company")), wrong)
    }

    // --- A move within one account ---------------------------------------------------

    /**
     * What a merge leaves a running tab: the row it was on is gone and the choice is the row that stays,
     * holding the very same account. The move asks this before stopping the turn, and the turn used to be
     * stopped - "Stopped to switch account" under work nobody had touched.
     */
    @Test
    fun `two rows holding one account are one account`() {
        assertTrue(AccountTwin.sameAccount(keyOf("me@example.com"), keyOf("me@example.com")))
    }

    /** Between two subscriptions the turn is still stopped - that is what pressing Select says. */
    @Test
    fun `two accounts are two accounts`() {
        assertFalse(AccountTwin.sameAccount(keyOf("me@example.com"), keyOf("work@example.com")))
        assertFalse(AccountTwin.sameAccount(keyOf("me@example.com", "personal"), keyOf("me@example.com", "work")))
    }

    /** Not knowing whose a row is - a stale answer from the CLI's own sign-in - keeps the rows apart. */
    @Test
    fun `an unknown account is nobody's twin`() {
        assertFalse(AccountTwin.sameAccount(null, keyOf("me@example.com")))
        assertFalse(AccountTwin.sameAccount(keyOf("me@example.com"), null))
        assertFalse(AccountTwin.sameAccount(null, null))
    }

    /** What the CLI's own sign-in contributes to that question: its answer, if it is fresh. */
    @Test
    fun `the name in a fresh answer is the account that drawer holds`() {
        assertEquals(keyOf("me@example.com"), AccountTwin.named(probe("me@example.com"), asked))
        assertNull(AccountTwin.named(probe("me@example.com", at = asked - 1), asked))
        assertNull(AccountTwin.named(null, asked))
    }

    // --- Before a repeated sign-in deletes a drawer ----------------------------------------

    /**
     * The rule that would have kept the account: the drawer a repeated sign-in replaces is deleted only
     * when it holds that very account, or nothing at all.
     */
    @Test
    fun `a drawer is replaced only when it holds the same account or nobody`() {
        val work = keyOf("work@example.com")

        assertEquals(ClaudeAccounts.Holds.Same, ClaudeAccounts.Holds.of(true, who("work@example.com"), work))
        assertEquals(ClaudeAccounts.Holds.Nobody, ClaudeAccounts.Holds.of(false, null, work))
        assertEquals(
            ClaudeAccounts.Holds.Another(who("proton@example.com")),
            ClaudeAccounts.Holds.of(true, who("proton@example.com"), work),
        )
    }

    /** Signed in but would not say whose: kept. "It would not say" is not "it is empty". */
    @Test
    fun `a drawer that will not say whose it is is never taken for empty`() {
        val work = keyOf("work@example.com")

        assertEquals(ClaudeAccounts.Holds.Unknown, ClaudeAccounts.Holds.of(true, null, work))
        assertEquals(ClaudeAccounts.Holds.Unknown, ClaudeAccounts.Holds.of(true, AccountIdentity.Who("", "", ""), work))
    }
}

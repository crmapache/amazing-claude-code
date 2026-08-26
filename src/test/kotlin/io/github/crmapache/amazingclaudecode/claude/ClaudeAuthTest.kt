package io.github.crmapache.amazingclaudecode.claude

import kotlin.test.Test
import kotlin.test.assertFalse
import kotlin.test.assertTrue

/**
 * Telling one account from another. Everything the panel counts about a subscription belongs to the
 * account it was asked about (see ProjectUsage.forget), and this is the whole of the decision to throw
 * it away.
 */
class ClaudeAuthTest {

    private fun signedIn(email: String, orgId: String = "org-1", method: String = "claude.ai") =
        ClaudeAuth.Status(installed = true, loggedIn = true, email = email, orgId = orgId, method = method)

    private val signedOut = ClaudeAuth.Status(installed = true, loggedIn = false)

    @Test
    fun `a different account is a switch`() {
        val known = signedIn("first@example.com").identity

        assertTrue(ClaudeAuth.switchedAccount(known, signedIn("second@example.com", orgId = "org-2")))
    }

    // One address stands behind both a personal account and a workspace that invited it: the email alone
    // would call these one and the same.
    @Test
    fun `the same email in another organization is a switch too`() {
        val known = signedIn("one@example.com", orgId = "org-1").identity

        assertTrue(ClaudeAuth.switchedAccount(known, signedIn("one@example.com", orgId = "org-2")))
    }

    @Test
    fun `the same account is not`() {
        val known = signedIn("one@example.com").identity

        assertFalse(ClaudeAuth.switchedAccount(known, signedIn("one@example.com")))
    }

    // The first answer of all: there is nothing to compare it with, and the figures on the rings were
    // asked of this very account.
    @Test
    fun `the first answer changes nothing`() {
        assertFalse(ClaudeAuth.switchedAccount("", signedIn("one@example.com")))
    }

    /**
     * Asking the CLI means starting a process, and one that did not answer in time comes back as "not
     * signed in". Read as a switch, every such hiccup would wipe the figures and send the panel for
     * fresh ones; the account behind the miss has not gone anywhere.
     */
    @Test
    fun `an answer naming nobody is not read as a switch`() {
        val known = signedIn("one@example.com").identity

        assertFalse(ClaudeAuth.switchedAccount(known, signedOut))
        assertFalse(ClaudeAuth.switchedAccount(known, ClaudeAuth.Status(installed = false, loggedIn = false)))
    }

    // A sign-out and back in as somebody else is the case this exists for: the miss in between says
    // nothing, the answer after it says everything.
    @Test
    fun `a sign-out followed by another account is still a switch`() {
        val known = signedIn("one@example.com").identity

        assertFalse(ClaudeAuth.switchedAccount(known, signedOut))
        assertTrue(ClaudeAuth.switchedAccount(known, signedIn("two@example.com", orgId = "org-2")))
    }

    @Test
    fun `a signed-out status names nobody at all`() {
        assertTrue(signedOut.identity.isEmpty())
        assertFalse(signedIn("one@example.com").identity.isEmpty())
    }
}

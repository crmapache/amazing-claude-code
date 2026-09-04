package io.github.crmapache.amazingclaudecode.claude.accounts

import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertNotNull
import kotlin.test.assertNull
import kotlin.test.assertTrue

/**
 * The arithmetic behind switching accounts.
 *
 * Every mistake this file guards against is silent: a turn that starts, answers normally, and is billed
 * to somebody else's subscription. There is nothing on screen to notice, which is exactly why the rules
 * are held by a test rather than by care.
 */
class AccountStoreTest {

    private val base = mapOf("PATH" to "/usr/bin", "HOME" to "/Users/someone")

    private fun ready(storeDir: String?): Map<String, String> {
        val answer = AccountStore.environmentFor(base, storeDir)
        assertTrue(answer is AccountStore.Environment.Ready, "expected a usable environment, got $answer")
        return answer.variables
    }

    private fun refusal(storeDir: String): String {
        val answer = AccountStore.environmentFor(base, storeDir)
        assertTrue(answer is AccountStore.Environment.Refused, "expected a refusal, got $answer")
        return answer.reason
    }

    private fun probe(storeDir: String?, configDir: String): Map<String, String> {
        val answer = AccountStore.usageProbeEnvironment(base, storeDir, configDir)
        assertTrue(answer is AccountStore.Environment.Ready, "expected a usable environment, got $answer")
        return answer.variables
    }

    // --- Asking one account about its usage --------------------------------------

    /**
     * The usage question gets a config directory of its own, and that is what makes its answer this
     * account's. Sharing the CLI's own directory, a process that cannot reach the endpoint answers out
     * of a usage cache the whole machine shares - measured live: three drawers of three different
     * subscriptions reporting one and the same weekly percentage, and nothing on screen to say so.
     */
    @Test
    fun `a usage question carries the drawer and a config directory of its own`() {
        val environment = probe("/Users/someone/drawers/s-1", "/Users/someone/usage/a1")

        assertEquals("/Users/someone/drawers/s-1", environment[AccountStore.STORE_VARIABLE])
        assertEquals("/Users/someone/usage/a1", environment[AccountStore.CONFIG_VARIABLE])
        // The rest of the rules still hold: what outranks a drawer is emptied here as well.
        AccountStore.OUTRANKING_VARIABLES.forEach { assertEquals("", environment[it]) }
    }

    /**
     * The one place an empty drawer is right, and it needs saying because everywhere else it is the
     * feature's worst failure. With a config directory of our own, leaving the variable out sends the
     * CLI looking for the credential inside that directory, where there is none; empty means the drawer
     * it has always used, which is exactly whose figures this row wants.
     */
    @Test
    fun `the default sign-in is asked with an empty drawer, not with none`() {
        val environment = probe(null, "/Users/someone/usage/default")

        assertEquals("", environment[AccountStore.STORE_VARIABLE])
        assertEquals("/Users/someone/usage/default", environment[AccountStore.CONFIG_VARIABLE])
    }

    // A relative config directory would be resolved against the conversation's working directory - the
    // person's repository - exactly as a relative drawer would.
    @Test
    fun `a config directory that is not absolute is refused`() {
        val answer = AccountStore.usageProbeEnvironment(base, null, "usage")

        assertTrue(answer is AccountStore.Environment.Refused, "expected a refusal, got $answer")
    }

    // --- The default account: the machine that never touches this feature ---------

    @Test
    fun `the default account adds no drawer at all`() {
        val environment = ready(null)

        assertNull(environment[AccountStore.STORE_VARIABLE])
        // And nothing is neutralised either: a person with an API key in their profile goes on using it
        // exactly as they did before this feature existed.
        AccountStore.OUTRANKING_VARIABLES.forEach { assertNull(environment[it]) }
    }

    // --- The refusals, which are the whole point ----------------------------------

    /**
     * The dangerous one. The CLI reads an empty value as "the default drawer", so a blank store
     * directory does not mean "no isolation" - it means the person's own account. A record that lost its
     * folder to a truncated settings file would otherwise run every turn on whoever is really signed in.
     */
    @Test
    fun `a blank drawer is refused rather than treated as no isolation`() {
        assertEquals("blank store directory", refusal(""))
        assertEquals("blank store directory", refusal("   "))
    }

    /**
     * A relative path is resolved by the CLI against the process's own directory, so it would put the
     * credential inside whatever repository the conversation happens to be about - and on the platforms
     * where the CLI falls back to a file, that is a plaintext refresh token in somebody's git checkout.
     */
    @Test
    fun `a relative drawer is refused`() {
        assertEquals("relative store directory", refusal("accounts/s-abc"))
        assertEquals("relative store directory", refusal("s-abc"))
    }

    @Test
    fun `an absolute drawer is accepted and travels in the environment`() {
        val environment = ready("/tmp/acc/s-abcdef")

        assertEquals("/tmp/acc/s-abcdef", environment[AccountStore.STORE_VARIABLE])
        // The rest of the environment is untouched - this is a login shell's, and the CLI needs it.
        assertEquals("/usr/bin", environment["PATH"])
    }

    // --- What must not outrank the drawer -----------------------------------------

    /**
     * Emptied rather than dropped, and that distinction is the bug it prevents: the platform builds a
     * child's environment as "the parent's, then ours on top", and the parent's is the very map we were
     * handed. A key merely left out of our copy comes straight back.
     */
    @Test
    fun `what outranks a drawer is emptied, not left out`() {
        val withKeys = base + mapOf(
            "ANTHROPIC_API_KEY" to "sk-ant-something",
            "ANTHROPIC_AUTH_TOKEN" to "a-token",
            "CLAUDE_CODE_OAUTH_TOKEN" to "sk-ant-oat01-something",
        )

        val answer = AccountStore.environmentFor(withKeys, "/tmp/acc/s-abcdef")
        assertTrue(answer is AccountStore.Environment.Ready)

        AccountStore.OUTRANKING_VARIABLES.forEach { name ->
            assertTrue(answer.variables.containsKey(name), "$name has to be present so it can override the parent's")
            assertEquals("", answer.variables[name], "$name has to read as absent to the CLI")
        }
    }

    @Test
    fun `the map handed in is never mutated`() {
        val original = HashMap(base)
        AccountStore.environmentFor(original, "/tmp/acc/s-abcdef")

        assertEquals(base, original)
    }

    // --- Naming a drawer, and the keychain item behind it --------------------------

    @Test
    fun `a drawer name gives nothing about the account away`() {
        val first = AccountStore.newStoreDirName()
        val second = AccountStore.newStoreDirName()

        assertTrue(first.startsWith("s-"))
        assertTrue(first != second, "two drawers must not collide")
        assertTrue(first.drop(2).all { it.isDigit() || it in 'a'..'f' }, "opaque hex, nothing readable")
    }

    @Test
    fun `the keychain name is the CLI's own formula, and never the shared default`() {
        val name = AccountStore.serviceNameFor("/tmp/acc/s-abcdef")

        assertNotNull(name)
        assertTrue(name.startsWith("Claude Code-credentials-"))
        // Eight hex characters of a digest over the literal path - which is why a drawer is never renamed.
        assertEquals(8, name.removePrefix("Claude Code-credentials-").length)

        // A drawer we would refuse has no keychain item worth deleting, and guessing one risks deleting
        // the shared item that holds the person's own ordinary sign-in.
        assertNull(AccountStore.serviceNameFor(""))
        assertNull(AccountStore.serviceNameFor("relative"))
    }

    @Test
    fun `the same drawer always names the same keychain item`() {
        assertEquals(
            AccountStore.serviceNameFor("/tmp/acc/s-abcdef"),
            AccountStore.serviceNameFor("/tmp/acc/s-abcdef"),
        )
        assertTrue(AccountStore.serviceNameFor("/tmp/acc/s-abcdef") != AccountStore.serviceNameFor("/tmp/acc/s-abcdff"))
    }

    // --- Who an account is ----------------------------------------------------------

    /**
     * The organisation is part of the identity and not padding: one address can hold a personal
     * subscription and a seat in somebody's team at the same time, with different limits and different
     * rules, and the panel has to run a conversation on one without the other's figures beside it.
     */
    @Test
    fun `one address in two organisations is two accounts`() {
        val personal = AccountStore.idOf("someone@example.com", "")
        val atWork = AccountStore.idOf("someone@example.com", "org-uuid-1")

        assertTrue(personal != atWork)
        assertEquals(personal, AccountStore.idOf("someone@example.com", ""))
        assertEquals(16, personal.length)
    }
}

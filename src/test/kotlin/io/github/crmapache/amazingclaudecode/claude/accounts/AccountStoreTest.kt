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

    private val userHome = "/Users/someone"

    private fun probe(
        storeDir: String?,
        configDir: String,
        base: Map<String, String> = this.base,
    ): Map<String, String> {
        val answer = AccountStore.usageProbeEnvironment(base, storeDir, configDir, userHome)
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
        val answer = AccountStore.usageProbeEnvironment(base, null, "usage", userHome)

        assertTrue(answer is AccountStore.Environment.Refused, "expected a refusal, got $answer")
    }

    // --- The person's plugins, lent to a question that has a config directory of its own ---

    /**
     * A config directory of its own is a machine without plugins to the CLI, which then clones every
     * marketplace its settings declare - on every question, because the process is gone a second later
     * with the clone unfinished. One person lost 321 GB to it. The person's own plugins folder, lent as a
     * seed, is registered as it is and nothing is cloned.
     */
    @Test
    fun `a usage question is lent the person's own plugins`() {
        val environment = probe(null, "/Users/someone/usage/default")

        assertEquals("/Users/someone/.claude/plugins", environment[AccountStore.PLUGIN_SEED_VARIABLE])
    }

    // Their CLI is the one their environment names, and the question's own config directory - which
    // replaces that variable for the process - must not be mistaken for it.
    @Test
    fun `the person's moved CLI is the one whose plugins are lent`() {
        val moved = base + (AccountStore.CONFIG_VARIABLE to "/Volumes/work/claude")
        val environment = probe("/Users/someone/drawers/s-1", "/Users/someone/usage/a1", moved)

        assertEquals("/Volumes/work/claude/plugins", environment[AccountStore.PLUGIN_SEED_VARIABLE])
        assertEquals("/Users/someone/usage/a1", environment[AccountStore.CONFIG_VARIABLE])
    }

    // The first seed to have a marketplace wins, so seeds of their own stay first - the order their own
    // CLI reads them in.
    @Test
    fun `seeds the person set themselves stay first`() {
        val seeded = base + (AccountStore.PLUGIN_SEED_VARIABLE to "/opt/seed-a:/opt/seed-b")

        assertEquals(
            "/opt/seed-a:/opt/seed-b:/Users/someone/.claude/plugins",
            AccountStore.pluginSeed(seeded, userHome, separator = ":"),
        )
    }

    // The CLI splits the list by the platform's own separator - a semicolon on Windows, where a colon is
    // part of every path.
    @Test
    fun `seeds are split and joined by the platform's separator`() {
        val seeded = base + (AccountStore.PLUGIN_SEED_VARIABLE to "/opt/seed-a;/opt/seed-b")

        assertEquals(
            "/opt/seed-a;/opt/seed-b;/Users/someone/.claude/plugins",
            AccountStore.pluginSeed(seeded, userHome, separator = ";"),
        )
    }

    // A relative CLAUDE_CONFIG_DIR would be resolved against the working directory; guessing at it could
    // lend a folder inside the person's repository. Their own seeds still travel.
    @Test
    fun `a moved CLI that is not absolute lends nothing of its own`() {
        val relative = mapOf(AccountStore.CONFIG_VARIABLE to "claude-home")

        assertNull(AccountStore.pluginSeed(relative, userHome, separator = ":"))
        assertEquals(
            "/opt/seed",
            AccountStore.pluginSeed(relative + (AccountStore.PLUGIN_SEED_VARIABLE to "/opt/seed"), userHome, ":"),
        )
    }

    // A conversation runs in the person's own config directory, where the plugins already are: lending
    // them there would only make them read-only.
    @Test
    fun `an ordinary run is lent nothing`() {
        assertNull(ready(null)[AccountStore.PLUGIN_SEED_VARIABLE])
        assertNull(ready("/Users/someone/drawers/s-1")[AccountStore.PLUGIN_SEED_VARIABLE])
    }

    // --- A run that needs nobody's sign-in --------------------------------------

    private val noSignIn = "/Users/someone/.amazing-claude-code/no-sign-in"

    /**
     * The panel's own listings of plugins ran under the ordinary sign-in, once a minute in every open
     * project, and a short process that refreshes a credential can leave the drawer holding a retired
     * one: the ordinary sign-in was wiped nearly every day. Pointed at a drawer nobody signs into, the
     * run has nothing to refresh - and what outranks a drawer is emptied here too, or a key in the
     * person's environment would hand the run a credential through the other door.
     */
    @Test
    fun `a run that needs no sign-in is pointed at a drawer nobody signs into`() {
        val answer = AccountStore.signInFreeEnvironment(base, noSignIn, remote = false)

        assertTrue(answer is AccountStore.Environment.Ready, "expected a usable environment, got $answer")
        assertEquals(noSignIn, answer.variables[AccountStore.STORE_VARIABLE])
        AccountStore.OUTRANKING_VARIABLES.forEach { assertEquals("", answer.variables[it]) }
    }

    // An empty drawer is not "no sign-in", it is the person's real one - the very credential this exists
    // to keep such runs away from.
    @Test
    fun `a run that needs no sign-in is never handed the ordinary one instead`() {
        val answer = AccountStore.signInFreeEnvironment(base, "", remote = false)

        assertTrue(answer is AccountStore.Environment.Refused, "expected a refusal, got $answer")
    }

    // Inside WSL a path from here is one relative segment, resolved against the person's repository, so
    // nothing is named and the run goes on as it always ran.
    @Test
    fun `inside WSL a run that needs no sign-in keeps the environment it had`() {
        val answer = AccountStore.signInFreeEnvironment(base, noSignIn, remote = true)

        assertTrue(answer is AccountStore.Environment.Ready, "expected a usable environment, got $answer")
        assertNull(answer.variables[AccountStore.STORE_VARIABLE])
        assertEquals(base["PATH"], answer.variables["PATH"])
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
        val personal = AccountStore.keyOf("someone@example.com", "")
        val atWork = AccountStore.keyOf("someone@example.com", "org-uuid-1")

        assertTrue(personal != atWork)
        assertEquals(personal, AccountStore.keyOf("someone@example.com", ""))
        assertEquals(16, personal.length)
    }

    /**
     * A record's id says nothing about who is in it. When it did, a sign-in labelled with the wrong
     * address was filed AS the wrong account, and the next genuine sign-in of that account read as a
     * repeated one and deleted the drawer of whoever was really in it.
     */
    @Test
    fun `a record's id is random and never the account's key`() {
        val ids = (1..50).map { AccountStore.newAccountId() }.toSet()

        assertEquals(50, ids.size)
        assertTrue(ids.all { it.matches(Regex("^[0-9a-f]{16}$")) })
        // Not a drawer's name and not a draft's either - those are told apart by their prefixes.
        assertTrue(ids.none { it.startsWith("s-") || it.startsWith(ClaudeAccounts.PENDING_PREFIX) })
    }
}

package io.github.crmapache.amazingclaudecode.claude.accounts

import io.github.crmapache.amazingclaudecode.claude.HostOs
import java.io.File
import java.security.MessageDigest
import java.security.SecureRandom
import java.text.Normalizer

/**
 * Several Claude accounts on one machine, and the one variable that keeps them apart.
 *
 * The obvious way to do this is `CLAUDE_CONFIG_DIR`: point each account at a folder of its own and the
 * CLI files their credentials separately by itself. It also files everything ELSE separately - the
 * skills, the hooks, the MCP servers, the settings, the personal commands, `projects/` with every
 * transcript in it, and with them the history, the search index and the statistics. Switching account
 * that way is switching to a stranger's machine. Verified rather than assumed: under that variable
 * `auth status` reports a different `projectsDirectory`.
 *
 * `CLAUDE_SECURESTORAGE_CONFIG_DIR` moves the credential and nothing else. Under it `auth status`
 * answers `loggedIn:false` - it looked in a drawer we named and found nothing - while
 * `projectsDirectory` stays `~/.claude/projects`. So the folder stays one, and what travels is which
 * drawer a process opens. It is per process, which is the whole prize: two conversations on two
 * accounts run at the same time, because nothing global is switched.
 *
 * The plugin therefore stores no credential of its own. There is no vault, no token scraped off a
 * terminal, nothing sealed and nothing for the panel to leak: each account is an ordinary
 * `claude auth login` that the CLI itself files, refreshes and reads, in whatever way it does that on
 * this platform. What the plugin keeps is a label and the name of a drawer.
 *
 * Two things about that variable are worth knowing before touching this file:
 *
 *  - **It is undocumented.** It is not in `claude --help`; it was found by reading the shipped binary
 *    and confirmed live. Anthropic may rename it. That is why nothing here trusts it: [ClaudeAccounts]
 *    proves on this machine that it moves the credential and does NOT move the folder, and refuses the
 *    whole feature when it cannot prove both halves.
 *  - **An empty value is not "no isolation", it is the person's real account.** The CLI reads the
 *    variable as "set to empty means the default drawer", so a blank value silently runs the turn on
 *    whoever owns the ordinary sign-in. That is the one outcome this feature must never produce, and
 *    it is why [environmentFor] refuses a blank or relative path instead of quietly dropping it.
 *
 * Everything here is arithmetic over maps and strings, with no platform behind it, so
 * `AccountStoreTest` can hold it without an IDE - which matters because every mistake in it is silent:
 * a turn that runs, answers, and is billed to the wrong subscription.
 */
internal object AccountStore {

    /** The CLI's own name for "which credential drawer to open". See the file header. */
    const val STORE_VARIABLE = "CLAUDE_SECURESTORAGE_CONFIG_DIR"

    /**
     * What must not reach a process running as a named account.
     *
     * All three outrank the drawer in the CLI's own resolution order, so any one of them left standing
     * means the account we chose is ignored and the turn runs - and is billed - as somebody else.
     * Measured, not assumed: with a token set, `auth status` answers `authMethod: oauth_token` and a
     * real turn fails `401 OAuth access token is invalid`; with `ANTHROPIC_API_KEY` set, `claude -p`
     * produced no output at all and had to be killed. A hang is worse than a refusal, because a hang
     * looks like the panel is thinking.
     */
    val OUTRANKING_VARIABLES = listOf("ANTHROPIC_API_KEY", "ANTHROPIC_AUTH_TOKEN", "CLAUDE_CODE_OAUTH_TOKEN")

    /**
     * What a launch may do with the account it was given.
     *
     * Two answers rather than a map and a silent fallback, because the fallback is the bug: a named
     * account whose drawer cannot be resolved must stop the launch, not run it on the default
     * credential. The reference implementation degrades silently here and tells nobody.
     */
    sealed interface Environment {

        /** Hand these variables to the process. */
        data class Ready(val variables: Map<String, String>) : Environment

        /** Start nothing. [reason] is a shape for the diagnostics buffer, never shown to a person. */
        data class Refused(val reason: String) : Environment
    }

    /**
     * The environment for a process that belongs to [storeDir], over the environment it would otherwise
     * have had.
     *
     * `null` means the default account - the one the CLI has always had - and then this adds nothing at
     * all beyond the `USER` fill below. That is what keeps a machine that never touches this feature
     * byte-identical to how it ran before.
     */
    fun environmentFor(base: Map<String, String>, storeDir: String?): Environment {
        val filled = withUserName(base)

        if (storeDir == null) return Environment.Ready(filled)

        refusalFor(storeDir)?.let { return Environment.Refused(it) }

        val variables = filled.toMutableMap()

        // Set to empty rather than removed, and this is not a style choice. GeneralCommandLine builds the
        // child's environment as "the parent's, then ours on top" (ParentEnvironmentType.CONSOLE, which is
        // its default), and the parent's IS the map we were handed. A key we merely leave out of our copy
        // therefore comes straight back from the parent. An empty value survives the merge and reads as
        // absent on the CLI's side, which tests all three for truthiness.
        OUTRANKING_VARIABLES.forEach { name ->
            // Windows environments are case-insensitive while a Kotlin map is not, so a variable stored
            // as `Anthropic_Api_Key` would survive beside our `ANTHROPIC_API_KEY=""` and the two would
            // race - whichever the platform's case-insensitive map happened to apply last would win. The
            // plugin already knows this hazard: see ClaudeLookup's PATH / Path / path lookup.
            if (HostOs.isWindows) variables.keys.removeIf { it.equals(name, ignoreCase = true) }
            variables[name] = ""
        }

        variables[STORE_VARIABLE] = storeDir

        return Environment.Ready(variables)
    }

    /**
     * The environment for a one-off question about an account's usage: the same drawer, and a config
     * directory of its own.
     *
     * The second half is what makes the answer trustworthy. Claude Code caches the usage figures it last
     * fetched in `~/.claude.json`, stamped with the account named by that same shared file - so the cache
     * reads as "mine" to a process of ANY account, and whenever a fetch does not come back the CLI
     * answers out of it without saying so. Measured on this machine: with the shared file in place, three
     * drawers belonging to three different subscriptions answered with one and the same weekly figure.
     * With a config directory of its own there is nothing to borrow, so the answer is either this
     * account's or an honest blank.
     *
     * Only for asking. A conversation must never run this way: the config directory also carries
     * `projects/` with every transcript, the settings, the skills and the hooks (see the file header),
     * and a turn taken there would be taken on a stranger's machine. This process asks one question and
     * dies.
     *
     * The empty drawer for the default sign-in is deliberate and is the one case where an empty value is
     * right: with a config directory of our own, "not set" would send the CLI looking for the credential
     * inside that directory, where there is none. Empty means the drawer the CLI has always used - which
     * is precisely whose figures this row wants. Wrong, it costs nothing worse than a blank: the process
     * answers "not signed in" and no figure is drawn.
     */
    fun usageProbeEnvironment(base: Map<String, String>, storeDir: String?, configDir: String): Environment {
        refusalFor(configDir)?.let { return Environment.Refused("probe config directory: $it") }

        val resolved = environmentFor(base, storeDir)
        if (resolved !is Environment.Ready) return resolved

        val variables = resolved.variables.toMutableMap()
        variables[CONFIG_VARIABLE] = configDir
        if (storeDir == null) variables[STORE_VARIABLE] = ""

        return Environment.Ready(variables)
    }

    /** The CLI's own name for "where everything else lives" - see [usageProbeEnvironment]. */
    const val CONFIG_VARIABLE = "CLAUDE_CONFIG_DIR"

    /**
     * Why this drawer may not be used, or null when it may.
     *
     * Blank is the dangerous one and the reason this function exists - see the file header. A relative
     * path is the other: the CLI resolves it against the process's working directory, so
     * `CLAUDE_SECURESTORAGE_CONFIG_DIR=some-name` writes the credential into a folder inside whatever
     * repository the conversation happens to be about. On the platforms where the CLI falls back to a
     * file that is a plaintext refresh token inside the person's git checkout.
     */
    fun refusalFor(storeDir: String): String? = when {
        storeDir.isBlank() -> "blank store directory"
        storeDir.contains('\u0000') -> "store directory contains a null character"
        !File(storeDir).isAbsolute -> "relative store directory"
        else -> null
    }

    /**
     * A drawer's name: opaque, random, and never derived from who the account is.
     *
     * Never renamed either, once minted, and that is a load-bearing rule rather than tidiness. On macOS
     * the CLI files the credential in the login keychain under a service name containing a hash of this
     * literal string, so renaming the folder orphans a live credential: the account is signed out, and
     * what signed it out is left behind in the keychain with nothing pointing at it.
     */
    fun newStoreDirName(): String {
        val bytes = ByteArray(STORE_NAME_BYTES)
        SecureRandom().nextBytes(bytes)

        return "s-" + bytes.joinToString("") { "%02x".format(it) }
    }

    /**
     * The keychain service name the CLI would have used for this drawer, on macOS.
     *
     * Used for exactly one thing - deleting an item we caused to exist, when an account is forgotten -
     * and best-effort even then. It is reconstructed rather than asked for, because the CLI has no
     * command that says it, and the reconstruction is knowingly incomplete: the real name carries a
     * build-configured infix that is empty for the ordinary endpoint but not for a staging or custom
     * one. So a failed delete is never reported as a failed forget.
     *
     * Null when the hash suffix would be empty. That case is the shared default item - the person's own
     * ordinary sign-in - and deleting it would sign them out of the account this feature exists to
     * leave alone.
     */
    fun serviceNameFor(storeDir: String): String? {
        if (refusalFor(storeDir) != null) return null

        val normalised = Normalizer.normalize(storeDir, Normalizer.Form.NFC)
        val suffix = sha256Hex(normalised).take(SERVICE_HASH_LENGTH)

        return if (suffix.isEmpty()) null else "Claude Code-credentials-$suffix"
    }

    /**
     * A stable id for an account, from what identifies it to Anthropic rather than from a counter.
     *
     * The organisation is part of it, and that is not padding: one address can hold a personal
     * subscription and a seat in somebody's team at the same time, with different limits and different
     * rules, and the panel has to be able to run a conversation on one without the other's figures
     * appearing beside it.
     */
    fun idOf(email: String, organisationUuid: String): String =
        sha256Hex("$email|$organisationUuid").take(ID_LENGTH)

    /**
     * The login name, filled in only when the environment does not already carry one, and only on macOS.
     *
     * The CLI reads `USER` in exactly one place - the account argument it passes to the `security`
     * command - so off macOS this buys nothing and there is no reason to touch every launch's
     * environment for it. On macOS it matters and its symptom is a liar: without `USER`,
     * `auth status --json` answers `loggedIn:false` on a perfectly signed-in machine, and the panel
     * draws the sign-in screen over a live account.
     *
     * Never overridden when present. A person who set it meant it.
     */
    fun withUserName(base: Map<String, String>): Map<String, String> {
        if (!HostOs.isMac) return base
        if (base["USER"].orEmpty().isNotBlank()) return base

        val name = System.getProperty("user.name").orEmpty()

        return base + ("USER" to if (name.matches(SAFE_USER_NAME)) name else FALLBACK_USER_NAME)
    }

    private fun sha256Hex(text: String): String =
        MessageDigest.getInstance("SHA-256")
            .digest(text.toByteArray(Charsets.UTF_8))
            .joinToString("") { "%02x".format(it) }

    /** The CLI's own rule for a usable login name, and its own fallback when it does not hold. */
    private val SAFE_USER_NAME = Regex("^[A-Za-z0-9._-]+$")
    private const val FALLBACK_USER_NAME = "claude-code-user"

    private const val STORE_NAME_BYTES = 8
    private const val SERVICE_HASH_LENGTH = 8
    private const val ID_LENGTH = 16
}

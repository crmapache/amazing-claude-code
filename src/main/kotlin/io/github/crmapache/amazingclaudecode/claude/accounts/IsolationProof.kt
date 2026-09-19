package io.github.crmapache.amazingclaudecode.claude.accounts

import io.github.crmapache.amazingclaudecode.claude.ClaudeAuth
import io.github.crmapache.amazingclaudecode.claude.accounts.ClaudeAccounts.Capability

/**
 * What the isolation probe's answers prove, apart from the processes that give them (see
 * ClaudeAccounts.capability).
 *
 * The answers cost processes; the verdict is arithmetic, and it breaks silently in both directions. Too
 * strict, and a machine that has plainly proven the mechanism is refused the Add button - which is how
 * this was found: "sign in to Claude Code first" beside two working accounts. Too lenient, and a second
 * sign-in lands in the drawer the account in use lives in and overwrites it. So it lives here, where
 * `IsolationProofTest` holds it without an IDE.
 */
internal object IsolationProof {

    /**
     * [plain] is the CLI asked with no drawer at all. [reference] is a sign-in known to be live - the
     * CLI's own when [plain] is signed in, otherwise a drawer added here that answers signed in - or null
     * when there is neither. [isolated] asks a drawer known to be empty; it is a lambda because it starts
     * a process the first two answers can make pointless, and it answers null when that drawer could not
     * even be named.
     */
    fun verdict(
        plain: ClaudeAuth.Status,
        reference: ClaudeAuth.Status?,
        isolated: () -> ClaudeAuth.Status?,
    ): Capability {
        // Nothing live anywhere: no answer can tell a drawer that was chosen from one that was ignored,
        // because both would be empty.
        if (reference == null || !reference.loggedIn) return Capability.NOT_SIGNED_IN

        // An API key or a key helper comes out of the environment and outranks any drawer, so a second
        // account here would be a row that cannot be switched to. Note that this machine still answers
        // `claude.ai` when only an unapproved key is present - the isolated run below is what actually
        // catches those, by answering signed in where it should have answered nothing.
        if (reference.method.isNotEmpty() && reference.method != SUBSCRIPTION_METHOD) return Capability.API_KEY

        val empty = isolated() ?: return Capability.IGNORED

        val moved = !empty.loggedIn
        // Every answer given under a drawer must name the folder the plain CLI names. Present, too: builds
        // up to 2.1.247 do not report the field, and two absences compare equal.
        val folderStayed = plain.projectsDirectory.isNotEmpty() &&
            listOf(reference, empty).all { it.projectsDirectory == plain.projectsDirectory }

        return if (moved && folderStayed) Capability.SUPPORTED else Capability.IGNORED
    }

    /** What `authMethod` says for a Claude subscription, the only kind a drawer can hold. */
    private const val SUBSCRIPTION_METHOD = "claude.ai"
}

package io.github.crmapache.amazingclaudecode.claude.accounts

/**
 * Whether two rows on the accounts screen are one account wearing two drawers.
 *
 * It happens for one reason and it is nobody's mistake: the sign-in Claude Code already had is a row
 * like any other, and nothing stops the person signing a SECOND drawer into that same account - either
 * by adding it here, or by signing the CLI's own drawer back in later, as the very account this screen
 * already lists. The screen then shows one subscription twice, with two sets of figures that say almost
 * the same thing because they ARE the same thing, and the account a conversation is billed to depends
 * on which of the two identical rows was pressed.
 *
 * Worse than untidy: the panel refuses a usage snapshot that repeats another account's weekly window to
 * the second, because a repeat like that is how a borrowed answer gives itself away (see
 * UsageProbes.trust). Two drawers on one subscription repeat each other honestly and for ever, so a
 * genuine answer for one of them can be thrown away as somebody else's.
 *
 * **Identity, not address.** The id is the one thing both halves agree on - it is what the register
 * files an account under (see AccountStore.idOf) - and it takes the organisation as well as the
 * address. Comparing addresses alone would merge two seats of one person in two different
 * organisations, which are two subscriptions and two bills.
 *
 * **Only an answer that came after we asked.** Each drawer's own configuration file keeps the last
 * account it was asked about for ever - a drawer signed out of last week still names whoever was in it.
 * Acting on that would delete a live drawer because of who USED to be in another one, and the
 * credential in it is the only copy on this machine. So the answer has to be newer than the moment the
 * question went out; anything older is treated as no answer at all, and the rows simply stay apart
 * until a fresh one arrives. Nothing was ever asked ([answeredAfter] of zero) is the same answer.
 *
 * **And only a drawer that is signed in now.** A question asked of an empty drawer still rewrites that
 * drawer's file - the CLI keeps its own bookkeeping there - and leaves the previous occupant's name in
 * place. Fresh file, stale name: exactly the pair that would merge two strangers. The liveness comes
 * from the caller, who has just asked the drawer itself.
 */
internal object AccountTwin {

    /** One row, as far as a decision that deletes something may rely on it. */
    data class Drawer(val id: String, val probe: AccountIdentity.Probed?, val live: Boolean)

    /**
     * The added row holding the very account [default] holds, or null when there is no such row or no
     * answer worth acting on.
     */
    fun duplicate(default: Drawer, added: List<Drawer>, answeredAfter: Long): String? {
        val theirs = accountIn(default, answeredAfter) ?: return null

        return added.firstOrNull { it.id.isNotEmpty() && accountIn(it, answeredAfter) == theirs }?.id
    }

    /**
     * Whether a conversation on [from] is still on the same subscription once it is on [to].
     *
     * Asked by a move that finds a turn running (see ClaudeSessions.moveTo): between two subscriptions
     * the turn is interrupted, and within one it is let finish, because nothing about the bill changes
     * and stopping it would cost the person an answer for nothing. The case it exists for is the merge
     * (see AccountDesk.mergeTwin): the added row goes, the conversations on it move onto the CLI's own
     * sign-in, and that is one account in two drawers. The move read the two ids as two accounts and
     * stopped a running turn - "Stopped to switch account" under work nobody had touched, in whichever
     * project happened to be busy when another one opened its panel and the merge came round.
     *
     * An added row's id IS its account - it is minted from the identity the sign-in landed as (see
     * AccountStore.idOf) - so two added rows are two accounts by construction, and only the CLI's own
     * sign-in needs asking. The answer is its usage question's, as it is for the merge.
     *
     * Looser than [duplicate] on purpose, because nothing here deletes anything. The liveness is not
     * asked: it costs a process, and the move runs on whatever thread chose the account. So a signed-out
     * drawer's stale name can pass, and the worst that buys is a turn finishing on the account being
     * left - which is what a renewal does anyway. It can hardly come up: a drawer that answered with the
     * very account an added row holds is the pair the merge takes apart as soon as it sees it.
     */
    fun sameAccount(from: String, to: String, defaultProbe: AccountIdentity.Probed?, answeredAfter: Long): Boolean {
        if (from == to) return true

        val added = when {
            from.isEmpty() -> to
            to.isEmpty() -> from
            else -> return false
        }

        return named(defaultProbe, answeredAfter) == added
    }

    /** Which account this drawer really holds, or null when the answer cannot be relied on. */
    fun accountIn(drawer: Drawer, answeredAfter: Long): String? =
        if (drawer.live) named(drawer.probe, answeredAfter) else null

    /**
     * Which account an answer names, when it is fresh enough to be worth acting on.
     *
     * Liveness is the caller's half, and kept apart because proving it costs a process: an answer that
     * names somebody else settles the question on its own, without asking any drawer anything.
     */
    fun named(probe: AccountIdentity.Probed?, answeredAfter: Long): String? {
        if (answeredAfter <= 0L) return null

        val fresh = probe?.takeIf { it.at > answeredAfter } ?: return null
        val who = fresh.who.takeIf { it.isNamed } ?: return null

        return AccountStore.idOf(who.email, who.orgUuid)
    }
}

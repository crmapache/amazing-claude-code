package io.github.crmapache.amazingclaudecode.claude.accounts

/**
 * Whether two rows on the accounts screen are one account wearing two drawers - and whether a row is the
 * account it is filed under at all.
 *
 * Two drawers on one account happen without anybody's mistake: the sign-in Claude Code already had is a
 * row like any other, and nothing stops the person signing a SECOND drawer into that same account - by
 * adding it here, or by signing the CLI's own drawer back in later, as the very account this screen
 * already lists. Two added rows can end up the same way, once a mislabelled one is filed under its true
 * name (see [mislabelled]). The screen then shows one subscription twice, with two sets of figures that say
 * almost the same thing because they ARE the same thing, and the account a conversation is billed to
 * depends on which of the two identical rows was pressed.
 *
 * Worse than untidy: the panel refuses a usage snapshot that repeats another account's weekly window to
 * the second, because a repeat like that is how a borrowed answer gives itself away (see
 * UsageProbes.trust). Two drawers on one subscription repeat each other honestly and for ever, so a
 * genuine answer for one of them can be thrown away as somebody else's.
 *
 * **Identity, not address.** Accounts are compared by [AccountStore.keyOf], which takes the organisation
 * as well as the address. Comparing addresses alone would merge two seats of one person in two different
 * organisations, which are two subscriptions and two bills.
 *
 * **Only an answer fetched after we asked.** A drawer's usage config keeps the profile it fetched for up to
 * a day, so a drawer signed into by somebody else since still names whoever used to be in it. Acting on
 * that would delete a live drawer because of who USED to be in another one, and the credential in it is
 * the only copy on this machine. So the answer has to have been fetched after the question went out - by
 * when the CLI fetched it, not by when it last rewrote the file (see AccountIdentity.probe); anything
 * older is treated as no answer at all, and the rows simply stay as they are until a fresh one arrives.
 * Nothing was ever asked ([answeredAfter] of zero) is the same answer.
 *
 * **And only a drawer that is signed in now.** Belt and braces since the usage question takes a stale
 * profile away before asking (see AccountIdentity.expire): the liveness comes from the caller, who has just
 * asked the drawer itself.
 */
internal object AccountTwin {

    /**
     * One row, as far as a decision that deletes or re-files something may rely on it.
     *
     * [filedAs] is the account the register files it under (empty for the CLI's own sign-in, which has
     * no record); [addedAt] decides which of two added drawers on one account stays.
     */
    data class Drawer(
        val id: String,
        val probe: AccountIdentity.Probed?,
        val live: Boolean,
        val filedAs: String = "",
        val addedAt: Long = 0L,
    )

    /** Two rows holding one account: [extra] goes, [keeper] is where everything on it moves. */
    data class Twin(val extra: String, val keeper: String)

    /**
     * Two rows holding one account, or null when there are none or no answer worth acting on.
     *
     * The added row goes when the other one is the CLI's own sign-in: that one owns no drawer to delete,
     * and the only way to remove it is to sign the person out of Claude Code altogether. Between two added
     * rows the one in use stays, so nothing has to move - and otherwise the newer, whose credential is the
     * fresher of two that both work.
     */
    fun duplicate(default: Drawer, added: List<Drawer>, answeredAfter: Long, inUse: String = ""): Twin? {
        val named = added.filter { it.id.isNotEmpty() }.mapNotNull { drawer ->
            accountIn(drawer, answeredAfter)?.let { drawer to it }
        }

        accountIn(default, answeredAfter)?.let { theirs ->
            named.firstOrNull { (_, account) -> account == theirs }?.let { (drawer, _) ->
                return Twin(extra = drawer.id, keeper = "")
            }
        }

        val pair = named.groupBy({ it.second }, { it.first }).values.firstOrNull { it.size > 1 } ?: return null
        val keeper = pair.firstOrNull { it.id == inUse } ?: pair.maxBy { it.addedAt }

        return Twin(extra = pair.first { it.id != keeper.id }.id, keeper = keeper.id)
    }

    /**
     * The added rows whose drawer holds somebody other than the account they are filed under, with who it
     * really is.
     *
     * How a row comes to be mislabelled: the drawer was signed into again from the expired sign-in screen
     * as another account, or the record dates from when a sign-in's name was read out of the file every
     * drawer shares (see ClaudeAccounts.completeSignIn). Either way the drawer is right and the label is
     * not, so the label is what changes - in place, with nothing moving (see ClaudeAccounts.refile). Left
     * alone, the next genuine sign-in of the account the label names would read as a repeated one.
     *
     * The same evidence as a merge asks for - fresh and live - although nothing is deleted on it.
     */
    fun mislabelled(added: List<Drawer>, answeredAfter: Long): List<Pair<String, AccountIdentity.Who>> =
        added.mapNotNull { drawer ->
            val holds = accountIn(drawer, answeredAfter) ?: return@mapNotNull null
            val who = drawer.probe?.who ?: return@mapNotNull null

            if (drawer.id.isEmpty() || holds == drawer.filedAs) null else drawer.id to who
        }

    /**
     * Whether a conversation on an account is still on the same subscription once it is on another, given
     * which account each of the two holds - null when that is not known.
     *
     * Asked by a move that finds a turn running (see ClaudeSessions.moveTo): between two subscriptions
     * the turn is interrupted, and within one it is let finish, because nothing about the bill changes
     * and stopping it would cost the person an answer for nothing. The case it exists for is the merge
     * (see AccountDesk.mergeTwin): the extra row goes, the conversations on it move onto the row that
     * stays, and that is one account in two drawers. The move read the two ids as two accounts and
     * stopped a running turn - "Stopped to switch account" under work nobody had touched, in whichever
     * project happened to be busy when another one opened its panel and the merge came round.
     *
     * Looser than [duplicate] on purpose, because nothing here deletes anything: the worst a wrong answer
     * buys is a turn finishing on the account being left - which is what a renewal does anyway.
     */
    fun sameAccount(fromAccount: String?, toAccount: String?): Boolean =
        fromAccount != null && fromAccount == toAccount

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

        return who.key
    }
}

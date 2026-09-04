package io.github.crmapache.amazingclaudecode.claude

import com.intellij.openapi.components.Service
import com.intellij.openapi.components.service

/**
 * How often the subscription may be asked about, and whether the answer is about the account we asked
 * for. One register for the whole IDE, because both questions are about an ACCOUNT while everything
 * that asks them belongs to a project.
 *
 * Both halves come from the same discovery, and it is worth writing down because nothing on the screen
 * hints at it. The CLI keeps the usage figures it last fetched in `~/.claude.json` -
 * `cachedUsageUtilization` - and that file is shared by every account: the drawer variable moves the
 * credential and nothing else (see AccountStore), so the cache is stamped with the accountUuid of
 * whoever the shared profile happens to name. When a fresh process fails to reach the usage endpoint,
 * it answers out of that cache instead, for up to an hour, and says nothing about having done so. The
 * failure that triggers it is not exotic: the endpoint starts refusing after a few requests in a row,
 * and a panel that pings three accounts and retries each of them produces exactly that. What the person
 * then sees is one account's weekly percentage sitting under another account's name - which is the
 * report this was written for.
 *
 * So:
 *
 *  - **[claim] paces the questions**, per account and across every open project. The pace is the cure:
 *    an answer that never had to fall back is an answer about the right subscription.
 *  - **[trust] catches what gets through** on the one route that can still borrow - a live conversation,
 *    which runs in the CLI's own configuration - by the thing a borrowed answer cannot hide: it is the
 *    same window, to the second, as another account's. A one-off ping is exempt, because it is asked
 *    with a configuration of its own and has nobody to borrow from; judged all the same, it made two
 *    seats of one organisation silence each other (see [trust]).
 *
 * Kept in memory: it is about not asking twice in a moment, and after a restart there is nothing left
 * to pace.
 */
@Service(Service.Level.APP)
internal class UsageProbes {

    /** The last week window accepted for an account, and when we accepted it. */
    private class Seen(val week: ClaudeUsage.Window, val at: Long)

    private val askedAt = HashMap<String, Long>()

    private val seen = HashMap<String, Seen>()

    /**
     * Take the right to ask this account about its usage, or find out how long is left until it comes
     * free. Zero means "ask now, and it is written down"; anything else is milliseconds to wait.
     *
     * [minGapMs] is the caller's own floor rather than a constant here, because the two callers pay
     * different prices: a question into a process that is already up costs nothing, while a question
     * that raises a process of its own costs seconds of one (see ProjectUsage.refreshLimits). What they
     * share is the register: the server counts requests per ACCOUNT, and two open projects asking
     * politely on their own schedules add up to one impolite one.
     */
    @Synchronized
    fun claim(account: String, minGapMs: Long, now: Long = System.currentTimeMillis()): Long {
        val since = now - (askedAt[account] ?: 0L)
        if (since in 0 until minGapMs) return minGapMs - since

        askedAt[account] = now
        return 0
    }

    /**
     * Whether this snapshot is about the account it arrived for.
     *
     * [borrowable] is the first question and usually the last one. A one-off ping runs with a config
     * directory of its own (see AccountStore.usageProbeEnvironment), so the only cache it can fall back
     * on is that account's - there is nothing of anybody else's to borrow, and an answer from there is
     * this account's whatever it says. A live conversation is the other case: it runs in the CLI's own
     * configuration, where the cache is stamped with whoever the shared profile names.
     *
     * For those, the test is a twin: another account, asked within the hour the CLI's cache lives, whose
     * weekly window is the same one - the same reset time and the same percentage.
     *
     * **It is deliberately not applied to a ping, and that is a fix rather than an optimisation.** The
     * comparison is coarse by necessity - the percentage is a whole number and the reset times are
     * matched to within minutes - so two seats of one organisation, onboarded together and both barely
     * used, look exactly like a copy. Judged, they silenced each other: the accounts screen asks for
     * every row at once, and the second row to answer showed a dash instead of a figure that was true.
     *
     * A refusal no longer takes the twin's record with it either. The retry goes past the conversations
     * to a ping of its own (see ProjectUsage.retryLater), which cannot borrow anything - so one refusal
     * settles the question, and there is no reason to make the honest account prove itself again.
     *
     * A snapshot with no weekly window is trusted as it comes: there is nothing to compare, and this is
     * the ordinary shape of an account that has not opened its week yet.
     */
    @Synchronized
    fun trust(
        account: String,
        snapshot: ClaudeUsage.Snapshot,
        borrowable: Boolean,
        now: Long = System.currentTimeMillis(),
    ): Boolean {
        val week = snapshot.week?.takeIf { it.resetsAt != null } ?: return true

        val twin = borrowable && seen.entries.any { (id, held) ->
            id != account &&
                now - held.at <= BORROWED_MS &&
                held.week.percent == week.percent &&
                held.week.sameWindowAs(week)
        }

        if (twin) return false

        seen[account] = Seen(week, now)
        return true
    }

    /** The account has been signed out of, or switched away from: its window says nothing about it now. */
    @Synchronized
    fun forget(account: String) {
        seen.remove(account)
    }

    companion object {

        fun getInstance(): UsageProbes = service()

        /**
         * The floor under a question that has to be asked now - a panel opening, a retry, the accounts
         * screen wanting a figure beside every row.
         *
         * Measured against the live endpoint rather than guessed: four questions about one account
         * inside a few seconds were enough for it to start refusing, and the refusal lasted well over a
         * minute. At one question per fifteen seconds nothing refused anything.
         */
        const val URGENT_GAP_MS = 15_000L

        /**
         * How long a borrowed answer can keep circulating: the CLI serves its cached figures for an
         * hour (`yQr` in the bundle), so a window seen inside that hour is still worth suspecting.
         */
        private const val BORROWED_MS = 60 * 60 * 1000L
    }
}

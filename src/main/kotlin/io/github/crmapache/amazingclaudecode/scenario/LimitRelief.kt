package io.github.crmapache.amazingclaudecode.scenario

import io.github.crmapache.amazingclaudecode.claude.AccountUsage

/**
 * Where a scenario run goes on when the account it works on is refused by its own limit - and, when no
 * account has room, until when it waits.
 *
 * A run is work nobody is watching. Before this, a five-hour window running out at night was the end of
 * it: the card's turn died with "you've hit your session limit", the head was asked to judge that, was
 * refused the same way, and the run was written off as a head that never decided - with two more accounts
 * on the machine sitting idle. In the morning the person picked another account and pressed Continue.
 * That is exactly what is done here, at the moment it went wrong.
 *
 * Only the run moves. The person's own choice of account (ClaudeAccounts.currentId) is theirs, and so are
 * the tabs on it: a model's week running out is a refusal of that model only, and moving every tab off an
 * account its other models still serve would interrupt work nothing had stopped. A run that borrowed an
 * account goes back to following the person's choice the moment they make one (see ScenarioEngine.follow).
 */
internal object LimitRelief {

    /** One account the run could work on, as the IDE knows it right now. */
    data class Candidate(
        /** The account's id - empty for the CLI's own sign-in. */
        val id: String,
        val standing: AccountUsage.Standing = AccountUsage.Standing(),
        /**
         * One subscription with the account the run is on, filed under another row (see
         * ClaudeAccounts.sameAccount): refused whenever that one is, whatever its own figures say - they
         * are the same figures, and whichever row the last answer was filed under is chance.
         */
        val twinOfHere: Boolean = false,
        /**
         * Whether it can run every model the run uses. False is a definite no - a model the account has
         * no access to is not refused at launch, the process dies on its first message (see
         * ClaudeAccounts.canRun). Null is not known, which is the ordinary state of an account nobody has
         * opened a conversation on since the IDE started.
         */
        val runs: Boolean? = null,
    )

    sealed interface Way {
        /** Carry on on [account] - the one the run is on, when it has room again, or another one with room. */
        data class Go(val account: String) : Way

        /** No account has room: look again at [at]. */
        data class Wait(val at: Long) : Way
    }

    /**
     * Where the run goes on from [here], the account it is on.
     *
     * The order is the point:
     *
     *  1. [here] itself, once it has room - after a wait, carrying on where it was is no move at all;
     *  2. [chosen], the account the person works on, when it is not [here] - a run that borrowed an account
     *     goes home as soon as home has room;
     *  3. an account known to run the run's models before one that is not known to;
     *  4. a measured account before an unmeasured one, and the least spent of the measured first - the one
     *     at 12% will carry a night of work, the one at 93% will refuse again in twenty minutes;
     *  5. an account nothing is known about is tried all the same: a refusal costs one request and is
     *     remembered, while not trying costs the night.
     *
     * Nothing with room: wait for the first refusal known to end, never sooner than a minute (a reset that
     * is already due is a clock a moment off, not a reason to ask every second), and when no refusal says
     * when it ends, look again after [UNKNOWN_RESET_MS].
     */
    fun choose(here: String, chosen: String, candidates: List<Candidate>, now: Long): Way {
        val hereRefused = candidates.firstOrNull { it.id == here }?.standing?.refusedUntil
        fun refusedUntil(candidate: Candidate): Long? =
            if (candidate.twinOfHere) listOfNotNull(candidate.standing.refusedUntil, hereRefused).maxOrNull()
            else candidate.standing.refusedUntil

        val usable = candidates.filter { it.runs != false }
        val free = usable.filter { candidate -> refusedUntil(candidate)?.let { it <= now } ?: true }

        val best = free.minWithOrNull(
            compareBy<Candidate>(
                { it.id != here },
                { it.id != chosen },
                { it.runs != true },
                { it.standing.fullest == null },
                { it.standing.fullest ?: 0 },
            ),
        )
        if (best != null) return Way.Go(best.id)

        val firstEnd = usable.mapNotNull(::refusedUntil).filter { it > now }.minOrNull()
        return Way.Wait(maxOf(firstEnd ?: (now + UNKNOWN_RESET_MS), now + MIN_WAIT_MS))
    }

    /**
     * Whether a run follows the account the person's choice names now (see ScenarioEngine.follow).
     *
     * The choice is broadcast on more than its changes: Select pressed on the row already chosen, an unrelated
     * account forgotten, the register re-read after another IDE wrote it - each moves every conversation onto
     * the chosen account again. A new choice is always followed. The same choice said again is followed only
     * by a run that borrowed another account and only when the chosen one has room: dragged back onto an
     * account that is still refused, the run is interrupted, refused at once and moved away again, with a
     * line in its timeline saying the person chose an account they never touched.
     */
    fun follows(to: String, lastFollowed: String, borrowed: Boolean, refused: Boolean): Boolean = when {
        to != lastFollowed -> true
        !borrowed -> false
        else -> !refused
    }

    /**
     * How long an account refused without saying until when is taken to be refused, and how long a run
     * with nothing to go by waits before it asks again. A quarter of an hour: the five-hour window resets
     * on the hour, so a refusal with no time on it is on average half an hour from its end, and asking
     * again every fifteen minutes costs one refused request each time.
     */
    const val UNKNOWN_RESET_MS = 15L * 60 * 1000

    /** The shortest wait, so that a reset a moment overdue is not asked about in a loop. */
    const val MIN_WAIT_MS = 60L * 1000
}

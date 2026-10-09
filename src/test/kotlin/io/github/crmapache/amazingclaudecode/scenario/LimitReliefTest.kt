package io.github.crmapache.amazingclaudecode.scenario

import io.github.crmapache.amazingclaudecode.claude.AccountUsage
import io.github.crmapache.amazingclaudecode.scenario.LimitRelief.Candidate
import io.github.crmapache.amazingclaudecode.scenario.LimitRelief.Way
import kotlin.test.Test
import kotlin.test.assertEquals

/**
 * Where a run goes on when its account's limit refuses it.
 *
 * Both ways of getting this wrong cost a night. A run that waits beside an account with room is the
 * evening of 8 October again: the five-hour window of one account ran out, two more stood idle, and the run
 * stopped until somebody came back to it. A run that moves onto an account that cannot take it is refused
 * again at once - or, on an account without its model, dies on its first message.
 */
class LimitReliefTest {

    private val now = 1_800_000_000_000L
    private val hour = 60 * 60 * 1000L

    private fun refused(until: Long, fullest: Int? = null) = AccountUsage.Standing(refusedUntil = until, fullest = fullest)

    private fun measured(percent: Int) = AccountUsage.Standing(fullest = percent)

    @Test
    fun `a refused run goes to the least spent account it is known to run on`() {
        val way = LimitRelief.choose(
            here = "gmail",
            chosen = "gmail",
            candidates = listOf(
                Candidate("gmail", refused(now + hour)),
                Candidate("proton", measured(58), runs = true),
                Candidate("work", measured(12), runs = true),
            ),
            now = now,
        )

        assertEquals(Way.Go("work"), way)
    }

    /** A run that borrowed an account goes home the moment home has room, however spent home is. */
    @Test
    fun `the account the person works on comes before any other with room`() {
        val way = LimitRelief.choose(
            here = "work",
            chosen = "proton",
            candidates = listOf(
                Candidate("work", refused(now + hour)),
                Candidate("proton", measured(80), runs = true),
                Candidate("gmail", measured(3), runs = true),
            ),
            now = now,
        )

        assertEquals(Way.Go("proton"), way)
    }

    /** After a wait, carrying on where it stood is no move at all. */
    @Test
    fun `the account the run is on is kept once its refusal is over`() {
        val way = LimitRelief.choose(
            here = "gmail",
            chosen = "proton",
            candidates = listOf(
                Candidate("gmail", refused(now - 1000)),
                Candidate("proton", measured(10), runs = true),
            ),
            now = now,
        )

        assertEquals(Way.Go("gmail"), way)
    }

    /**
     * The CLI's own sign-in and an added row holding the same account are one subscription: its figures may
     * have been filed under either, and moving onto the twin is being refused again a second later.
     */
    @Test
    fun `the same subscription under another row is refused with it`() {
        val way = LimitRelief.choose(
            here = "gmail",
            chosen = "gmail",
            candidates = listOf(
                Candidate("gmail", refused(now + hour)),
                Candidate("", measured(4), twinOfHere = true, runs = true),
                Candidate("work", measured(70), runs = true),
            ),
            now = now,
        )

        assertEquals(Way.Go("work"), way)
    }

    @Test
    fun `an account that cannot run the run's models is never a way on`() {
        val way = LimitRelief.choose(
            here = "gmail",
            chosen = "gmail",
            candidates = listOf(
                Candidate("gmail", refused(now + hour)),
                Candidate("pro", measured(1), runs = false),
            ),
            now = now,
        )

        assertEquals(Way.Wait(now + hour), way)
    }

    /** Known to run the models beats not known; an unmeasured account is still tried rather than waited out. */
    @Test
    fun `an account nothing is known about is tried after the known ones`() {
        val candidates = listOf(
            Candidate("gmail", refused(now + hour)),
            Candidate("fresh"),
            Candidate("work", measured(90), runs = true),
        )
        assertEquals(Way.Go("work"), LimitRelief.choose("gmail", "gmail", candidates, now))

        val onlyUnknown = listOf(Candidate("gmail", refused(now + hour)), Candidate("fresh"))
        assertEquals(Way.Go("fresh"), LimitRelief.choose("gmail", "gmail", onlyUnknown, now))
    }

    @Test
    fun `with no room anywhere the run waits for the first refusal to end`() {
        val way = LimitRelief.choose(
            here = "gmail",
            chosen = "gmail",
            candidates = listOf(
                Candidate("gmail", refused(now + 3 * hour)),
                Candidate("proton", refused(now + hour), runs = true),
            ),
            now = now,
        )

        assertEquals(Way.Wait(now + hour), way)
    }

    /** Nothing it could run on says when it frees up: no reason to ask every minute, nor to give up. */
    @Test
    fun `a wait with nothing to go by looks again after a quarter of an hour`() {
        val way = LimitRelief.choose(
            here = "gmail",
            chosen = "gmail",
            candidates = listOf(Candidate("pro", refused(now + hour), runs = false)),
            now = now,
        )

        assertEquals(Way.Wait(now + LimitRelief.UNKNOWN_RESET_MS), way)
    }

    @Test
    fun `a new choice of account is always followed`() {
        assertEquals(true, LimitRelief.follows(to = "work", lastFollowed = "gmail", borrowed = false, refused = true))
    }

    /**
     * Select pressed on the row already chosen, or another account forgotten: the same choice broadcast again.
     * A run that borrowed an account is not dragged back onto the one still refusing it.
     */
    @Test
    fun `the same choice said again moves a borrowed run home only when home has room`() {
        assertEquals(false, LimitRelief.follows(to = "gmail", lastFollowed = "gmail", borrowed = true, refused = true))
        assertEquals(true, LimitRelief.follows(to = "gmail", lastFollowed = "gmail", borrowed = true, refused = false))
        assertEquals(false, LimitRelief.follows(to = "gmail", lastFollowed = "gmail", borrowed = false, refused = false))
    }

    /** A reset a few seconds overdue on our clock is not a reason to ask every second. */
    @Test
    fun `a wait is never shorter than a minute`() {
        val way = LimitRelief.choose(
            here = "gmail",
            chosen = "gmail",
            candidates = listOf(Candidate("gmail", refused(now + 5_000))),
            now = now,
        )

        assertEquals(Way.Wait(now + LimitRelief.MIN_WAIT_MS), way)
    }
}

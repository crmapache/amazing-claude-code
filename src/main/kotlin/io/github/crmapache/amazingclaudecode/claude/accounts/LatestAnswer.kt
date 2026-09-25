package io.github.crmapache.amazingclaudecode.claude.accounts

/**
 * The last thing one drawer was heard to say - where the newer QUESTION wins, not the later answer.
 *
 * Several askers put the same question to the same drawer. The accounts screen's own round asks every
 * row, a process each and at most once a minute (see AccountDesk). The sign-in round asks about the
 * account in force every few minutes, and every few seconds while somebody is signing in (see
 * ProjectAuth). And a logout is an answer as well: the CLI has just said the drawer is empty.
 *
 * The screen used to believe one source per row, and each time it was the wrong one. A person who
 * signed in again from the gate came straight back to a card saying "No stored credential" beside a chat
 * plainly running on that account. And after "Log out" on the CLI's own sign-in its row came straight
 * back, drawn from an answer given while it was still signed in - and stayed until the IDE restarted,
 * because nothing asked about that sign-in again once another account was in force.
 *
 * With several askers the answers cross. A round takes seconds, and one begun just before a sign-in
 * landed brings back "nothing filed" AFTER the sign-in round has said "filed": the later arrival is the
 * older fact. So every answer carries the moment its question was put, and an answer to an older question
 * never replaces an answer to a newer one.
 */
internal class LatestAnswer<T : Any> {

    private var held: T? = null

    private var heldAskedAt = Long.MIN_VALUE

    /** What was last heard, or null while nobody has asked. */
    val current: T?
        @Synchronized get() = held

    /** When the question behind [current] was put - how old the answer on screen is. */
    val askedAt: Long?
        @Synchronized get() = heldAskedAt.takeIf { held != null }

    /**
     * Files an answer unless a newer question has already been answered, and tells whether what is held
     * changed - redrawing on anything else would repeat the list every few seconds of a sign-in for
     * nothing.
     */
    @Synchronized
    fun record(answer: T, askedAt: Long): Boolean {
        if (askedAt < heldAskedAt) return false

        val changed = held != answer
        held = answer
        heldAskedAt = askedAt

        return changed
    }
}

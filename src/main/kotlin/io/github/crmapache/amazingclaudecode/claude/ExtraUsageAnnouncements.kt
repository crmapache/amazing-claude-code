package io.github.crmapache.amazingclaudecode.claude

import com.intellij.openapi.components.Service
import com.intellij.openapi.components.service

/**
 * The limit windows a person has already been called about, for the whole IDE rather than for one
 * project.
 *
 * The plan's limit belongs to an account and the thing that notices it running out belongs to a project:
 * every open project reads its own agent's stream and sees the same crossing for itself. Three projects
 * with agents working meant three identical pushes to a phone about one moment - and that moment is the
 * one occasion a person away from the desk is called about something no message mentions, so the repeat
 * is all there is to read. The state the crossing is a change of is the account's now (see
 * AccountUsage.noteRateLimit), which takes most repeats away on its own; this still holds the ones it
 * cannot see - two processes on one account whose events disagree for a moment around the crossing
 * read as off, on, off, on, and each "on" is a crossing of that one window.
 *
 * So the announcement is claimed once per window: the first project to see the crossing takes it, and
 * whoever comes after finds it taken. Held in memory rather than on disk - this is about not saying one
 * thing twice, and after a restart there is nothing left to repeat.
 */
@Service(Service.Level.APP)
internal class ExtraUsageAnnouncements {

    private val announced = LinkedHashSet<String>()

    /**
     * True for the first project to ask about this window, false for every one after it.
     *
     * A window with nothing to name it by is always claimed: an event that did not say which window it
     * was about cannot be told apart from the next one, and a call not made is worse than one made twice.
     */
    @Synchronized
    fun claim(account: String, window: String, resetsAt: Long?): Boolean {
        if (window.isEmpty() && resetsAt == null) return true

        // The account is part of the key, and it has to be: five-hour windows are aligned to the wall
        // clock, so two accounts can run out in the same second - and without it the second person to
        // start spending money is never told, because the first one's claim already covered that key.
        if (!announced.add("$account:$window:${resetsAt ?: 0}")) return false

        while (announced.size > KEPT) announced.remove(announced.first())
        return true
    }

    companion object {

        fun getInstance(): ExtraUsageAnnouncements = service()

        /** How many windows are remembered. A day holds five of the five-hour ones; the rest is slack. */
        private const val KEPT = 8
    }
}

package io.github.crmapache.amazingclaudecode.claude

import com.intellij.openapi.components.Service
import com.intellij.openapi.components.service

/**
 * The limit windows a person has already been called about, for the whole IDE rather than for one
 * project.
 *
 * The plan's limit belongs to an account and the thing that notices it running out belongs to a project:
 * every open project reads its own agent's stream and sees the same crossing for itself (see
 * ProjectUsage.noteRateLimit). Three projects with agents working meant three identical pushes to a phone
 * about one moment - and that moment is the one occasion a person away from the desk is called about
 * something no message mentions, so the repeat is all there is to read.
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
    fun claim(window: String, resetsAt: Long?): Boolean {
        if (window.isEmpty() && resetsAt == null) return true

        if (!announced.add("$window:${resetsAt ?: 0}")) return false

        while (announced.size > KEPT) announced.remove(announced.first())
        return true
    }

    companion object {

        fun getInstance(): ExtraUsageAnnouncements = service()

        /** How many windows are remembered. A day holds five of the five-hour ones; the rest is slack. */
        private const val KEPT = 8
    }
}

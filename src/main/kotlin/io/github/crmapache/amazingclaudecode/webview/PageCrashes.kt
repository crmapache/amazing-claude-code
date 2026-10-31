package io.github.crmapache.amazingclaudecode.webview

/**
 * Whether the page whose process has just died should be brought back by itself.
 *
 * A page's process can die without the browser around it dying: out of memory, killed by the system under
 * memory pressure, a crash in the renderer. What is left on screen is an empty rectangle - and before
 * this, nothing ever loaded the page again, so the panel stayed empty until the IDE was restarted. A
 * reload is all it takes: the conversations live in the IDE, and a fresh page is handed all of them the
 * moment it says it is ready, exactly as after a reload from the crash screen.
 *
 * But a page that dies again as soon as it is back would be reloaded forever, with the person watching it
 * flicker. So it is brought back a few times within a while, and after that the panel stops and says so.
 * Building the browser anew from there starts the count afresh: it belongs to one browser.
 */
internal class PageCrashes(
    private val limit: Int = LIMIT,
    private val windowMs: Long = WINDOW_MS,
    private val now: () -> Long = System::currentTimeMillis,
) {

    private val recent = ArrayDeque<Long>()

    /** One more death: true when the page should be loaded again, false when it is time to give up. */
    @Synchronized
    fun reloadAfterCrash(): Boolean {
        val at = now()
        while (recent.isNotEmpty() && at - recent.first() > windowMs) recent.removeFirst()
        recent.addLast(at)
        return recent.size <= limit
    }

    companion object {
        /** How many deaths in a row are brought back without asking. */
        const val LIMIT = 3

        /** Within what time they count as "in a row". */
        const val WINDOW_MS = 5 * 60_000L
    }
}

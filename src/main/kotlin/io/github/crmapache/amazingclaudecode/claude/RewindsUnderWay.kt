package io.github.crmapache.amazingclaudecode.claude

import java.util.concurrent.ConcurrentHashMap

/**
 * The tabs a rewind of the conversation is on its way in - their queue waits, and the "work is done" push for
 * the turn the rewind stops stays quiet (see ClaudeSessionHub.rewind).
 *
 * Counted rather than marked: the desk and the phone can rewind one tab at once, and the first to end used to
 * lift the hold for both - the end of the turn the second one stopped then fired the queue into the
 * conversation a moment before it was cut.
 */
internal class RewindsUnderWay {

    private val counts = ConcurrentHashMap<String, Int>()

    fun start(sessionId: String) {
        counts.merge(sessionId, 1, Int::plus)
    }

    /** One of them is over. An end with no start lifts nothing. */
    fun end(sessionId: String) {
        counts.computeIfPresent(sessionId) { _, count -> (count - 1).takeIf { it > 0 } }
    }

    operator fun contains(sessionId: String): Boolean = counts.containsKey(sessionId)

    /** The tab is gone, and so is everything it waited for. */
    fun forget(sessionId: String) {
        counts.remove(sessionId)
    }
}

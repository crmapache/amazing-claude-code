package io.github.crmapache.amazingclaudecode.claude

import java.util.concurrent.ConcurrentHashMap

/**
 * Which messages a conversation has already taken, by the identifier their sender gave them.
 *
 * A phone cannot know whether a message it sent arrived: the road goes through a relay and a mobile
 * network, and a frame lost on the way is lost without a word. So a phone keeps what it sent until the IDE
 * says it has it, and sends it again when the line comes back or the person presses Retry (see
 * mobile/outbox.ts). That is only safe if a second copy of a message that did arrive is not said a second
 * time - a repeated "delete the branch" is not something to find out about afterwards. This is that
 * promise: the first copy is taken, every later one is recognised and dropped, and the sender is told it
 * has arrived either way.
 *
 * Kept per conversation and only for the last [kept] messages of each. A repeat comes within a minute or
 * two of the original - a reconnect, a press of Retry - not after a hundred other messages.
 */
internal class ArrivedMessages(private val kept: Int = KEPT) {

    private val bySession = ConcurrentHashMap<String, LinkedHashSet<String>>()

    /**
     * True the first time this message is seen in this conversation, false for every copy after it.
     *
     * Noted before the message is said rather than after: two copies may be on their way at once (the
     * original, slowed down, and the resend), and the second must find the first already noted.
     */
    fun first(sessionId: String, id: String): Boolean {
        val ids = bySession.getOrPut(sessionId) { LinkedHashSet() }
        synchronized(ids) {
            if (!ids.add(id)) return false
            while (ids.size > kept) ids.remove(ids.first())
            return true
        }
    }

    /**
     * The message was not said after all - saying it failed. Forgotten, so the copy the sender sends
     * again is taken rather than dropped as one already said.
     */
    fun undo(sessionId: String, id: String) {
        val ids = bySession[sessionId] ?: return
        synchronized(ids) { ids.remove(id) }
    }

    /** The conversation is closed - nothing more will arrive for it. */
    fun forget(sessionId: String) {
        bySession.remove(sessionId)
    }

    companion object {
        const val KEPT = 64
    }
}

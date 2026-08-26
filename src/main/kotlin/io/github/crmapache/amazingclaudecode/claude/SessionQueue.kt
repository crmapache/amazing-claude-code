package io.github.crmapache.amazingclaudecode.claude

import kotlinx.serialization.json.JsonObject

/**
 * The messages waiting for the turn in progress to end, by conversation.
 *
 * Here rather than in the window that typed them, and that is the whole point of the class. A queue used
 * to be a piece of state inside a screen: the panel's own, and a second copy of it on the phone. At a
 * desk that mostly works - the panel stays open beside the IDE. On a phone it does not: the page is
 * thrown out while it sits in someone's pocket, the socket closes with the screen, and putting the phone
 * away is exactly what one queues a message in order to do. What happened instead was that the message
 * disappeared - not sent, not queued, nowhere - and the person came back to a conversation that had
 * simply stopped after the last turn.
 *
 * Kept beside the conversation, it survives all of that, and both windows see the same list: a message
 * queued at the desk is visible from the sofa, and either screen can take it out again.
 *
 * What is not kept here is the numbering of the images, the chips, or anything else about how the
 * message will be drawn - that travels in [Entry.echo] untouched and unread, exactly as an ordinary
 * message's echo does (see ClaudeSessionHub.prompt).
 */
internal class SessionQueue {

    /** One message waiting its turn, with everything needed to send it when the turn comes. */
    data class Entry(
        val id: String,
        val text: String,
        /**
         * What the row shows beside the text - "3 refs". Worked out by the interface and carried rather
         * than computed here: what counts as an attachment is a question about chips in a field, and a
         * second answer to it in Kotlin would drift from the first.
         */
        val attach: String,
        val images: List<ImageAttachment>,
        val echo: JsonObject?,
        /** Queued from a paired phone rather than from the desk - the statistics tell the two apart. */
        val remote: Boolean,
    )

    private val bySession = mutableMapOf<String, MutableList<Entry>>()

    @Synchronized
    fun of(sessionId: String): List<Entry> = bySession[sessionId].orEmpty().toList()

    @Synchronized
    fun add(sessionId: String, entry: Entry): List<Entry> {
        val list = bySession.getOrPut(sessionId) { mutableListOf() }
        // The same identifier twice is a message sent again after a frame went missing, not a second
        // message: a phone that does not hear the answer resends, and two copies of one thought is worse
        // than none (see RemoteOutbox).
        if (list.none { it.id == entry.id }) list += entry
        return list.toList()
    }

    @Synchronized
    fun remove(sessionId: String, id: String): List<Entry> {
        val list = bySession[sessionId] ?: return emptyList()
        list.removeAll { it.id == id }
        return list.toList()
    }

    /**
     * Put in the order named, and nothing else.
     *
     * By identifiers rather than "move the third one to the first place": two windows are looking at this
     * list, and a position means something different to each of them the moment one of them adds a
     * message. Anything the order does not mention keeps its place at the end - it arrived while the drag
     * was happening and nobody has decided anything about it.
     */
    @Synchronized
    fun reorder(sessionId: String, order: List<String>): List<Entry> {
        val list = bySession[sessionId] ?: return emptyList()
        val named = order.mapNotNull { id -> list.firstOrNull { it.id == id } }
        val rest = list.filterNot { entry -> named.any { it.id == entry.id } }

        list.clear()
        list += named + rest
        return list.toList()
    }

    /** The message at the front, taken out - and what is left after it. Null when there is nothing. */
    @Synchronized
    fun take(sessionId: String): Pair<Entry, List<Entry>>? {
        val list = bySession[sessionId] ?: return null
        val first = list.removeFirstOrNull() ?: return null
        return first to list.toList()
    }

    /** Everything this conversation was waiting to say, dropped. True when there was anything to drop. */
    @Synchronized
    fun clear(sessionId: String): Boolean = bySession.remove(sessionId)?.isNotEmpty() == true
}

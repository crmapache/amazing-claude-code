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
        /**
         * What the editor showed when Queue was pressed, as the agent will read it (see EditorContext) - taken
         * then rather than when the message fires: it is what the person was looking at while writing it, and
         * by the time the turn ends they may well be looking at something else.
         */
        val context: String? = null,
    )

    private val bySession = mutableMapOf<String, MutableList<Entry>>()

    @Synchronized
    fun of(sessionId: String): List<Entry> = bySession[sessionId].orEmpty().toList()

    /**
     * [before] is the place a message taken out for editing is going back to - the one that stood after it
     * (see [takeOut]). Gone by now - fired, or taken out itself - the message goes to the end, which is
     * where anything queued goes: the place it asked for no longer exists, and the end is the one place
     * that still means "after everything already waiting".
     */
    @Synchronized
    fun add(sessionId: String, entry: Entry, before: String? = null): List<Entry> {
        val list = bySession.getOrPut(sessionId) { mutableListOf() }
        // The same identifier twice is a message sent again after a frame went missing, not a second
        // message: a phone that does not hear the answer resends, and two copies of one thought is worse
        // than none (see RemoteOutbox).
        if (list.any { it.id == entry.id }) return list.toList()

        val at = before?.let { id -> list.indexOfFirst { it.id == id } } ?: -1
        if (at >= 0) list.add(at, entry) else list += entry
        return list.toList()
    }

    /** A message taken out to be edited: the whole of it, where it stood, and what is left waiting. */
    data class Taken(
        val entry: Entry,
        /** The message that stood right after it - the place it goes back to. Null when it was the last. */
        val before: String?,
        val rest: List<Entry>,
    )

    /**
     * Take one message out to be edited, rather than dropping it as [remove] does.
     *
     * Out of the queue for as long as it is being edited, and that is the point rather than a side effect:
     * left in, a message would fire the moment the turn ended - half-edited, or in the version the person
     * had just decided to change. Null when it is no longer here: it fired while the press was on its way,
     * and there is nothing left to edit.
     */
    @Synchronized
    fun takeOut(sessionId: String, id: String): Taken? {
        val list = bySession[sessionId] ?: return null
        val at = list.indexOfFirst { it.id == id }
        if (at < 0) return null

        val entry = list.removeAt(at)
        return Taken(entry, list.getOrNull(at)?.id, list.toList())
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

    /**
     * The messages named, dropped, and what is left - the ones queued since the names were taken stay (see
     * ClaudeSessionHub.rewind).
     */
    @Synchronized
    fun removeAll(sessionId: String, ids: Set<String>): List<Entry> {
        val list = bySession[sessionId] ?: return emptyList()
        list.removeAll { it.id in ids }
        return list.toList()
    }

    /** Everything this conversation was waiting to say, dropped. True when there was anything to drop. */
    @Synchronized
    fun clear(sessionId: String): Boolean = bySession.remove(sessionId)?.isNotEmpty() == true
}

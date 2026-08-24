package io.github.crmapache.amazingclaudecode.claude

/**
 * One conversation's recent messages to the interface, kept so that a client joining later can be
 * given what it missed.
 *
 * Until now nothing at all was kept on this side: an agent's event travelled up to the browser and was
 * forgotten (see ClaudePanel.forwardAgentEvent). That was enough while the browser was the only client
 * and died together with the conversation. It stops being enough the moment the panel may be closed
 * over a running turn, and stops being possible at all once a second client - a phone - may join in
 * the middle of one.
 *
 * What is kept is the ready messages themselves, as strings, exactly as they went out. Then "hand the
 * journal over" is literally "send these strings", and the interface needs no second way of reading
 * them: whatever it did with a message the first time it will do again. A parallel format of our own
 * would have to be built by one side and understood by the other, and the two would drift.
 *
 * Every entry carries a number. The numbers are what a client comes back with after a break ("I have
 * everything up to N") and what it gets only the tail by - without them a phone in a lift would
 * reload the whole feed on every reconnect.
 */
internal class SessionJournal(
    /** How many entries are kept at most - see the trimming rules in [append]. */
    private val maxEntries: Int = MAX_ENTRIES,
    /** And how many characters in total: a few large entries outweigh a great many small ones. */
    private val maxChars: Int = MAX_CHARS,
) {

    data class Entry(
        val seq: Long,
        /** When it happened, so that a replayed feed counts durations by the real times. */
        val at: Long,
        val json: String,
    )

    private val entries = ArrayDeque<Entry>()

    private var nextSeq = 1L

    /** How many entries have been pushed out of the head - the client is told about them explicitly. */
    private var dropped = 0L

    private var chars = 0L

    /**
     * Put a ready message into the journal and give it its number.
     *
     * The number is handed out here rather than by the caller on purpose: it has to be strictly
     * increasing, and it has to match the order the message goes out in. Two events from different
     * threads that took their numbers apart from the sending would arrive at the client in one order
     * and be numbered in another - and the tail after a reconnect would come out with a hole.
     */
    @Synchronized
    fun append(json: String, at: Long): Entry {
        val entry = Entry(seq = nextSeq++, at = at, json = json)

        entries.addLast(entry)
        chars += entry.json.length
        trim()

        return entry
    }

    /**
     * Everything after [seq]. A client that has seen nothing passes 0 and gets the whole journal.
     *
     * Whether the head has been reached is answered by [truncatedSince] rather than by an empty answer
     * here: a client whose number is older than what we still keep must be told about the gap instead
     * of being handed a stump silently.
     *
     * [maxEntries] and [maxChars] cut it from the front, not from the back: what a client that asks for
     * a conversation wants first is the end of it, and a phone on a mobile network cannot be handed a
     * working day's journal - eight megabytes of it in one go was how a long conversation opened from a
     * phone came out blank (see ClaudeSessionHub.CatchUp). The panel passes neither and gets the lot.
     * What was left out is not left in silence - see [truncatedFrom].
     */
    @Synchronized
    fun since(seq: Long, maxEntries: Int = Int.MAX_VALUE, maxChars: Long = Long.MAX_VALUE): List<Entry> {
        val after = entries.filter { it.seq > seq }
        if (after.size <= maxEntries && after.sumOf { it.json.length.toLong() } <= maxChars) return after

        val tail = ArrayDeque<Entry>()
        var chars = 0L

        for (entry in after.asReversed()) {
            chars += entry.json.length
            // At least one entry whatever the budget: an empty answer would read as "nothing happened
            // here" rather than as "this is too big to send".
            if (tail.isNotEmpty() && (tail.size >= maxEntries || chars > maxChars)) break
            tail.addFirst(entry)
        }

        return tail.toList()
    }

    /** Whether [handed] leaves out entries this journal still holds after [seq] - see [since]. */
    @Synchronized
    fun truncatedFrom(seq: Long, handed: List<Entry>): Boolean {
        if (truncatedSince(seq)) return true
        val first = handed.firstOrNull() ?: return false
        return first.seq > seq + 1
    }

    /** Whether a client resuming from [seq] has missed entries that are no longer kept. */
    @Synchronized
    fun truncatedSince(seq: Long): Boolean {
        val first = entries.firstOrNull() ?: return dropped > 0
        return first.seq > seq + 1
    }

    /** The number of the last entry - what a client is caught up to. */
    @Synchronized
    fun lastSeq(): Long = nextSeq - 1

    /** The number of the oldest entry still kept, or 0 when the journal is empty. */
    @Synchronized
    fun firstSeq(): Long = entries.firstOrNull()?.seq ?: 0

    @Synchronized
    fun droppedCount(): Long = dropped

    @Synchronized
    fun size(): Int = entries.size

    /**
     * Start the journal over - the conversation it described is gone.
     *
     * This happens on /clear and on opening a past conversation: the process is torn down and raised
     * again with another transcript (see ClaudeSessions.resume). Keeping the old feed would leave every
     * other client showing a conversation that no longer exists.
     *
     * The numbering carries on rather than restarting. A client that reconnects with an old number
     * would otherwise be handed entries it has already seen under numbers it recognises - and would
     * quietly skip them.
     */
    @Synchronized
    fun reset() {
        entries.clear()
        chars = 0
        dropped = 0
    }

    private fun trim() {
        while (entries.size > maxEntries || (chars > maxChars && entries.size > 1)) {
            val removed = entries.removeFirst()
            chars -= removed.json.length
            dropped++
        }
    }

    companion object {
        /**
         * A heavy turn is a few hundred entries; ten of them is a long day's work in one tab. Beyond
         * that the oldest go, and the client is told the beginning is missing.
         */
        const val MAX_ENTRIES = 2000

        /**
         * The characters matter more than the count: a single tool result may weigh as much as a
         * hundred ordinary events. Roughly eight megabytes of text per tab.
         *
         * Worth putting beside the frightening figure: this very content already sits in the browser's
         * heap, parsed into feed items - which is a good deal more expensive than the raw strings that
         * replace it. New memory appears only for as long as the panel is closed.
         */
        const val MAX_CHARS = 8 * 1024 * 1024
    }
}

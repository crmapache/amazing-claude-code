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
        /** What this entry is part of when that is not the conversation itself - see [Strand]. */
        val strand: Strand? = null,
    )

    /**
     * A strand of traffic that runs beside the conversation rather than being it: one subagent's own
     * stream, one background task's progress.
     *
     * The journal used to be one undivided list, and it paid for that on exactly the conversations people
     * leave running. A workflow re-sends its whole report - every agent of a fleet of sixty, with a preview
     * of each one's errand and answer - on every change, and sends hundreds of bare progress events between
     * two reports. Hours of that filled the journal with copies of one report, pushed the conversation out
     * of its head, and left a phone opening the tab with the end of the journal and nothing in it but
     * progress: a mark saying the beginning is not shown, an empty feed under it, and nothing to anchor a
     * request for the rest on (see ClaudeSessionHub.CatchUp).
     */
    data class Strand(val key: String, val kind: Kind) {
        enum class Kind {
            /**
             * The whole state of the strand as it stands: every earlier entry of it says less than this one
             * does, and is let go the moment it arrives (see [append]). A workflow's report is one - the
             * interface draws the card from the last report alone (see feed/workflow.ts).
             */
            REPORT,

            /**
             * A step inside the strand - a subagent's call, a line of progress. Kept whole in the journal,
             * because the desk draws a card's log out of them, and thinned for a phone (see [tail]).
             */
            DETAIL,
        }
    }

    /**
     * How much of the journal one reader is handed - see [tail].
     *
     * [thinning] null means the strands are handed over like everything else: the desk takes them all and
     * should, the journal is already in this process's memory.
     */
    data class Budget(
        val maxEntries: Int = Int.MAX_VALUE,
        val maxChars: Long = Long.MAX_VALUE,
        val thinning: Thinning? = null,
    ) {
        companion object {
            val WHOLE = Budget()
        }
    }

    /**
     * What a strand may take out of a phone's tail, apart from the conversation's own budget.
     *
     * Apart rather than out of the same budget, and that is the point: five subagents at work would
     * otherwise spend the whole of it on their own calls, and the phone would once more open on a feed with
     * no conversation in it. The newest steps of each strand are what is kept - the card on a phone shows
     * the end of a subagent's log, the same end the desk shows.
     */
    data class Thinning(
        /** How many of one strand's newest steps are handed over. */
        val perStrand: Int,
        /** And how many of all the strands' steps together, and what they may weigh. */
        val maxEntries: Int,
        val maxChars: Long,
    )

    /**
     * What a reader is handed, and whether that leaves out any of the conversation after its number.
     *
     * [truncated] is said here rather than worked out afterwards from the numbers, because the numbers can
     * no longer tell it: a report replacing its predecessors leaves holes in the numbering that are not
     * losses, and a strand thinned for a phone leaves out steps whose absence is not "the beginning is
     * missing" either. Only two things are: entries the journal no longer holds, and entries of the
     * conversation the budget did not reach.
     */
    data class Tail(val entries: List<Entry>, val truncated: Boolean)

    private val entries = ArrayDeque<Entry>()

    private var nextSeq = 1L

    /** How many entries have been pushed out of the head - the client is told about them explicitly. */
    private var dropped = 0L

    /**
     * The newest number the journal has let go of for good - pushed out of the head, or swept by a reset.
     *
     * A client whose own number is below it has missed something that cannot be handed to it any more. Not
     * read off the first entry's number, which is what this was: a report replacing its predecessors takes
     * entries out of the middle, and when one of them happens to be the oldest the first number jumps with
     * nothing lost at all.
     */
    private var goneThrough = 0L

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
    fun append(json: String, at: Long, strand: Strand? = null): Entry {
        val entry = Entry(seq = nextSeq++, at = at, json = json, strand = strand)

        // Whatever this strand said before is said again, whole, by this entry - holding the old copies
        // would be holding the same report a hundred times over while the conversation itself is pushed
        // out of the head to make room for them. A client that already has them loses nothing; one that
        // does not is handed this, which is all the others would have come to.
        if (strand?.kind == Strand.Kind.REPORT) {
            entries.removeAll { kept ->
                val superseded = kept.strand?.key == strand.key
                if (superseded) chars -= kept.json.length
                superseded
            }
        }

        entries.addLast(entry)
        chars += entry.json.length
        trim()

        return entry
    }

    /**
     * Everything after [seq], cut to a budget from the front - the plain end of the journal, strands and
     * all. What reads it is the debug report, which wants the last few minutes exactly as they went out
     * (see ClaudeSessionHub.journalTail); a client joining is handed [tail] instead.
     */
    @Synchronized
    fun since(seq: Long, maxEntries: Int = Int.MAX_VALUE, maxChars: Long = Long.MAX_VALUE): List<Entry> =
        tail(seq, Budget(maxEntries, maxChars)).entries

    /**
     * What a client that has everything up to [seq] is handed. A client that has seen nothing passes 0.
     *
     * Cut from the front, not from the back: what a client that asks for a conversation wants first is
     * the end of it, and a phone on a mobile network cannot be handed a working day's journal - eight
     * megabytes of it in one go was how a long conversation opened from a phone came out blank (see
     * ClaudeSessionHub.CatchUp). The panel passes no budget and gets the lot.
     *
     * The conversation's own entries are counted against the budget, and at least one is always handed
     * over, however large: an empty answer would read as "nothing happened here" rather than as "this is
     * too big to send". A strand's steps, when the budget thins them, are counted apart - see [Thinning].
     */
    @Synchronized
    fun tail(seq: Long, budget: Budget = Budget.WHOLE): Tail {
        val after = entries.filter { it.seq > seq }
        val missing = truncatedSince(seq)
        val thinning = budget.thinning

        if (thinning == null && after.size <= budget.maxEntries &&
            after.sumOf { it.json.length.toLong() } <= budget.maxChars
        ) {
            return Tail(after, missing)
        }

        val kept = ArrayDeque<Entry>()
        var ownEntries = 0
        var ownChars = 0L
        var strandEntries = 0
        var strandChars = 0L
        val perStrand = HashMap<String, Int>()
        var cutAt = -1

        for (index in after.indices.reversed()) {
            val entry = after[index]
            val length = entry.json.length.toLong()
            val strand = entry.strand

            if (thinning != null && strand?.kind == Strand.Kind.DETAIL) {
                val taken = perStrand[strand.key] ?: 0
                val fits = taken < thinning.perStrand &&
                    strandEntries < thinning.maxEntries &&
                    strandChars + length <= thinning.maxChars
                // Left out rather than ending the tail: an older step of a subagent is worth less than any
                // of the conversation around it, and stopping here would cut the conversation instead.
                if (!fits) continue

                perStrand[strand.key] = taken + 1
                strandEntries += 1
                strandChars += length
                kept.addFirst(entry)
                continue
            }

            if (ownEntries > 0 && (ownEntries >= budget.maxEntries || ownChars + length > budget.maxChars)) {
                cutAt = index
                break
            }

            ownEntries += 1
            ownChars += length
            kept.addFirst(entry)
        }

        // Cut short only if some of the conversation itself was left behind: steps of a strand that would
        // have been thinned anyway are no part of a beginning that is "not shown".
        val cut = cutAt >= 0 && (thinning == null || (0..cutAt).any { after[it].strand?.kind != Strand.Kind.DETAIL })

        return Tail(kept.toList(), missing || cut)
    }

    /** Whether a client resuming from [seq] has missed entries that are no longer kept. */
    @Synchronized
    fun truncatedSince(seq: Long): Boolean = entries.isNotEmpty() && seq < goneThrough

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
        // Gone for a client that has less, which is how a reset always looked from outside: the numbers
        // carry on, so the first entry after it stands above a gap. A tab reset by opening a past
        // conversation is replayed from a page of its end, and that gap is where the rest of it is loaded
        // from.
        goneThrough = nextSeq - 1
        entries.clear()
        chars = 0
        dropped = 0
    }

    private fun trim() {
        while (entries.size > maxEntries || (chars > maxChars && entries.size > 1)) {
            val removed = entries.removeFirst()
            chars -= removed.json.length
            goneThrough = maxOf(goneThrough, removed.seq)
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

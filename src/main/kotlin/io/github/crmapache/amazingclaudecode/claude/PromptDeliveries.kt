package io.github.crmapache.amazingclaudecode.claude

/**
 * What was sent into the process and not yet accounted for, and the rules for recovering what got
 * lost.
 *
 * Started because a message written into a running turn goes missing at the CLI without a word: it
 * takes the message, and then either starts a new turn with it, or hands it to the running one, or
 * loses it entirely - and in the last case nothing appears in the stream at all. The person sees their
 * message in the feed, no work begins, and there is nothing to explain it with (see [PromptDelivery]
 * and ClaudeSession.checkDeliveries).
 *
 * Apart from the session itself for two reasons. First, the list has rules of its own - one record
 * found closes one wait, resending goes one message per turn - and keeping them mixed in with starting
 * a process is pointless. Second, there is no other way to check them: the session owns a live claude
 * process and does not come up in a test, while a mistake here costs the person a lost or doubled
 * message.
 */
internal class PromptDeliveries {

    /**
     * One sent message awaiting confirmation.
     *
     * Compared by itself rather than by its text: a person writes identical messages in a row all the
     * time ("yes", "go on"), and they wait separately.
     */
    class Delivery(
        val text: String,
        val images: List<ImageAttachment>,
        /** When it went into the process - the record in the conversation is looked up by it. */
        val sentAt: Long,
        /** This is already a repeat: the same thing is not sent blindly a second time. */
        val repeat: Boolean,
    )

    private val pending = mutableListOf<Delivery>()

    /** One more message whose report we are waiting for. */
    fun watch(delivery: Delivery) {
        synchronized(pending) { pending += delivery }
    }

    /** A snapshot for a new chain of checks - see ClaudeSession.scheduleDeliveryCheck. */
    fun snapshot(): List<Delivery> = synchronized(pending) { pending.toList() }

    /** What in the snapshot is still waiting: the rest was closed by a neighbouring chain. */
    fun stillPending(watched: List<Delivery>): List<Delivery> =
        synchronized(pending) { watched.filter { it in pending } }

    /**
     * Close what arrived and say what out of [watched] is still waiting.
     *
     * [arrived] holds the waits themselves rather than texts: two "go on" in a row have one and the
     * same text, and closing both by one record found means silently losing the second.
     */
    fun settle(watched: List<Delivery>, arrived: Collection<Delivery>): List<Delivery> =
        synchronized(pending) {
            pending.removeAll(arrived)
            watched.filter { it in pending }
        }

    /**
     * Resend what was lost - one message per turn.
     *
     * [isTurnRunning] is asked before each one: while a turn is running we will not write into it -
     * that is exactly where messages get lost. So a successful send ends the pass: the next lost
     * message will wait for the end of the turn it just started.
     *
     * A send that never became a turn (the message ran out of attempts and it came to nothing but an
     * error in the panel), on the other hand, does not end the pass: otherwise the next lost message
     * after it would be waiting for the end of a turn nobody is going to start.
     *
     * A message that is already a repeat is handed over regardless of the turn: nothing more is sent
     * for it - all that is left is to say out loud that it was lost (see ClaudeSession.resend), and
     * saying so writes nothing into the process. Waiting for a free turn here would mean waiting
     * forever: the turn a resend declared is exactly the one that is never going to end, because the
     * repeat vanished just like the original.
     *
     * The sending itself happens outside the list's lock, and that is no detail: sending reaches into
     * the process, up into the panel and back into this very list. Holding three doors open at once is
     * enough for two chains of checks in the air to jam them into a deadlock. The lock guards what it
     * is for - taking a message out of the list, so that two chains do not pick up the same one and
     * send it to the agent twice.
     */
    fun resendLost(missing: List<Delivery>, isTurnRunning: () -> Boolean, resend: (Delivery) -> Unit) {
        for (lost in missing) {
            if (!lost.repeat && isTurnRunning()) return
            // Not taken means it was already picked up by a neighbouring chain or forgotten by the
            // conversation itself (see [forget]).
            if (!claim(lost)) continue

            resend(lost)
        }
    }

    /**
     * Stop waiting for these, sending nothing.
     *
     * Two places need it, and both would otherwise end in a message sent twice. The write into the
     * process failed, so the message never went out even once and there is nothing to recover - the
     * panel has already been told about the error. Or the conversation could not be read at all (see
     * PromptDelivery.Lookup), and we know neither that the message arrived nor that it was lost:
     * resending on a guess is the worse of the two mistakes, because a `deploy` carried out twice
     * cannot be taken back, while a message that genuinely vanished the person notices by the silence
     * and sends again themselves.
     */
    fun stopWatching(unknown: List<Delivery>) {
        synchronized(pending) { pending.removeAll(unknown) }
    }

    /** Take a message out of the list: true means it is ours to send now, and nobody else's. */
    private fun claim(lost: Delivery): Boolean = synchronized(pending) { pending.remove(lost) }

    /** What was sent no longer waits for an answer: the conversation was interrupted, cleared or lost its process. */
    fun forget() {
        synchronized(pending) { pending.clear() }
    }
}

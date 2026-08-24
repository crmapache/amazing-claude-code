package io.github.crmapache.amazingclaudecode.remote

import java.util.ArrayDeque

/**
 * What is waiting to go out while there is nothing to send it over.
 *
 * A phone's connection breaks constantly - a lift, a tunnel, a laptop asleep - and the events do not
 * stop for it. Something has to hold them, and it has to hold them without letting a night without
 * signal turn into a gigabyte of heap in someone's IDE.
 *
 * The interesting decision is what happens when it fills up. Dropping the oldest and carrying on
 * produces a feed with a hole in it that neither side can see. So instead the whole queue collapses
 * into a single marker meaning "ask again from your last number": the client then catches up from the
 * journal, which has all of it anyway, and the memory this can hold is bounded by construction rather
 * than by how long the network was down.
 */
internal class RemoteOutbox(
    private val maxFrames: Int = MAX_FRAMES,
    private val maxBytes: Int = MAX_BYTES,
) {

    private val queue = ArrayDeque<ByteArray>()

    private var bytes = 0

    /** Set when the queue collapsed: the next thing to go out is the marker, before anything else. */
    private var resyncNeeded = false

    /**
     * Answers to a request the other side is waiting on, and revocations. They are not part of the
     * feed and must not be swept away with it: a phone waiting on a "did that go through?" would
     * otherwise wait forever.
     */
    private val urgent = ArrayDeque<ByteArray>()

    @Synchronized
    fun offer(frame: ByteArray) {
        // Once it has collapsed there is nothing to gain by filling it again: the client will be told
        // to ask from its last number, and the journal answers that. Carrying on queueing would put the
        // memory straight back that the collapse just gave up.
        if (resyncNeeded) return

        queue.addLast(frame)
        bytes += frame.size

        if (queue.size > maxFrames || bytes > maxBytes) collapse()
    }

    @Synchronized
    fun offerUrgent(frame: ByteArray) {
        // Bounded too, but far smaller: these are answers, and an answer nobody came back for is worth
        // nothing after a while.
        if (urgent.size >= MAX_URGENT) urgent.removeFirst()
        urgent.addLast(frame)
    }

    /**
     * Everything waiting, oldest first, and the queue is emptied.
     *
     * [resyncFrames] is asked for only after a collapse, and it is a list because the queue is one and
     * the devices behind it are many: everybody who was being written to has just lost whatever was in
     * flight, and each of them has to be told in a frame addressed to them. A single frame addressed to
     * nobody - which is what this used to hand back - was routed nowhere and read by no one, so a
     * collapse was silent on both ends.
     */
    @Synchronized
    fun drain(resyncFrames: () -> List<ByteArray>): List<ByteArray> {
        val out = ArrayList<ByteArray>(queue.size + urgent.size + 1)

        if (resyncNeeded) {
            out += resyncFrames()
            resyncNeeded = false
        }

        out += urgent
        out += queue
        urgent.clear()
        queue.clear()
        bytes = 0

        return out
    }

    @Synchronized
    fun size(): Int = queue.size + urgent.size

    @Synchronized
    fun needsResync(): Boolean = resyncNeeded

    @Synchronized
    fun clear() {
        queue.clear()
        urgent.clear()
        bytes = 0
        resyncNeeded = false
    }

    private fun collapse() {
        queue.clear()
        bytes = 0
        resyncNeeded = true
    }

    companion object {
        /**
         * Enough to cover a few minutes of a busy turn. Past that, catching up from the journal is both
         * cheaper and more honest than replaying a queue.
         */
        const val MAX_FRAMES = 2000

        const val MAX_BYTES = 8 * 1024 * 1024

        const val MAX_URGENT = 64
    }
}

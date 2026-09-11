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
 * produces a feed with a hole in it that neither side can see. So instead the queue collapses into a
 * single marker meaning "ask again from your last number": the client then catches up from the
 * journal, which has all of it anyway, and the memory this can hold is bounded by construction rather
 * than by how long the network was down.
 *
 * A QUEUE PER DEVICE, which is the part that had to change. One queue meant one fate: a phone in a
 * tunnel filled the queue that belonged to everybody, and the collapse threw away the frames of the
 * laptop sitting on the desk with a perfectly good connection - and told it to ask again for a feed it
 * had never lost. With a conversation open in three places that stopped being an edge case and became
 * the ordinary day. The ceilings are per device for the same reason: what one device may cost this
 * IDE's memory should not depend on how many others are paired.
 */
internal class RemoteOutbox(
    private val maxFrames: Int = MAX_FRAMES,
    private val maxBytes: Int = MAX_BYTES,
) {

    /** One frame and who it is for, so that what could not be sent goes back where it came from. */
    class Sent(val deviceId: String, val frame: ByteArray)

    private class Queue {
        val frames = ArrayDeque<ByteArray>()

        var bytes = 0

        /** Set when this queue collapsed: the next thing out is the marker, before anything else. */
        var resyncNeeded = false

        /**
         * Answers to a request this device is waiting on. They are not part of the feed and must not be
         * swept away with it: a phone waiting on a "did that go through?" would otherwise wait forever.
         */
        val urgent = ArrayDeque<ByteArray>()

        fun isEmpty(): Boolean = frames.isEmpty() && urgent.isEmpty() && !resyncNeeded
    }

    private val devices = LinkedHashMap<String, Queue>()

    @Synchronized
    fun offer(deviceId: String, frame: ByteArray) {
        val queue = devices.getOrPut(deviceId) { Queue() }

        // Once it has collapsed there is nothing to gain by filling it again: this device will be told
        // to ask from its last number, and the journal answers that. Carrying on queueing would put the
        // memory straight back that the collapse just gave up.
        if (queue.resyncNeeded) return

        queue.frames.addLast(frame)
        queue.bytes += frame.size

        if (queue.frames.size > maxFrames || queue.bytes > maxBytes) collapse(queue)
    }

    @Synchronized
    fun offerUrgent(deviceId: String, frame: ByteArray) {
        val queue = devices.getOrPut(deviceId) { Queue() }

        // Bounded too, but far smaller: these are answers, and an answer nobody came back for is worth
        // nothing after a while.
        if (queue.urgent.size >= MAX_URGENT) queue.urgent.removeFirst()
        queue.urgent.addLast(frame)
    }

    /**
     * Everything waiting, oldest first per device, and the queues are emptied.
     *
     * [resyncFrame] is asked for only where a queue collapsed, and it is asked per device because the
     * marker has to be sealed and addressed to that one: a frame addressed to nobody is routed nowhere
     * and read by no one, so a collapse used to be silent on both ends.
     */
    @Synchronized
    fun drain(resyncFrame: (String) -> ByteArray?): List<Sent> {
        val out = ArrayList<Sent>()

        for ((deviceId, queue) in devices) {
            if (queue.resyncNeeded) {
                resyncFrame(deviceId)?.let { out += Sent(deviceId, it) }
                queue.resyncNeeded = false
            }

            for (frame in queue.urgent) out += Sent(deviceId, frame)
            for (frame in queue.frames) out += Sent(deviceId, frame)

            queue.urgent.clear()
            queue.frames.clear()
            queue.bytes = 0
        }

        // A device with nothing waiting is a row this map does not need: pairing and a revocation both
        // leave addresses behind, and this is where they stop being remembered.
        devices.entries.removeIf { it.value.isEmpty() }

        return out
    }

    /**
     * What could not go out after all, back at the front of its own queue.
     *
     * The transport hands a frame to a socket that may refuse it - the JDK's client will not take a
     * second send before the first has finished - and a batch already taken out of here would then be
     * lost with nothing anywhere saying so. That is the shape of the worst kind of defect in this
     * feature: the connection stands, the screen looks alive, and one message of the conversation is
     * simply not on it. Given back, it goes out on the next beat.
     */
    @Synchronized
    fun putBack(rest: List<Sent>) {
        // The rows are made in the order the frames stood in, and only then filled from the back: the
        // drain takes empty rows away, so filling alone would bring the devices back in reverse.
        for (item in rest) devices.getOrPut(item.deviceId) { Queue() }

        for (item in rest.asReversed()) {
            val queue = devices.getOrPut(item.deviceId) { Queue() }
            if (queue.resyncNeeded) continue

            queue.frames.addFirst(item.frame)
            queue.bytes += item.frame.size
        }

        for (queue in devices.values) {
            if (queue.frames.size > maxFrames || queue.bytes > maxBytes) collapse(queue)
        }
    }

    /** A device is gone - what was on its way to it is not worth holding. */
    @Synchronized
    fun forget(deviceId: String) {
        devices.remove(deviceId)
    }

    @Synchronized
    fun size(): Int = devices.values.sumOf { it.frames.size + it.urgent.size }

    @Synchronized
    fun needsResync(deviceId: String): Boolean = devices[deviceId]?.resyncNeeded ?: false

    @Synchronized
    fun clear() {
        devices.clear()
    }

    private fun collapse(queue: Queue) {
        queue.frames.clear()
        queue.bytes = 0
        queue.resyncNeeded = true
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

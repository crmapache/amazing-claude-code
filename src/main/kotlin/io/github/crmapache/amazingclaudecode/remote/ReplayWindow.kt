package io.github.crmapache.amazingclaudecode.remote

/**
 * Whether this frame has been seen before.
 *
 * A frame that arrives twice is not a curiosity: replay one carrying "allow this tool call" and the
 * agent is granted the same permission a second time, at a moment nobody chose. The tag stops anyone
 * altering a frame; only this stops them sending an unaltered one again.
 *
 * A window rather than a single high-water mark, because order is not guaranteed end to end. Over one
 * socket it is, but a reconnect merges what was buffered on the relay with what is arriving live, and
 * a strict "must be higher than the last" would throw away good frames.
 */
internal class ReplayWindow(private val size: Int = SIZE) {

    private var highest = -1L

    /** A bitmap of what has been seen below [highest]: bit 0 is highest itself, bit 1 the one before. */
    private var seen = 0L

    /**
     * Take a counter. False means "already had this one, or it is too old to tell" - and the frame is
     * dropped without further thought.
     */
    @Synchronized
    fun accept(counter: Long): Boolean {
        if (counter < 0) return false

        if (highest < 0) {
            highest = counter
            seen = 1L
            return true
        }

        if (counter > highest) {
            val step = counter - highest
            seen = if (step >= size) 1L else (seen shl step.toInt()) or 1L
            highest = counter
            return true
        }

        val behind = highest - counter
        // Below the window there is no way to tell a repeat from something merely very late, and
        // guessing in favour of the sender is how a replay gets through. Old is dropped.
        if (behind >= size) return false

        val bit = 1L shl behind.toInt()
        if (seen and bit != 0L) return false

        seen = seen or bit
        return true
    }

    @Synchronized
    fun highest(): Long = highest

    companion object {
        /**
         * Sixty-four, because that is what fits in one word and because reordering past that is not
         * something a socket does - a merge after a reconnect is a handful of frames out of order, not
         * a hundred.
         */
        const val SIZE = 64
    }
}

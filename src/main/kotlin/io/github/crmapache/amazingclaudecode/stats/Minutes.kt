package io.github.crmapache.amazingclaudecode.stats

import java.util.BitSet
import java.util.Base64

/**
 * The minutes of one day something happened in - a bit per minute, 1440 of them.
 *
 * Time in the panel is counted this way rather than as a running total of seconds: a minute is either
 * active or it is not, and marking the same minute twice costs nothing. That is what makes the sources
 * easy to add up - a turn running, a message sent, a hand on the keyboard - without one of them counting
 * a moment the other has already counted. The hour-of-day breakdown the calendar draws falls out of the
 * same bits for free.
 */
internal class MinuteSet private constructor(private val bits: BitSet) {

    constructor() : this(BitSet(MINUTES_PER_DAY))

    fun mark(minuteOfDay: Int) {
        if (minuteOfDay in 0 until MINUTES_PER_DAY) bits.set(minuteOfDay)
    }

    /** How many minutes of the day were active. */
    fun count(): Int = bits.cardinality()

    fun isEmpty(): Boolean = bits.isEmpty

    /** Active minutes per hour of the day - the calendar's "between 10:00 and 13:00" is read off this. */
    fun hours(): IntArray {
        val out = IntArray(24)
        var minute = bits.nextSetBit(0)
        while (minute >= 0) {
            out[minute / 60]++
            minute = bits.nextSetBit(minute + 1)
        }
        return out
    }

    /**
     * Every set minute, in order. The ledger turns these into the longer-running counts a day cannot
     * hold on its own (a conversation's unbroken stretch crosses midnight).
     */
    fun minutes(): IntArray {
        val out = IntArray(count())
        var index = 0
        var minute = bits.nextSetBit(0)
        while (minute >= 0) {
            out[index++] = minute
            minute = bits.nextSetBit(minute + 1)
        }
        return out
    }

    /** The bits as text for the file on disk: a hundred and eighty bytes at most, base64 over them. */
    fun encode(): String = if (bits.isEmpty) "" else Base64.getEncoder().encodeToString(bits.toByteArray())

    /**
     * Every minute either of the two was active in.
     *
     * The one figure in a day that two IDEs can genuinely add up without counting anything twice: a
     * minute is active or it is not, and a minute both of them marked is still one minute (see
     * StatsSnapshot.mergedWith, where the rest of the day has to make do with the larger of two).
     */
    fun union(other: MinuteSet): MinuteSet {
        val joined = bits.clone() as BitSet
        joined.or(other.bits)
        return MinuteSet(joined)
    }

    companion object {
        const val MINUTES_PER_DAY = 24 * 60

        fun decode(text: String): MinuteSet {
            if (text.isBlank()) return MinuteSet()
            val bytes = runCatching { Base64.getDecoder().decode(text) }.getOrNull() ?: return MinuteSet()
            val bits = BitSet.valueOf(bytes)
            // A file written by a later version with more bits than a day holds is read up to the day's edge.
            if (bits.length() > MINUTES_PER_DAY) bits.clear(MINUTES_PER_DAY, bits.length())
            return MinuteSet(bits)
        }
    }
}

package io.github.crmapache.amazingclaudecode.remote

import kotlin.math.min
import kotlin.random.Random

/**
 * How long to wait before trying the relay again, and whether to try at all.
 *
 * Three kinds of failure, three behaviours. Collapsing them into one retry loop is the usual mistake
 * and it shows up twice: an IDE that hammers a relay which is deliberately refusing it, and a person
 * staring at "reconnecting…" when the answer is "this plugin is too old and always will be".
 */
internal class Backoff(private val random: Random = Random.Default) {

    enum class Failure {
        /**
         * The network blinked - a timeout, a reset, a close with no HTTP answer behind it. Short pause,
         * the queue is kept, and the panel says nothing alarming: this is the ordinary weather of a
         * laptop lid and a train tunnel.
         */
        NETWORK,

        /**
         * The relay is up but unwell - a 5xx on the upgrade, an explicit "try later". The pause runs to
         * its ceiling, because hammering a struggling server is how a bad minute becomes a bad hour.
         */
        RELAY,

        /**
         * A refusal on the merits: the address was rejected, the wire version is not spoken, another
         * instance took this address. Retrying changes nothing at all, so it stops and says why.
         */
        FATAL,
    }

    private var attempts = 0

    /** Null means stop trying: only a person can move this on. */
    fun next(failure: Failure): Long? {
        if (failure == Failure.FATAL) return null

        attempts += 1

        val ceiling = if (failure == Failure.RELAY) RELAY_CEILING_MS else NETWORK_CEILING_MS
        val ideal = min(BASE_MS shl min(attempts - 1, MAX_SHIFT), ceiling)

        // Jitter, because every IDE that lost the same relay would otherwise come back at the same
        // instant and knock it over again the moment it recovered.
        val spread = (ideal * JITTER).toLong()
        return ideal - spread + random.nextLong(2 * spread + 1)
    }

    /** A connection that stayed up long enough counts as a fresh start. */
    fun succeeded() {
        attempts = 0
    }

    fun attempts(): Int = attempts

    /**
     * Which kind of failure a close code means.
     *
     * The codes above 4000 are this relay's own (see relay/src/routing/hub.ts): they are the cases
     * where the server has looked at the request and decided against it, and no amount of trying again
     * will change its mind.
     */
    fun classify(closeCode: Int, hadHttpResponse: Boolean, httpStatus: Int = 0): Failure = when {
        closeCode in FATAL_CODES -> Failure.FATAL
        hadHttpResponse && httpStatus >= 500 -> Failure.RELAY
        hadHttpResponse && httpStatus == 429 -> Failure.RELAY
        closeCode == TRY_AGAIN_LATER -> Failure.RELAY
        else -> Failure.NETWORK
    }

    companion object {
        const val BASE_MS = 1_000L

        /** A blinking network is worth retrying often: the answer is usually "it is back". */
        const val NETWORK_CEILING_MS = 60_000L

        /** A relay that is down is not worth asking every minute. */
        const val RELAY_CEILING_MS = 300_000L

        private const val MAX_SHIFT = 8

        private const val JITTER = 0.25

        /** The websocket standard's own "come back later". */
        const val TRY_AGAIN_LATER = 1013

        /** Address refused, version not spoken, displaced by another instance. */
        val FATAL_CODES = setOf(4001, 4002, 4009)
    }
}

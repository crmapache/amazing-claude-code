package io.github.crmapache.amazingclaudecode.remote

import kotlin.random.Random
import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertNotNull
import kotlin.test.assertNull
import kotlin.test.assertTrue

/**
 * Three kinds of failure, three behaviours. Collapsing them into one retry loop shows up twice: an IDE
 * hammering a relay that is deliberately refusing it, and a person staring at "reconnecting…" when the
 * true answer is "this plugin is too old and always will be".
 */
class BackoffTest {

    /** A fixed source of randomness, so the jitter can be reasoned about rather than guessed at. */
    private fun backoff() = Backoff(Random(1))

    @Test
    fun `the pause grows with the attempts`() {
        val backoff = backoff()

        val first = backoff.next(Backoff.Failure.NETWORK)!!
        val second = backoff.next(Backoff.Failure.NETWORK)!!
        val third = backoff.next(Backoff.Failure.NETWORK)!!

        assertTrue(first < second && second < third, "$first then $second then $third")
    }

    @Test
    fun `a blinking network is retried for a minute at most`() {
        val backoff = backoff()
        repeat(30) { backoff.next(Backoff.Failure.NETWORK) }

        val pause = backoff.next(Backoff.Failure.NETWORK)!!

        assertTrue(pause <= Backoff.NETWORK_CEILING_MS, "$pause")
    }

    /** Hammering a struggling server is how a bad minute becomes a bad hour. */
    @Test
    fun `a relay that is unwell is left alone for longer`() {
        val network = backoff()
        val relay = backoff()
        repeat(30) {
            network.next(Backoff.Failure.NETWORK)
            relay.next(Backoff.Failure.RELAY)
        }

        assertTrue(relay.next(Backoff.Failure.RELAY)!! > network.next(Backoff.Failure.NETWORK)!!)
    }

    /** Retrying changes nothing when the server has looked at the request and said no. */
    @Test
    fun `a refusal on the merits stops the retrying`() {
        assertNull(backoff().next(Backoff.Failure.FATAL))
    }

    @Test
    fun `a connection that held resets the count`() {
        val backoff = backoff()
        repeat(5) { backoff.next(Backoff.Failure.NETWORK) }

        backoff.succeeded()

        assertEquals(0, backoff.attempts())
        assertTrue(backoff.next(Backoff.Failure.NETWORK)!! < 2 * Backoff.BASE_MS)
    }

    /**
     * Without jitter every IDE that lost the same relay comes back at the same instant and knocks it
     * over again the moment it recovers.
     */
    @Test
    fun `two agents do not come back at the same instant`() {
        val pauses = (1..20).map { seed ->
            Backoff(Random(seed.toLong())).let { backoff ->
                repeat(3) { backoff.next(Backoff.Failure.NETWORK) }
                backoff.next(Backoff.Failure.NETWORK)!!
            }
        }

        assertTrue(pauses.distinct().size > 1, "all equal: $pauses")
    }

    @Test
    fun `the relay's own refusals are read as final`() {
        val backoff = backoff()

        for (code in Backoff.FATAL_CODES) {
            assertEquals(Backoff.Failure.FATAL, backoff.classify(code, hadHttpResponse = false))
        }
    }

    @Test
    fun `a server error is read as the relay being unwell`() {
        val backoff = backoff()

        assertEquals(Backoff.Failure.RELAY, backoff.classify(1006, hadHttpResponse = true, httpStatus = 503))
        assertEquals(Backoff.Failure.RELAY, backoff.classify(1006, hadHttpResponse = true, httpStatus = 429))
        assertEquals(Backoff.Failure.RELAY, backoff.classify(Backoff.TRY_AGAIN_LATER, hadHttpResponse = false))
    }

    @Test
    fun `a socket that simply died is read as the network`() {
        val backoff = backoff()

        assertEquals(Backoff.Failure.NETWORK, backoff.classify(1006, hadHttpResponse = false))
        assertNotNull(backoff.next(backoff.classify(1006, hadHttpResponse = false)))
    }
}

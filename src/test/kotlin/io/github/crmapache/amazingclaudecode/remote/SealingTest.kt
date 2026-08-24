package io.github.crmapache.amazingclaudecode.remote

import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertFalse
import kotlin.test.assertNotEquals
import kotlin.test.assertNull
import kotlin.test.assertTrue

/**
 * The properties the sealed channel is worth having, each stated as the attack it stops.
 *
 * Round-tripping is the least interesting of them: a scheme that encrypts and decrypts its own output
 * and nothing else is trivially satisfied by returning the input. What matters is what fails.
 */
class SealingTest {

    private val key = ByteArray(Sealing.KEY_BYTES) { it.toByte() }
    private val prefix = byteArrayOf(1, 2, 3, 4)
    private val header = ByteArray(Frame.HEADER_BYTES) { 9 }
    private val body = "the agent read src/auth/session.ts".toByteArray()

    @Test
    fun `a sealed body comes back out for the holder of the key`() {
        val sealed = Sealing.seal(key, prefix, 1, header, body)

        assertEquals(String(body), String(Sealing.open(key, prefix, 1, header, sealed)!!))
    }

    @Test
    fun `what travels does not contain the plain text`() {
        val sealed = Sealing.seal(key, prefix, 1, header, body)

        assertFalse(String(sealed).contains("session.ts"))
        assertNotEquals(String(body), String(sealed))
    }

    @Test
    fun `someone else's key opens nothing`() {
        val sealed = Sealing.seal(key, prefix, 1, header, body)
        val other = ByteArray(Sealing.KEY_BYTES) { 0x5a }

        assertNull(Sealing.open(other, prefix, 1, header, sealed))
    }

    /**
     * A relay that altered a byte would otherwise hand the other end something that decrypts into
     * nonsense - or, with bad luck, into something plausible.
     */
    @Test
    fun `a body altered on the way does not open`() {
        val sealed = Sealing.seal(key, prefix, 1, header, body)
        sealed[3] = (sealed[3] + 1).toByte()

        assertNull(Sealing.open(key, prefix, 1, header, sealed))
    }

    /**
     * The point of covering the header: a frame addressed to one device cannot be re-addressed to
     * another by whoever forwards it.
     */
    @Test
    fun `a frame re-addressed on the way does not open`() {
        val sealed = Sealing.seal(key, prefix, 1, header, body)
        val altered = header.copyOf().also { it[5] = 42 }

        assertNull(Sealing.open(key, prefix, 1, altered, sealed))
    }

    /** The counter is part of the nonce, so a frame only opens under the number it was sealed with. */
    @Test
    fun `a frame does not open under someone else's counter`() {
        val sealed = Sealing.seal(key, prefix, 7, header, body)

        assertNull(Sealing.open(key, prefix, 8, header, sealed))
    }

    /**
     * The rule this whole scheme dies of if broken. Two frames under one key and one counter would
     * share a nonce - which in GCM is not a weakness but a break.
     */
    @Test
    fun `the same body under different counters looks different`() {
        val first = Sealing.seal(key, prefix, 1, header, body)
        val second = Sealing.seal(key, prefix, 2, header, body)

        assertFalse(first.contentEquals(second))
    }

    @Test
    fun `each direction's prefix keeps its frames apart`() {
        val sealed = Sealing.seal(key, byteArrayOf(1, 1, 1, 1), 1, header, body)

        assertNull(Sealing.open(key, byteArrayOf(2, 2, 2, 2), 1, header, sealed))
    }

    /**
     * A fingerprint is read aloud off two screens by a person holding a phone, so it has to be short
     * and grouped. It is not what makes pairing safe - the QR secret does that - but it catches the
     * case the cryptography cannot: someone who photographed the screen and scanned it first.
     */
    @Test
    fun `a fingerprint is short, grouped and stable`() {
        val fingerprint = Sealing.fingerprint("a public key".toByteArray())

        assertEquals(19, fingerprint.length)
        assertEquals(4, fingerprint.split(" ").size)
        assertEquals(fingerprint, Sealing.fingerprint("a public key".toByteArray()))
    }

    @Test
    fun `a different key has a different fingerprint`() {
        assertNotEquals(
            Sealing.fingerprint("one key".toByteArray()),
            Sealing.fingerprint("another key".toByteArray()),
        )
    }

    @Test
    fun `comparing secrets does not stop at the first difference`() {
        assertTrue(Sealing.sameBytes(byteArrayOf(1, 2, 3), byteArrayOf(1, 2, 3)))
        assertFalse(Sealing.sameBytes(byteArrayOf(1, 2, 3), byteArrayOf(1, 2, 4)))
        assertFalse(Sealing.sameBytes(byteArrayOf(1, 2, 3), byteArrayOf(1, 2)))
    }
}

package io.github.crmapache.amazingclaudecode.remote

import java.security.MessageDigest
import javax.crypto.Cipher
import javax.crypto.spec.GCMParameterSpec
import javax.crypto.spec.SecretKeySpec

/**
 * Sealing a body so that only the other end can open it.
 *
 * AES-256-GCM: it encrypts and authenticates in one pass, and the authentication is the half that
 * matters most here. The relay forwards bytes it cannot read; without a tag it could still alter them,
 * and an altered frame that decrypts into something plausible is worse than one that fails.
 *
 * The frame's own header goes in as additional data rather than being ignored - all of it, the wire
 * version and the kind of frame included. It is not secret, the relay routes by it, but it is covered
 * by the tag: nobody can take a frame addressed to one device and re-address it to another, and nobody
 * can relabel an envelope as "wake this phone" to have it handed to a push service instead. The tag
 * stops matching, and the frame is dropped.
 *
 * The one rule this scheme dies of if broken: a key and a nonce must never be used twice together.
 * That is why the nonce is a per-direction prefix plus a counter, why each direction has a key of its
 * own, and why keys are derived afresh from ephemeral material on every connection - a restarted agent
 * cannot resurrect an old counter under an old key, because the key is gone.
 */
internal object Sealing {

    private const val TRANSFORMATION = "AES/GCM/NoPadding"

    private const val TAG_BITS = 128

    const val KEY_BYTES = 32

    /** Four bytes of prefix and eight of counter - the twelve GCM expects. */
    const val NONCE_PREFIX_BYTES = 4

    const val NONCE_BYTES = 12

    fun seal(key: ByteArray, noncePrefix: ByteArray, counter: Long, header: ByteArray, body: ByteArray): ByteArray {
        val cipher = Cipher.getInstance(TRANSFORMATION)
        cipher.init(Cipher.ENCRYPT_MODE, SecretKeySpec(key, "AES"), GCMParameterSpec(TAG_BITS, nonce(noncePrefix, counter)))
        cipher.updateAAD(header)
        return cipher.doFinal(body)
    }

    /**
     * Open a sealed body, or fail.
     *
     * Failure is not an error to report anywhere but a log line: a frame that does not open is a frame
     * from a device that has been revoked, or one somebody altered on the way. Both are answered the
     * same way - drop it.
     */
    fun open(key: ByteArray, noncePrefix: ByteArray, counter: Long, header: ByteArray, sealed: ByteArray): ByteArray? =
        runCatching {
            val cipher = Cipher.getInstance(TRANSFORMATION)
            cipher.init(Cipher.DECRYPT_MODE, SecretKeySpec(key, "AES"), GCMParameterSpec(TAG_BITS, nonce(noncePrefix, counter)))
            cipher.updateAAD(header)
            cipher.doFinal(sealed)
        }.getOrNull()

    private fun nonce(prefix: ByteArray, counter: Long): ByteArray {
        require(prefix.size == NONCE_PREFIX_BYTES) { "a nonce prefix is exactly 4 bytes" }

        val nonce = ByteArray(NONCE_BYTES)
        prefix.copyInto(nonce, 0)

        for (index in 0 until 8) {
            nonce[NONCE_PREFIX_BYTES + index] = ((counter ushr (56 - 8 * index)) and 0xff).toByte()
        }

        return nonce
    }

    /**
     * A key's fingerprint, as it is shown on both screens during pairing.
     *
     * Eight bytes in four groups, because it is meant to be compared by eye by a person holding a
     * phone. The comparison is not what makes the pairing safe - the secret in the QR code does that -
     * but it does catch the everyday case the cryptography cannot: someone who photographed the screen,
     * or saw it in a recording, and scanned it before you did.
     */
    fun fingerprint(publicKey: ByteArray): String {
        val digest = MessageDigest.getInstance("SHA-256").digest(publicKey)

        return digest.take(8)
            .joinToString("") { "%02X".format(it) }
            .chunked(4)
            .joinToString(" ")
    }

    /** Comparing secrets in constant time, so that a wrong guess tells nobody how nearly right it was. */
    fun sameBytes(first: ByteArray, second: ByteArray): Boolean = MessageDigest.isEqual(first, second)
}

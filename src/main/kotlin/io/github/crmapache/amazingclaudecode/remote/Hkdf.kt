package io.github.crmapache.amazingclaudecode.remote

import javax.crypto.Mac
import javax.crypto.spec.SecretKeySpec

/**
 * Turning one shared secret into the several keys that are actually used.
 *
 * Written out here because JDK 21 has no HKDF of its own - `javax.crypto.KDF` is a preview feature of a
 * later release, and a plugin cannot ask an IDE to run on a different JVM. The browser half needs none
 * of this: `crypto.subtle.deriveBits({name: 'HKDF'})` has been standard for years. So only this side
 * is hand-written, and it is thirty lines of a specification (RFC 5869) rather than a scheme of our own.
 *
 * Why not simply use the shared secret as the key: it is one value, and the same key used in both
 * directions is how a message sent to you gets replayed back at you and accepted. Each direction gets
 * its own key and its own nonce prefix, and the two never meet.
 */
internal object Hkdf {

    private const val ALGORITHM = "HmacSHA256"

    private const val HASH_BYTES = 32

    /**
     * Extract: whatever entropy the input had, concentrated into one pseudorandom key.
     *
     * The salt is not a secret and does not need to be one: it exists so that two exchanges that
     * happened to share an input still end up with different keys.
     */
    fun extract(salt: ByteArray, ikm: ByteArray): ByteArray {
        val mac = Mac.getInstance(ALGORITHM)
        mac.init(SecretKeySpec(if (salt.isEmpty()) ByteArray(HASH_BYTES) else salt, ALGORITHM))
        return mac.doFinal(ikm)
    }

    /**
     * Expand: as many bytes as are wanted, for a named purpose.
     *
     * The `info` label is what keeps the keys apart. "agent to device" and "device to agent" derive
     * from the same secret and are unrelated because of this string alone - which is why the labels
     * are constants rather than something a caller passes in freehand.
     */
    fun expand(prk: ByteArray, info: ByteArray, length: Int): ByteArray {
        require(length <= 255 * HASH_BYTES) { "HKDF cannot expand that far" }

        val mac = Mac.getInstance(ALGORITHM)
        mac.init(SecretKeySpec(prk, ALGORITHM))

        val out = ByteArray(length)
        var block = ByteArray(0)
        var filled = 0
        var counter = 1

        while (filled < length) {
            mac.reset()
            mac.update(block)
            mac.update(info)
            mac.update(counter.toByte())
            block = mac.doFinal()

            val take = minOf(block.size, length - filled)
            block.copyInto(out, filled, 0, take)
            filled += take
            counter += 1
        }

        return out
    }

    /** The two halves in one call, which is how it is used everywhere here. */
    fun derive(salt: ByteArray, ikm: ByteArray, info: String, length: Int): ByteArray =
        expand(extract(salt, ikm), info.toByteArray(Charsets.UTF_8), length)
}

package io.github.crmapache.amazingclaudecode.remote

import java.nio.ByteBuffer
import java.util.Base64

/**
 * The envelope the relay sees, and the only part of a message it can read.
 *
 * Forty-two bytes of header, then a body nothing between here and the phone looks inside. Binary
 * rather than JSON so that the claim "the relay cannot read your code" is a property of the code
 * rather than a promise: routing reads two fixed offsets, and there is no parser on that side that
 * could be pointed at the rest.
 *
 * The same header carries a plaintext body in phase 2 and a sealed one from phase 3 onwards - the
 * relay does not change between the two, because it never knew the difference. This is the mirror of
 * relay/src/wire/frame.ts, and the two are obliged to agree byte for byte.
 */
internal object Frame {

    const val HEADER_BYTES = 42

    const val WIRE_VERSION = 1

    /** An envelope between two paired parties. Its body means nothing to the relay. */
    const val TYPE_SEALED = 0x01

    /**
     * The relay's own word, and the only thing it ever says: "there was a break, ask for the tail
     * again". A type of its own so it can never be taken for something an agent said.
     */
    const val TYPE_CONTROL = 0x02

    /**
     * "Wake this device": the agent has something worth a notification and the device is not
     * connected, so the relay should hand it to a push service. The body is sealed like any other -
     * neither the relay nor Apple nor Google can read it.
     */
    const val TYPE_PUSH = 0x03

    const val ADDRESS_BYTES = 16

    data class Envelope(
        val version: Int,
        val type: Int,
        val to: ByteArray,
        val from: ByteArray,
        val counter: Long,
        val body: ByteArray,
    ) {
        // Generated equality would compare the arrays by identity, which is never what a test means.
        override fun equals(other: Any?): Boolean {
            if (this === other) return true
            if (other !is Envelope) return false
            return version == other.version &&
                type == other.type &&
                to.contentEquals(other.to) &&
                from.contentEquals(other.from) &&
                counter == other.counter &&
                body.contentEquals(other.body)
        }

        override fun hashCode(): Int {
            var result = version
            result = 31 * result + type
            result = 31 * result + to.contentHashCode()
            result = 31 * result + from.contentHashCode()
            result = 31 * result + counter.hashCode()
            result = 31 * result + body.contentHashCode()
            return result
        }
    }

    class FrameException(message: String) : Exception(message)

    fun build(type: Int, to: ByteArray, from: ByteArray, counter: Long, body: ByteArray): ByteArray {
        require(to.size == ADDRESS_BYTES && from.size == ADDRESS_BYTES) { "an address is exactly 16 bytes" }

        val buffer = ByteBuffer.allocate(HEADER_BYTES + body.size)
        buffer.put(WIRE_VERSION.toByte())
        buffer.put(type.toByte())
        buffer.put(to)
        buffer.put(from)
        buffer.putLong(counter)
        buffer.put(body)
        return buffer.array()
    }

    fun parse(raw: ByteArray, maxBytes: Int): Envelope {
        if (raw.size < HEADER_BYTES) throw FrameException("frame shorter than its header")
        if (raw.size > maxBytes) throw FrameException("frame over the size limit")

        val buffer = ByteBuffer.wrap(raw)
        val version = buffer.get().toInt() and 0xff
        if (version != WIRE_VERSION) throw FrameException("unknown wire version $version")

        val type = buffer.get().toInt() and 0xff
        if (type != TYPE_SEALED && type != TYPE_CONTROL && type != TYPE_PUSH) {
            throw FrameException("unknown frame type $type")
        }

        val to = ByteArray(ADDRESS_BYTES).also { buffer.get(it) }
        val from = ByteArray(ADDRESS_BYTES).also { buffer.get(it) }
        val counter = buffer.long
        val body = ByteArray(raw.size - HEADER_BYTES).also { buffer.get(it) }

        return Envelope(version, type, to, from, counter, body)
    }

    /**
     * An address as it travels in a URL: sixteen bytes as twenty-two characters. Random, and derived
     * from nothing about a person, a machine or a project - but stable, which is worth saying out loud
     * because it means the relay can link one agent's sessions over time.
     */
    fun encodeAddress(address: ByteArray): String =
        Base64.getUrlEncoder().withoutPadding().encodeToString(address)

    fun decodeAddress(text: String): ByteArray {
        val bytes = runCatching { Base64.getUrlDecoder().decode(text) }
            .getOrElse { throw FrameException("an address is not base64url") }

        if (bytes.size != ADDRESS_BYTES) throw FrameException("an address is exactly 16 bytes")
        return bytes
    }

    /** The first four bytes, for a log line - never the whole address, and never a body. */
    fun addressHint(address: ByteArray): String =
        address.take(4).joinToString("") { "%02x".format(it) }
}

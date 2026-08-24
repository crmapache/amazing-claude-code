package io.github.crmapache.amazingclaudecode.remote

import java.security.KeyPair
import java.security.PublicKey
import java.security.SecureRandom
import java.util.Base64
import javax.crypto.Mac
import javax.crypto.spec.SecretKeySpec

/**
 * Letting a phone in, once.
 *
 * The whole difficulty is that the two ends meet through a server neither of them trusts. A plain key
 * exchange over such a server is trivially defeated: the server hands each side its own key, reads
 * everything, and both ends see a working connection. The QR code is what closes that - it carries a
 * secret over a channel the relay is not on, namely your eyes, and both sides prove they saw it.
 *
 * What is derived is deliberately more than one key: a key per direction, a nonce prefix per direction,
 * and a long-lived one for reconnecting later without another QR code. Reusing a single key in both
 * directions is how a message sent to you gets replayed back at you and accepted.
 *
 * Ephemeral keys as well as the long-lived ones, so that recording today's traffic and stealing a key
 * next year does not open it: this connection's keys are gone the moment it ends.
 */
internal object Pairing {

    /** Sixteen bytes: enough that guessing it is out of the question, short enough to fit a QR code. */
    const val SECRET_BYTES = 16

    private const val MAC_ALGORITHM = "HmacSHA256"

    /**
     * What the IDE is offering right now. It lives in memory alone and is never written down: a secret
     * that only has to survive three minutes has no business being on a disk.
     */
    data class Offer(
        val secret: ByteArray,
        val expiresAt: Long,
        val attempts: Int = 0,
        val used: Boolean = false,
    ) {
        override fun equals(other: Any?): Boolean =
            this === other || (other is Offer && secret.contentEquals(other.secret) && expiresAt == other.expiresAt)

        override fun hashCode(): Int = secret.contentHashCode() * 31 + expiresAt.hashCode()
    }

    /** The keys one connection runs on, all of them derived from one exchange. */
    class Session(
        val toDevice: ByteArray,
        val toAgent: ByteArray,
        val noncePrefixToDevice: ByteArray,
        val noncePrefixToAgent: ByteArray,
        /** Long-lived: what lets the two reconnect later without another QR code. */
        val auth: ByteArray,
    )

    fun newSecret(): ByteArray = ByteArray(SECRET_BYTES).also { SecureRandom().nextBytes(it) }

    fun encodeSecret(secret: ByteArray): String =
        Base64.getUrlEncoder().withoutPadding().encodeToString(secret)

    fun decodeSecret(text: String): ByteArray? = runCatching {
        Base64.getUrlDecoder().decode(text).takeIf { it.size == SECRET_BYTES }
    }.getOrNull()

    /**
     * The address in the QR code.
     *
     * Everything that matters sits after the hash. That is not decoration: by the design of HTTP a
     * fragment is never sent to the server, so the pairing secret cannot reach the relay's logs or its
     * request handling even in principle. The phone reads it locally and clears it from its history at
     * once.
     *
     * The agent's key travels as a fingerprint rather than whole. The full key would make the code
     * noticeably denser and harder to scan off a monitor, and it adds nothing: the key itself arrives
     * over the relay, and the phone checks it against this.
     */
    fun offerUrl(relayUrl: String, agentId: String, secret: ByteArray, fingerprint: String): String {
        val host = relayUrl
            .replace("wss://", "https://")
            .replace("ws://", "http://")
            .trimEnd('/')

        return "$host/p#1.$agentId.${encodeSecret(secret)}.${fingerprint.replace(" ", "")}"
    }

    /**
     * What the phone proves it saw the QR code with.
     *
     * Both public keys are covered, which is the point: a relay that swapped one of them for its own
     * would have to produce this code without the secret, and it has never seen the secret.
     */
    fun deviceProof(
        secret: ByteArray,
        agentId: String,
        deviceStaticPub: String,
        deviceEphemeralPub: String,
        deviceId: String,
    ): ByteArray = mac(secret, "acc-pair-v1", agentId, deviceStaticPub, deviceEphemeralPub, deviceId)

    /**
     * And what the IDE answers with. The phone checks this one *and* the fingerprint from the QR code -
     * either alone closes the substitution, and both together cost a line each.
     */
    fun agentProof(
        secret: ByteArray,
        agentId: String,
        deviceId: String,
        agentStaticPub: String,
        agentEphemeralPub: String,
    ): ByteArray = mac(secret, "acc-pair-ack-v1", agentId, deviceId, agentStaticPub, agentEphemeralPub)

    /**
     * The keys both sides arrive at, from the same inputs in the same order.
     *
     * Two exchanges rather than one: the static pair proves who the parties are, the ephemeral pair
     * makes this connection's keys disposable. The QR secret goes in as well, so that a relay which
     * somehow held both private keys still could not derive these without having seen the code.
     */
    fun derive(
        staticSecret: ByteArray,
        ephemeralSecret: ByteArray,
        qrSecret: ByteArray,
        agentId: String,
        deviceId: String,
        agentEphemeralPub: String,
        deviceEphemeralPub: String,
    ): Session {
        val ikm = staticSecret + ephemeralSecret + qrSecret
        val salt = java.security.MessageDigest.getInstance("SHA-256")
            .digest("$agentId|$deviceId|$agentEphemeralPub|$deviceEphemeralPub".toByteArray())

        val prk = Hkdf.extract(salt, ikm)

        return Session(
            toDevice = Hkdf.expand(prk, "acc/v1/agent-to-device".toByteArray(), Sealing.KEY_BYTES),
            toAgent = Hkdf.expand(prk, "acc/v1/device-to-agent".toByteArray(), Sealing.KEY_BYTES),
            noncePrefixToDevice = Hkdf.expand(prk, "acc/v1/nonce-a2d".toByteArray(), Sealing.NONCE_PREFIX_BYTES),
            noncePrefixToAgent = Hkdf.expand(prk, "acc/v1/nonce-d2a".toByteArray(), Sealing.NONCE_PREFIX_BYTES),
            // From the static halves alone, so that it survives this connection and can prove who the
            // parties are on the next one - which is what saves a person from scanning a code again.
            auth = Hkdf.derive(ByteArray(0), staticSecret, "acc/v1/auth", Sealing.KEY_BYTES),
        )
    }

    /**
     * Reconnecting later: fresh ephemeral keys, vouched for by the long-lived key from pairing. No QR
     * code, and no long-lived key doing the encrypting either.
     */
    fun resume(
        auth: ByteArray,
        ephemeralSecret: ByteArray,
        agentId: String,
        deviceId: String,
        agentEphemeralPub: String,
        deviceEphemeralPub: String,
    ): Session {
        val salt = java.security.MessageDigest.getInstance("SHA-256")
            .digest("$agentId|$deviceId|$agentEphemeralPub|$deviceEphemeralPub".toByteArray())

        val prk = Hkdf.extract(salt, ephemeralSecret + auth)

        return Session(
            toDevice = Hkdf.expand(prk, "acc/v1/agent-to-device".toByteArray(), Sealing.KEY_BYTES),
            toAgent = Hkdf.expand(prk, "acc/v1/device-to-agent".toByteArray(), Sealing.KEY_BYTES),
            noncePrefixToDevice = Hkdf.expand(prk, "acc/v1/nonce-a2d".toByteArray(), Sealing.NONCE_PREFIX_BYTES),
            noncePrefixToAgent = Hkdf.expand(prk, "acc/v1/nonce-d2a".toByteArray(), Sealing.NONCE_PREFIX_BYTES),
            auth = auth,
        )
    }

    fun fingerprintOf(pair: KeyPair): String = Sealing.fingerprint(pair.public.encoded)

    fun fingerprintOf(key: PublicKey): String = Sealing.fingerprint(key.encoded)

    private fun mac(secret: ByteArray, vararg parts: String): ByteArray {
        val mac = Mac.getInstance(MAC_ALGORITHM)
        mac.init(SecretKeySpec(secret, MAC_ALGORITHM))
        // Separated rather than run together: without it, two different sets of fields could produce
        // one and the same input, which is the oldest way to make a signature mean less than it looks.
        for (part in parts) {
            mac.update(part.toByteArray())
            mac.update(0)
        }
        return mac.doFinal()
    }

    /** How long a code is worth anything. Long enough to find the phone, short enough to be forgotten. */
    const val OFFER_LIFETIME_MS = 3 * 60 * 1000L

    /**
     * How many wrong answers a code survives.
     *
     * A wrong one does not burn it - noise on a public relay should not cost a person their pairing -
     * but a run of them does: sixteen bytes cannot be guessed, and something trying is not noise.
     */
    const val MAX_ATTEMPTS = 5
}

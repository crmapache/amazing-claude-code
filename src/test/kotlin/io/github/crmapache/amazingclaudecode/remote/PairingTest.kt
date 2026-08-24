package io.github.crmapache.amazingclaudecode.remote

import kotlin.test.Test
import kotlin.test.assertContains
import kotlin.test.assertEquals
import kotlin.test.assertFalse
import kotlin.test.assertNotEquals
import kotlin.test.assertNull
import kotlin.test.assertTrue

/**
 * Pairing is where the whole arrangement is either safe or theatre.
 *
 * The two ends meet through a server neither trusts, so a plain key exchange over it is defeated by
 * that server handing each side its own key and reading everything - with both ends showing a working
 * connection. What stops it is the QR code: a secret carried over a channel the relay is not on, which
 * both sides then prove they saw.
 *
 * The test that matters most here is the substitution one: it is the claim the entire feature rests on,
 * and the one nobody can check by looking at a screen.
 */
class PairingTest {

    private val agentId = "agent-address-22chars"
    private val deviceId = "device-1"

    /**
     * A whole pairing, both sides, as it genuinely happens: two static pairs, two ephemeral ones, and a
     * secret that only travelled through the QR code.
     */
    private fun pair(
        qrSecret: ByteArray = Pairing.newSecret(),
        agentStatic: java.security.KeyPair = RemoteKeys.generate(),
        deviceStatic: java.security.KeyPair = RemoteKeys.generate(),
    ): Pair<Pairing.Session, Pairing.Session> {
        val agentEphemeral = RemoteKeys.generate()
        val deviceEphemeral = RemoteKeys.generate()

        val agentEphemeralPub = RemoteKeys.encodePublic(agentEphemeral.public)
        val deviceEphemeralPub = RemoteKeys.encodePublic(deviceEphemeral.public)

        val onAgent = Pairing.derive(
            staticSecret = RemoteKeys.agree(agentStatic.private, deviceStatic.public),
            ephemeralSecret = RemoteKeys.agree(agentEphemeral.private, deviceEphemeral.public),
            qrSecret = qrSecret,
            agentId = agentId,
            deviceId = deviceId,
            agentEphemeralPub = agentEphemeralPub,
            deviceEphemeralPub = deviceEphemeralPub,
        )

        val onDevice = Pairing.derive(
            staticSecret = RemoteKeys.agree(deviceStatic.private, agentStatic.public),
            ephemeralSecret = RemoteKeys.agree(deviceEphemeral.private, agentEphemeral.public),
            qrSecret = qrSecret,
            agentId = agentId,
            deviceId = deviceId,
            agentEphemeralPub = agentEphemeralPub,
            deviceEphemeralPub = deviceEphemeralPub,
        )

        return onAgent to onDevice
    }

    /**
     * The one thing that has to hold: both ends compute the same keys from their own halves, without
     * either key ever travelling.
     */
    @Test
    fun `both ends arrive at the same keys`() {
        val (onAgent, onDevice) = pair()

        assertTrue(onAgent.toDevice.contentEquals(onDevice.toDevice))
        assertTrue(onAgent.toAgent.contentEquals(onDevice.toAgent))
        assertTrue(onAgent.auth.contentEquals(onDevice.auth))
    }

    /** And what they arrive at is genuinely usable in both directions. */
    @Test
    fun `a message sealed by one end opens at the other`() {
        val (onAgent, onDevice) = pair()
        val header = ByteArray(Frame.HEADER_BYTES) { 3 }

        val sealed = Sealing.seal(onAgent.toDevice, onAgent.noncePrefixToDevice, 1, header, "hello".toByteArray())
        val opened = Sealing.open(onDevice.toDevice, onDevice.noncePrefixToDevice, 1, header, sealed)

        assertEquals("hello", String(opened!!))
    }

    /**
     * A key used in both directions is how a message sent to you is replayed back at you and accepted
     * as your own.
     */
    @Test
    fun `the two directions do not share a key`() {
        val (onAgent, _) = pair()

        assertFalse(onAgent.toDevice.contentEquals(onAgent.toAgent))
        assertFalse(onAgent.noncePrefixToDevice.contentEquals(onAgent.noncePrefixToAgent))
    }

    /**
     * **The claim the feature rests on.** A relay that swaps a public key for one of its own sits in
     * the middle and reads everything - unless the two ends derive different keys when it does, which
     * is what the QR secret buys.
     */
    @Test
    fun `a relay that swapped a key cannot listen in`() {
        val qrSecret = Pairing.newSecret()
        val agentStatic = RemoteKeys.generate()
        val deviceStatic = RemoteKeys.generate()
        val relayStatic = RemoteKeys.generate()

        val agentEphemeral = RemoteKeys.generate()
        val deviceEphemeral = RemoteKeys.generate()

        // What the device would compute, believing the relay's key to be the agent's.
        val fooled = Pairing.derive(
            staticSecret = RemoteKeys.agree(deviceStatic.private, relayStatic.public),
            ephemeralSecret = RemoteKeys.agree(deviceEphemeral.private, agentEphemeral.public),
            qrSecret = qrSecret,
            agentId = agentId,
            deviceId = deviceId,
            agentEphemeralPub = RemoteKeys.encodePublic(agentEphemeral.public),
            deviceEphemeralPub = RemoteKeys.encodePublic(deviceEphemeral.public),
        )

        val real = Pairing.derive(
            staticSecret = RemoteKeys.agree(agentStatic.private, deviceStatic.public),
            ephemeralSecret = RemoteKeys.agree(agentEphemeral.private, deviceEphemeral.public),
            qrSecret = qrSecret,
            agentId = agentId,
            deviceId = deviceId,
            agentEphemeralPub = RemoteKeys.encodePublic(agentEphemeral.public),
            deviceEphemeralPub = RemoteKeys.encodePublic(deviceEphemeral.public),
        )

        assertFalse(fooled.toDevice.contentEquals(real.toDevice))
    }

    /** And the proof is what makes that swap visible rather than merely useless. */
    @Test
    fun `a proof made without the code does not check out`() {
        val secret = Pairing.newSecret()
        val wrong = Pairing.newSecret()

        val honest = Pairing.deviceProof(secret, agentId, "static", "ephemeral", deviceId)
        val forged = Pairing.deviceProof(wrong, agentId, "static", "ephemeral", deviceId)

        assertFalse(Sealing.sameBytes(honest, forged))
    }

    @Test
    fun `a proof covers every field it names`() {
        val secret = Pairing.newSecret()
        val base = Pairing.deviceProof(secret, agentId, "static", "ephemeral", deviceId)

        assertFalse(Sealing.sameBytes(base, Pairing.deviceProof(secret, "other", "static", "ephemeral", deviceId)))
        assertFalse(Sealing.sameBytes(base, Pairing.deviceProof(secret, agentId, "other", "ephemeral", deviceId)))
        assertFalse(Sealing.sameBytes(base, Pairing.deviceProof(secret, agentId, "static", "other", deviceId)))
        assertFalse(Sealing.sameBytes(base, Pairing.deviceProof(secret, agentId, "static", "ephemeral", "other")))
    }

    /**
     * Without separators, two different sets of fields can run together into one and the same input -
     * the oldest way to make a signature mean less than it appears to.
     */
    @Test
    fun `fields that run together are still told apart`() {
        val secret = Pairing.newSecret()

        assertFalse(
            Sealing.sameBytes(
                Pairing.deviceProof(secret, "ab", "cd", "ef", "gh"),
                Pairing.deviceProof(secret, "a", "bcd", "ef", "gh"),
            ),
        )
    }

    @Test
    fun `each side's proof is a different one`() {
        val secret = Pairing.newSecret()

        assertFalse(
            Sealing.sameBytes(
                Pairing.deviceProof(secret, agentId, "s", "e", deviceId),
                Pairing.agentProof(secret, agentId, deviceId, "s", "e"),
            ),
        )
    }

    /**
     * The secret sits after the hash, where by the design of HTTP it is never sent to a server - so it
     * cannot reach the relay's logs even in principle.
     */
    @Test
    fun `the pairing address keeps its secret out of the request`() {
        val secret = Pairing.newSecret()
        val url = Pairing.offerUrl("wss://relay.example.com", agentId, secret, "A1B2 C3D4 E5F6 0718")

        val beforeHash = url.substringBefore('#')
        assertFalse(beforeHash.contains(Pairing.encodeSecret(secret)))
        assertContains(url.substringAfter('#'), Pairing.encodeSecret(secret))
        assertTrue(url.startsWith("https://"))
    }

    @Test
    fun `a fresh secret is never the previous one`() {
        assertNotEquals(
            Pairing.encodeSecret(Pairing.newSecret()),
            Pairing.encodeSecret(Pairing.newSecret()),
        )
    }

    @Test
    fun `something that is not a secret is refused`() {
        assertNull(Pairing.decodeSecret("short"))
        assertNull(Pairing.decodeSecret("!!!"))
        assertEquals(Pairing.SECRET_BYTES, Pairing.decodeSecret(Pairing.encodeSecret(Pairing.newSecret()))?.size)
    }

    /**
     * Reconnecting has to work without a QR code and has to produce fresh keys anyway: recording
     * today's traffic and stealing a key next year should still open nothing.
     */
    @Test
    fun `reconnecting derives new keys from the long-lived one`() {
        val (onAgent, onDevice) = pair()

        val agentEphemeral = RemoteKeys.generate()
        val deviceEphemeral = RemoteKeys.generate()
        val agentPub = RemoteKeys.encodePublic(agentEphemeral.public)
        val devicePub = RemoteKeys.encodePublic(deviceEphemeral.public)

        val resumedOnAgent = Pairing.resume(
            onAgent.auth,
            RemoteKeys.agree(agentEphemeral.private, deviceEphemeral.public),
            agentId, deviceId, agentPub, devicePub,
        )
        val resumedOnDevice = Pairing.resume(
            onDevice.auth,
            RemoteKeys.agree(deviceEphemeral.private, agentEphemeral.public),
            agentId, deviceId, agentPub, devicePub,
        )

        assertTrue(resumedOnAgent.toDevice.contentEquals(resumedOnDevice.toDevice))
        // Fresh, not the ones from pairing.
        assertFalse(resumedOnAgent.toDevice.contentEquals(onAgent.toDevice))
    }

    @Test
    fun `a device with the wrong long-lived key cannot resume`() {
        val (onAgent, _) = pair()
        val (other, _) = pair()

        val agentEphemeral = RemoteKeys.generate()
        val deviceEphemeral = RemoteKeys.generate()
        val shared = RemoteKeys.agree(agentEphemeral.private, deviceEphemeral.public)
        val agentPub = RemoteKeys.encodePublic(agentEphemeral.public)
        val devicePub = RemoteKeys.encodePublic(deviceEphemeral.public)

        val honest = Pairing.resume(onAgent.auth, shared, agentId, deviceId, agentPub, devicePub)
        val impostor = Pairing.resume(other.auth, shared, agentId, deviceId, agentPub, devicePub)

        assertFalse(honest.toDevice.contentEquals(impostor.toDevice))
    }
}

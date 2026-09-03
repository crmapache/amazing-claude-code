package io.github.crmapache.amazingclaudecode.remote

import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertFalse
import kotlin.test.assertNotNull
import kotlin.test.assertNull
import kotlin.test.assertTrue

/**
 * The sealed channel as it is actually used: a frame is built, sent, and opened at the other end - with
 * counters handed out by the sender and checked by the receiver.
 *
 * Both ends are simulated here with two DeviceSessions holding mirrored keys, which is what a real
 * pairing produces (see PairingTest).
 */
class DeviceSessionsTest {

    private val agent = ByteArray(Frame.ADDRESS_BYTES) { 0xa1.toByte() }
    private val device = ByteArray(Frame.ADDRESS_BYTES) { 0xd1.toByte() }

    /** The body, or null for either of the two ways a frame can fail to become one. */
    private fun DeviceSessions.body(deviceId: String, envelope: Frame.Envelope): ByteArray? =
        (open(deviceId, envelope) as? DeviceSessions.Opened.Body)?.bytes

    /**
     * The device's view of the same session: what one end seals to the other, the other opens - so its
     * "to device" key is the one it reads with.
     */
    private fun mirror(session: Pairing.Session) = Pairing.Session(
        toDevice = session.toAgent,
        toAgent = session.toDevice,
        noncePrefixToDevice = session.noncePrefixToAgent,
        noncePrefixToAgent = session.noncePrefixToDevice,
        auth = session.auth,
    )

    private fun session(seed: Byte = 1) = Pairing.Session(
        toDevice = ByteArray(Sealing.KEY_BYTES) { seed },
        toAgent = ByteArray(Sealing.KEY_BYTES) { (seed + 1).toByte() },
        noncePrefixToDevice = byteArrayOf(1, 1, 1, seed),
        noncePrefixToAgent = byteArrayOf(2, 2, 2, seed),
        auth = ByteArray(Sealing.KEY_BYTES) { 9 },
    )

    @Test
    fun `a body sealed for a device opens at that device`() {
        val onAgent = DeviceSessions()
        val onDevice = DeviceSessions()
        onAgent.open("phone", session())
        onDevice.open("agent", mirror(session()))

        val frame = onAgent.seal("phone", device, agent, "the feed".toByteArray())!!
        val opened = onDevice.body("agent", Frame.parse(frame, 4096))

        assertEquals("the feed", String(opened!!))
    }

    @Test
    fun `nothing is sealed for a device that is not paired`() {
        assertNull(DeviceSessions().seal("stranger", device, agent, "hello".toByteArray()))
    }

    /**
     * A revocation is exactly this and nothing more: the record goes, and from that moment the device's
     * frames do not open. Nothing has to reach the phone, which is why it works while the phone is off.
     */
    @Test
    fun `a revoked device's frames stop opening at once`() {
        val onAgent = DeviceSessions()
        val onDevice = DeviceSessions()
        onAgent.open("phone", session())
        onDevice.open("agent", mirror(session()))

        val frame = onDevice.seal("agent", agent, device, "a command".toByteArray())!!
        onAgent.close("phone")

        assertNull(onAgent.body("phone", Frame.parse(frame, 4096)))
    }

    /**
     * The counter must never repeat under one key: two frames sharing a nonce is not a weakness in GCM
     * but a break. Handing it out here rather than at the call site is what guarantees it.
     */
    @Test
    fun `every frame takes the next counter`() {
        val sessions = DeviceSessions()
        sessions.open("phone", session())

        val counters = (1..5).map { Frame.parse(sessions.seal("phone", device, agent, "x".toByteArray())!!, 4096).counter }

        assertEquals(listOf(1L, 2L, 3L, 4L, 5L), counters)
    }

    /**
     * A replayed "allow this tool call" would grant a permission a second time at a moment nobody
     * chose. The tag does not stop that - only the window does.
     */
    @Test
    fun `a frame sent twice is opened once`() {
        val onAgent = DeviceSessions()
        val onDevice = DeviceSessions()
        onAgent.open("phone", session())
        onDevice.open("agent", mirror(session()))

        val frame = onDevice.seal("agent", agent, device, "allow it".toByteArray())!!
        val envelope = Frame.parse(frame, 4096)

        assertNotNull(onAgent.body("phone", envelope))
        assertEquals(DeviceSessions.Opened.Replayed, onAgent.open("phone", envelope))
    }

    @Test
    fun `a frame altered on the way does not open`() {
        val onAgent = DeviceSessions()
        val onDevice = DeviceSessions()
        onAgent.open("phone", session())
        onDevice.open("agent", mirror(session()))

        val frame = onDevice.seal("agent", agent, device, "a command".toByteArray())!!
        frame[frame.size - 1] = (frame[frame.size - 1] + 1).toByte()

        assertNull(onAgent.body("phone", Frame.parse(frame, 4096)))
    }

    /**
     * The header is covered by the tag, so a relay cannot take a frame meant for one device and hand it
     * to another.
     */
    @Test
    fun `a frame re-addressed on the way does not open`() {
        val onAgent = DeviceSessions()
        val onDevice = DeviceSessions()
        onAgent.open("phone", session())
        onDevice.open("agent", mirror(session()))

        val frame = onDevice.seal("agent", agent, device, "a command".toByteArray())!!
        val envelope = Frame.parse(frame, 4096)
        val readdressed = Frame.Envelope(
            envelope.version,
            envelope.type,
            to = ByteArray(Frame.ADDRESS_BYTES) { 0x77 },
            from = envelope.from,
            counter = envelope.counter,
            body = envelope.body,
        )

        assertNull(onAgent.body("phone", readdressed))
    }

    /**
     * The kind of frame is covered too, and it is an instruction to whoever carries it: an envelope
     * relabelled "wake this phone" would be handed to a push service instead of to a socket.
     */
    @Test
    fun `a frame relabelled on the way does not open`() {
        val onAgent = DeviceSessions()
        val onDevice = DeviceSessions()
        onAgent.open("phone", session())
        onDevice.open("agent", mirror(session()))

        val frame = onDevice.seal("agent", agent, device, "a command".toByteArray())!!
        val envelope = Frame.parse(frame, 4096)
        val relabelled = Frame.Envelope(
            envelope.version,
            type = Frame.TYPE_PUSH,
            to = envelope.to,
            from = envelope.from,
            counter = envelope.counter,
            body = envelope.body,
        )

        assertNull(onAgent.body("phone", relabelled))
    }

    @Test
    fun `a push sealed as a push opens as one`() {
        val onAgent = DeviceSessions()
        val onDevice = DeviceSessions()
        onAgent.open("phone", session())
        onDevice.open("agent", mirror(session()))

        val frame = onAgent.seal("phone", device, agent, "wake up".toByteArray(), type = Frame.TYPE_PUSH)!!

        assertEquals(Frame.TYPE_PUSH, Frame.parse(frame, 4096).type)
        assertEquals("wake up", String(onDevice.body("agent", Frame.parse(frame, 4096))!!))
    }

    @Test
    fun `another device's keys open nothing`() {
        val onAgent = DeviceSessions()
        val stranger = DeviceSessions()
        onAgent.open("phone", session(seed = 1))
        stranger.open("agent", mirror(session(seed = 40)))

        val frame = stranger.seal("agent", agent, device, "a command".toByteArray())!!

        assertNull(onAgent.body("phone", Frame.parse(frame, 4096)))
    }

    /**
     * The counter is a plaintext field, so whoever carries the frame writes it. Moving the window on
     * one that never proved itself is how a made-up number pins the window at its maximum and every
     * real frame afterwards falls off the bottom of it - the channel going deaf, in silence.
     */
    @Test
    fun `a counter nobody proved does not move the window`() {
        val onAgent = DeviceSessions()
        val onDevice = DeviceSessions()
        onAgent.open("phone", session())
        onDevice.open("agent", mirror(session()))

        val forged = Frame.Envelope(
            Frame.WIRE_VERSION,
            Frame.TYPE_SEALED,
            to = agent,
            from = device,
            counter = Long.MAX_VALUE,
            body = ByteArray(64) { 0x33 },
        )

        assertEquals(DeviceSessions.Opened.Unreadable, onAgent.open("phone", forged))

        val real = onDevice.seal("agent", agent, device, "still here".toByteArray())!!

        assertEquals("still here", String(onAgent.body("phone", Frame.parse(real, 4096))!!))
    }

    /**
     * Anyone carrying frames can say "it is me, I have lost my keys" - the handshake that says it
     * travels in the open. So new keys wait beside the ones in use, and what promotes them is the one
     * thing only the device can produce: a frame sealed under them.
     */
    @Test
    fun `keys offered while others are in use wait to be proved`() {
        val onAgent = DeviceSessions()
        val onDevice = DeviceSessions()
        onAgent.open("phone", session(seed = 1))
        onDevice.open("agent", mirror(session(seed = 1)))

        onAgent.offer("phone", session(seed = 60))

        // The device still holds the older keys, and they still work: nothing it sends is lost while
        // somebody else's offer sits waiting.
        val old = onDevice.seal("agent", agent, device, "from the old keys".toByteArray())!!
        assertEquals("from the old keys", String(onAgent.body("phone", Frame.parse(old, 4096))!!))

        // And when the device does prove the new ones, they take over.
        val proving = DeviceSessions()
        proving.open("agent", mirror(session(seed = 60)))
        val fresh = proving.seal("agent", agent, device, "from the new keys".toByteArray())!!
        assertEquals("from the new keys", String(onAgent.body("phone", Frame.parse(fresh, 4096))!!))

        val stale = onDevice.seal("agent", agent, device, "too late".toByteArray())!!
        assertNull(onAgent.body("phone", Frame.parse(stale, 4096)))
    }

    /** With nothing in use there is nothing to protect, so an offer is simply taken. */
    @Test
    fun `keys offered to a device that has none are taken at once`() {
        val sessions = DeviceSessions()
        sessions.offer("phone", session())

        assertTrue(sessions.isOpen("phone"))
    }

    @Test
    fun `a closed device is no longer listed`() {
        val sessions = DeviceSessions()
        sessions.open("phone", session())

        assertTrue(sessions.isOpen("phone"))
        sessions.close("phone")
        assertFalse(sessions.isOpen("phone"))
        assertEquals(emptySet(), sessions.openDevices())
    }
}

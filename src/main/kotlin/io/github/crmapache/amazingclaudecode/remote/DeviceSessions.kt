package io.github.crmapache.amazingclaudecode.remote

import com.intellij.openapi.diagnostic.thisLogger
import java.util.concurrent.ConcurrentHashMap
import java.util.concurrent.atomic.AtomicLong

/**
 * The live cryptographic state for each paired device: which keys this connection runs on, what the
 * next counter is, and what has already been seen.
 *
 * Kept in memory and nowhere else, on purpose. The counters must never repeat under a key, and the
 * cheapest way to guarantee that is for the keys not to outlive the process: every connection derives
 * fresh ones from fresh ephemeral material, so a restarted IDE cannot resurrect an old counter under
 * an old key. Persisting them would buy nothing and put the one rule this scheme dies of at the mercy
 * of a file write.
 *
 * What does persist is the long-lived key from pairing (in the keychain, see RemoteKeys) - and it is
 * used only to prove who the parties are, never to encrypt anything.
 */
internal class DeviceSessions {

    private class Live(
        val session: Pairing.Session,
        val outgoing: AtomicLong = AtomicLong(0),
        val replay: ReplayWindow = ReplayWindow(),
    )

    /** What opening a frame came to. Three outcomes rather than a body or null - see [open]. */
    sealed interface Opened {
        class Body(val bytes: ByteArray) : Opened

        /** Seen before. Ordinary after a reconnect: the relay hands over what it buffered. */
        data object Replayed : Opened

        /** Not from this device, or altered on the way, or sealed with keys this side has let go. */
        data object Unreadable : Opened
    }

    private val devices = ConcurrentHashMap<String, Live>()

    /**
     * Keys offered by somebody claiming to be a device that already has some.
     *
     * The handshake that offers them travels in the open - it has to, since it is what establishes a
     * key - so anyone carrying frames can send one, and replacing the live keys on the strength of it
     * would leave the real device talking into a channel the agent no longer listens on. Nobody but
     * the device can prove otherwise: the keys are derived from the secret it got at pairing, so a
     * frame that opens under them is the proof, and until one arrives the old keys go on working.
     */
    private val offered = ConcurrentHashMap<String, Live>()

    fun open(deviceId: String, session: Pairing.Session) {
        devices[deviceId] = Live(session)
        offered.remove(deviceId)
    }

    /**
     * Take new keys without letting go of the ones in use.
     *
     * With nothing in use there is nothing to protect, and the keys are simply taken: that is the
     * ordinary reconnect, and making it wait for a frame that cannot be sealed yet would deadlock it.
     */
    fun offer(deviceId: String, session: Pairing.Session) {
        if (devices.containsKey(deviceId)) offered[deviceId] = Live(session)
        else devices[deviceId] = Live(session)
    }

    fun close(deviceId: String) {
        devices.remove(deviceId)
        offered.remove(deviceId)
    }

    fun isOpen(deviceId: String): Boolean = devices.containsKey(deviceId)

    fun openDevices(): Set<String> = devices.keys.toSet()

    /**
     * Seal a body for a device, and take the next counter for it.
     *
     * The counter is handed out here rather than by the caller because it must be strictly increasing
     * per key, and a caller that took its own would eventually hand two frames the same one - which in
     * GCM is not a weakness but a break.
     */
    fun seal(
        deviceId: String,
        to: ByteArray,
        from: ByteArray,
        body: ByteArray,
        /** What this frame is: an envelope between the two, or one to be handed to a push service. */
        type: Int = Frame.TYPE_SEALED,
    ): ByteArray? {
        val live = devices[deviceId] ?: return null
        val counter = live.outgoing.incrementAndGet()

        // The header is built first because it is what the tag covers: a frame cannot then be
        // re-addressed to another device by whoever forwards it - nor re-labelled as another kind of
        // frame, which is why the real type goes in rather than a constant.
        val header = Frame.build(type, to, from, counter, ByteArray(0))
        val sealed = Sealing.seal(live.session.toDevice, live.session.noncePrefixToDevice, counter, header, body)

        return Frame.build(type, to, from, counter, sealed)
    }

    /**
     * Open a frame from a device, or refuse it.
     *
     * The tag is checked before the replay window is touched, and the order is the whole point. The
     * counter is a plaintext field that whoever carries the frame can write, and nothing binds it to
     * the window: moving the window first meant a made-up counter pinned it at its maximum, and every
     * real frame afterwards fell off the bottom of it and was dropped in silence. Now a frame has to
     * prove it came from this device before it is allowed to say anything about what has been seen.
     *
     * Replayed is kept apart from Unreadable because the two mean opposite things to the caller: a
     * repeat is ordinary after a reconnect - the relay hands over what it buffered - while a frame
     * that will not open at all is a sign the two halves are holding different keys.
     */
    fun open(deviceId: String, envelope: Frame.Envelope): Opened {
        val live = devices[deviceId] ?: return Opened.Unreadable

        // Cheap, and ahead of the decrypt because no negative counter can carry a tag this side would
        // accept: the nonce is built from the same number.
        if (envelope.counter < 0) return Opened.Unreadable

        opened(live, envelope)?.let { body ->
            return if (live.replay.accept(envelope.counter)) Opened.Body(body) else {
                thisLogger().info("A frame arrived twice from $deviceId - dropped")
                Opened.Replayed
            }
        }

        // Keys this device offered while these were still in use, and this is the frame that proves
        // they are its own: nobody else can seal under them. The old ones go now rather than when they
        // were offered - see [offer].
        val waiting = offered[deviceId] ?: return Opened.Unreadable
        val body = opened(waiting, envelope) ?: return Opened.Unreadable

        if (!waiting.replay.accept(envelope.counter)) return Opened.Replayed

        devices[deviceId] = waiting
        offered.remove(deviceId)
        thisLogger().info("A device proved the keys it offered - the older ones are let go")

        return Opened.Body(body)
    }

    private fun opened(live: Live, envelope: Frame.Envelope): ByteArray? {
        // Built from this frame's own header, type included: a frame relabelled on the way - an
        // envelope turned into "wake this phone", or the other way about - no longer matches its tag.
        val header = Frame.build(envelope.type, envelope.to, envelope.from, envelope.counter, ByteArray(0))

        return Sealing.open(
            live.session.toAgent,
            live.session.noncePrefixToAgent,
            envelope.counter,
            header,
            envelope.body,
        )
    }
}

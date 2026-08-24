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

    private val devices = ConcurrentHashMap<String, Live>()

    fun open(deviceId: String, session: Pairing.Session) {
        devices[deviceId] = Live(session)
    }

    fun close(deviceId: String) {
        devices.remove(deviceId)
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
    fun seal(deviceId: String, to: ByteArray, from: ByteArray, body: ByteArray): ByteArray? {
        val live = devices[deviceId] ?: return null
        val counter = live.outgoing.incrementAndGet()

        // The header is built first because it is what the tag covers: a frame cannot then be
        // re-addressed to another device by whoever forwards it.
        val header = Frame.build(Frame.TYPE_SEALED, to, from, counter, ByteArray(0))
        val sealed = Sealing.seal(live.session.toDevice, live.session.noncePrefixToDevice, counter, header, body)

        return Frame.build(Frame.TYPE_SEALED, to, from, counter, sealed)
    }

    /**
     * Open a frame from a device, or refuse it.
     *
     * Null covers three cases that all end the same way - the frame is dropped and nothing is answered:
     * the device is not paired (or has been revoked), the frame was altered on the way, or it has been
     * seen before. Only the last one deserves a word: a replayed "allow this tool call" would grant a
     * permission a second time at a moment nobody chose, and the tag alone does not stop it.
     */
    fun open(deviceId: String, envelope: Frame.Envelope): ByteArray? {
        val live = devices[deviceId] ?: return null

        if (!live.replay.accept(envelope.counter)) {
            thisLogger().info("A frame arrived twice from $deviceId - dropped")
            return null
        }

        val header = Frame.build(Frame.TYPE_SEALED, envelope.to, envelope.from, envelope.counter, ByteArray(0))

        return Sealing.open(
            live.session.toAgent,
            live.session.noncePrefixToAgent,
            envelope.counter,
            header,
            envelope.body,
        )
    }
}

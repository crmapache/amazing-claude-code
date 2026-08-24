package io.github.crmapache.amazingclaudecode.remote

import com.intellij.openapi.components.PersistentStateComponent
import com.intellij.openapi.components.RoamingType
import com.intellij.openapi.components.Service
import com.intellij.openapi.components.State
import com.intellij.openapi.components.Storage
import com.intellij.openapi.components.service
import com.intellij.util.xmlb.XmlSerializerUtil
import java.security.SecureRandom

/**
 * Who this agent is, and which devices have been let in.
 *
 * The first component of its kind in this plugin - everything else lives in PropertiesComponent, which
 * is right for a scalar and wrong for a list of records with five fields each. Squeezing a device
 * registry into comma-separated strings would be a hack with a paragraph of explanation attached.
 *
 * Roaming is off, deliberately and permanently. A pairing says "this phone may talk to this machine";
 * carrying it to another machine through settings sync would either be meaningless or - if the keys
 * went with it - a way to hand someone else's laptop the keys to your work machine.
 *
 * The keys themselves are not here: they belong in the system keychain (see phase 3). What is here is
 * the open part - who, when, and what their fingerprint is - so the panel can list them without
 * touching a secret store on every repaint.
 */
@Service(Service.Level.APP)
@State(
    name = "AmazingClaudeCodeRemote",
    storages = [Storage("amazing-claude-code.xml", roamingType = RoamingType.DISABLED)],
)
internal class RemoteState : PersistentStateComponent<RemoteState.Data> {

    class Data {
        /**
         * This installation's own address, as the relay sees it: 22 characters of base64url over 16
         * random bytes. Random and derived from nothing about the machine - but stable, which is what
         * lets a phone find this IDE again tomorrow, and also what lets a relay link its sessions over
         * time. That second half is worth saying out loud rather than discovering.
         */
        var agentId: String = ""

        /** A name for the person's own list of devices, so an IDE is not just an id. */
        var label: String = ""

        var devices: MutableList<Device> = mutableListOf()
    }

    class Device {
        var id: String = ""

        /** What the device called itself. Untrusted by definition - it is the device that says it. */
        var label: String = ""

        /** SHA-256 of its public key, shortened - shown on both screens so a person can compare them. */
        var fingerprint: String = ""

        var pairedAt: Long = 0

        var lastSeenAt: Long = 0
    }

    private var data = Data()

    override fun getState(): Data = data

    override fun loadState(state: Data) {
        XmlSerializerUtil.copyBean(state, data)
    }

    /**
     * This installation's address, made on first use.
     *
     * Made per configuration directory rather than per machine, which matters more than it looks: the
     * keychain is shared across every JetBrains IDE on a machine, while this file is not. Two products
     * sharing one address would fight over the single connection the relay allows per address, each
     * displacing the other in turn.
     */
    fun agentId(): String {
        if (data.agentId.isEmpty()) {
            val bytes = ByteArray(Frame.ADDRESS_BYTES)
            SecureRandom().nextBytes(bytes)
            data.agentId = Frame.encodeAddress(bytes)
        }

        return data.agentId
    }

    fun address(): ByteArray = Frame.decodeAddress(agentId())

    fun devices(): List<Device> = data.devices.toList()

    fun remember(device: Device) {
        data.devices.removeIf { it.id == device.id }
        data.devices.add(device)
    }

    /**
     * Forget a device.
     *
     * This is the whole of a revocation on this side, and it is worth understanding why that is
     * enough: with the record gone, frames from that device no longer decrypt and are dropped. No
     * message needs to reach the phone and the relay needs to be told nothing - so it works while the
     * phone is switched off, which is exactly when it is most likely to be wanted.
     */
    fun forget(deviceId: String): Boolean = data.devices.removeIf { it.id == deviceId }

    fun forgetAll() {
        data.devices.clear()
    }

    /** A fresh identity: every device falls away with it, because none of them knows the new one. */
    fun resetIdentity() {
        data.agentId = ""
        data.devices.clear()
    }

    companion object {
        fun getInstance(): RemoteState = service()
    }
}

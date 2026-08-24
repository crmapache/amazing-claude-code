package io.github.crmapache.amazingclaudecode.remote

import com.intellij.credentialStore.CredentialAttributes
import com.intellij.credentialStore.Credentials
import com.intellij.credentialStore.generateServiceName
import com.intellij.ide.passwordSafe.PasswordSafe
import com.intellij.openapi.diagnostic.thisLogger
import java.security.KeyFactory
import java.security.KeyPair
import java.security.KeyPairGenerator
import java.security.PrivateKey
import java.security.PublicKey
import java.security.spec.ECGenParameterSpec
import java.security.spec.PKCS8EncodedKeySpec
import java.security.spec.X509EncodedKeySpec
import java.util.Base64
import javax.crypto.KeyAgreement

/**
 * This IDE's own key pair, and the shared secrets it has with paired devices.
 *
 * The curve is P-256 rather than the newer X25519, and the reason is the other end: a browser's
 * WebCrypto has had P-256 since forever and X25519 only recently, so a phone a couple of versions
 * behind would simply have no way to pair. The security difference between them is not what decides
 * this; being able to pair at all is.
 *
 * The private half lives in the IDE's password safe, which is the system keychain rather than a file
 * in a config directory. Two things follow from that and both matter:
 *
 * - reading it can block on the system keychain, so it never happens on the interface thread;
 * - the safe can be configured to keep nothing between restarts, and then the keys quietly vanish
 *   every time. Rather than leave a person pairing their phone forever without knowing why, that case
 *   is detected outright (see [usable]).
 *
 * The record is named after the agent id rather than the plugin, because the keychain is shared across
 * every JetBrains IDE on the machine while the id is per configuration directory. Under one name, two
 * products would share a key and not share a device registry, which ends with them displacing each
 * other on the relay forever.
 */
internal object RemoteKeys {

    private const val CURVE = "secp256r1"

    private const val SERVICE = "Amazing Claude Code"

    fun generate(): KeyPair {
        val generator = KeyPairGenerator.getInstance("EC")
        generator.initialize(ECGenParameterSpec(CURVE))
        return generator.generateKeyPair()
    }

    /**
     * The agent's long-lived pair, made on first use and kept from then on.
     *
     * Long-lived deliberately: rotating it on a schedule would mean re-scanning a QR code on every
     * paired phone for no event that warranted it. It changes when a person asks for it to change, and
     * then every device falls away with it - which is what "reset this agent's identity" means.
     */
    fun identity(agentId: String): KeyPair? {
        val attributes = attributesFor("remote-agent-$agentId", "identity")
        val stored = PasswordSafe.instance.get(attributes)?.getPasswordAsString()

        if (!stored.isNullOrEmpty()) {
            val restored = runCatching { restore(stored) }.getOrNull()
            if (restored != null) return restored
            thisLogger().warn("The stored agent key could not be read - making a new one")
        }

        val fresh = generate()
        PasswordSafe.instance.set(attributes, Credentials(agentId, encode(fresh)))

        // Written and read straight back, because a password safe set to keep nothing in between will
        // accept the write and forget it. Left undetected, that is an endless cycle of pairing a phone
        // that never stays paired, with nothing on screen to explain it.
        val readBack = PasswordSafe.instance.get(attributes)?.getPasswordAsString()
        if (readBack.isNullOrEmpty()) {
            thisLogger().warn("This IDE is set not to remember passwords - remote pairing will not survive a restart")
            return fresh
        }

        return fresh
    }

    /**
     * Whether the safe genuinely keeps what it is given. False means pairing will work today and be
     * gone tomorrow, and the panel says so rather than letting a person find out by repetition.
     */
    fun usable(agentId: String): Boolean {
        val attributes = attributesFor("remote-probe-$agentId", "probe")
        PasswordSafe.instance.set(attributes, Credentials(agentId, "probe"))
        val kept = PasswordSafe.instance.get(attributes)?.getPasswordAsString() == "probe"
        PasswordSafe.instance.set(attributes, null)
        return kept
    }

    /** The shared secret with one device, from which its two direction keys are derived. */
    fun deviceSecret(agentId: String, deviceId: String): ByteArray? =
        PasswordSafe.instance.get(attributesFor("remote-device-$agentId", deviceId))
            ?.getPasswordAsString()
            ?.let { runCatching { Base64.getDecoder().decode(it) }.getOrNull() }

    fun rememberDevice(agentId: String, deviceId: String, secret: ByteArray) {
        PasswordSafe.instance.set(
            attributesFor("remote-device-$agentId", deviceId),
            Credentials(deviceId, Base64.getEncoder().encodeToString(secret)),
        )
    }

    /**
     * Forget a device's secret.
     *
     * This is the whole of a revocation, and it is worth being clear about why that is enough: with the
     * secret gone, frames from that device no longer open and are dropped. Nothing has to reach the
     * phone and the relay has to be told nothing - so it takes effect while the phone is switched off,
     * which is exactly when someone is most likely to want it.
     */
    fun forgetDevice(agentId: String, deviceId: String) {
        PasswordSafe.instance.set(attributesFor("remote-device-$agentId", deviceId), null)
    }

    fun forgetIdentity(agentId: String) {
        PasswordSafe.instance.set(attributesFor("remote-agent-$agentId", "identity"), null)
    }

    /**
     * The shared secret two parties arrive at from their own private key and the other's public one.
     * Never used as a key directly - it goes through HKDF first, which is what gives each direction a
     * key of its own (see [Hkdf]).
     */
    fun agree(privateKey: PrivateKey, publicKey: PublicKey): ByteArray {
        val agreement = KeyAgreement.getInstance("ECDH")
        agreement.init(privateKey)
        agreement.doPhase(publicKey, true)
        return agreement.generateSecret()
    }

    /**
     * Public keys travel in their structured form rather than as a raw point: a browser can produce
     * either, and the JDK cannot read the raw one back without being told the curve by hand. Choosing
     * the format both sides already agree on removes a whole class of "it works on my machine".
     */
    fun encodePublic(key: PublicKey): String = Base64.getEncoder().encodeToString(key.encoded)

    fun decodePublic(text: String): PublicKey? = runCatching {
        KeyFactory.getInstance("EC").generatePublic(X509EncodedKeySpec(Base64.getDecoder().decode(text)))
    }.getOrNull()

    fun fingerprintOf(key: PublicKey): String = Sealing.fingerprint(key.encoded)

    /**
     * Both halves, kept together.
     *
     * The public one is derivable from the private one in principle, but not through any call the JDK
     * offers for EC - it would mean multiplying the curve's base point by hand, which is real
     * cryptographic arithmetic written for the sake of saving forty bytes. Storing the pair is the
     * cheaper and duller choice.
     */
    private fun encode(pair: KeyPair): String =
        Base64.getEncoder().encodeToString(pair.private.encoded) +
            SEPARATOR +
            Base64.getEncoder().encodeToString(pair.public.encoded)

    private fun restore(text: String): KeyPair {
        val (privateText, publicText) = text.split(SEPARATOR).let { it[0] to it[1] }
        val factory = KeyFactory.getInstance("EC")

        return KeyPair(
            factory.generatePublic(X509EncodedKeySpec(Base64.getDecoder().decode(publicText))),
            factory.generatePrivate(PKCS8EncodedKeySpec(Base64.getDecoder().decode(privateText))),
        )
    }

    private const val SEPARATOR = ":"

    private fun attributesFor(subsystem: String, key: String): CredentialAttributes =
        CredentialAttributes(generateServiceName(SERVICE, subsystem), key)
}

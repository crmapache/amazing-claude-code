package io.github.crmapache.amazingclaudecode.voice

import com.intellij.credentialStore.CredentialAttributes
import com.intellij.credentialStore.Credentials
import com.intellij.credentialStore.generateServiceName
import com.intellij.ide.passwordSafe.PasswordSafe

/**
 * The Deepgram key, in the system keychain rather than in a settings file.
 *
 * The same place the remote access keys live (see RemoteKeys) and for the same reason: this one buys
 * transcription with somebody's money, and a settings file is world-readable, backed up and synced.
 *
 * It never travels back to the panel. The screen is told whether a key is set and what its last four
 * characters are - enough to tell "the one I pasted" from "some other one" - and nothing more: the panel
 * is a web page in an embedded browser, and a secret that never enters it cannot leave through it.
 *
 * Reading can block on the system keychain, so it never happens on the interface thread.
 */
internal object VoiceKeys {

    fun key(): String = runCatching {
        PasswordSafe.instance.get(attributes())?.getPasswordAsString().orEmpty()
    }.getOrDefault("")

    fun store(key: String) {
        val trimmed = key.trim()

        runCatching {
            if (trimmed.isEmpty()) PasswordSafe.instance.set(attributes(), null)
            else PasswordSafe.instance.set(attributes(), Credentials(ACCOUNT, trimmed))
        }
    }

    /**
     * What the settings screen may know about the key: that there is one, and its tail.
     *
     * Four characters identify a key against the list in Deepgram's console without being of any use to
     * anybody who reads them off a screen recording.
     */
    fun hint(): String = key().takeLast(TAIL).let { if (it.isBlank()) "" else "…$it" }

    private const val SERVICE = "Amazing Claude Code"
    private const val ACCOUNT = "deepgram"
    private const val TAIL = 4

    private fun attributes(): CredentialAttributes =
        CredentialAttributes(generateServiceName(SERVICE, "voice"), ACCOUNT)
}

package io.github.crmapache.amazingclaudecode.voice

import com.intellij.util.concurrency.AppExecutorUtil
import io.github.crmapache.amazingclaudecode.claude.ClaudePreferences
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.buildJsonObject
import kotlinx.serialization.json.put

/**
 * A phone's way into dictation: a token that lasts a minute, instead of the key that lasts for ever.
 *
 * The phone records and talks to Deepgram itself rather than sending audio here to be forwarded, and
 * both halves of that are deliberate. Audio through the relay would be a live stream of somebody's voice
 * crossing a server whose whole design is that it can carry nothing but sealed envelopes it cannot read
 * (see SECURITY-REMOTE-CONTROL.md) - and it would arrive late, because every chunk would travel twice.
 * Straight to Deepgram it is one hop, and the relay never sees a byte of it.
 *
 * What the phone must never get is the key itself. A key is money with no expiry: whoever holds it can
 * spend the account until somebody notices. So the IDE mints a token instead - `POST /v1/auth/grant`,
 * good for one minute and for transcription only (`usage:write`), useless against the account's own
 * settings. A phone that is stolen an hour later holds a string that expired fifty-nine minutes ago.
 *
 * The door is narrow on purpose (see RemoteCommands): this is the one voice message a remote client may
 * send, and it is refused unless the person has switched voice input on at the desk and left a key here.
 */
internal object VoiceGrant {

    /**
     * A minute rather than Deepgram's default of thirty seconds.
     *
     * The token is spent at the handshake and never again - the socket that opens with it lives as long
     * as the dictation does - so the only thing this length has to cover is the walk from "the button
     * was pressed" to "the socket is open", across a mobile network having a bad day. A minute is that
     * with room to spare; an hour would be a key with extra steps.
     */
    private const val TTL_SECONDS = 60

    /**
     * Hands whoever asked a token, or says why not. [emit] addresses the answer back to the one device
     * that asked - a grant is a dialogue somebody opened, of no interest to the others watching this
     * project - and [id] names the press it belongs to, because it can outlive it: a phone that let go
     * while the request was crossing the relay must not be told off for a press it has forgotten.
     */
    fun send(id: String, emit: (JsonObject) -> Unit) {
        // The one thing cheap enough to answer on the spot: a flag out of the settings, no disk and no
        // network behind it.
        if (!ClaudePreferences.voiceEnabled) {
            emit(refusal(id, "off"))
            return
        }

        /*
         * Everything else happens elsewhere, the keychain included.
         *
         * Reading a password safe can block - it is the system keychain, and it can be locked, waiting
         * on somebody's fingerprint - and the thread that brought this message in is the relay's. Holding
         * it holds the whole line: every conversation on it, for every device (see ClaudeSessionHub.prompt
         * for the same rule about saving files before a turn).
         */
        AppExecutorUtil.getAppExecutorService().submit {
            val key = VoiceKeys.key()
            if (key.isBlank()) {
                emit(refusal(id, VoiceDictation.NO_KEY))
                return@submit
            }

            val granted = DeepgramAccount.grant(key, TTL_SECONDS)

            emit(
                when (granted) {
                    is DeepgramAccount.Grant.Token -> buildJsonObject {
                        put("type", "voiceGrant")
                        put("id", id)
                        put("token", granted.token)
                        put("expiresIn", granted.expiresIn)
                        // The language is the machine's setting rather than the phone's: it is the same
                        // person speaking, and choosing it twice in two places is a setting that drifts.
                        put("language", VoiceLanguages.sanitize(ClaudePreferences.voiceLanguage))
                        put("model", DeepgramStream.MODEL)
                    }

                    DeepgramAccount.Grant.Rejected -> refusal(id, DeepgramStream.KEY_REFUSED)
                    DeepgramAccount.Grant.Failed -> refusal(id, DeepgramStream.UNREACHABLE)
                },
            )
        }
    }

    /**
     * Why not, as a code the phone says in its own language (see feed/voice.ts).
     *
     * Mostly the same codes a dictation at the desk fails with, plus one that only ever reaches a phone:
     * `off` - the feature is switched off on the machine this conversation runs on. At the desk that
     * state has no button to press, so nobody there can arrive at it.
     */
    private fun refusal(id: String, reason: String): JsonObject = buildJsonObject {
        put("type", "voiceGrant")
        put("id", id)
        put("error", reason)
    }
}

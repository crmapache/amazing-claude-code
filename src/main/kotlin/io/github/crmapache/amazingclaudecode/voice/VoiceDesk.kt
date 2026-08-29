package io.github.crmapache.amazingclaudecode.voice

import com.intellij.openapi.Disposable
import com.intellij.openapi.diagnostic.thisLogger
import com.intellij.openapi.project.Project
import com.intellij.openapi.util.Disposer
import com.intellij.util.concurrency.AppExecutorUtil
import io.github.crmapache.amazingclaudecode.claude.ClaudePreferences
import io.github.crmapache.amazingclaudecode.toolwindow.ClaudePanels
import kotlinx.serialization.json.add
import kotlinx.serialization.json.buildJsonObject
import kotlinx.serialization.json.put
import kotlinx.serialization.json.putJsonArray
import kotlinx.serialization.json.putJsonObject

/**
 * The IDE's side of voice input: the settings screen, the button in the composer, and the words on their
 * way into the input field.
 *
 * It lives with the panel's window rather than with the conversation hub, exactly like FeedbackDesk and
 * for the same reason: everything about a conversation travels through SessionCommands, which is also
 * the door a paired phone comes in by, while these messages arrive at the window's own handler where a
 * remote client does not appear at all (see ClaudePanel). A message that opens a microphone on somebody's
 * desk and spends their Deepgram credit should be unreachable from outside by construction rather than
 * only by being on a list - though it is on that list too (see RemoteCommands).
 */
internal class VoiceDesk(
    private val project: Project,
    /** How an answer gets back to the panel - the window's own channel, not the conversation's journal. */
    private val answer: (String) -> Unit,
) : VoiceDictation.Sink {

    /**
     * Assembling a config message costs more than it looks: the key's last four characters come out of
     * the system keychain, which can block, and the device list walks every mixer on the machine. Both
     * used to happen on the thread that asked - the interface one, when a panel opened and again on
     * every setting anybody touched, so recording a four-key chord enumerated the audio devices four
     * times over.
     *
     * One thread rather than the shared pool, because two settings changed quickly would otherwise race
     * and the screen would keep whichever message happened to arrive last.
     */
    private val configs = AppExecutorUtil.createBoundedApplicationPoolExecutor("acc-voice-config", 1)

    /** The panel is up: the hotkeys now have somewhere to put a dictation. */
    fun opened(parent: Disposable) {
        VoiceHotkeys.getInstance().register(project, this, parent)
        // And down again: a dictation on its way into a window that is closing has nowhere to land, and
        // left alone it would hold the microphone and keep spending Deepgram credit until the ceiling.
        Disposer.register(parent) {
            VoiceDictation.getInstance().release(this)
            configs.shutdown()
        }
        sendConfig()
    }

    // --- What the panel asks for ------------------------------------------------------

    fun start(mode: String) {
        val wanted = if (mode == "hold") HotkeyEngine.Mode.HOLD_TALK else HotkeyEngine.Mode.PUSH_TO_TALK
        VoiceDictation.getInstance().start(wanted, this)
    }

    fun stop() = VoiceDictation.getInstance().stop()

    fun cancel() = VoiceDictation.getInstance().cancel()

    fun setEnabled(enabled: Boolean) {
        ClaudePreferences.voiceEnabled = enabled
        // A dictation running while the feature is switched off would have nowhere to land.
        if (!enabled) VoiceDictation.getInstance().cancel()
        VoiceHotkeys.getInstance().refresh()
        announce()
    }

    fun setLanguage(code: String) {
        ClaudePreferences.voiceLanguage = VoiceLanguages.sanitize(code)
        announce()
    }

    fun setDevice(id: String) {
        ClaudePreferences.voiceDevice = id
        announce()
    }

    /**
     * The key, on its way to the keychain.
     *
     * Checked against Deepgram straight away rather than at the first dictation: a key pasted with a
     * space in it or copied from the wrong account is the ordinary mistake, and finding out about it
     * while holding a hotkey and talking is the worst possible moment.
     */
    fun setKey(key: String) {
        VoiceKeys.store(key)
        announce()
        if (key.isNotBlank()) refreshBalance()
    }

    /** The balance behind the key - see DeepgramAccount for why this can legitimately be unavailable. */
    fun refreshBalance() {
        sendBalance(buildJsonObject { put("state", "checking") })

        // Two HTTP round trips on the thread that brought the message in would freeze the panel, and so
        // would the keychain the key comes out of (see VoiceKeys).
        AppExecutorUtil.getAppExecutorService().submit {
            val key = VoiceKeys.key()

            if (key.isBlank()) {
                sendBalance(buildJsonObject { put("state", "none") })
                return@submit
            }

            val answer = DeepgramAccount.check(key)

            sendBalance(
                buildJsonObject {
                    when (answer) {
                        is DeepgramAccount.Answer.Balance -> {
                            put("state", "ok")
                            put("amount", answer.amount)
                            put("units", answer.units)
                        }

                        DeepgramAccount.Answer.NoBillingAccess -> put("state", "noAccess")
                        DeepgramAccount.Answer.Rejected -> put("state", "rejected")
                        // The reason goes to the log rather than to the screen: "Deepgram answered 502"
                        // is not a sentence anybody acts on, and the panel has a translated one for it.
                        is DeepgramAccount.Answer.Failed -> {
                            thisLogger().info("The Deepgram balance would not read: ${answer.reason}")
                            put("state", "failed")
                        }
                    }
                },
            )
        }
    }

    /**
     * Waits for the next key or mouse button and binds it to [slot].
     *
     * The recording happens in the IDE rather than in the panel because that is where the hotkey will
     * later be caught: a page reports what the browser calls a key, and binding by one name while
     * listening by another is how a hotkey ends up impossible to press.
     */
    fun captureHotkey(slot: String) {
        VoiceHotkeys.getInstance().capture(deviceOf(slot)) { capture ->
            when (capture) {
                is VoiceHotkeys.Capture.Bound -> {
                    if (store(slot, HotkeyBinding.write(capture.binding))) {
                        VoiceHotkeys.getInstance().refresh()
                        announce()
                    }
                }

                VoiceHotkeys.Capture.BadButton -> answer(
                    buildJsonObject {
                        put("type", "voiceCapture")
                        put("slot", slot)
                        put("problem", "button")
                    }.toString(),
                )

                VoiceHotkeys.Capture.Cancelled -> answer(
                    buildJsonObject {
                        put("type", "voiceCapture")
                        put("slot", slot)
                        put("problem", "cancelled")
                    }.toString(),
                )
            }
        }
    }

    fun stopCapturing() = VoiceHotkeys.getInstance().stopCapturing()

    fun clearHotkey(slot: String) {
        if (!store(slot, "")) return

        VoiceHotkeys.getInstance().refresh()
        announce()
    }

    // --- What a running dictation reports ---------------------------------------------

    override fun state(state: VoiceDictation.State) {
        answer(
            buildJsonObject {
                put("type", "voiceState")
                put("phase", state.phase.name.lowercase())
                put("mode", if (state.mode == HotkeyEngine.Mode.HOLD_TALK) "hold" else "push")
                put("level", state.level)
                put("error", state.error)
            }.toString(),
        )
    }

    override fun interim(text: String) = sendText(text, false)

    override fun final(text: String) = sendText(text, true)

    private fun sendText(text: String, settled: Boolean) {
        answer(
            buildJsonObject {
                put("type", "voiceText")
                put("text", text)
                put("final", settled)
            }.toString(),
        )
    }

    // --- Saying it all to the panel ---------------------------------------------------

    /**
     * Everything the screen draws itself from, in one message.
     *
     * The key itself is never in it - only its last four characters (see VoiceKeys.hint). The panel is a
     * web page, and a secret that never enters it cannot leave through it.
     */
    /**
     * A setting changed, and these settings are the machine's rather than this project's.
     *
     * So every open window hears it, not only the one that was clicked in: two projects side by side is
     * the ordinary case in a JetBrains IDE, and the second one went on showing a switched-off feature as
     * on - with a microphone button whose dictation was refused the instant it was pressed.
     */
    private fun announce() = ClaudePanels.everyPanel { it.voiceSettingsChanged() }

    fun sendConfig() {
        // Rejected once the panel is gone, which is not an error: there is nothing left to tell.
        runCatching { configs.execute { answer(configBody()) } }
    }

    private fun configBody(): String =
        buildJsonObject {
            put("type", "voiceConfig")
            put("enabled", ClaudePreferences.voiceEnabled)
            put("language", VoiceLanguages.sanitize(ClaudePreferences.voiceLanguage))
            put("device", ClaudePreferences.voiceDevice)
            put("keyHint", VoiceKeys.hint())

            putJsonArray("languages") {
                add(
                    buildJsonObject {
                        put("code", VoiceLanguages.MULTI.code)
                        put("native", VoiceLanguages.MULTI.native)
                        put("english", VoiceLanguages.MULTI.english)
                    },
                )
                for (language in VoiceLanguages.ALL) {
                    add(
                        buildJsonObject {
                            put("code", language.code)
                            put("native", language.native)
                            put("english", language.english)
                        },
                    )
                }
            }

            putJsonArray("devices") {
                for (device in Microphone.devices()) {
                    add(
                        buildJsonObject {
                            put("id", device.id)
                            put("label", device.label)
                        },
                    )
                }
            }

            putJsonObject("hotkeys") {
                putJsonObject("push") { binding(ClaudePreferences.voicePushHotkey) }
                putJsonObject("hold") { binding(ClaudePreferences.voiceHoldHotkey) }
                putJsonObject("pushMouse") { binding(ClaudePreferences.voicePushMouse) }
                putJsonObject("holdMouse") { binding(ClaudePreferences.voiceHoldMouse) }
            }
        }.toString()

    private fun sendBalance(body: kotlinx.serialization.json.JsonObject) {
        answer(
            buildJsonObject {
                put("type", "voiceBalanceIs")
                for ((key, value) in body) put(key, value)
            }.toString(),
        )
    }

    /**
     * A binding as the screen shows it: the keys it is pressed with, one at a time.
     *
     * Which sign belongs on a key is this machine's business (⌥ and ⌘ on a Mac, words everywhere else),
     * and the drawing of it is the panel's - see HotkeyCap. The side of the keyboard travels as a word
     * because it is one, and words are translated on the side that speaks nine languages.
     */
    private fun kotlinx.serialization.json.JsonObjectBuilder.binding(stored: String) {
        putJsonArray("caps") {
            for (cap in HotkeyBinding.parse(stored)?.caps().orEmpty()) {
                add(
                    buildJsonObject {
                        put("glyph", cap.glyph)
                        put("text", cap.text)
                        put("side", cap.side)
                    },
                )
            }
        }
    }

    /**
     * Where a binding is kept, by the name the panel calls its slot - and whether there was one.
     *
     * A name nobody here knows means the panel and the IDE no longer agree on the four slots (see
     * protocol.ts), and it used to fall off the end of this `when` without a word: the screen asked for a
     * key, the key was pressed, and it was written nowhere at all.
     */
    /**
     * What a slot is bound with. Half of every row asks for a chord, the other half for a mouse button,
     * and neither will take the other's answer - see VoiceHotkeys.Device.
     */
    private fun deviceOf(slot: String): VoiceHotkeys.Device = when (slot) {
        "pushMouse", "holdMouse" -> VoiceHotkeys.Device.MOUSE
        else -> VoiceHotkeys.Device.KEYS
    }

    private fun store(slot: String, value: String): Boolean {
        when (slot) {
            "push" -> ClaudePreferences.voicePushHotkey = value
            "hold" -> ClaudePreferences.voiceHoldHotkey = value
            "pushMouse" -> ClaudePreferences.voicePushMouse = value
            "holdMouse" -> ClaudePreferences.voiceHoldMouse = value
            else -> {
                thisLogger().warn("A voice hotkey slot this IDE does not know: $slot")
                return false
            }
        }

        return true
    }
}

package io.github.crmapache.amazingclaudecode.voice

import com.intellij.openapi.Disposable
import com.intellij.openapi.components.Service
import com.intellij.openapi.components.service
import com.intellij.util.concurrency.AppExecutorUtil
import io.github.crmapache.amazingclaudecode.claude.ClaudePreferences
import io.github.crmapache.amazingclaudecode.feedback.DiagnosticsLog
import java.util.concurrent.ScheduledFuture
import java.util.concurrent.TimeUnit

/**
 * One dictation at a time, for the whole IDE.
 *
 * Application-wide rather than per project because the microphone is: two panels recording at once
 * would be two applications fighting over one device, and the second would simply fail. Which panel the
 * words go to is decided when the dictation starts (see [Sink]) - the one whose window was in front, or
 * the one whose button was pressed.
 *
 * Nothing about the audio is kept. Chunks go from the line into the socket and are forgotten; no file is
 * written, and no text is stored beyond the phrase on its way to the input field.
 */
@Service(Service.Level.APP)
internal class VoiceDictation : Disposable {

    enum class Phase { IDLE, LISTENING, FINISHING }

    data class State(
        val phase: Phase,
        val mode: HotkeyEngine.Mode?,
        /** 0..100 from the microphone, for the ring around the button. */
        val level: Int,
        /**
         * Empty unless something went wrong, and then it is a code rather than a sentence: `no-key`,
         * `mic`, `key`, `network`, `deepgram`. The sentence is the panel's, because the panel is the side
         * that speaks every language the panel has (see webview/src/i18n).
         */
        val error: String,
    )

    /** Where a running dictation reports - the panel that started it. */
    interface Sink {
        fun state(state: State)
        /** The phrase as it is being said. Replaced by the next one; never lands in the field by itself. */
        fun interim(text: String)
        /** A phrase Deepgram settled on - this is what is written into the draft. */
        fun final(text: String)
    }

    private val microphone = Microphone()

    /**
     * Every step of the life cycle, off the thread that asked for it and in the order it was asked.
     *
     * Off, because starting is slow in two ways that both stop an IDE dead: reading the key can put up
     * the system keychain's own dialog, and opening an audio line means walking the mixers and up to six
     * attempts at a device - a couple of hundred milliseconds on Bluetooth. Both used to happen on the
     * interface thread, inside the dispatcher that was delivering the keystroke.
     *
     * In order, because these are not independent: a release queued behind a press has to be the release
     * of that press. One thread is what guarantees it.
     */
    private val commands = AppExecutorUtil.createBoundedApplicationPoolExecutor("acc-voice", 1)

    @Volatile
    private var stream: DeepgramStream? = null

    @Volatile
    private var sink: Sink? = null

    @Volatile
    private var phase = Phase.IDLE

    @Volatile
    private var mode: HotkeyEngine.Mode? = null

    @Volatile
    private var level = 0

    @Volatile
    private var lastLevelSent = 0L

    @Volatile
    private var ceiling: ScheduledFuture<*>? = null

    /**
     * Whether a dictation is running - a second one would find the microphone already taken.
     *
     * Asked from outside too, by the hotkeys (see HotkeyEngine.Handlers.running): a toggle has no other
     * way to hear that the last dictation refused to start or ended by itself.
     */
    fun running(): Boolean = phase != Phase.IDLE

    /** Starts listening, or says why it cannot - on its own thread, see [commands]. */
    fun start(mode: HotkeyEngine.Mode, sink: Sink) {
        submit { begin(mode, sink) }
    }

    /**
     * Everything that can refuse does so before the microphone is touched: a device opened and closed
     * again half a second later shows the recording indicator for no reason, which reads as the plugin
     * listening when it should not.
     */
    @Synchronized
    private fun begin(mode: HotkeyEngine.Mode, sink: Sink) {
        if (running()) return

        if (!ClaudePreferences.voiceEnabled) return

        val key = VoiceKeys.key()
        if (key.isBlank()) {
            sink.state(State(Phase.IDLE, null, 0, NO_KEY))
            return
        }

        this.sink = sink
        this.mode = mode
        this.level = 0

        val language = VoiceLanguages.sanitize(ClaudePreferences.voiceLanguage)

        // The socket first: the audio has somewhere to go from the first chunk, and a key Deepgram
        // refuses fails before anything has been recorded.
        val capture = microphone.start(
            deviceId = ClaudePreferences.voiceDevice,
            onChunk = { chunk -> stream?.push(chunk) },
            onLevel = { measure -> reportLevel(measure) },
            onError = { reason -> fail(reason) },
        )

        if (capture == null) {
            this.sink = null
            this.mode = null
            sink.state(State(Phase.IDLE, null, 0, Microphone.UNAVAILABLE))
            return
        }

        stream = DeepgramStream(
            key = key,
            language = language,
            sampleRate = capture.sampleRate,
            onInterim = { text -> this.sink?.interim(text) },
            onFinal = { text -> this.sink?.final(text) },
            onError = { reason -> fail(reason) },
            onDone = { settle() },
        ).also { it.open() }

        phase = Phase.LISTENING
        publish()

        // A ceiling, because a key held down and released in another application never reports the
        // release: see HotkeyEngine.windowLostFocus for the half of this the keyboard can cover.
        ceiling = AppExecutorUtil.getAppScheduledExecutorService()
            .schedule({ runCatching { stop() } }, MAX_MS, TimeUnit.MILLISECONDS)

        DiagnosticsLog.note(DiagnosticsLog.PANEL, "dictation started ($language, ${capture.sampleRate}Hz)")
    }

    /**
     * The speech is over: stop the microphone and let Deepgram count the tail.
     *
     * The field goes on filling while that happens - the last phrase usually lands a few tenths of a
     * second after the key is released, and it is the pause that makes the difference between a feature
     * that feels instant and one that does not.
     */
    fun stop() {
        submit { finish() }
    }

    @Synchronized
    private fun finish() {
        if (phase != Phase.LISTENING) return

        ceiling?.cancel(false)
        ceiling = null

        microphone.stop()
        phase = Phase.FINISHING
        level = 0
        publish()

        val live = stream
        if (live == null) settle() else live.finish()
    }

    /**
     * The panel a dictation is going to is closing - there is nowhere left to put the words.
     *
     * Only its own: with two windows open, the one being closed has no business ending a dictation
     * running in the other. And without this the line stayed open, the audio went on being charged for
     * up to the two-minute ceiling, and every word was handed to a sink whose webview had been destroyed.
     */
    fun release(sink: Sink) {
        submit { discardFor(sink) }
    }

    @Synchronized
    private fun discardFor(sink: Sink) {
        if (this.sink === sink) discard()
    }

    /** Escape, or the panel going away: the words are not wanted and the tail is not waited for. */
    fun cancel() {
        submit { discard() }
    }

    @Synchronized
    private fun discard() {
        if (phase == Phase.IDLE) return

        ceiling?.cancel(false)
        ceiling = null

        // Taken before anything is torn down: abort() reaches settle() on this very thread, and settle()
        // is where the sink is let go of - said afterwards, this was a message to nobody.
        val listener = sink

        microphone.stop()
        stream?.abort()
        stream = null
        settle()

        // The tail is dropped rather than shown: cancelling has to leave the field as it was, and a grey
        // ghost of a thrown-away phrase cannot be selected, deleted or got rid of at all.
        listener?.interim("")
    }

    /**
     * Something gave way while the dictation was running: the device, the socket, the network.
     *
     * Synchronized like every other step of the life cycle, and for a plainer reason than the rest: it is
     * called from two background threads at once - the one reading the microphone and the one Deepgram
     * answers on - and it writes the same six fields those steps do. Without the monitor, the gap between
     * putting the phase back to idle and letting go of the sink was wide enough for a second press to get
     * through [running] and have its brand new sink erased. The microphone would then be open, the indicator
     * lit, and every word going nowhere at all.
     */
    @Synchronized
    private fun fail(reason: String) {
        // Nothing is running: a device that refused to open says so through [start], which is holding
        // the monitor this call is waiting for and is about to report the same thing itself.
        if (phase == Phase.IDLE) return

        val listener = sink

        ceiling?.cancel(false)
        ceiling = null
        microphone.stop()
        stream?.abort()
        stream = null
        phase = Phase.IDLE
        mode = null
        level = 0
        sink = null

        listener?.interim("")
        listener?.state(State(Phase.IDLE, null, 0, reason))
        DiagnosticsLog.note(DiagnosticsLog.PANEL, "dictation failed")
    }

    /** The end of the road, however it was reached: back to idle, and say so once. */
    @Synchronized
    private fun settle() {
        if (phase == Phase.IDLE) return

        stream = null
        phase = Phase.IDLE
        mode = null
        level = 0
        publish()
        sink = null
    }

    /**
     * The level, at a rate a person can see rather than at the rate it is measured.
     *
     * The microphone hands one over every fifty milliseconds; a ring redrawn twenty times a second is
     * twenty trips into the page for an animation that reads the same at ten.
     */
    private fun reportLevel(measure: () -> Int) {
        val now = System.currentTimeMillis()
        if (now - lastLevelSent < LEVEL_MS) return

        lastLevelSent = now
        // Measured only now, and not on the chunks in between: it is a pass over every sample, and what
        // is not going to be shown does not need taking.
        level = measure()
        publish()
    }

    private fun publish() {
        sink?.state(State(phase, mode, level, ""))
    }

    override fun dispose() {
        // Straight through rather than queued: the application is going away and there may be no moment
        // left in which a queued task would run, and what is queued here holds a microphone.
        discard()
        commands.shutdown()
    }

    /** Rejected once the service is disposed, which is not an error - see [dispose]. */
    private fun submit(action: () -> Unit) {
        runCatching { commands.execute { runCatching(action) } }
    }

    companion object {

        fun getInstance(): VoiceDictation = service()

        /** What the panel is told when there is no key yet - the screen turns it into a way to add one. */
        const val NO_KEY = "no-key"

        /**
         * How long one dictation may last.
         *
         * Two minutes is far longer than anybody talks into an input field and far shorter than "until
         * somebody notices": the case it exists for is a held key released in another application, where
         * nothing else will ever say the speech is over.
         */
        private const val MAX_MS = 120_000L

        private const val LEVEL_MS = 100L
    }
}

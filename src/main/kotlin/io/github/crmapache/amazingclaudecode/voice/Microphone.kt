package io.github.crmapache.amazingclaudecode.voice

import com.intellij.openapi.diagnostic.thisLogger
import java.util.concurrent.CountDownLatch
import java.util.concurrent.TimeUnit
import java.util.concurrent.atomic.AtomicBoolean
import javax.sound.sampled.AudioFormat
import javax.sound.sampled.AudioSystem
import javax.sound.sampled.DataLine
import javax.sound.sampled.LineUnavailableException
import javax.sound.sampled.Mixer
import javax.sound.sampled.TargetDataLine
import kotlin.math.min
import kotlin.math.roundToInt
import kotlin.math.sqrt

/**
 * The microphone, read straight from the JVM.
 *
 * The alternative was the embedded browser, and it is not available: the panel is served over
 * `http://acc-webview` (see WebviewResources), which is not a secure context, so `navigator.mediaDevices`
 * is simply absent there. Making it appear would mean a CEF command-line flag, and CEF's flags are set
 * for the whole IDE process - every other plugin's browser included. Recording here costs nothing by
 * comparison: `javax.sound.sampled` is in the JDK, macOS already grants the IDE the microphone
 * (`NSMicrophoneUsageDescription` in its Info.plist, `com.apple.security.device.audio-input` in its
 * entitlements), and the same thread can hold a socket open to Deepgram with an `Authorization` header,
 * which a browser's WebSocket cannot do at all.
 *
 * The line is opened when dictation starts rather than kept warm. An open line is a microphone taken
 * away from every other application on the machine, and a panel that quietly owns the microphone all day
 * is a panel nobody would keep installed.
 */
internal class Microphone {

    /** An input device as the settings screen lists it. */
    data class Device(val id: String, val label: String)

    /** What a running capture turns out to be, once the device has agreed to a format. */
    data class Capture(val sampleRate: Int)

    /**
     * One run of the microphone: its own line, its own reader, its own end.
     *
     * The line belongs to the capture rather than to the microphone, and that is the whole of it. Shared,
     * a reader still winding down from the last dictation closed the line the next one had just opened -
     * so the fresh reader threw, was taken for a device failure and reported "the microphone is busy" on
     * a microphone nothing was holding.
     */
    private class Session(val line: TargetDataLine) {
        val alive = AtomicBoolean(true)
        /** Raised once the reader has let go of the device - see the wait in [start]. */
        val ended = CountDownLatch(1)
    }

    @Volatile
    private var session: Session? = null

    /**
     * Opens the device and starts reading.
     *
     * [onChunk] gets raw little-endian 16-bit mono samples, which is Deepgram's `linear16` without any
     * conversion. Both are called on the reading thread - neither does anything but hand the bytes on.
     *
     * [onLevel] is handed a measurement to take rather than a number: 0..100 for the ring around the
     * button, wanted ten times a second while the chunks arrive twenty (see LEVEL_MS in VoiceDictation).
     * Measured up front, half of those passes over every sample of a chunk were made to be thrown away.
     *
     * Returns null when there is already a capture running or when the device would not open. The caller
     * says so - it is the one holding a panel to say it to.
     */
    fun start(
        deviceId: String,
        onChunk: (ByteArray) -> Unit,
        onLevel: (measure: () -> Int) -> Unit,
        onError: (String) -> Unit,
    ): Capture? {
        val previous = session
        if (previous != null) {
            if (previous.alive.get()) return null

            // Stopped a moment ago and still holding the device: pressing the hotkey again straight after
            // Escape is the ordinary way to reach this, and opening a second line over the first is how
            // a working microphone reports itself as busy.
            if (!previous.ended.await(DRAIN_MS, TimeUnit.MILLISECONDS)) return null
        }

        session = null

        val (open, format) = open(deviceId) ?: return null

        val fresh = Session(open)
        session = fresh
        open.start()

        // Fifty milliseconds a piece: small enough that the words arrive as they are spoken, large enough
        // that a socket is not woken a hundred times a second.
        val chunk = ByteArray(bytesFor(format, CHUNK_MS))

        val thread = Thread({
            var died = false

            try {
                while (fresh.alive.get()) {
                    val read = open.read(chunk, 0, chunk.size)
                    if (read <= 0) break

                    val piece = chunk.copyOf(read)
                    onChunk(piece)
                    onLevel { levelOf(piece) }
                }
            } catch (error: Exception) {
                died = fresh.alive.get()
                if (died) thisLogger().info("The microphone stopped reading: ${error.message}")
            } finally {
                closeLine(fresh.line)
                fresh.ended.countDown()
            }

            // After the device has been let go of, never before: this call goes back into VoiceDictation
            // and waits for its monitor, and a dictation starting at that moment holds that monitor while
            // waiting for exactly the latch above.
            if (died) onError(UNAVAILABLE)
        }, "acc-microphone")

        thread.isDaemon = true
        thread.start()

        return Capture(format.sampleRate.roundToInt())
    }

    fun stop() {
        val live = session ?: return
        if (!live.alive.compareAndSet(true, false)) return
        // Ends the blocking read the thread is sitting in - it then closes the line itself.
        runCatching { live.line.stop() }
    }

    private fun closeLine(held: TargetDataLine) {
        runCatching {
            held.stop()
            held.flush()
            held.close()
        }
    }

    /**
     * Finds a line that will take one of our formats.
     *
     * More than one format is tried because 16 kHz is a request, not a promise: plenty of interfaces
     * only ever open at 44.1 or 48 kHz, and refusing them would mean "your microphone is not supported"
     * for a microphone that works everywhere else. Deepgram is told the rate we actually got, so a
     * higher one costs bandwidth and nothing else.
     */
    private fun open(deviceId: String): Pair<TargetDataLine, AudioFormat>? {
        val mixer = mixerFor(deviceId)

        for (rate in RATES) {
            val format = AudioFormat(rate.toFloat(), BITS, 1, true, false)
            val info = DataLine.Info(TargetDataLine::class.java, format)

            val line = runCatching {
                if (mixer != null) {
                    if (!mixer.isLineSupported(info)) return@runCatching null
                    mixer.getLine(info) as TargetDataLine
                } else {
                    if (!AudioSystem.isLineSupported(info)) return@runCatching null
                    AudioSystem.getLine(info) as TargetDataLine
                }
            }.getOrNull() ?: continue

            val ready = runCatching {
                // Half a second of slack, so a busy machine cannot lose samples between two reads.
                line.open(format, bytesFor(format, BUFFER_MS))
                line
            }.getOrElse { error ->
                if (error is LineUnavailableException) {
                    thisLogger().info("The microphone is busy at ${rate}Hz: ${error.message}")
                }
                runCatching { line.close() }
                null
            } ?: continue

            return ready to format
        }

        return null
    }

    /** The chosen device, or null for "whatever the system calls the default". */
    private fun mixerFor(deviceId: String): Mixer? {
        if (deviceId.isBlank()) return null

        return AudioSystem.getMixerInfo()
            .firstOrNull { it.name == deviceId }
            ?.let { runCatching { AudioSystem.getMixer(it) }.getOrNull() }
    }

    /** 0..100 from one chunk's root mean square - the ring around the button, not a meter. */
    private fun levelOf(chunk: ByteArray): Int {
        if (chunk.size < 2) return 0

        var sum = 0.0
        var samples = 0

        var index = 0
        while (index + 1 < chunk.size) {
            val sample = ((chunk[index + 1].toInt() shl 8) or (chunk[index].toInt() and 0xFF)).toShort().toInt()
            sum += sample.toDouble() * sample.toDouble()
            samples += 1
            index += 2
        }

        if (samples == 0) return 0

        val rms = sqrt(sum / samples)
        // Speech at a comfortable distance sits far below the full range, so the scale is against a
        // quarter of it: against the whole one the ring would barely move while somebody was talking.
        return min(100, (rms / (Short.MAX_VALUE / 4.0) * 100).roundToInt())
    }

    /**
     * Whole frames, never a fraction of one.
     *
     * `TargetDataLine.read` is specified to throw when the length is not a multiple of the frame size,
     * and fifty milliseconds at 22.05 kHz is 1102.5 frames. The first read threw, was caught as the
     * device dying, and came out as "the microphone is busy - find what else is holding it" on a
     * microphone that nothing was holding. The other five rates we ask for divide evenly, which is
     * exactly why this stayed hidden.
     */
    private fun bytesFor(format: AudioFormat, milliseconds: Int): Int {
        val frames = (format.sampleRate * milliseconds / 1000).toInt()
        return frames * format.frameSize
    }

    companion object {

        /**
         * The input devices this machine has.
         *
         * A mixer counts as one when it can give a recording line at all - the list otherwise fills with
         * the machine's outputs, and a person picking their headset from a list of speakers has been
         * handed the wrong list.
         */
        fun devices(): List<Device> = runCatching {
            AudioSystem.getMixerInfo()
                .filter { info ->
                    runCatching {
                        AudioSystem.getMixer(info).targetLineInfo.any { it is DataLine.Info }
                    }.getOrDefault(false)
                }
                .map { Device(id = it.name, label = it.name) }
                .distinctBy { it.id }
        }.getOrDefault(emptyList())

        /**
         * What the panel is told when the device will not play - a code rather than a sentence, because
         * the sentence belongs on the side that speaks every language the panel has (see webview/src/i18n).
         *
         * One code for both halves of it - the line refusing to open and the line dying mid-dictation -
         * because there is one thing to do about either: find out what else on the machine is holding
         * the microphone.
         */
        const val UNAVAILABLE = "mic"

        private const val BITS = 16
        private const val CHUNK_MS = 50
        private const val BUFFER_MS = 500

        /**
         * How long a new capture waits for the last reader to let go of the device.
         *
         * The read it is sitting in returns as soon as the line is stopped, so this is measured in
         * milliseconds in practice; the number is only here so that a device that never answers cannot
         * hold up the press that comes after it.
         */
        private const val DRAIN_MS = 500L

        /** Asked for in this order: what Deepgram likes best first, then what devices actually give. */
        private val RATES = listOf(16_000, 48_000, 44_100, 32_000, 22_050, 8_000)
    }
}

package io.github.crmapache.amazingclaudecode.sound

import com.intellij.openapi.diagnostic.thisLogger
import com.intellij.util.concurrency.AppExecutorUtil
import java.io.ByteArrayInputStream
import java.util.concurrent.ConcurrentHashMap
import javax.sound.sampled.AudioInputStream
import javax.sound.sampled.AudioSystem
import javax.sound.sampled.Clip
import javax.sound.sampled.FloatControl
import javax.sound.sampled.LineEvent
import kotlin.math.log10

/**
 * The panel's sound alerts.
 *
 * The shell plays the sound rather than the page: the embedded browser renders offscreen and obeys the
 * autoplay policy, because of which the very first sound without a mouse click would simply not be
 * heard. The system mixer does not care whether the person is looking at the panel or whether it is
 * open at all - which is exactly what one expects from an alert.
 *
 * When to sound is decided by the interface: only it knows that a plan is waiting for a decision and
 * that a turn has reached its end. What arrives here is a ready sound name.
 */
internal object AlertSounds {

    /**
     * The names are the same as in the panel's protocol. The files live in the plugin's resources
     * rather than being read from the user's disk: the set of sounds is part of the plugin.
     *
     * The order here is importance, from the most alarming to the most everyday: it decides whose signal
     * outlives the other when both happen at once (see [AlertThrottle]). The same order is described in
     * the panel itself, where the main one is picked out of several occasions in one tab (sounds.ts).
     */
    internal val FILES = mapOf(
        "trouble" to "trouble.wav",
        "rateLimit" to "rate-limit.wav",
        "permission" to "permission.wav",
        "question" to "question.wav",
        "plan" to "plan.wav",
        "turnFinished" to "turn-finished.wav",
    )

    val ids: Set<String> get() = FILES.keys

    /** The bytes of files already read: from the second time on a sound does not touch the disk. */
    private val cache = ConcurrentHashMap<String, ByteArray>()

    private val throttle = AlertThrottle()

    /** [volume] is a percentage of the file's full volume, as in the settings list. */
    fun play(id: String, volume: Int = 100) {
        val file = FILES[id] ?: return
        if (volume <= 0) return
        if (!throttle.allow(FILES.keys.indexOf(id), System.currentTimeMillis())) return

        // Opening a line reaches into the system mixer and waits for its answer - on the interface
        // thread that is a noticeable pause in the panel itself.
        AppExecutorUtil.getAppExecutorService().submit { playNow(id, file, volume) }
    }

    private fun playNow(id: String, file: String, volume: Int) {
        val bytes = cache.getOrPut(id) {
            val resource = AlertSounds::class.java.getResourceAsStream("/sounds/$file")
            if (resource == null) {
                thisLogger().warn("Sound resource missing: $file")
                return
            }
            resource.use { it.readBytes() }
        }

        // A sound card's line is not an endless resource, and it is taken by the very request for a
        // clip, before any playing. So from here on it is closed on every outcome: both when the sound
        // has finished and when opening it did not work out - otherwise a busy device would take a line
        // per alert until the panel fell silent altogether.
        val clip = runCatching { AudioSystem.getClip() }.getOrElse {
            thisLogger().warn("No audio line for sound $id", it)
            return
        }

        // The stream is single-use: one per playback, while the bytes are shared.
        var stream: AudioInputStream? = null

        runCatching {
            stream = AudioSystem.getAudioInputStream(ByteArrayInputStream(bytes))

            clip.addLineListener { event ->
                if (event.type == LineEvent.Type.STOP) {
                    clip.close()
                    runCatching { stream?.close() }
                }
            }

            clip.open(stream)
            applyVolume(clip, volume)
            clip.start()
        }.onFailure {
            // A sound is not worth bringing the panel down for: on a machine without a sound card (or
            // with a busy device) the alert simply will not be heard. The listener above has nothing to
            // count on here - it is waiting for the end of something that never began - so we clean up
            // after ourselves right here.
            runCatching { clip.close() }
            runCatching { stream?.close() }
            thisLogger().warn("Failed to play sound $id", it)
        }
    }

    /**
     * Turn a line's volume down to the requested share.
     *
     * The mixer takes not per cent but gain in decibels - a logarithmic quantity, because so is hearing:
     * half the per cent is not half the loudness to the ear but "a little quieter". Hence the conversion
     * through a logarithm: it makes the scale even to the ear rather than on paper.
     *
     * A line may have no control of its own - then the sound simply plays as it is: that is better than
     * not sounding at all.
     */
    private fun applyVolume(clip: Clip, volume: Int) {
        val fraction = volume.coerceIn(0, 100) / 100.0
        if (fraction >= 1.0) return

        val control = runCatching { clip.getControl(FloatControl.Type.MASTER_GAIN) as FloatControl }.getOrNull()
            ?: return

        val gain = (20.0 * log10(fraction)).toFloat()
        control.value = gain.coerceIn(control.minimum, control.maximum)
    }
}

/**
 * Which of several signals in a row gets heard.
 *
 * Occasions that call a person come several at a time: the agent asks for three permissions in a row, a
 * turn breaks off with an error and immediately ends, and one pass of the panel over its tabs can call
 * from several conversations at once. Playing them all is a mush of overlaid signals in which none can
 * be made out, so the ones that follow stay silent for a while.
 *
 * But what must stay silent is the less important one, not the one that merely arrived a millisecond
 * late. Had the shell let through the first that came, a dead process in a background tab would have
 * been lost behind a neighbour's turn that had just finished. So a signal more important than the
 * previous one passes even inside the window: hearing two in a row is better than not hearing the main
 * one.
 */
internal class AlertThrottle(private val gapMs: Long = MIN_GAP_MS) {

    private var lastAt = 0L
    private var lastRank = Int.MAX_VALUE

    @Synchronized
    fun allow(rank: Int, now: Long): Boolean {
        if (now - lastAt < gapMs && rank >= lastRank) return false

        lastAt = now
        lastRank = rank
        return true
    }

    private companion object {
        const val MIN_GAP_MS = 400L
    }
}

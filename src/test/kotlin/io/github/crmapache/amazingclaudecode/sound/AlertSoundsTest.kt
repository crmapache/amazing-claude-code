package io.github.crmapache.amazingclaudecode.sound

import java.io.ByteArrayInputStream
import javax.sound.sampled.AudioSystem
import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertFalse
import kotlin.test.assertNotNull
import kotlin.test.assertTrue

/**
 * An alert whose file has gone missing stays silent - and stays silent unnoticed: the only way to learn
 * about it would be that one day the panel did not call.
 */
class AlertSoundsTest {

    @Test
    fun `every occasion has a sound of its own`() {
        assertEquals(
            setOf("turnFinished", "permission", "plan", "question", "rateLimit", "trouble"),
            AlertSounds.ids,
        )
    }

    @Test
    fun `every file is in the resources and readable by the audio subsystem`() {
        for ((id, file) in AlertSounds.FILES) {
            val bytes = AlertSounds::class.java.getResourceAsStream("/sounds/$file")?.use { it.readBytes() }
            assertNotNull(bytes, "no sound file for $id: /sounds/$file")
            assertTrue(bytes.isNotEmpty(), "empty sound file for $id")

            // The format is parsed the same way as during playback: a file the JVM does not understand
            // shows up right here.
            AudioSystem.getAudioInputStream(ByteArrayInputStream(bytes)).use { stream ->
                assertTrue(stream.format.sampleRate > 0, "odd format for sound $id")
            }
        }
    }

    @Test
    fun `an unfamiliar name does not bring the panel down`() {
        AlertSounds.play("nope", 100)
    }

    @Test
    fun `zero volume does not start playback at all`() {
        AlertSounds.play("turnFinished", 0)
    }

    @Test
    fun `the order of the sounds sets their importance`() {
        assertEquals(listOf("trouble", "rateLimit", "permission", "question", "plan", "turnFinished"), AlertSounds.ids.toList())
    }
}

class AlertThrottleTest {

    /** The ranks are the same as in AlertSounds: the smaller, the more alarming. */
    private val trouble = 0
    private val turnFinished = 5

    @Test
    fun `the first signal always passes`() {
        assertTrue(AlertThrottle(gapMs = 400).allow(turnFinished, now = 1_000))
    }

    @Test
    fun `an equally important one inside the window stays silent`() {
        val throttle = AlertThrottle(gapMs = 400)

        assertTrue(throttle.allow(turnFinished, now = 1_000))
        assertFalse(throttle.allow(turnFinished, now = 1_100))
    }

    @Test
    fun `a more important one breaks through inside the window`() {
        // A background tab died at the very moment a neighbouring one finished its turn: that signal
        // must not be lost.
        val throttle = AlertThrottle(gapMs = 400)

        assertTrue(throttle.allow(turnFinished, now = 1_000))
        assertTrue(throttle.allow(trouble, now = 1_010))
    }

    @Test
    fun `after an important one, a lesser one in the same window stays silent`() {
        val throttle = AlertThrottle(gapMs = 400)

        assertTrue(throttle.allow(trouble, now = 1_000))
        assertFalse(throttle.allow(turnFinished, now = 1_010))
    }

    @Test
    fun `past the window anything passes`() {
        val throttle = AlertThrottle(gapMs = 400)

        assertTrue(throttle.allow(trouble, now = 1_000))
        assertTrue(throttle.allow(turnFinished, now = 1_500))
    }
}

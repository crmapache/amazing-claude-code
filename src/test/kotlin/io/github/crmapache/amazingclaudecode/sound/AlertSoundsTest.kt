package io.github.crmapache.amazingclaudecode.sound

import java.io.ByteArrayInputStream
import javax.sound.sampled.AudioSystem
import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertFalse
import kotlin.test.assertNotNull
import kotlin.test.assertTrue

/**
 * Оповещение, у которого пропал файл, молчит — и молчит незаметно: узнать об
 * этом можно было бы только по тому, что панель однажды не позвала.
 */
class AlertSoundsTest {

    @Test
    fun `у каждого повода есть свой звук`() {
        assertEquals(
            setOf("turnFinished", "permission", "plan", "question", "rateLimit", "trouble"),
            AlertSounds.ids,
        )
    }

    @Test
    fun `все файлы лежат в ресурсах и читаются звуковой подсистемой`() {
        for ((id, file) in AlertSounds.FILES) {
            val bytes = AlertSounds::class.java.getResourceAsStream("/sounds/$file")?.use { it.readBytes() }
            assertNotNull(bytes, "нет файла звука $id: /sounds/$file")
            assertTrue(bytes.isNotEmpty(), "пустой файл звука $id")

            // Формат разбирается тем же способом, что и при проигрывании: файл,
            // который JVM не понимает, здесь и обнаружится.
            AudioSystem.getAudioInputStream(ByteArrayInputStream(bytes)).use { stream ->
                assertTrue(stream.format.sampleRate > 0, "странный формат у звука $id")
            }
        }
    }

    @Test
    fun `незнакомое имя не роняет панель`() {
        AlertSounds.play("nope", 100)
    }

    @Test
    fun `нулевая громкость не заводит проигрывание вовсе`() {
        AlertSounds.play("turnFinished", 0)
    }

    @Test
    fun `порядок звуков задаёт их важность`() {
        assertEquals(listOf("trouble", "rateLimit", "permission", "question", "plan", "turnFinished"), AlertSounds.ids.toList())
    }
}

class AlertThrottleTest {

    /** Ранги — те же, что и в AlertSounds: чем меньше, тем тревожнее. */
    private val trouble = 0
    private val turnFinished = 5

    @Test
    fun `первый сигнал проходит всегда`() {
        assertTrue(AlertThrottle(gapMs = 400).allow(turnFinished, now = 1_000))
    }

    @Test
    fun `равный по важности внутри окна молчит`() {
        val throttle = AlertThrottle(gapMs = 400)

        assertTrue(throttle.allow(turnFinished, now = 1_000))
        assertFalse(throttle.allow(turnFinished, now = 1_100))
    }

    @Test
    fun `более важный пробивается внутри окна`() {
        // Фоновая вкладка умерла в тот же миг, когда соседняя закончила ход:
        // потерять этот сигнал нельзя.
        val throttle = AlertThrottle(gapMs = 400)

        assertTrue(throttle.allow(turnFinished, now = 1_000))
        assertTrue(throttle.allow(trouble, now = 1_010))
    }

    @Test
    fun `после важного менее важное в том же окне молчит`() {
        val throttle = AlertThrottle(gapMs = 400)

        assertTrue(throttle.allow(trouble, now = 1_000))
        assertFalse(throttle.allow(turnFinished, now = 1_010))
    }

    @Test
    fun `за окном проходит любой`() {
        val throttle = AlertThrottle(gapMs = 400)

        assertTrue(throttle.allow(trouble, now = 1_000))
        assertTrue(throttle.allow(turnFinished, now = 1_500))
    }
}

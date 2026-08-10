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
 * Звуковые оповещения панели.
 *
 * Звук проигрывает оболочка, а не сама страница: встроенный браузер рисуется
 * офскрин и подчиняется политике автовоспроизведения, из-за которой первый же
 * звук без клика мышью просто не прозвучал бы. Системному микшеру всё равно,
 * смотрит ли человек в панель и открыта ли она вообще, — а именно этого от
 * оповещения и ждут.
 *
 * Решает, когда звучать, интерфейс: только он знает, что план ждёт решения, а
 * ход дошёл до конца. Сюда приходит уже готовое имя звука.
 */
internal object AlertSounds {

    /**
     * Имена — те же, что в протоколе панели. Файлы лежат в ресурсах плагина, а
     * не читаются с диска пользователя: набор звуков — часть плагина.
     *
     * Порядок здесь — это важность, от самого тревожного к самому будничному:
     * по нему решается, чей сигнал переживёт другой, если оба случились разом
     * (см. [AlertThrottle]). Тот же порядок описан и в самой панели, где из
     * нескольких поводов одной вкладки выбирается главный (sounds.ts).
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

    /** Байты уже прочитанных файлов: со второго раза звук не трогает диск. */
    private val cache = ConcurrentHashMap<String, ByteArray>()

    private val throttle = AlertThrottle()

    /** [volume] — проценты от полной громкости файла, как в списке настроек. */
    fun play(id: String, volume: Int = 100) {
        val file = FILES[id] ?: return
        if (volume <= 0) return
        if (!throttle.allow(FILES.keys.indexOf(id), System.currentTimeMillis())) return

        // Открытие линии обращается к системному микшеру и ждёт его ответа —
        // на потоке интерфейса это заметная пауза в самой панели.
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

        // Линия звуковой карты — ресурс не бесконечный, и занимает её уже сам
        // запрос клипа, до всякого проигрывания. Поэтому дальше она закрывается
        // при любом исходе: и когда звук доиграл, и когда открыть его не вышло —
        // иначе занятое устройство отнимало бы по линии на каждое оповещение,
        // пока панель не замолчала бы совсем.
        val clip = runCatching { AudioSystem.getClip() }.getOrElse {
            thisLogger().warn("No audio line for sound $id", it)
            return
        }

        // Поток одноразовый: на каждое проигрывание он свой, а вот байты общие.
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
            // Звук — не то, ради чего стоит ронять панель: на машине без звуковой
            // карты (или с занятым устройством) оповещение просто не прозвучит.
            // Слушателю выше тут рассчитывать не на что — он ждёт конца того, что
            // так и не началось, — поэтому прибираем за собой здесь.
            runCatching { clip.close() }
            runCatching { stream?.close() }
            thisLogger().warn("Failed to play sound $id", it)
        }
    }

    /**
     * Убавить громкость линии до просимой доли.
     *
     * Микшер принимает не проценты, а усиление в децибелах — величину
     * логарифмическую, потому что таков и слух: половина процентов на слух не
     * половина громкости, а «чуть тише». Отсюда перевод через логарифм: он
     * делает шкалу равномерной на слух, а не на бумаге.
     *
     * Своего регулятора у линии может и не быть — тогда звук просто идёт как
     * есть: это лучше, чем не зазвучать вовсе.
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
 * Кто из подряд идущих сигналов прозвучит.
 *
 * Поводов, зовущих человека, случается по нескольку разом: агент просит подряд
 * три разрешения, ход обрывается ошибкой и тут же заканчивается, а один проход
 * панели по вкладкам умеет позвать сразу от нескольких разговоров. Играть их
 * все — каша из наложенных сигналов, из которой не разобрать ни одного, поэтому
 * идущие следом какое-то время молчат.
 *
 * Но молчать обязано менее важное, а не то, что просто опоздало на миллисекунду.
 * Пропусти оболочка первый попавшийся сигнал — умерший процесс фоновой вкладки
 * потерялся бы за только что закончившимся ходом соседней. Поэтому сигнал важнее
 * предыдущего проходит и внутри окна: услышать два подряд лучше, чем не услышать
 * главный.
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

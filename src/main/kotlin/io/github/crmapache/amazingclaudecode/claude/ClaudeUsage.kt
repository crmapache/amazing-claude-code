package io.github.crmapache.amazingclaudecode.claude

import java.time.Instant
import java.time.OffsetDateTime
import kotlin.math.abs
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.contentOrNull
import kotlinx.serialization.json.jsonPrimitive

/**
 * Разбор ответа CLI на `get_usage`: окна расхода подписки и размер окна
 * контекста. Не важно, отвечал живой разговор или разовый пинг — форма одна.
 *
 * Отдельно от панели, потому что вся сложность здесь именно в форме ответа: у
 * только что поднятого процесса лимитов ещё нет вовсе, размер окна контекста
 * лежит в разбивке по моделям, а пустое место приходит честным null. Панели же
 * остаётся сложить готовые числа в сообщение наверх.
 */
internal object ClaudeUsage {

    /** Одно окно расхода: доля и когда обнулится (пустая строка — CLI не сказал). */
    data class Window(val percent: Int, val resets: String) {

        /** Время сброса разобранным, или null: CLI шлёт и `Z`, и `+00:00`, и ничего. */
        val resetsAt: Instant? by lazy {
            if (resets.isBlank()) null else runCatching { OffsetDateTime.parse(resets).toInstant() }.getOrNull()
        }

        /** Про нынешнее ли окно эта доля: сброс ещё впереди, значит окно то самое. */
        fun isCurrent(now: Instant): Boolean = resetsAt?.isAfter(now) == true
    }

    data class Snapshot(val session: Window?, val week: Window?, val contextWindow: Int?) {
        /**
         * Приехали ли сами лимиты. Без них панель переспрашивает: обычно это
         * значит, что процесс поднялся, но окна подписки от сервера ещё не
         * узнал, — через пару секунд ответ будет полным.
         */
        val hasLimits: Boolean get() = session != null || week != null

        /**
         * Замер ли ответ. Окно, чьё время сброса уже прошло, значит ровно одно:
         * отвечавший процесс не обращался к серверу с прошлого окна и повторяет
         * долю из него. Переспрашивать его бесполезно — за свежими цифрами панель
         * идёт к серверу (см. refreshLimits).
         */
        fun isStale(now: Instant = Instant.now()): Boolean =
            listOfNotNull(session, week).any { it.resetsAt != null && !it.isCurrent(now) }
    }

    fun parse(usage: JsonObject): Snapshot {
        val limits = usage.child("rate_limits")

        return Snapshot(
            session = limits?.let { window(it, "five_hour") },
            week = limits?.let { window(it, "seven_day") },
            contextWindow = contextWindow(usage),
        )
    }

    /**
     * Копилка окон: приводит поток разнородных снимков к тому, что на самом деле
     * происходит с лимитом.
     *
     * Одну и ту же долю панель узнаёт двумя путями, и они расходятся. Живой
     * разговор отдаёт цифру из последнего ответа сервера на запрос к модели: она
     * самая свежая, но замирает, пока ходов нет, — процесс, работавший вчера,
     * весь день отвечает вчерашней долей. Разовый пинг спрашивает сводку у
     * сервера: она про сейчас, но отстаёт на минуты (за пять минут наблюдения
     * подряд шли 3, 12, 17, 20 процентов). Показывать это как есть значит мигать
     * процентом туда-сюда, а после сброса окна — держать на кольце долю прошлого
     * окна: ровно так там и оказывались 99% при почти пустом окне.
     *
     * Поэтому окно узнаётся по времени сброса, а доля на слово не берётся:
     * - сброс уже прошёл — снимок из окна, которого больше нет, и доля из него
     *   ничего не говорит о нынешнем; нынешнее пусто, пока не приедут данные;
     * - то же окно (время сброса совпало) — берём наибольшую из виденных долей:
     *   внутри окна расход только растёт, а расхождение путей — это задержка
     *   одного из них, а не откат расхода;
     * - окно новее известного — начинаем считать заново, с него.
     *
     * Экземпляр живёт вместе с панелью: это её память о том, что уже видели.
     */
    class Tracker {

        private var session: Window? = null
        private var week: Window? = null

        /**
         * Тот же снимок, но с окнами, сверенными со всем, что видели раньше.
         *
         * Под замком: ответы приезжают то от разговора, то от пинга — каждый в
         * своём потоке, — и без него два одновременных снимка затирали бы память
         * друг друга.
         */
        @Synchronized
        fun merge(snapshot: Snapshot, now: Instant = Instant.now()): Snapshot {
            session = fold(session, snapshot.session, now)
            week = fold(week, snapshot.week, now)

            return snapshot.copy(session = session, week = week)
        }

        private fun fold(known: Window?, incoming: Window?, now: Instant): Window? {
            // Известное окно, но только пока оно нынешнее: с моментом сброса его
            // доля перестаёт что-либо значить, даже если новых данных нет.
            val current = known?.takeIf { it.isCurrent(now) }

            val incomingAt = incoming?.resetsAt
            if (incomingAt == null) {
                // Нуль без времени сброса — честное «окно ещё не открывалось»: так
                // отвечает процесс, не сделавший ни одного запроса. А вот долю без
                // окна привязать не к чему, и перебивать ей известное нельзя.
                return current
                    ?: incoming?.takeIf { it.percent == 0 }
                    // Знали окно, а оно кончилось: в новом расход с нуля.
                    ?: RESET.takeIf { known != null }
            }

            // Снимок из окна, которое уже сброшено: его доля — про прошлое, а про
            // нынешнее окно она говорит ровно одно — оно началось заново. Именно
            // так и приходит замерший ответ процесса, работавшего до сброса.
            if (!incomingAt.isAfter(now)) return current ?: RESET

            val currentAt = current?.resetsAt ?: return incoming

            return when {
                // Одно и то же окно с точностью до минут, а не строкой: время
                // сброса фиксировано, но пути дают его по-разному — живой разговор
                // округляет до секунд («20:30:00.000Z»), сводка от сервера несёт
                // микросекунды («20:30:00.464237+00:00»). Сравнение строк считало
                // бы это разными окнами и обнуляло копилку на каждом шаге, а
                // настоящие окна отличаются на пять часов или на неделю.
                abs(currentAt.toEpochMilli() - incomingAt.toEpochMilli()) <= SAME_WINDOW_TOLERANCE_MS ->
                    incoming.copy(percent = maxOf(current.percent, incoming.percent))
                // Окно новее известного — сброс случился, считаем заново с него.
                incomingAt.isAfter(currentAt) -> incoming
                // Иначе снимок отстал на целое окно: держим то, что уже знаем.
                else -> current
            }
        }
    }

    /**
     * Окно сброшено, а свежих данных ещё нет: расход в новом окне нулевой, а
     * когда оно кончится — станет известно с первым же запросом к модели.
     */
    private val RESET = Window(percent = 0, resets = "")

    private const val SAME_WINDOW_TOLERANCE_MS = 2 * 60 * 1000L

    private fun window(limits: JsonObject, name: String): Window? {
        val window = limits.child(name) ?: return null
        val percent = window["utilization"]?.jsonPrimitive?.contentOrNull?.toDoubleOrNull() ?: return null

        return Window(
            percent = percent.toInt(),
            resets = window["resets_at"]?.jsonPrimitive?.contentOrNull.orEmpty(),
        )
    }

    /**
     * Размер окна контекста зависит от модели: у больших он миллион, а не двести
     * тысяч. Берём его из ответа, иначе доля на датчике будет втрое заниженной.
     */
    private fun contextWindow(usage: JsonObject): Int? {
        val models = usage.child("session")?.child("model_usage") ?: return null

        return models.keys
            .mapNotNull { models.child(it)?.get("contextWindow")?.jsonPrimitive?.contentOrNull?.toIntOrNull() }
            // 0 отсекаем наравне с null: на стороне вебвью его девать некуда —
            // `?? current` не срабатывает на 0 (это не nullish), он застревает
            // в state панели навсегда, и датчик контекста делится на ноль.
            .filter { it > 0 }
            .maxOrNull()
    }
}

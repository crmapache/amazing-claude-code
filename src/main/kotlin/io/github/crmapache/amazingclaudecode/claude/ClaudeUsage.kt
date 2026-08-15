package io.github.crmapache.amazingclaudecode.claude

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
    data class Window(val percent: Int, val resets: String)

    data class Snapshot(val session: Window?, val week: Window?, val contextWindow: Int?) {
        /**
         * Приехали ли сами лимиты. Без них панель переспрашивает: обычно это
         * значит, что процесс поднялся, но окна подписки от сервера ещё не
         * узнал, — через пару секунд ответ будет полным.
         */
        val hasLimits: Boolean get() = session != null || week != null
    }

    fun parse(usage: JsonObject): Snapshot {
        val limits = usage.child("rate_limits")

        return Snapshot(
            session = limits?.let { window(it, "five_hour") },
            week = limits?.let { window(it, "seven_day") },
            contextWindow = contextWindow(usage),
        )
    }

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

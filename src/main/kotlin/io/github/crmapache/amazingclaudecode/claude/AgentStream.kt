package io.github.crmapache.amazingclaudecode.claude

import kotlinx.serialization.json.Json
import kotlinx.serialization.json.contentOrNull
import kotlinx.serialization.json.jsonObject
import kotlinx.serialization.json.jsonPrimitive

/**
 * Чтение потока агента настолько, насколько это нужно самой оболочке.
 *
 * Разбирать события целиком здесь незачем — это работа интерфейса. Оболочке важно
 * одно: где кончился ход. По нему она гасит работу в панели, отправляет
 * отложенную служебную команду и понимает, свободен ли разговор (см.
 * [ClaudeSession]).
 */
internal object AgentStream {

    /**
     * Правда ли, что эта строка — итог хода.
     *
     * Быстрая проверка по подстроке решает почти всё, но одной её мало:
     * `"type":"result"` встречается и внутри самого разговора — стоит агенту
     * напечатать пример потокового события или показать результат инструмента с
     * таким текстом. Принять такой текст за конец хода значит погасить работу на
     * полуслове и подписать ходу итог посреди дела, поэтому в спорном случае (а
     * он редкий) разбираем строку и смотрим тип на верхнем уровне.
     */
    fun isTurnResult(line: String): Boolean {
        if (!line.contains("\"type\":\"result\"")) return false

        val type = runCatching {
            Json.parseToJsonElement(line).jsonObject["type"]?.jsonPrimitive?.contentOrNull
        }.getOrNull()

        return type == "result"
    }
}

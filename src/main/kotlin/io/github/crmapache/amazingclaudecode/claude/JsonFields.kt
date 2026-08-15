package io.github.crmapache.amazingclaudecode.claude

import kotlinx.serialization.json.JsonArray
import kotlinx.serialization.json.JsonObject

/**
 * Терпимое чтение ответов CLI.
 *
 * Пустое место у него — это не только отсутствующее поле: в ответ пишется и
 * честный null. Так приходят лимиты подписки у только что поднятого процесса,
 * сводка сессии, настройки MCP-сервера. Привычные `jsonObject` и `jsonArray` на
 * таком месте бросают исключение, а лететь ему некуда: разбор идёт в том же
 * потоке, что и события разговора, — и вместе с цифрой в углу панель теряет
 * ещё не разобранный хвост вывода.
 */
internal fun JsonObject.child(name: String): JsonObject? = this[name] as? JsonObject

/** То же самое для списка — см. [child]. */
internal fun JsonObject.items(name: String): JsonArray? = this[name] as? JsonArray

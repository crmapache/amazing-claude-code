package io.github.crmapache.amazingclaudecode.claude

import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.contentOrNull
import kotlinx.serialization.json.jsonPrimitive

/**
 * Как назвать человеку вызов инструмента, на который просят разрешения.
 *
 * Отдельно от [PermissionServer], потому что спрашивают двумя разными путями: хук
 * перед опасным инструментом и встречный вопрос самого агента по управляющему
 * каналу (см. [PermissionChannel]). Карточка в панели одна и та же, значит
 * и подписи к ней должны быть одни и те же.
 */
internal object PermissionPrompt {

    /** Короткая строка «что собирается сделать» — заголовок карточки. */
    fun target(toolName: String, input: JsonObject?): String {
        val path = input.string("file_path").ifEmpty { input.string("notebook_path") }
        if (path.isNotEmpty()) return "wants to edit ${path.substringAfterLast('/')}"

        return when (toolName) {
            "Bash" -> "wants to run a command"
            "WebFetch", "WebSearch" -> "wants to reach the network"
            else -> "wants to use $toolName"
        }
    }

    /** Сама суть вызова: команда, адрес или путь — то, по чему запоминается правило. */
    fun command(toolName: String, input: JsonObject?): String {
        if (input == null) return toolName

        return input.string("command").ifEmpty {
            input.string("url").ifEmpty {
                input.string("file_path").ifEmpty { toolName }
            }
        }
    }

    private fun JsonObject?.string(key: String): String =
        this?.get(key)?.jsonPrimitive?.contentOrNull.orEmpty()
}

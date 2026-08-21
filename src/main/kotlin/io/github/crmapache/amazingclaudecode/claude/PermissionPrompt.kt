package io.github.crmapache.amazingclaudecode.claude

import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.contentOrNull
import kotlinx.serialization.json.jsonPrimitive

/**
 * How to name, for a person, the tool call permission is being asked for.
 *
 * Apart from [PermissionChannel]: that one parses the protocol, this one writes the card's captions.
 * Different concerns, and they are checked in different ways.
 */
internal object PermissionPrompt {

    /** The short "what it is about to do" line - the card's title. */
    fun target(toolName: String, input: JsonObject?): String {
        val path = input.string("file_path").ifEmpty { input.string("notebook_path") }
        if (path.isNotEmpty()) return "wants to edit ${path.substringAfterLast('/')}"

        return when (toolName) {
            "Bash" -> "wants to run a command"
            "WebFetch", "WebSearch" -> "wants to reach the network"
            else -> "wants to use $toolName"
        }
    }

    /** The substance of the call: the command, the address or the path - what a rule is remembered by. */
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

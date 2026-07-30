package io.github.crmapache.amazingclaudecode.claude

import com.intellij.openapi.diagnostic.thisLogger
import java.io.File
import kotlinx.serialization.json.Json
import kotlinx.serialization.json.JsonArray
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.JsonPrimitive
import kotlinx.serialization.json.buildJsonArray
import kotlinx.serialization.json.buildJsonObject
import kotlinx.serialization.json.jsonArray
import kotlinx.serialization.json.jsonObject

/**
 * Запоминание решения «разрешать всегда».
 *
 * Правило кладём туда же, куда его кладёт сам Claude Code, — в локальные настройки
 * проекта. Тогда правило переживает перезапуск панели, работает и в терминале, и
 * его видно глазами в файле, а не только в нашей памяти.
 */
internal object PermissionRules {

    private val json = Json { prettyPrint = true }

    fun allowAlways(projectPath: String, toolName: String, input: String) {
        val rule = rule(toolName, input)
        val file = File(projectPath, ".claude/settings.local.json")

        runCatching {
            file.parentFile?.mkdirs()

            val current = if (file.isFile) {
                Json.parseToJsonElement(file.readText()).jsonObject
            } else {
                JsonObject(emptyMap())
            }

            file.writeText(json.encodeToString(JsonObject.serializer(), withRule(current, rule)))
        }.onFailure {
            thisLogger().warn("Failed to store permission rule", it)
        }
    }

    /**
     * Правило в том же виде, что понимает сам агент: для команд — префикс со
     * звёздочкой, чтобы не спрашивать про каждый её аргумент, для остального —
     * имя инструмента целиком.
     */
    fun rule(toolName: String, input: String): String {
        if (toolName != "Bash") return toolName

        val head = input.trim().split(Regex("\\s+")).take(2).joinToString(" ")
        return if (head.isEmpty()) toolName else "Bash($head *)"
    }

    private fun withRule(settings: JsonObject, rule: String): JsonObject {
        val permissions = settings["permissions"]?.jsonObject ?: JsonObject(emptyMap())
        val allow = permissions["allow"]?.jsonArray ?: JsonArray(emptyList())

        if (allow.any { it is JsonPrimitive && it.content == rule }) return settings

        val updatedAllow = buildJsonArray {
            allow.forEach { add(it) }
            add(JsonPrimitive(rule))
        }

        val updatedPermissions = buildJsonObject {
            permissions.forEach { (key, value) -> if (key != "allow") put(key, value) }
            put("allow", updatedAllow)
        }

        return buildJsonObject {
            settings.forEach { (key, value) -> if (key != "permissions") put(key, value) }
            put("permissions", updatedPermissions)
        }
    }
}

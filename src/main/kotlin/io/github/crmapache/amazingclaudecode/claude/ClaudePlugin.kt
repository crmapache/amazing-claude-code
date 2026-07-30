package io.github.crmapache.amazingclaudecode.claude

import kotlinx.serialization.json.Json
import kotlinx.serialization.json.JsonElement
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.booleanOrNull
import kotlinx.serialization.json.contentOrNull
import kotlinx.serialization.json.intOrNull
import kotlinx.serialization.json.jsonArray
import kotlinx.serialization.json.jsonObject
import kotlinx.serialization.json.jsonPrimitive

internal data class InstalledPlugin(
    /** "context7@claude-plugins-official" — имя плагина и его маркетплейс одной строкой. */
    val id: String,
    val version: String,
    val scope: String,
    val enabled: Boolean,
    /** Путь на диске, где лежат его commands/ и skills/ — нужен для ClaudeCommandHints. */
    val installPath: String? = null,
)

internal data class AvailablePlugin(
    val id: String,
    val name: String,
    val description: String,
    val marketplace: String,
    val installCount: Int,
)

internal data class PluginMarketplace(
    val name: String,
    /** Человекочитаемый источник: "github: anthropics/claude-plugins-official" и т.п. */
    val source: String,
)

/**
 * Плагины и маркетплейсы — то же самое, что [ClaudeMcp] для MCP-серверов: разовые
 * вызовы `claude plugin ...`, а не часть живого разговора. В отличие от MCP, тут у
 * install/uninstall/enable/disable есть собственные подкоманды CLI — маршрутизировать
 * их через слэш-команду внутри сессии не нужно, все идут напрямую.
 *
 * `list` заодно тянет каталог доступных в подключённых маркетплейсах плагинов
 * (`--available`) — реальный поиск по 200+ плагинам, чего для MCP-серверов в
 * принципе не существует (там нет публичного реестра).
 */
internal object ClaudePlugin {

    // Каталог маркетплейсов заметно тяжелее одного списка MCP-серверов.
    private const val LIST_TIMEOUT_MS = 60_000

    fun list(
        workingDirectory: String?,
        onResult: (installed: List<InstalledPlugin>, available: List<AvailablePlugin>) -> Unit,
        onError: (String) -> Unit,
    ) {
        ClaudeCli.run(
            workingDirectory,
            listOf("plugin", "list", "--available", "--json"),
            timeoutMs = LIST_TIMEOUT_MS,
            onError = onError,
        ) { output ->
            val parsed = runCatching { Json.parseToJsonElement(output).jsonObject }.getOrNull()
            if (parsed == null) {
                onError("Couldn't parse the plugin list.")
                return@run
            }

            onResult(
                parsed["installed"]?.jsonArray.orEmpty().mapNotNull(::parseInstalled),
                parsed["available"]?.jsonArray.orEmpty().mapNotNull(::parseAvailable),
            )
        }
    }

    /**
     * Только установленные, без каталога доступных — для подсказок аргументов
     * слэш-команд нужны лишь id и installPath, а полный `--available` тянет
     * каталог всех плагинов подключённых маркетплейсов и ощутимо медленнее.
     */
    fun installed(
        workingDirectory: String?,
        onResult: (List<InstalledPlugin>) -> Unit,
        onError: (String) -> Unit,
    ) {
        ClaudeCli.run(workingDirectory, listOf("plugin", "list", "--json"), onError = onError) { output ->
            val parsed = runCatching { Json.parseToJsonElement(output).jsonArray }.getOrNull()
            if (parsed == null) {
                onError("Couldn't parse the plugin list.")
                return@run
            }

            onResult(parsed.mapNotNull(::parseInstalled))
        }
    }

    fun marketplaces(
        workingDirectory: String?,
        onResult: (List<PluginMarketplace>) -> Unit,
        onError: (String) -> Unit,
    ) {
        ClaudeCli.run(workingDirectory, listOf("plugin", "marketplace", "list", "--json"), onError = onError) { output ->
            val parsed = runCatching { Json.parseToJsonElement(output).jsonArray }.getOrNull()
            if (parsed == null) {
                onError("Couldn't parse the marketplace list.")
                return@run
            }

            onResult(parsed.mapNotNull(::parseMarketplace))
        }
    }

    fun install(workingDirectory: String?, plugin: String, onResult: (String) -> Unit, onError: (String) -> Unit) {
        ClaudeCli.run(workingDirectory, listOf("plugin", "install", plugin), onError = onError) { output ->
            onResult(formatResult(output).ifEmpty { "Installed $plugin." })
        }
    }

    fun uninstall(workingDirectory: String?, plugin: String, onResult: (String) -> Unit, onError: (String) -> Unit) {
        ClaudeCli.run(workingDirectory, listOf("plugin", "uninstall", plugin), onError = onError) { output ->
            onResult(formatResult(output).ifEmpty { "Uninstalled $plugin." })
        }
    }

    fun enable(workingDirectory: String?, plugin: String, onResult: (String) -> Unit, onError: (String) -> Unit) {
        ClaudeCli.run(workingDirectory, listOf("plugin", "enable", plugin), onError = onError) { output ->
            onResult(formatResult(output).ifEmpty { "Enabled $plugin." })
        }
    }

    fun disable(workingDirectory: String?, plugin: String, onResult: (String) -> Unit, onError: (String) -> Unit) {
        ClaudeCli.run(workingDirectory, listOf("plugin", "disable", plugin), onError = onError) { output ->
            onResult(formatResult(output).ifEmpty { "Disabled $plugin." })
        }
    }

    fun addMarketplace(workingDirectory: String?, source: String, onResult: (String) -> Unit, onError: (String) -> Unit) {
        ClaudeCli.run(workingDirectory, listOf("plugin", "marketplace", "add", source), onError = onError) { output ->
            onResult(formatResult(output).ifEmpty { "Added marketplace $source." })
        }
    }

    fun removeMarketplace(workingDirectory: String?, name: String, onResult: (String) -> Unit, onError: (String) -> Unit) {
        ClaudeCli.run(workingDirectory, listOf("plugin", "marketplace", "remove", name), onError = onError) { output ->
            onResult(formatResult(output).ifEmpty { "Removed marketplace $name." })
        }
    }

    /**
     * `claude plugin install` печатает "Installing plugin…" и итог (✔/✘) одним
     * куском без единого разделителя — проверено напрямую побайтово, это не наша
     * недостача переноса строки, а как есть у самого CLI. Ставим перенос сами.
     */
    private fun formatResult(output: String): String =
        output.trim().replace(Regex("""\s*([✔✘])"""), "\n$1").trim()

    private fun parseInstalled(element: JsonElement): InstalledPlugin? {
        val obj = element as? JsonObject ?: return null
        val id = obj["id"]?.jsonPrimitive?.contentOrNull ?: return null

        return InstalledPlugin(
            id = id,
            version = obj["version"]?.jsonPrimitive?.contentOrNull ?: "unknown",
            scope = obj["scope"]?.jsonPrimitive?.contentOrNull ?: "user",
            enabled = obj["enabled"]?.jsonPrimitive?.booleanOrNull ?: true,
            installPath = obj["installPath"]?.jsonPrimitive?.contentOrNull,
        )
    }

    private fun parseAvailable(element: JsonElement): AvailablePlugin? {
        val obj = element as? JsonObject ?: return null
        val id = obj["pluginId"]?.jsonPrimitive?.contentOrNull ?: return null

        return AvailablePlugin(
            id = id,
            name = obj["name"]?.jsonPrimitive?.contentOrNull ?: id,
            description = obj["description"]?.jsonPrimitive?.contentOrNull.orEmpty(),
            marketplace = obj["marketplaceName"]?.jsonPrimitive?.contentOrNull.orEmpty(),
            installCount = obj["installCount"]?.jsonPrimitive?.intOrNull ?: 0,
        )
    }

    private fun parseMarketplace(element: JsonElement): PluginMarketplace? {
        val obj = element as? JsonObject ?: return null
        val name = obj["name"]?.jsonPrimitive?.contentOrNull ?: return null
        // Форма источника разная в зависимости от типа: у github есть repo, у
        // прочих (url/path) — соответствующее поле с тем же смыслом.
        val kind = obj["source"]?.jsonPrimitive?.contentOrNull.orEmpty()
        val detail = obj["repo"]?.jsonPrimitive?.contentOrNull
            ?: obj["url"]?.jsonPrimitive?.contentOrNull
            ?: obj["path"]?.jsonPrimitive?.contentOrNull

        val source = if (kind.isNotEmpty() && detail != null) "$kind: $detail" else kind.ifEmpty { detail.orEmpty() }
        return PluginMarketplace(name = name, source = source)
    }
}

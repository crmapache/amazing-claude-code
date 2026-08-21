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
    /** "context7@claude-plugins-official" - the plugin's name and its marketplace in one string. */
    val id: String,
    val version: String,
    val scope: String,
    val enabled: Boolean,
    /** The path on disk where its commands/ and skills/ live - needed by ClaudeCommandHints. */
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
    /** A human-readable source: "github: anthropics/claude-plugins-official" and the like. */
    val source: String,
)

/**
 * Plugins and marketplaces - the same thing [ClaudeMcp] is for MCP servers: one-off `claude plugin ...`
 * calls rather than part of a live conversation. Unlike MCP, install/uninstall/enable/disable have CLI
 * subcommands of their own - there is no need to route them through a slash command inside the session,
 * they all go directly.
 *
 * `list` also pulls the catalogue of plugins available in the connected marketplaces (`--available`) -
 * a real search across 200+ plugins, which for MCP servers does not exist at all (there is no public
 * registry there).
 */
internal object ClaudePlugin {

    // The marketplace catalogue is noticeably heavier than a single list of MCP servers.
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
     * The installed ones only, without the available catalogue - for slash command argument hints only
     * the id and the installPath are needed, while a full `--available` pulls the catalogue of every
     * plugin in every connected marketplace and is noticeably slower.
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
     * `claude plugin install` prints "Installing plugin…" and the outcome (✔/✘) as one lump without a
     * single separator - checked byte by byte directly, this is not a newline we dropped but how the
     * CLI has it. So we add the break ourselves.
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
        // The shape of the source differs by type: github has a repo, the others (url/path) have the
        // corresponding field with the same meaning.
        val kind = obj["source"]?.jsonPrimitive?.contentOrNull.orEmpty()
        val detail = obj["repo"]?.jsonPrimitive?.contentOrNull
            ?: obj["url"]?.jsonPrimitive?.contentOrNull
            ?: obj["path"]?.jsonPrimitive?.contentOrNull

        val source = if (kind.isNotEmpty() && detail != null) "$kind: $detail" else kind.ifEmpty { detail.orEmpty() }
        return PluginMarketplace(name = name, source = source)
    }
}

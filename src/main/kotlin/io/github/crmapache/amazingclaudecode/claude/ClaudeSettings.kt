package io.github.crmapache.amazingclaudecode.claude

import java.io.File
import kotlinx.serialization.json.Json
import kotlinx.serialization.json.contentOrNull
import kotlinx.serialization.json.jsonObject
import kotlinx.serialization.json.jsonPrimitive

/**
 * Claude Code's settings files - the same ones the CLI itself reads, in the same order of precedence.
 *
 * The panel looks into them not out of curiosity: part of what the CLI decides happens before the
 * first event, and the person only ever sees those decisions in the panel. The permission mode a
 * conversation will start in, and whether the "no questions" mode is forbidden at all, are exactly
 * that kind of decision. Asking the CLI is no help: it answers with a process already running, while
 * the selector in the panel has to tell the truth from the first second.
 *
 * The layers are listed from the strongest down, the way the CLI merges them (`userSettings` →
 * `projectSettings` → `localSettings` → `policySettings`, each one overriding the previous). So the
 * first value found while walking from the top is the one in force.
 */
internal object ClaudeSettings {

    /**
     * Whose file this is.
     *
     * The CLI's layers differ in more than precedence: a project's settings live inside the repository
     * itself, and anyone who has sent a change to it could have slipped a laxer mode in. That is why
     * the `auto` mode is accepted only from an organization's policy and from personal settings - see
     * [PermissionDefaultMode].
     */
    enum class Layer { POLICY, LOCAL, PROJECT, USER }

    data class Source(val layer: Layer, val file: File)

    /**
     * Layers from the strongest down: the first value found is the one in force.
     *
     * The policy's and the user's files are the CLI's own, wherever the CLI runs for this project (see
     * ClaudeHome): for a project opened out of WSL they are the distribution's, not this machine's. The
     * project's own files are read where the IDE sees the project.
     */
    fun sources(projectDirectory: String?): List<Source> = buildList {
        val home = ClaudeHome.of(projectDirectory)
        val managed = home.managedSettingsDirectory
        add(Source(Layer.POLICY, File(managed, MANAGED_SETTINGS)))
        // The directory beside the policy: its separate pieces live there and the CLI reads all of
        // them. By name, so that the order is the same on every launch.
        managed.resolve("$MANAGED_SETTINGS.d").listFiles()
            ?.filter { it.extension == "json" }
            ?.sortedBy { it.name }
            ?.forEach { add(Source(Layer.POLICY, it)) }

        projectDirectory?.let { directory ->
            add(Source(Layer.LOCAL, File(directory, ".claude/$LOCAL_SETTINGS")))
            add(Source(Layer.PROJECT, File(directory, ".claude/$SETTINGS")))
        }

        add(Source(Layer.USER, File(home.configDirectory, SETTINGS)))
    }

    /**
     * The value of a field inside `permissions` - or nothing.
     *
     * Nothing both for a missing file and for a broken one: parsing someone else's settings is not our
     * business, and broken ones are the CLI's own concern. The panel must neither crash over them nor
     * change the person's mode because of them.
     */
    fun permission(file: File, field: String): String = runCatching {
        if (!file.isFile) return ""

        Json.parseToJsonElement(file.readText())
            .jsonObject["permissions"]
            ?.jsonObject
            ?.get(field)
            ?.jsonPrimitive
            ?.contentOrNull
            .orEmpty()
    }.getOrDefault("")

    private const val MANAGED_SETTINGS = "managed-settings.json"
    private const val SETTINGS = "settings.json"
    private const val LOCAL_SETTINGS = "settings.local.json"
}

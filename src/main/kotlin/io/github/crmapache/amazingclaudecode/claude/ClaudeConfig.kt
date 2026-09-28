package io.github.crmapache.amazingclaudecode.claude

import java.io.File
import kotlinx.serialization.json.Json
import kotlinx.serialization.json.JsonElement
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.JsonPrimitive
import kotlinx.serialization.json.booleanOrNull
import kotlinx.serialization.json.contentOrNull
import kotlinx.serialization.json.jsonObject

/**
 * Claude Code's own settings - what `/config` changes in a terminal - as a screen of the panel can show
 * and change them.
 *
 * In a terminal `/config` opens a screen of tabs where every setting is changed in place. The panel runs
 * the CLI as a stream (see ClaudeLaunch), and there the same command prints a usage text instead: the
 * key of every setting with the values it takes, and the form `/config key=value`. Typed into the panel,
 * that text landed in the feed as a wall of monospace nobody could act on, and the person went off to
 * edit the CLI's files by hand.
 *
 * So the screen is built out of the CLI's own words, and the CLI does the writing:
 * - **which settings exist, and what they take**, is that very usage text ([parse]) - one per CLI version,
 *   so a setting a newer CLI adds appears here without a release of the plugin;
 * - **the change** goes through `/config key=value` (see ProjectCatalog.setClaudeConfig) - the CLI's own
 *   writer, into the files a terminal's `/config` writes, with its own validation and its own refusals;
 * - **the current value** is the one thing the CLI does not say in this mode, so it is read off its files
 *   here ([settings]), by the rules its own screen reads them with ([SPECS]). A setting this table does
 *   not know is still offered - without a value marked as current rather than with a guessed one.
 */
internal object ClaudeConfig {

    /** One line of the usage text: a key, and the values it takes - or any value at all. */
    data class Entry(val key: String, val options: List<String>, val free: Boolean)

    /**
     * The usage text `/config` prints, as entries. Lines that are not `key=values` are skipped, the heading
     * included; an empty list means the CLI said something else entirely - an old one that knows no
     * `key=value`, say - and the screen says so rather than showing nothing.
     */
    fun parse(text: String): List<Entry> = text.lineSequence()
        .mapNotNull { line -> ENTRY.matchEntire(line.trim()) }
        .map { match ->
            val key = match.groupValues[1]
            val values = match.groupValues[2].trim()
            if (values.startsWith("<") && values.endsWith(">")) {
                Entry(key, emptyList(), free = true)
            } else {
                Entry(key, values.split('|').map { it.trim() }.filter { it.isNotEmpty() }, free = false)
            }
        }
        .distinctBy { it.key }
        .toList()

    private val ENTRY = Regex("([A-Za-z][A-Za-z0-9_]*)=(.+)")

    /** Where a setting sits in the screen: what shapes the work, what only the terminal draws, and the rest. */
    enum class Group(val wire: String) { WORK("work"), TERMINAL("terminal"), OTHER("other") }

    /**
     * Where the CLI keeps a setting.
     *
     * [GLOBAL] is what used to be its global config: read from the user's settings file first, then from
     * `~/.claude.json`, where older CLIs kept it and where it still stands until rewritten, then the CLI's
     * default - exactly the chain its own screen uses. [SETTINGS] is an ordinary setting, merged across the
     * layers the project loads (see ClaudeSettings.sources), the strongest first.
     */
    enum class Store { GLOBAL, SETTINGS }

    /**
     * How the CLI's own screen reads one setting (2.1.280). [path] is where the value lives, [default] what
     * it is when nothing is written - null where the CLI works the default out at run time (a feature flag,
     * the plan) and a guess would show a value that is not in force. [read] turns what is stored into one
     * of the values `/config` takes. [writes] is the layer `/config` writes it into: a stronger layer
     * holding the setting means a change here would change nothing, and the screen says so.
     */
    class Spec(
        val store: Store,
        val path: List<String>,
        val default: String?,
        val group: Group,
        val writes: ClaudeSettings.Layer = ClaudeSettings.Layer.USER,
        val read: (JsonElement) -> String? = ::scalar,
        /** A switch elsewhere that turns the setting off whatever it says itself - see `workflows`. */
        val offWhen: List<String>? = null,
    )

    private fun global(key: String, default: String?, group: Group) = Spec(Store.GLOBAL, listOf(key), default, group)

    private fun setting(key: String, default: String?, group: Group) = Spec(Store.SETTINGS, listOf(key), default, group)

    /**
     * A setting `/config` writes into the project's local file rather than the user's (`be(...)` in the CLI's
     * builder, 2.1.280 - checked live: `tips=true` landed in `.claude/settings.local.json`). It holds for
     * this project alone, and the screen says so.
     */
    private fun local(key: String, default: String?, group: Group) =
        Spec(Store.SETTINGS, listOf(key), default, group, writes = ClaudeSettings.Layer.LOCAL)

    /**
     * The settings this screen knows, by the key `/config` names them with. Kept to what the CLI's own
     * builder of the screen reads (`l$e` in 2.1.280), defaults included - `Be()` for the global ones.
     */
    val SPECS: Map<String, Spec> = mapOf(
        // What the conversations themselves do - in a terminal and in the panel alike.
        "autoCompact" to global("autoCompactEnabled", "true", Group.WORK),
        "checkpoints" to global("fileCheckpointingEnabled", "true", Group.WORK),
        "thinking" to setting("alwaysThinkingEnabled", "true", Group.WORK),
        "language" to setting("language", "default", Group.WORK),
        "outputStyle" to local("outputStyle", "default", Group.WORK),
        // `disableWorkflows: true` wins over everything, the way the CLI reads it.
        "workflows" to Spec(Store.SETTINGS, listOf("enableWorkflows"), null, Group.WORK, offWhen = listOf("disableWorkflows")),
        "workflowKeywordTriggerEnabled" to setting("workflowKeywordTriggerEnabled", "true", Group.WORK),
        "workflowSizeGuideline" to setting("workflowSizeGuideline", null, Group.WORK),
        "useAutoModeDuringPlan" to setting("useAutoModeDuringPlan", "true", Group.WORK),
        "worktreeBaseRef" to Spec(Store.SETTINGS, listOf("worktree", "baseRef"), "fresh", Group.WORK),
        "switchModelsOnFlag" to Spec(
            Store.SETTINGS,
            listOf("switchModelsOnFlag"),
            null,
            Group.WORK,
            read = { value ->
                when ((value as? JsonPrimitive)?.booleanOrNull) {
                    true -> "Switch automatically"
                    false -> "Ask each time"
                    null -> null
                }
            },
        ),
        "chrome" to global("claudeInChromeDefaultEnabled", "false", Group.WORK),
        "remoteControl" to global("remoteControlAtStartup", "default", Group.WORK),
        "inputNeededNotifEnabled" to global("inputNeededNotifEnabled", "false", Group.WORK),
        "agentPushNotifEnabled" to global("agentPushNotifEnabled", "false", Group.WORK),

        // What only a terminal draws. The model and the permission mode stand here too: in the panel the
        // chips under the input field decide both, per tab and for new tabs, and these are the terminal's.
        "model" to setting("model", "default", Group.TERMINAL),
        "permissionMode" to Spec(Store.SETTINGS, listOf("permissions", "defaultMode"), "default", Group.TERMINAL),
        "theme" to global("theme", "dark", Group.TERMINAL),
        "editor" to Spec(
            Store.GLOBAL,
            listOf("editorMode"),
            "normal",
            Group.TERMINAL,
            // The CLI names the old "emacs" mode "normal" now.
            read = { value -> scalar(value)?.let { if (it == "emacs") "normal" else it } },
        ),
        "verbose" to global("verbose", "false", Group.TERMINAL),
        "tips" to local("spinnerTipsEnabled", "true", Group.TERMINAL),
        "reduceMotion" to local("prefersReducedMotion", "false", Group.TERMINAL),
        "promptSuggestionEnabled" to setting("promptSuggestionEnabled", null, Group.TERMINAL),
        "recap" to setting("awaySummaryEnabled", null, Group.TERMINAL),
        "timeFormat" to setting("timeFormat", "auto", Group.TERMINAL),
        "turnDuration" to global("showTurnDuration", "true", Group.TERMINAL),
        "progressBar" to global("terminalProgressBarEnabled", "true", Group.TERMINAL),
        "notifChannel" to global("preferredNotifChannel", "auto", Group.TERMINAL),
        "autoScroll" to global("autoScrollEnabled", "true", Group.TERMINAL),
        "copyFullResponse" to global("copyFullResponse", "false", Group.TERMINAL),
        "copyOnSelect" to global("copyOnSelect", "true", Group.TERMINAL),
        "gitignore" to global("respectGitignore", "true", Group.TERMINAL),
        "defaultToAgentsView" to global("defaultToAgentsView", "false", Group.TERMINAL),
        "leftArrowOpensAgents" to global("leftArrowOpensAgents", "true", Group.TERMINAL),
        "externalEditorContext" to global("externalEditorContext", "false", Group.TERMINAL),
        "prStatus" to global("prStatusFooterEnabled", "true", Group.TERMINAL),
        "autoInstallIdeExtension" to global("autoInstallIdeExtension", "true", Group.TERMINAL),
    )

    private val SPEC_ORDER: Map<String, Int> = SPECS.keys.withIndex().associate { (index, key) -> key to index }

    /** A stored value as `/config` spells it: booleans and strings as they are, anything else not at all. */
    private fun scalar(value: JsonElement): String? = (value as? JsonPrimitive)?.contentOrNull

    /**
     * What the screen draws for one setting. [value] is null when it is not known - a setting this table
     * does not have, or one whose default the CLI works out at run time and nothing has been written for.
     * [lockedBy] names a layer stronger than the one `/config` writes into that holds the setting: then a
     * change here changes nothing, and the row says why instead of pretending.
     */
    data class Setting(
        val key: String,
        val options: List<String>,
        val free: Boolean,
        val value: String?,
        val group: Group,
        val lockedBy: ClaudeSettings.Layer?,
        /** `/config` writes it into this project's local file: it holds for this project alone. */
        val projectOnly: Boolean = false,
    )

    /** The settings files, already read - apart from the disk so that a test can hand them over directly. */
    class Files(
        /** The layers the project loads, the strongest first (see ClaudeSettings.sources). */
        val layers: List<Pair<ClaudeSettings.Layer, JsonObject>>,
        /** `~/.claude.json` - the CLI's old global config, still read for what has not been rewritten. */
        val globalConfig: JsonObject,
    )

    /**
     * The files for a project, read off disk. A missing or broken file is an empty one: it is the CLI's
     * business, and one odd file must not take the whole screen with it.
     */
    fun files(projectDirectory: String?, settingSources: String): Files {
        val home = ClaudeHome.of(projectDirectory)
        return Files(
            layers = ClaudeSettings.sources(projectDirectory, settingSources).map { it.layer to readObject(it.file) },
            globalConfig = readObject(home.globalConfigFile),
        )
    }

    private fun readObject(file: File): JsonObject = runCatching {
        if (!file.isFile) return JsonObject(emptyMap())
        Json.parseToJsonElement(file.readText()).jsonObject
    }.getOrDefault(JsonObject(emptyMap()))

    /**
     * The catalogue with the values in force - in the order of [SPECS], which puts what matters first,
     * and the settings it does not know after them in the CLI's own order (alphabetical by key, which is
     * no order at all to somebody reading the names).
     */
    fun settings(catalog: List<Entry>, files: Files): List<Setting> = catalog.sortedBy { entry ->
        SPEC_ORDER[entry.key] ?: Int.MAX_VALUE
    }.map { entry ->
        val spec = SPECS[entry.key]
        if (spec == null) {
            Setting(entry.key, entry.options, entry.free, value = null, group = Group.OTHER, lockedBy = null)
        } else {
            val (value, layer) = valueOf(spec, files)
            Setting(
                key = entry.key,
                options = entry.options,
                free = entry.free,
                value = value,
                group = spec.group,
                lockedBy = layer?.takeIf { stronger(it, spec.writes) },
                projectOnly = spec.writes == ClaudeSettings.Layer.LOCAL,
            )
        }
    }

    /** The value in force and the layer it came from - null for a default or for the old global config. */
    private fun valueOf(spec: Spec, files: Files): Pair<String?, ClaudeSettings.Layer?> {
        val layers = when (spec.store) {
            // A global one is the user's alone: the policy may still hold it, the project's files may not.
            Store.GLOBAL -> files.layers.filter {
                it.first == ClaudeSettings.Layer.POLICY || it.first == ClaudeSettings.Layer.USER
            }
            Store.SETTINGS -> files.layers
        }

        spec.offWhen?.let { path ->
            layers.firstOrNull { (_, settings) -> (at(settings, path) as? JsonPrimitive)?.booleanOrNull == true }
                ?.let { (layer, _) -> return "false" to layer }
        }

        for ((layer, settings) in layers) {
            val stored = at(settings, spec.path) ?: continue
            return spec.read(stored) to layer
        }

        if (spec.store == Store.GLOBAL) {
            at(files.globalConfig, spec.path)?.let { return spec.read(it) to null }
        }

        return spec.default to null
    }

    private fun at(root: JsonObject, path: List<String>): JsonElement? {
        var current: JsonElement = root
        for (name in path) current = (current as? JsonObject)?.get(name) ?: return null
        return current.takeUnless { it is JsonPrimitive && it.contentOrNull == null }
    }

    /** Whether [layer] outranks [target] - the layers go from the strongest down (see ClaudeSettings.Layer). */
    private fun stronger(layer: ClaudeSettings.Layer, target: ClaudeSettings.Layer): Boolean =
        layer.ordinal < target.ordinal

    /**
     * The line `/config` is handed to change one setting - or null when this is not a change to send.
     *
     * Only a key the CLI listed, and only a value it listed for it, unless it takes any: the command goes
     * into a process on this machine, and what reaches it is decided here rather than by whoever sent the
     * message. A free value is one line with its ends trimmed, and that is all it needs - a single pair is
     * read by the CLI up to the end of the line, spaces included.
     */
    fun command(catalog: List<Entry>, key: String, value: String): String? {
        val entry = catalog.firstOrNull { it.key == key } ?: return null
        val line = value.replace(Regex("[\\r\\n]+"), " ").trim()
        if (line.isEmpty()) return null
        if (!entry.free && line !in entry.options) return null

        return "/config $key=$line"
    }
}

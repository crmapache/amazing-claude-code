package io.github.crmapache.amazingclaudecode.scenario

import com.intellij.openapi.diagnostic.thisLogger
import io.github.crmapache.amazingclaudecode.claude.ClaudeHome
import java.io.File
import java.util.UUID
import kotlinx.serialization.json.Json

/**
 * Where the scenarios live, on two shelves.
 *
 * The same split Claude Code itself makes, and for the same reason: a round of work the team repeats
 * belongs to the repository, beside the project's own commands and skills, where it is reviewed and
 * shared; a round of work one person repeats belongs to that person's Claude home, where it follows them
 * from project to project. Anything else would mean inventing a third place for something the CLI has
 * already taught everybody to look for in two.
 *
 * Read from disk on every request rather than cached. They are a handful of small files, the panel asks
 * for them when a tab is opened, and a cache would have to be kept honest against an editor window, a
 * git checkout and a second IDE - three writers this side does not own.
 */
internal class ScenarioStore(private val workingDirectory: String?) {

    private val json = Json {
        prettyPrint = true
        ignoreUnknownKeys = true
        encodeDefaults = true
    }

    /** The repository's own shelf. Null when there is no project folder to put it in. */
    fun projectDirectory(): File? = workingDirectory?.let { File(File(it, ".claude"), "scenarios") }

    /**
     * The person's own shelf, beside the commands and skills of the same Claude home.
     *
     * Asked of [ClaudeHome] rather than of this machine's home directory, because a project opened inside
     * WSL runs its CLI in there: the home whose `commands/` the panel already reads for slash hints is the
     * home this belongs next to.
     */
    fun userDirectory(): File = File(ClaudeHome.of(workingDirectory).configDirectory, "scenarios")

    private fun directoryOf(scope: String): File? =
        if (ScenarioScope.normalize(scope) == ScenarioScope.USER) userDirectory() else projectDirectory()

    /** Everything on both shelves, project first, each in the order it was created. */
    fun all(): List<Scenario> = read(ScenarioScope.PROJECT) + read(ScenarioScope.USER)

    fun find(id: String, scope: String): Scenario? = read(scope).firstOrNull { it.id == id }

    private fun read(scope: String): List<Scenario> {
        val directory = directoryOf(scope) ?: return emptyList()
        val files = runCatching { directory.listFiles() }.getOrNull() ?: return emptyList()

        return files
            .filter { it.isFile && it.name.endsWith(".json") }
            .mapNotNull { file -> parse(file, scope) }
            .sortedBy { it.createdAt }
    }

    /**
     * A file from disk made safe to draw.
     *
     * Every field the interface indexes into is given a value it can survive, because the alternative is a
     * white panel: a scenario written by an older build, or hand-edited, or half-written when the power
     * went, reaches the page as an object with a missing array and takes the whole render with it. The
     * defaults on the model do most of this; what is left is the numbers, which arrive as whatever was
     * typed into the file.
     */
    private fun parse(file: File, scope: String): Scenario? {
        val raw = runCatching { json.decodeFromString<Scenario>(file.readText()) }
            .onFailure { thisLogger().info("Unreadable scenario ${file.name}: ${it.message}") }
            .getOrNull() ?: return null

        val id = raw.id.ifBlank { file.nameWithoutExtension }
        return raw.copy(
            id = id,
            name = raw.name.ifBlank { "Untitled" },
            createdAt = if (raw.createdAt > 0) raw.createdAt else file.lastModified(),
            updatedAt = if (raw.updatedAt > 0) raw.updatedAt else file.lastModified(),
            stages = raw.stages.map { stage -> stage.copy(repeat = ScenarioRules.passesOf(stage)) },
            head = raw.head.copy(retries = raw.head.retries.coerceIn(0, MAX_CARD_RETRIES)),
            scope = scope,
        )
    }

    /**
     * Write one down. Answers with what was actually stored, identifier and timestamps included.
     *
     * The scope travels with the scenario rather than being remembered anywhere: moving one from the
     * repository to the personal shelf is saving it under the other scope, and the old file is taken away
     * here so that the same scenario does not end up on both shelves answering to one identifier.
     */
    fun save(scenario: Scenario, scope: String): Scenario? {
        val chosen = ScenarioScope.normalize(scope)
        val directory = directoryOf(chosen) ?: return null
        val now = System.currentTimeMillis()

        val stored = scenario.copy(
            version = SCENARIO_VERSION,
            // A name this side can put into a path. An unusable one is replaced rather than refused: it
            // cannot have come from a scenario this plugin wrote, so there is nothing of anybody's to lose.
            id = scenario.id.takeIf(::usableId) ?: newId(),
            name = scenario.name.ifBlank { "Untitled" },
            createdAt = if (scenario.createdAt > 0) scenario.createdAt else now,
            updatedAt = now,
            stages = scenario.stages.map { stage -> stage.copy(repeat = ScenarioRules.passesOf(stage)) },
            head = scenario.head.copy(retries = scenario.head.retries.coerceIn(0, MAX_CARD_RETRIES)),
            scope = chosen,
        )

        return runCatching {
            directory.mkdirs()
            File(directory, "${stored.id}.json").writeText(json.encodeToString(stored))
            // Moved rather than copied: two files under one identifier is a scenario that is edited on one
            // shelf and run off the other.
            val other = if (chosen == ScenarioScope.USER) ScenarioScope.PROJECT else ScenarioScope.USER
            directoryOf(other)?.let { File(it, "${stored.id}.json") }?.takeIf(File::isFile)?.delete()
            stored
        }.onFailure { thisLogger().warn("Could not write a scenario", it) }.getOrNull()
    }

    fun delete(id: String, scope: String): Boolean {
        if (!usableId(id)) return false
        val directory = directoryOf(scope) ?: return false
        val file = File(directory, "$id.json")
        return runCatching { file.isFile && file.delete() }.getOrDefault(false)
    }

    /**
     * A copy under a new identifier, and every identifier inside it new as well.
     *
     * Sharing them would mean two scenarios whose cards answer to the same name, and a run of one drawing
     * its live state onto the other's timeline.
     */
    fun duplicate(id: String, scope: String): Scenario? {
        val source = find(id, scope) ?: return null
        val copy = source.copy(
            id = newId(),
            name = "${source.name} copy",
            createdAt = 0,
            updatedAt = 0,
            inputs = source.inputs.map { it.copy(id = newId()) },
            stages = source.stages.map { stage ->
                stage.copy(
                    id = newId(),
                    cards = stage.cards.map { card ->
                        card.copy(id = newId(), slots = card.slots.map { it.copy(id = newId()) })
                    },
                )
            },
        )
        return save(copy, scope)
    }

    internal companion object {
        fun newId(): String = UUID.randomUUID().toString().replace("-", "").take(16)

        /**
         * Whether an identifier may be put into a path at all.
         *
         * Every one of them is this side's own making - [newId] hands out sixteen hex characters - but they
         * come back from a page before they become a file name, and a page can say anything. Checked rather
         * than trusted for the same reason a fleet agent's name is (see WorkflowAgents.fileOf): one
         * separator in one of these walks out of the folder it belongs in, and what lies above it is the
         * machine's book of accounts, its statistics and every other project's runs - which a run's own
         * delete would take with it, recursively.
         */
        fun usableId(id: String): Boolean =
            id.isNotBlank() && id.length <= MAX_ID && id.all { it.isLetterOrDigit() || it == '-' || it == '_' }

        private const val MAX_ID = 64
    }
}

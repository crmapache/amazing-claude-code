package io.github.crmapache.amazingclaudecode.scenario

import com.intellij.openapi.diagnostic.thisLogger
import io.github.crmapache.amazingclaudecode.claude.ClaudeHome
import java.io.File
import java.nio.file.Files
import java.util.UUID
import kotlinx.serialization.Serializable
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
 *
 * `claudeHome` is for the tests alone: the person's shelf is otherwise their real Claude home, and a test
 * that moved a scenario onto it would leave one in the folder they actually work in.
 */
internal class ScenarioStore(private val workingDirectory: String?, private val claudeHome: File? = null) {

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
    fun userDirectory(): File = File(configDirectory(), "scenarios")

    private fun configDirectory(): File = claudeHome ?: ClaudeHome.of(workingDirectory).configDirectory

    private fun directoryOf(scope: String): File? =
        if (ScenarioScope.normalize(scope) == ScenarioScope.USER) userDirectory() else projectDirectory()

    /**
     * Whether the disk this shelf would stand on is answering at all.
     *
     * The shelf's own folder cannot say: a path on a share that is down and a path nobody ever created look
     * exactly alike from here. What the folder above it says can - the project that is open in this window,
     * and the Claude home the commands and skills are already read from. Either of those answering is proof
     * enough that a missing `scenarios` beneath it was simply never made.
     */
    private fun reachable(scope: String): Boolean =
        runCatching {
            if (ScenarioScope.normalize(scope) == ScenarioScope.USER) {
                configDirectory().parentFile?.isDirectory == true
            } else {
                workingDirectory?.let { File(it).isDirectory } == true
            }
        }.getOrDefault(false)

    /** Everything on both shelves, project first, each in the order it stands on its shelf (see [shelf]). */
    fun all(): List<Scenario> = shelf(ScenarioScope.PROJECT).orEmpty() + shelf(ScenarioScope.USER).orEmpty()

    fun find(id: String, scope: String): Scenario? = shelf(scope).orEmpty().firstOrNull { it.id == id }

    /**
     * One shelf, or null when it could not be looked at.
     *
     * The two are not the same sentence, and one caller has to know the difference: pruning the scheduled
     * runs against the scenarios that still exist (see Schedules.keepOnly). A branch checked out without a
     * `.claude/scenarios` folder in it, a network share that did not answer, a window with no project at
     * all - read as "there are no scenarios", each of those wipes every arrangement somebody made, and
     * they do not come back when the branch does.
     *
     * A folder that exists and lists as empty IS an answer: that is what deleting the last scenario leaves
     * behind, and its hours should go with it. So is a folder that was never made - and that half used to
     * be missing, which turned the pruning off on the ordinary machine rather than the odd one: nobody has
     * a `scenarios` folder of their own until they write a scenario of their own, so the person's shelf
     * answered "no idea" for ever, and a deleted scenario went on taking its hour every morning.
     *
     * Told apart by the ground the shelf stands on (see [reachable]): a folder that is not there, on a disk
     * that is, has genuinely never been made. A disk that will not answer is where the doubt belongs.
     *
     * In the order somebody put them in by dragging (see [place]), and whatever that order does not name -
     * written since, or brought in by a checkout - after it, in the order it was created. Sorted stably,
     * so the second half keeps the first sort.
     *
     * A file whose name starts with a dot is never a scenario. The shelf's own order lives in one, and
     * everything in [Scenario] has a default: read as a scenario, `{"order": [...]}` came out as a row
     * called "Untitled".
     */
    fun shelf(scope: String): List<Scenario>? {
        val directory = directoryOf(scope) ?: return null
        if (!directory.isDirectory) return if (reachable(scope)) emptyList() else null
        val files = runCatching { directory.listFiles() }.getOrNull() ?: return null

        val rank = orderOf(directory).withIndex().associate { (at, id) -> id to at }
        return files
            .filter { it.isFile && it.name.endsWith(".json") && !it.name.startsWith(".") }
            .mapNotNull { file -> parse(file, scope) }
            .sortedBy { it.createdAt }
            .sortedBy { rank[it.id] ?: Int.MAX_VALUE }
    }

    /**
     * Put one scenario at a place on a shelf - before [before], or last when that is empty or no longer
     * there - moving its file over from the other shelf first when [from] is not [to].
     *
     * Named by the neighbour rather than by a number, for the reason the queue moves by steps (see
     * QueueRules.move): two windows and a second IDE draw these shelves, and an index is a place in whatever
     * the sender last saw. A neighbour is a place in what is actually on the disk.
     *
     * Answers null when it is done, or the name of what went wrong - which the screen has words for.
     */
    fun place(id: String, from: String, to: String, before: String): String? {
        if (!usableId(id)) return GONE
        val source = ScenarioScope.normalize(from)
        val target = ScenarioScope.normalize(to)
        if (source != target) move(id, source, target)?.let { return it }

        val directory = directoryOf(target) ?: return NOT_ORDERED
        val standing = shelf(target)?.map { it.id } ?: return NOT_ORDERED
        if (id !in standing) return GONE

        val others = standing.filter { it != id }
        val at = others.indexOf(before).takeIf { before.isNotEmpty() && it >= 0 } ?: others.size
        val order = others.toMutableList().apply { add(at, id) }
        val written = ScenarioFile(File(directory, ORDER)).put(json.encodeToString(ShelfOrder(order)))
        return if (written) null else NOT_ORDERED
    }

    /**
     * The file itself, carried from one shelf to the other - not read and written again.
     *
     * Carried as it lies, so nothing in it changes but its folder: not the moment it was last edited, not a
     * field a newer build wrote that this one does not know. The shelf is not in the file (see
     * [Scenario.scope]), so the folder is the whole of the move.
     *
     * Refused rather than written over when the other shelf already holds a scenario under the same
     * identifier - a project file that came back with a git checkout beside somebody's own copy. Either of
     * the two could be the one somebody meant to keep, and a move is no place to lose one of them.
     */
    private fun move(id: String, from: String, to: String): String? {
        val file = directoryOf(from)?.let { File(it, "$id.json") }?.takeIf(File::isFile) ?: return GONE
        val directory = directoryOf(to) ?: return NOT_MOVED
        val landing = File(directory, "$id.json")
        if (landing.exists()) return TWIN

        return runCatching {
            directory.mkdirs()
            // Not atomic, on purpose: the two shelves are a repository and a home folder, which are on
            // different disks often enough, and a plain move copies and deletes where a rename cannot.
            Files.move(file.toPath(), landing.toPath())
        }.fold(
            onSuccess = { null },
            onFailure = {
                thisLogger().warn("Could not move a scenario to the other shelf", it)
                NOT_MOVED
            },
        )
    }

    /**
     * The shelf's own order, as far as it can be read - and nothing when it cannot.
     *
     * An order is a convenience rather than anything of anybody's: a file that will not parse costs the
     * rows their places, never the rows. So "could not read" and "there is none" are one answer here, unlike
     * the shelf itself.
     */
    private fun orderOf(directory: File): List<String> =
        when (val stored = ScenarioFile(File(directory, ORDER)).read()) {
            is ScenarioFile.Stored.Text ->
                runCatching { json.decodeFromString<ShelfOrder>(stored.text).order.distinct() }.getOrDefault(emptyList())
            else -> emptyList()
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

        /**
         * The file a shelf keeps its order in, beside the scenarios - so the repository's order travels with
         * the repository and one's own follows one from project to project, exactly as the rows do.
         *
         * A dot in front, and that is what keeps it apart from them: an identifier cannot hold a dot (see
         * [usableId]), so no scenario is ever written under this name, and the shelf skips every such file.
         */
        const val ORDER = ".order.json"

        /** What [place] answers with - the names the screen has words for (see `outcomes` in the panel). */
        const val GONE = "scenarioGone"
        const val TWIN = "scenarioOnBothShelves"
        const val NOT_MOVED = "scenarioNotMoved"
        const val NOT_ORDERED = "orderNotWritten"
    }
}

/** A shelf's order, by identifier. An object rather than a bare list, so the file can grow a field. */
@Serializable
internal data class ShelfOrder(val order: List<String> = emptyList())

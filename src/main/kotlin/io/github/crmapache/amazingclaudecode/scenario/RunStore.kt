package io.github.crmapache.amazingclaudecode.scenario

import com.intellij.openapi.diagnostic.thisLogger
import io.github.crmapache.amazingclaudecode.feedback.ShortHash
import java.io.File
import kotlinx.serialization.json.Json

/**
 * Past runs, kept beside the plugin's other machine-wide books rather than in anybody's repository.
 *
 * A run is a fact about what happened on this machine, not about the code: written into the project it
 * would arrive in a pull request and be a second writer of a folder the agent is editing at that very
 * moment. The scenario is the thing worth sharing; what came of it on Tuesday night is not.
 *
 * Two files per run and that is the whole design. `run.json` is the record with the snapshot inside it,
 * tens of kilobytes, read when somebody opens that one run. `summary.json` is the row in the list, and it
 * is what the list is built from - a hundred runs is a hundred small reads rather than a hundred
 * scenarios parsed to draw a date. A folder each, so deleting one takes everything with it in one move.
 *
 * What is deliberately NOT here is a transcript. Every card of a run is an ordinary conversation of the
 * CLI's and its transcript is already on the disk under the project (see StepTranscript); copying it here
 * would double a night's writing to keep a second copy that can only go stale.
 */
internal class RunStore(workingDirectory: String?) {

    private val json = Json { ignoreUnknownKeys = true; encodeDefaults = true }

    /**
     * The project's shelf of runs.
     *
     * Named by a hash of the path rather than by the path: the folder name is not a place to write where
     * somebody keeps their work, and the same reasoning the statistics use for their project keys.
     */
    private val directory: File =
        File(File(File(System.getProperty("user.home"), ".amazing-claude-code"), "scenario-runs"), key(workingDirectory))

    private fun key(workingDirectory: String?): String =
        if (workingDirectory.isNullOrBlank()) "unknown" else ShortHash.of(workingDirectory, length = 16)

    /**
     * One run's folder, and null for a name that may not be put into a path.
     *
     * See ScenarioStore.usableId: the identifiers are this side's own, but they come back from a page, and
     * a separator in one of them walks out of this folder - where [delete] deletes recursively and what
     * lies above is every other project's runs, the machine's statistics and its book of accounts.
     */
    private fun runDirectory(id: String): File? =
        if (ScenarioStore.usableId(id)) File(directory, id) else null

    /** Newest first, which is the order anybody wants a list of nights in. */
    fun summaries(): List<RunSummary> {
        val folders = runCatching { directory.listFiles() }.getOrNull() ?: return emptyList()

        return folders
            .filter(File::isDirectory)
            .mapNotNull { folder ->
                runCatching { json.decodeFromString<RunSummary>(File(folder, SUMMARY).readText()) }.getOrNull()
            }
            .sortedByDescending { it.startedAt }
    }

    fun read(id: String): ScenarioRun? =
        runCatching { json.decodeFromString<ScenarioRun>(File(runDirectory(id) ?: return null, RECORD).readText()) }
            .onFailure { thisLogger().info("Could not read a scenario run: ${it.message}") }
            .getOrNull()

    fun keep(run: ScenarioRun) {
        runCatching {
            val folder = runDirectory(run.id) ?: return
            folder.mkdirs()
            File(folder, RECORD).writeText(json.encodeToString(run))
            File(folder, SUMMARY).writeText(json.encodeToString(run.summarise()))
        }.onFailure { thisLogger().warn("Could not write a scenario run", it) }
    }

    fun delete(id: String): Boolean =
        runCatching { runDirectory(id)?.deleteRecursively() ?: false }.getOrDefault(false)

    /**
     * A run that outlived the IDE that was walking it is neither going nor finished, and it has to be made
     * one of them.
     *
     * Left as it was it would draw a timeline with a spinner on it for ever and hold the project's
     * one-at-a-time lock against every run after it. Done when the list is first read rather than on a
     * timer: that is the only moment anybody can see one of these.
     */
    fun repairAbandoned() {
        for (summary in summaries()) {
            if (RunState.finished(summary.state)) continue
            val run = read(summary.id) ?: continue
            keep(
                run.copy(
                    state = RunState.FAILED,
                    failure = run.failure.ifEmpty { RunFailure.CRASHED },
                    finishedAt = if (run.finishedAt > 0) run.finishedAt else System.currentTimeMillis(),
                    question = null,
                    steps = run.steps.map { step ->
                        if (StepState.over(step.state)) {
                            step
                        } else {
                            step.copy(
                                // A card that never got its go was skipped, and that is a different thing in
                                // the morning from one that was halfway through something when the IDE went
                                // away: only the second may have left half a change on the disk.
                                state = if (StepState.begun(step.state)) StepState.FAILED else StepState.SKIPPED,
                                failure = step.failure.ifEmpty {
                                    if (StepState.begun(step.state)) RunFailure.CRASHED else ""
                                },
                                finishedAt = if (step.finishedAt > 0) step.finishedAt else System.currentTimeMillis(),
                            )
                        }
                    },
                ),
            )
        }
    }

    private companion object {
        const val RECORD = "run.json"
        const val SUMMARY = "summary.json"
    }
}

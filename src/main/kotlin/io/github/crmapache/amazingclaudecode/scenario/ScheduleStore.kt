package io.github.crmapache.amazingclaudecode.scenario

import com.intellij.openapi.diagnostic.thisLogger
import io.github.crmapache.amazingclaudecode.feedback.ShortHash
import java.io.File
import kotlinx.serialization.json.Json

/**
 * The hours this project's scenarios are set to start at, kept on the machine beside the runs.
 *
 * Not in the repository, and that is the whole of the placing (see ScenarioSchedule): the round of work
 * is shared, the arrangement with somebody's own morning is not. Beside the runs rather than beside the
 * scenarios for the same reason - both are facts about what this machine does, and both are keyed by a
 * hash of the project's path rather than by the path itself.
 *
 * One file for all of them: a schedule is three numbers and a handful of answers, and the list is read
 * whole every time anybody asks about scenarios at all.
 */
internal class ScheduleStore(workingDirectory: String?) {

    private val json = Json { ignoreUnknownKeys = true; encodeDefaults = true }

    private val file: File =
        File(File(File(File(System.getProperty("user.home"), ".amazing-claude-code"), "scenario-schedules"), key(workingDirectory)), FILE)

    private fun key(workingDirectory: String?): String =
        if (workingDirectory.isNullOrBlank()) "unknown" else ShortHash.of(workingDirectory, length = 16)

    /** Held while the file is read and written: two windows on one project set hours in the same file. */
    private val lock = Any()

    fun all(): List<ScenarioSchedule> = synchronized(lock) { read() }

    /**
     * One scenario has one schedule, so this replaces rather than adds.
     *
     * Two hours for one round of work is a thing somebody would have to be shown, edited and told apart in
     * a row that today has neither the room nor the words for it - and nobody has asked for it. What it
     * would cost to allow later is a list instead of a replace, which is where this already is.
     */
    fun put(schedule: ScenarioSchedule): List<ScenarioSchedule> = synchronized(lock) {
        val kept = read().filterNot { it.scenarioId == schedule.scenarioId && it.scope == schedule.scope }
        write(kept + schedule)
    }

    fun remove(scenarioId: String, scope: String): List<ScenarioSchedule> = synchronized(lock) {
        write(read().filterNot { it.scenarioId == scenarioId && it.scope == scope })
    }

    /** A scenario that is gone takes its hour with it - an alarm for nothing rings for ever otherwise. */
    fun keepOnly(scenarios: List<Scenario>): List<ScenarioSchedule> = synchronized(lock) {
        val alive = scenarios.map { it.id to it.scope }.toSet()
        val current = read()
        val kept = current.filter { (it.scenarioId to it.scope) in alive }
        if (kept.size == current.size) kept else write(kept)
    }

    private fun read(): List<ScenarioSchedule> =
        runCatching { json.decodeFromString<List<ScenarioSchedule>>(file.readText()) }
            .getOrElse { emptyList() }

    private fun write(schedules: List<ScenarioSchedule>): List<ScenarioSchedule> {
        runCatching {
            file.parentFile?.mkdirs()
            file.writeText(json.encodeToString(schedules))
        }.onFailure { thisLogger().warn("Could not write the scenario schedules", it) }

        return schedules
    }

    private companion object {
        const val FILE = "schedules.json"
    }
}

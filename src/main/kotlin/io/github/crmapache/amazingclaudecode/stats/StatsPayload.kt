package io.github.crmapache.amazingclaudecode.stats

import com.intellij.openapi.application.ApplicationNamesInfo
import java.time.LocalDate
import kotlinx.serialization.json.add
import kotlinx.serialization.json.addJsonObject
import kotlinx.serialization.json.buildJsonObject
import kotlinx.serialization.json.put
import kotlinx.serialization.json.putJsonArray
import kotlinx.serialization.json.putJsonObject

/**
 * What the statistics tab is handed: the machine's days in full, every project's minutes by day, and the
 * achievements as they stand.
 *
 * The days travel folded together rather than one project at a time (see StatsSnapshot.daysTogether).
 * The tab is about a person's work, and the same person's hour does not become two hours because two
 * windows were open - which is what "this project's days, and everybody else's minutes underneath" made
 * of it: the big figure was one project's while the line under it added the others up, and the two
 * disagreed about the same afternoon. The one place the day is still broken up by project is the list of
 * where the hours went, and its minutes are what the projects carry here.
 *
 * The interface does the arithmetic of a range - the last week, the last month, all time - out of the
 * days themselves, so switching the range never comes back here. Nothing here names a path: a project is
 * its name and an opaque key (see StatsCollector.keyOf).
 */
internal object StatsPayload {

    /**
     * The IDE the book is kept in - "WebStorm", "IntelliJ IDEA". It stands under a shared picture of the
     * tab, and nowhere else; asked for through runCatching because the payload is also built in tests,
     * where no application stands behind the name.
     */
    private fun ideName(): String =
        runCatching { ApplicationNamesInfo.getInstance().fullProductName }.getOrDefault("JetBrains IDE")

    fun build(ledger: StatsLedger, projectKey: String, now: Long = System.currentTimeMillis()): String {
        val today = LocalDate.now()
        // Evaluated before the read rather than inside it: the evaluation takes the lock itself, and it is
        // what writes down the moments of the tiers the tab is about to list.
        val achievements = ledger.achievements(today)

        return ledger.read { snapshot ->
            buildJsonObject {
                put("type", "statistics")
                put("now", now)
                put("since", snapshot.since)
                put("today", today.toString())
                put("ide", ideName())
                put("devicesPaired", snapshot.devicesPaired)

                putJsonObject("project") {
                    put("key", projectKey)
                    put("name", snapshot.projects[projectKey]?.name.orEmpty())
                }

                putJsonArray("projects") {
                    for ((key, project) in snapshot.projects) {
                        addJsonObject {
                            put("key", key)
                            put("name", project.name)
                            putJsonObject("minutes") {
                                for ((day, record) in project.days) {
                                    val minutes = record.minutes.count()
                                    if (minutes > 0) put(day, minutes)
                                }
                            }
                        }
                    }
                }

                putJsonArray("days") {
                    for ((day, record) in snapshot.daysTogether()) {
                        addJsonObject {
                            put("date", day)
                            put("minutes", record.minutes.count())
                            putJsonArray("hours") { record.minutes.hours().forEach { add(it) } }
                            for (field in DayRecord.INT_FIELDS) {
                                val value = field.get(record)
                                if (value != 0) put(field.name, value)
                            }
                            for (field in DayRecord.LONG_FIELDS) {
                                val value = field.get(record)
                                if (value != 0L) put(field.name, value)
                            }
                            if (record.cost != 0.0) put("cost", record.cost)
                            put("filesTouched", record.files.size)
                            if (record.tools.isNotEmpty()) {
                                putJsonObject("tools") { for ((name, count) in record.tools) put(name, count) }
                            }
                            if (record.models.isNotEmpty()) {
                                putJsonObject("models") { for ((name, count) in record.models) put(name, count) }
                            }
                        }
                    }
                }

                putJsonArray("achievements") {
                    for (state in achievements) {
                        addJsonObject {
                            put("id", state.id)
                            put("tier", state.tier)
                            // How many lines this one has in all: the card draws a pip for each of them,
                            // and most but not all of them have five (see Achievements.Definition.steps).
                            put("steps", state.steps)
                            put("value", state.value)
                            state.target?.let { put("target", it) }
                            state.line?.let { put("line", it) }
                            putJsonObject("earned") {
                                for ((tier, at) in ledger.earnedAt(snapshot, state.id)) put(tier.toString(), at)
                            }
                        }
                    }
                }
            }.toString()
        }
    }
}

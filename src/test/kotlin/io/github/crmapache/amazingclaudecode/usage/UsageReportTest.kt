package io.github.crmapache.amazingclaudecode.usage

import io.github.crmapache.amazingclaudecode.stats.DayRecord
import io.github.crmapache.amazingclaudecode.stats.MinuteSet
import java.util.TreeMap
import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertFalse
import kotlin.test.assertNotEquals
import kotlin.test.assertTrue
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.jsonArray
import kotlinx.serialization.json.jsonObject
import kotlinx.serialization.json.jsonPrimitive

/**
 * The promise of the usage report, held by a test rather than by care: only counts leave, and every name
 * that leaves has been through a list.
 *
 * The most important check here is the first one. A day's report is compared with the exact set of keys it
 * may carry, so a field added to the statistics book does not start travelling because somebody wrote it
 * into the report without thinking - this test turns red, and PRIVACY.md is the other file to change.
 */
class UsageReportTest {

    private fun busyDay(): DayRecord = DayRecord().apply {
        minutes.mark(9 * 60)
        minutes.mark(9 * 60 + 20)
        minutes.mark(14 * 60)
        prompts = 12
        turns = 11
        sessions = 3
        turnMillis = 95_500
        files.add("hash-of-secret-path")
        files.add("hash-of-another-one")
        tools["Read"] = 20
        tools["MCP"] = 4
        tools["some weird name"] = 1
        models["Opus"] = 9
        models["my-company-model"] = 2
        slash.add("compact")
        slash.add("deploy-to-acme-prod")
        features["voice"] = 2
        features["screen:history"] = 1
        features["not-a-feature"] = 5
        cost = 12.5
        tokensIn = 1_000_000
        earlyPrompts = 4
        thanksWays.add("github")
        ranOutWindows.add("account-7:five_hour:2026-09-30T12:00")
    }

    @Test
    fun `a day carries exactly the keys it may carry and nothing more`() {
        val json = UsageReport.dayJson("2026-09-29", busyDay())

        assertEquals(
            setOf(
                "day", "minutes", "conversations", "prompts", "turns", "turnSeconds", "phonePrompts", "phoneActions", "forks",
                "edits", "linesAdded", "linesRemoved", "filesEdited", "permissionsAsked", "permissionsDenied",
                "plansApproved", "todosDone", "attachments", "quotes", "ranOutFiveHour", "watched", "mcpConnected",
                "plugins", "longestConversation", "sittings", "tools", "models", "slash", "features",
            ),
            json.keys,
        )
    }

    @Test
    fun `nothing a person could be recognised by travels`() {
        val text = UsageReport.dayJson("2026-09-29", busyDay()).toString()

        // The file hashes, a custom model's name, a command of one's own, an account's window.
        for (secret in listOf("hash-of-secret-path", "my-company-model", "deploy-to-acme-prod", "account-7", "some weird name")) {
            assertFalse(secret in text, "\"$secret\" leaked into the report: $text")
        }
        // Nor the figures that say what the work cost or when in the day it happened.
        for (field in listOf("cost", "tokens", "early", "late", "thanks", "hours")) {
            assertFalse("\"$field" in text, "\"$field\" should not be in the report: $text")
        }
    }

    @Test
    fun `names are held to their lists`() {
        val json = UsageReport.dayJson("2026-09-29", busyDay())

        assertEquals(mapOf("Read" to 20, "MCP" to 4, "other" to 1), counts(json, "tools"))
        assertEquals(mapOf("Opus" to 9, "Other" to 2), counts(json, "models"))
        assertEquals(mapOf("compact" to 1, "custom" to 1), counts(json, "slash"))
        assertEquals(mapOf("voice" to 2, "screen:history" to 1), counts(json, "features"))
        assertEquals(2, json["filesEdited"]!!.jsonPrimitive.content.toInt())
        assertEquals(95, json["turnSeconds"]!!.jsonPrimitive.content.toInt())
    }

    @Test
    fun `a sitting ends at a gap longer than half an hour`() {
        val minutes = MinuteSet()
        // 9:00-9:20 with a ten-minute pause inside, then 14:00 on its own, then 14:40-14:41.
        (540..545).forEach(minutes::mark)
        (555..560).forEach(minutes::mark)
        minutes.mark(840)
        minutes.mark(880)
        minutes.mark(881)

        assertEquals(listOf(21, 1, 2), UsageReport.sittings(minutes))
        assertEquals(emptyList(), UsageReport.sittings(MinuteSet()))
    }

    @Test
    fun `only days from the first allowed one on, and only days that saw anything`() {
        val together = TreeMap<String, DayRecord>().apply {
            put("2026-09-27", busyDay())
            put("2026-09-28", DayRecord())
            put("2026-09-29", busyDay())
            put("2026-09-30", DayRecord().apply { features["voice"] = 1 })
        }

        assertEquals(listOf("2026-09-29", "2026-09-30"), UsageReport.days(together, "2026-09-28").map { it.day })
    }

    @Test
    fun `a day that changed has a different digest`() {
        val day = busyDay()
        val before = UsageReport.days(TreeMap(mapOf("2026-09-29" to day)), "2026-09-01").single().digest
        day.prompts++
        val after = UsageReport.days(TreeMap(mapOf("2026-09-29" to day)), "2026-09-01").single().digest

        assertNotEquals(before, after)
    }

    @Test
    fun `the report wraps the days with the environment and the settings`() {
        val days = UsageReport.days(TreeMap(mapOf("2026-09-29" to busyDay())), "2026-09-01")
        val report = UsageReport.report(
            "Rk3pD9xQ2mV7tL1aZ8bN4c",
            UsageReport.Environment("0.14.0", "WS", "2026.2", "mac", "arm64", "2.3.1", "ru"),
            mapOf("remote" to true, "layout" to "bottom", "accounts" to 2),
            days,
        )

        assertEquals(setOf("schema", "install", "env", "settings", "days"), report.keys)
        assertEquals("Rk3pD9xQ2mV7tL1aZ8bN4c", report["install"]!!.jsonPrimitive.content)
        assertEquals("WS", report["env"]!!.jsonObject["ide"]!!.jsonPrimitive.content)
        assertEquals("true", report["settings"]!!.jsonObject["remote"]!!.jsonPrimitive.content)
        assertEquals(1, report["days"]!!.jsonArray.size)
        assertTrue(report["days"]!!.jsonArray[0].jsonObject["sittings"]!!.jsonArray.isNotEmpty())
    }

    private fun counts(json: JsonObject, name: String): Map<String, Int> =
        json[name]!!.jsonObject.mapValues { it.value.jsonPrimitive.content.toInt() }
}

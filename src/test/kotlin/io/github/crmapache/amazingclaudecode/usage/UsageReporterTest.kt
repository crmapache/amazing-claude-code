package io.github.crmapache.amazingclaudecode.usage

import com.intellij.openapi.util.Disposer
import io.github.crmapache.amazingclaudecode.stats.StatsLedger
import java.nio.file.Files
import java.time.LocalDate
import java.time.ZoneId
import kotlin.test.AfterTest
import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertTrue
import kotlinx.serialization.json.Json
import kotlinx.serialization.json.jsonArray
import kotlinx.serialization.json.jsonObject
import kotlinx.serialization.json.jsonPrimitive

/**
 * When a report goes, what it carries, and what saying no does - against a book and a state of their own,
 * with the network replaced by two lists that remember what was asked of them.
 */
class UsageReporterTest {

    private val directory = Files.createTempDirectory("acc-usage")

    private val ledger = StatsLedger(directory.resolve("statistics.json"))

    private val state = UsageState(directory.resolve(UsageState.FILE_NAME))

    private var now = LocalDate.parse("2026-09-30").atTime(12, 0).atZone(ZoneId.systemDefault()).toInstant().toEpochMilli()

    private val posted = mutableListOf<String>()

    private val forgotten = mutableListOf<String>()

    private var online = true

    private val reporter = UsageReporter(
        state = state,
        clock = { now },
        ledger = { ledger },
        environment = { UsageReport.Environment("0.14.0", "WS", "2026.2", "mac", "arm64", "2.3.1", "en") },
        settings = { mapOf("remote" to false) },
        post = { body -> if (online) posted.add(body) else false },
        forget = { id -> if (online) forgotten.add(id) else false },
        warmUp = {},
        execute = { it.run() },
    ).also { it.onChanged = {} }

    @AfterTest
    fun tearDown() {
        Disposer.dispose(ledger)
        directory.toFile().deleteRecursively()
    }

    private fun work(day: String, prompts: Int) {
        ledger.update { snapshot ->
            val record = ledger.day(snapshot, "p-test", "test", LocalDate.parse(day))
            record.prompts += prompts
            record.minutes.mark(600)
        }
    }

    private fun later(minutes: Long) {
        now += minutes * 60_000
    }

    private fun daysIn(body: String): List<String> =
        Json.parseToJsonElement(body).jsonObject["days"]!!.jsonArray.map { it.jsonObject["day"]!!.jsonPrimitive.content }

    @Test
    fun `nothing goes before a yes, however much the panel is used`() {
        work("2026-09-30", 5)
        reporter.nudge()

        assertEquals(emptyList(), posted)
        assertEquals(UsageState.Consent.UNKNOWN, state.read().consent)
    }

    @Test
    fun `a yes sends the first report at once, from that day on only`() {
        work("2026-09-29", 3)
        work("2026-09-30", 5)

        reporter.setConsent(true)

        val data = state.read()
        assertEquals(UsageState.Consent.GRANTED, data.consent)
        assertEquals(22, data.id.length)
        assertEquals("2026-09-30", data.since)
        assertEquals(1, posted.size)
        // Yesterday was worked before the yes, and stays on the machine.
        assertEquals(listOf("2026-09-30"), daysIn(posted.single()))
        assertEquals(data.id, Json.parseToJsonElement(posted.single()).jsonObject["install"]!!.jsonPrimitive.content)
    }

    @Test
    fun `today alone waits hours between reports, a finished day goes soon`() {
        work("2026-09-30", 5)
        reporter.setConsent(true)
        assertEquals(1, posted.size)

        work("2026-09-30", 1)
        later(30)
        reporter.nudge()
        assertEquals(1, posted.size, "only today changed, and four hours have not passed")

        later(UsageReporter.SEND_INTERVAL_MS / 60_000)
        reporter.nudge()
        assertEquals(2, posted.size)

        // The day ends; its last hours are worked in and the next morning comes.
        work("2026-09-30", 2)
        now = LocalDate.parse("2026-10-01").atTime(9, 0).atZone(ZoneId.systemDefault()).toInstant().toEpochMilli()
        reporter.nudge()
        assertEquals(3, posted.size)
        assertEquals(listOf("2026-09-30"), daysIn(posted.last()))
    }

    @Test
    fun `a day already sent as it is does not go again`() {
        work("2026-09-30", 5)
        reporter.setConsent(true)

        later(UsageReporter.SEND_INTERVAL_MS / 60_000 + 1)
        reporter.nudge()

        assertEquals(1, posted.size)
    }

    @Test
    fun `a report that did not arrive is tried again`() {
        work("2026-09-30", 5)
        online = false
        reporter.setConsent(true)
        assertEquals(0, posted.size)

        online = true
        later(UsageReporter.SEND_INTERVAL_MS / 60_000 + 1)
        reporter.nudge()
        assertEquals(1, posted.size)
    }

    @Test
    fun `a no drops the identifier and asks the service to delete it, until it has`() {
        work("2026-09-30", 5)
        reporter.setConsent(true)
        val id = state.read().id

        online = false
        reporter.setConsent(false)
        var data = state.read()
        assertEquals(UsageState.Consent.DECLINED, data.consent)
        assertEquals("", data.id)
        assertEquals(listOf(id), data.forget)

        online = true
        later(2)
        work("2026-09-30", 1)
        reporter.nudge()
        data = state.read()
        assertEquals(listOf(id), forgotten)
        assertEquals(emptyList(), data.forget)
        assertEquals(1, posted.size, "nothing is sent after a no")
    }

    @Test
    fun `a yes after a no starts over under a new identifier`() {
        reporter.setConsent(true)
        val first = state.read().id
        reporter.setConsent(false)
        reporter.setConsent(true)

        val second = state.read().id
        assertTrue(second.isNotEmpty() && second != first)
    }

    @Test
    fun `the preview before a yes shows today under a placeholder`() {
        work("2026-09-30", 5)
        val preview = reporter.preview()

        assertTrue(UsageReporter.PREVIEW_ID in preview)
        assertEquals(listOf("2026-09-30"), daysIn(preview))
        assertEquals(emptyList(), posted)
    }
}

package io.github.crmapache.amazingclaudecode.feedback

import io.github.crmapache.amazingclaudecode.claude.SessionJournal
import java.util.Locale
import kotlin.test.Test
import kotlin.test.assertContains
import kotlin.test.assertEquals
import kotlin.test.assertFalse
import kotlin.test.assertTrue

/**
 * The report's promise, as a test.
 *
 * Everything here is one question asked in several ways: given a journal that holds the whole of a
 * conversation - what a person typed, what the agent answered, the contents of the files it read, the
 * paths those files live at - does any of it come out the other side?
 *
 * This is the test to run when anything about the report changes. The screen tells people that nothing
 * private travels; if that stops being true, it stops being a bug and becomes a lie.
 */
class FeedbackReportTest {

    /** The things that must never appear, whatever shape the journal arrives in. */
    private val secrets = listOf(
        "my database password is hunter2",
        "/Users/somebody/work/private-repo",
        "AKIAIOSFODNN7EXAMPLE",
        "billing_service.rb",
        "the answer is to refactor the invoice totals",
    )

    private fun journalOf(vararg entries: String): List<SessionJournal.Entry> =
        entries.mapIndexed { index, json -> SessionJournal.Entry(seq = index + 1L, at = 1000L * index, json = json) }

    private fun report(journal: List<SessionJournal.Entry>, events: List<DiagnosticsLog.Entry> = emptyList()) =
        FeedbackReport.build(environment = listOf("Amazing Claude Code GUI 9.9.9"), journal = journal, events = events)

    @Test
    fun `nothing a person typed or the agent answered comes out`() {
        val journal = journalOf(
            """{"type":"echo","sessionId":"main","text":"my database password is hunter2"}""",
            """{"type":"agent","sessionId":"main","event":{"type":"assistant","message":{"content":[
                {"type":"text","text":"the answer is to refactor the invoice totals"},
                {"type":"thinking","thinking":"my database password is hunter2"}
            ]}}}""",
            """{"type":"agent","sessionId":"main","event":{"type":"user","message":{"content":[
                {"type":"tool_result","tool_use_id":"t1","content":"AKIAIOSFODNN7EXAMPLE"}
            ]}}}""",
        )

        val text = report(journal)

        secrets.forEach { secret -> assertFalse(text.contains(secret), "the report leaked: $secret") }
    }

    @Test
    fun `a path is replaced by a hash, and the same path by the same hash`() {
        val path = "/Users/somebody/work/private-repo/billing_service.rb"
        val journal = journalOf(
            """{"type":"agent","event":{"type":"assistant","message":{"content":[
                {"type":"tool_use","id":"t1","name":"Read","input":{"file_path":"$path"}}
            ]}}}""",
            """{"type":"agent","event":{"type":"assistant","message":{"content":[
                {"type":"tool_use","id":"t2","name":"Edit","input":{"file_path":"$path","old_string":"a","new_string":"b"}}
            ]}}}""",
        )

        val text = report(journal)

        assertFalse(text.contains("private-repo"), "the report leaked a path")
        assertFalse(text.contains("billing_service"), "the report leaked a file name")

        // The same file has to read as the same file - that is the whole worth of hashing it rather than
        // dropping it.
        val marks = Regex("f:([A-Za-z0-9_-]+)").findAll(text).map { it.groupValues[1] }.toList()
        assertEquals(2, marks.size, "both calls should name their file")
        assertEquals(marks[0], marks[1])
    }

    @Test
    fun `the shape of what happened does come out`() {
        val journal = journalOf(
            """{"type":"agent","event":{"type":"assistant","message":{"content":[
                {"type":"tool_use","id":"t1","name":"Bash","input":{"command":"rm -rf /tmp/secret-thing"}}
            ]}}}""",
            """{"type":"agent","event":{"type":"user","message":{"content":[
                {"type":"tool_result","tool_use_id":"t1","is_error":true,"content":"permission denied"}
            ]}}}""",
        )

        val text = report(journal)

        assertContains(text, "Bash")
        assertContains(text, "fail")
        // The command itself is not the shape of anything - it is the command.
        assertFalse(text.contains("secret-thing"), "the report leaked a command")
    }

    @Test
    fun `a prompt is counted, not quoted`() {
        val text = report(journalOf("""{"type":"echo","text":"my database password is hunter2"}"""))

        assertContains(text, "prompt sent")
        assertContains(text, "31 chars")
        assertFalse(text.contains("hunter2"))
    }

    @Test
    fun `a permission names the tool and never the command`() {
        val text = report(
            journalOf("""{"type":"permission","id":"p1","target":"Bash","command":"cat /Users/somebody/.aws/credentials"}"""),
        )

        assertContains(text, "permission asked")
        assertContains(text, "Bash")
        assertFalse(text.contains("credentials"))
    }

    @Test
    fun `an api retry is spelled out, because it looks like a hang`() {
        val text = report(
            journalOf(
                """{"type":"agent","event":{"type":"system","subtype":"api_retry","attempt":2,"max_retries":6,
                    "retry_delay_ms":8000,"error_status":529,"error":"overloaded"}}""",
            ),
        )

        assertContains(text, "api retry")
        assertContains(text, "2/6")
        assertContains(text, "529")
    }

    @Test
    fun `a field nobody taught it about contributes nothing`() {
        val journal = journalOf(
            """{"type":"agent","event":{"type":"assistant","message":{"content":[
                {"type":"tool_use","id":"t1","name":"Custom","input":{"secretPayload":"my database password is hunter2"}}
            ]}}}""",
        )

        val text = report(journal)

        assertContains(text, "Custom")
        assertFalse(text.contains("hunter2"), "an unknown input field must not be copied out")
    }

    @Test
    fun `an entry that is not json at all does not take the report down with it`() {
        val text = report(journalOf("not json", """{"type":"status","status":"running"}"""))

        assertContains(text, "unreadable entry")
        assertContains(text, "status running")
    }

    /**
     * The other half of the report, and the half a test used not to look at.
     *
     * The outline above cannot leak, because nothing is copied out of the journal at all. These lines can:
     * they are written by other programs, and they go through the same buffer into the same report. So the
     * promise is checked here too - end to end, from the line arriving to the report being built.
     */
    @Test
    fun `the trouble column carries nothing private either`() {
        val home = System.currentTimeMillis().let { "/Users/somebody" }
        val log = DiagnosticsLog()

        log.note("stderr", "(node:1) Warning: $home/work/private-repo/billing_service.rb is deprecated")
        log.note("agent", "claude would not start: Cannot run program \"$home/.nvm/versions/node/bin/claude\"")
        log.note("stats", "the statistics could not be written: $home/Library/Application Support/acc/stats.json")

        val text = report(journal = emptyList(), events = log.tail())

        assertFalse(text.contains("somebody"), "the home directory leaked into the report")
        assertFalse(text.contains("private-repo"), "a project name leaked into the report")
        assertFalse(text.contains("billing_service"), "a file name leaked into the report")
        assertFalse(text.contains(".nvm"), "a path leaked into the report")

        // And what happened is still readable, which is the only reason to attach any of this.
        assertContains(text, "Warning")
        assertContains(text, "would not start")
        assertContains(text, "path:")
    }

    @Test
    fun `the trouble column carries what the plugin itself saw`() {
        val text = report(
            journal = emptyList(),
            events = listOf(
                DiagnosticsLog.Entry(at = 1_700_000_000_000, source = "agent", text = "claude exited on its own (code 1)"),
            ),
        )

        assertContains(text, "claude exited on its own (code 1)")
        assertContains(text, "nothing yet in this conversation")
    }

    /**
     * The report is a wire format rather than something shown to the person whose machine wrote it: it is
     * read by somebody else, elsewhere. On a Russian or German machine a decimal comma is merely odd; on an
     * Arabic or Indian locale the digits themselves come out in another script, and the column of timings
     * stops being readable at all.
     */
    @Test
    fun `numbers read the same whatever the machine's language is`() {
        val was = Locale.getDefault()

        try {
            for (locale in listOf(Locale.forLanguageTag("ru-RU"), Locale.forLanguageTag("ar-EG"), Locale.GERMANY)) {
                Locale.setDefault(locale)

                val big = "x".repeat(1_600_000)
                val text = report(
                    journalOf(
                        "{\"type\":\"agent\",\"event\":{\"type\":\"assistant\",\"message\":{\"content\":[" +
                            "{\"type\":\"tool_use\",\"id\":\"t1\",\"name\":\"Read\",\"input\":{\"file_path\":\"/a\",\"data\":\"$big\"}}" +
                            "]}}}",
                        "{\"type\":\"agent\",\"event\":{\"type\":\"result\",\"duration_ms\":1500,\"num_turns\":2}}",
                    ),
                )

                assertContains(text, "1.5s", message = "the timing should read the same in $locale")
                assertContains(text, "1.5 MB", message = "the size should read the same in $locale")
                assertFalse(text.contains("1,5"), "a decimal comma got into the report in $locale")
            }
        } finally {
            Locale.setDefault(was)
        }
    }

    @Test
    fun `a huge conversation is cut, and says so`() {
        val long = "x".repeat(2_000)
        val journal = journalOf(
            *Array(300) { index ->
                """{"type":"agent","event":{"type":"assistant","message":{"content":[
                    {"type":"tool_use","id":"t$index","name":"Read","input":{"file_path":"/a/$index","data":"$long"}}
                ]}}}"""
            },
        )

        val text = FeedbackReport.build(
            environment = listOf("Amazing Claude Code GUI 9.9.9"),
            journal = journal + journalOf("""{"type":"status","status":"idle"}"""),
            events = emptyList(),
        )

        assertTrue(text.length <= FeedbackReport.MAX_CHARS, "the report should respect its ceiling")
        // The head survives, and so does the end - the cut is made in the middle, where the least is lost.
        assertContains(text, "Amazing Claude Code GUI 9.9.9")
        assertContains(text, "status idle")
        // And the outline still has its heading: a cut report should read as shortened, not as broken.
        assertContains(text, "--- this conversation, in outline ---")
    }
}

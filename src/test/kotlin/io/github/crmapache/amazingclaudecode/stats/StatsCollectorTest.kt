package io.github.crmapache.amazingclaudecode.stats

import com.intellij.openapi.util.Disposer
import java.nio.file.Files
import java.time.LocalDate
import java.time.ZoneId
import kotlin.test.AfterTest
import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertNull
import kotlin.test.assertSame
import kotlin.test.assertTrue
import kotlinx.serialization.json.buildJsonObject
import kotlinx.serialization.json.put

class StatsCollectorTest {

    private val directory = Files.createTempDirectory("acc-stats")

    private val ledger = StatsLedger(directory.resolve("statistics.json"))

    private val disposable = Disposer.newDisposable()

    /** Noon on a Wednesday, so the "hour of the day" figures are the ones the test expects. */
    private var now = LocalDate.parse("2026-08-26").atTime(12, 0).atZone(ZoneId.systemDefault()).toInstant().toEpochMilli()

    private val collector = StatsCollector(
        projectKey = "p-test",
        projectName = "test",
        workingDirectory = directory.toString(),
        parentDisposable = disposable,
        ledger = ledger,
        clock = { now },
    )

    @AfterTest
    fun tearDown() {
        Disposer.dispose(disposable)
        Disposer.dispose(ledger)
        directory.toFile().deleteRecursively()
    }

    private fun today(): DayRecord = ledger.read { it.projects["p-test"]!!.days["2026-08-26"]!! }

    private fun toolUse(id: String, name: String, input: String): String =
        """{"type":"assistant","message":{"model":"claude-sonnet-5","content":[{"type":"tool_use","id":"$id","name":"$name","input":$input}]}}"""

    private fun toolResult(id: String, error: Boolean = false): String =
        """{"type":"user","message":{"content":[{"type":"tool_result","tool_use_id":"$id","is_error":$error,"content":"ok"}]}}"""

    private fun result(durationMs: Long, cost: Double = 0.0): String =
        """{"type":"result","subtype":"success","duration_ms":$durationMs,"total_cost_usd":$cost,"usage":{"input_tokens":100,"output_tokens":20,"cache_read_input_tokens":300,"cache_creation_input_tokens":5}}"""

    @Test
    fun `an edit that landed counts its lines, one that failed does not`() {
        collector.noteLine("main", toolUse("t1", "Edit", """{"file_path":"src/app.ts","old_string":"a","new_string":"b\nc"}"""))
        collector.noteLine("main", toolResult("t1"))
        collector.noteLine("main", toolUse("t2", "Edit", """{"file_path":"src/app.test.ts","old_string":"x","new_string":"y"}"""))
        collector.noteLine("main", toolResult("t2", error = true))
        collector.noteLine("main", toolUse("t3", "Write", """{"file_path":"src/new.test.ts","content":"one\ntwo\nthree\n"}"""))
        collector.noteLine("main", toolResult("t3"))
        collector.noteLine("main", result(durationMs = 12_000, cost = 0.5))

        val day = today()
        assertEquals(2, day.edits)
        assertEquals(5, day.linesAdded)
        assertEquals(1, day.linesRemoved)
        assertEquals(3, day.biggestEdit)
        assertEquals(0, day.singleLineEdits)
        assertEquals(2, day.tools["Edit"])
        assertEquals(1, day.tools["Write"])
        assertEquals(2, day.files.size)
        assertEquals(2, day.maxFilesInTurn)
        assertEquals(1, day.testTurns)
        assertEquals(1, day.turns)
        assertEquals(1, day.quickTurns)
        assertEquals(12_000, day.turnMillis)
        assertEquals(425, day.tokensIn + day.tokensOut + day.tokensCacheRead + day.tokensCacheWrite)
        assertEquals(0.5, day.cost)
        assertEquals(1, day.models["Sonnet"])
        assertTrue(day.minutes.count() >= 1)
    }

    @Test
    fun `a turn's cost is what the running total grew by`() {
        collector.noteLine("main", result(durationMs = 1_000, cost = 0.5))
        collector.noteLine("main", result(durationMs = 1_000, cost = 0.8))
        // The conversation started over: the total fell, and the whole of it is new.
        collector.noteLine("main", result(durationMs = 1_000, cost = 0.1))

        assertEquals(0.9, today().cost, 1e-9)
    }

    @Test
    fun `a single-line swap is the surgeon's, and a long turn the long haul's`() {
        collector.noteLine("main", toolUse("t1", "Edit", """{"file_path":"a.kt","old_string":"val x = 1","new_string":"val x = 2"}"""))
        collector.noteLine("main", toolResult("t1"))
        collector.noteLine("main", result(durationMs = 11 * 60_000))

        val day = today()
        assertEquals(1, day.singleLineEdits)
        assertEquals(1, day.longTurns)
        assertEquals(0, day.quickTurns)
    }

    @Test
    fun `a finished task list is carried to the end once`() {
        val done = """{"todos":[{"content":"a","status":"completed"},{"content":"b","status":"completed"}]}"""
        val open = """{"todos":[{"content":"a","status":"completed"},{"content":"b","status":"in_progress"}]}"""

        collector.noteLine("main", toolUse("t1", "TodoWrite", open))
        collector.noteLine("main", toolUse("t2", "TodoWrite", done))
        collector.noteLine("main", toolUse("t3", "TodoWrite", done))
        collector.noteLine("main", toolUse("t4", "TodoWrite", open))
        collector.noteLine("main", toolUse("t5", "TodoWrite", done))

        assertEquals(2, today().todosDone)
        assertEquals(5, today().tools["TodoWrite"])
    }

    @Test
    fun `turns inside one hour are counted against the busiest hour`() {
        for (index in 0 until 4) {
            collector.noteLine("main", result(durationMs = 1_000))
            now += 10 * 60_000
        }
        now += 2 * 60 * 60_000
        collector.noteLine("main", result(durationMs = 1_000))

        assertEquals(4, today().maxTurnsInHour)
        assertEquals(5, today().turns)
    }

    @Test
    fun `a message counts the hour it was sent in, where it came from, and its command`() {
        collector.notePrompt("main", "/compact please", images = 0, remote = false)
        now -= 6 * 60 * 60_000 // six in the morning
        collector.notePrompt("main", "hello", images = 2, remote = true)
        now -= 4 * 60 * 60_000 // two in the morning
        collector.notePrompt("main", "still here", images = 0, remote = false)

        val day = today()
        assertEquals(3, day.prompts)
        assertEquals(1, day.phonePrompts)
        assertEquals(1, day.earlyPrompts)
        assertEquals(1, day.latePrompts)
        assertEquals(2, day.attachments)
        assertEquals(setOf("compact"), day.slash)
    }

    @Test
    fun `a refused edit is an edit turned down at the door`() {
        collector.notePermission("Edit", "deny")
        collector.notePermission("Bash", "deny")
        collector.notePermission("Edit", "once")
        collector.notePermission("Bash", "always")
        collector.notePlan("approve")
        collector.notePlan("keepPlanning")

        val day = today()
        assertEquals(4, day.permissionsAsked)
        assertEquals(2, day.permissionsAllowed)
        assertEquals(2, day.permissionsDenied)
        assertEquals(1, day.editsRefused)
        assertEquals(1, day.plansApproved)
    }

    @Test
    fun `a window that ran out is counted once however often the CLI repeats it`() {
        val resetsAt = now / 1000 + 3600
        val stopped = """{"type":"rate_limit_event","rate_limit_info":{"status":"rejected","resetsAt":$resetsAt,"rateLimitType":"five_hour"}}"""
        val warning = """{"type":"rate_limit_event","rate_limit_info":{"status":"allowed_warning","resetsAt":$resetsAt,"rateLimitType":"five_hour"}}"""
        val weekly = """{"type":"rate_limit_event","rate_limit_info":{"status":"rejected","resetsAt":$resetsAt,"rateLimitType":"seven_day"}}"""

        collector.noteLine("main", stopped)
        collector.noteLine("main", stopped)
        collector.noteLine("main", warning)
        collector.noteLine("main", weekly)

        assertEquals(1, today().ranOutFiveHour)
    }

    @Test
    fun `tabs, forks and their depth are written down as they open`() {
        collector.noteSessionOpened("main", parentId = null, groupId = "main", depth = 0)
        collector.noteSessionOpened("f1", parentId = "main", groupId = "main", depth = 1)
        collector.noteSessionOpened("f2", parentId = "f1", groupId = "main", depth = 2)

        val day = today()
        assertEquals(3, day.sessions)
        assertEquals(2, day.forks)
        assertEquals(2, day.maxForksInTree)
        assertEquals(2, day.maxDepth)
    }

    @Test
    fun `the tab that was already open counts as a conversation on its first sign of life`() {
        // Nobody opens the panel's first tab - it stands there before anything is asked for (see
        // SessionRegistry), and a day worked in it counted turns against no conversations at all.
        collector.noteLine("main", result(durationMs = 1_000))
        collector.noteLine("main", result(durationMs = 1_000))
        collector.notePrompt("main", "one more", images = 0, remote = false)

        assertEquals(1, today().sessions)
        assertEquals(2, today().turns)
    }

    @Test
    fun `a tab counted when it opened is not counted again by its work`() {
        collector.noteSessionOpened("f1", parentId = "main", groupId = "main", depth = 1)
        collector.noteLine("f1", result(durationMs = 1_000))

        assertEquals(1, today().sessions)
    }

    @Test
    fun `a tab that reads a past conversation is still the one tab it was`() {
        // The conversation arrives in the tab the person is already in: one tab, one conversation today.
        collector.noteLine("main", result(durationMs = 1_000))
        collector.noteResumed("main", "past-one")
        collector.noteResumed("main", "past-two")

        assertEquals(1, today().sessions)
    }

    @Test
    fun `a tab whose first act is to read a past conversation counts once`() {
        collector.noteResumed("fresh", "past-one")

        assertEquals(1, today().sessions)
    }

    @Test
    fun `the folded days are kept between passes and follow the book when it changes`() {
        collector.noteLine("main", result(durationMs = 1_000))

        val first = ledger.read { it.daysTogether() }
        val again = ledger.read { it.daysTogether() }
        // The same work, not done twice: every fold builds a record through reflection.
        assertSame(first, again)
        assertEquals(1, first["2026-08-26"]?.turns)

        collector.noteLine("main", result(durationMs = 1_000))

        assertEquals(2, ledger.read { it.daysTogether() }["2026-08-26"]?.turns)
    }

    @Test
    fun `the panel's own counts land where they belong`() {
        collector.noteClientEvent(buildJsonObject { put("type", "stat"); put("kind", "prompt"); put("attachments", 3); put("quotes", 2) })
        collector.noteClientEvent(buildJsonObject { put("type", "stat"); put("kind", "thanks"); put("way", "github") })
        // The same way again is the same thanks: what is written down is which ways were taken.
        collector.noteClientEvent(buildJsonObject { put("type", "stat"); put("kind", "thanks"); put("way", "github") })
        collector.noteClientEvent(buildJsonObject { put("type", "stat"); put("kind", "thanks"); put("way", "rate") })
        collector.noteClientEvent(buildJsonObject { put("type", "stat"); put("kind", "activity"); put("sessionId", "main") })
        collector.noteWatchers(1)
        collector.noteWatchers(2)
        collector.noteMcp(3)
        collector.noteMcp(1)
        collector.notePlugins(4)

        val day = today()
        assertEquals(3, day.attachments)
        assertEquals(2, day.quotes)
        assertEquals(setOf("github", "rate"), day.thanksWays)
        assertEquals(1, day.watched)
        assertEquals(3, day.mcpConnected)
        assertEquals(4, day.plugins)
        assertEquals(1, day.minutes.count())
    }

    @Test
    fun `a phone that keeps dropping the line is one visit, not twenty`() {
        collector.noteWatchers(1)
        // The line goes and comes back, the way a phone in a pocket does.
        repeat(5) {
            collector.noteWatchers(0)
            now += 20_000
            collector.noteWatchers(1)
        }
        assertEquals(1, today().watched)

        // Gone for the afternoon and back: that is somebody looking in again.
        collector.noteWatchers(0)
        now += 2 * 60 * 60_000
        collector.noteWatchers(1)
        assertEquals(2, today().watched)
    }

    @Test
    fun `a conversation's minutes add up to its longest stretch across the day's edge`() {
        collector.noteStatus("main", running = true)
        for (index in 0 until 30) {
            now += 60_000
            collector.noteStatus("main", running = true)
        }
        // A long pause, then a short burst: the session grows, the stretch does not.
        now += 60 * 60_000
        for (index in 0 until 5) {
            now += 60_000
            collector.noteStatus("main", running = true)
        }

        val day = today()
        assertEquals(36, day.longestSession)
        assertEquals(31, day.longestStretch)
    }

    /**
     * A pause shorter than the bridge is still the same stretch - a person reading the answer before
     * writing the next message has not left - while a longer one starts a new one. The rule used to live
     * in a helper of its own; it is carried along with the minutes now (see Conversation.mark).
     */
    @Test
    fun `a short pause does not break a stretch and a long one does`() {
        collector.noteStatus("main", running = true)
        // Five minutes of silence: bridged, so the stretch runs on across them.
        now += 5 * 60_000
        collector.noteStatus("main", running = true)
        now += 60_000
        collector.noteStatus("main", running = true)

        assertEquals(7, today().longestStretch)

        // Seven minutes is past the bridge: a new stretch begins, and the longest stays what it was.
        now += 7 * 60_000
        collector.noteStatus("main", running = true)

        assertEquals(7, today().longestStretch)
        assertEquals(4, today().longestSession)
    }

    @Test
    fun `a stream line the ledger cannot read is let through`() {
        collector.noteLine("main", "not json")
        collector.noteLine("main", """{"type":"stream_event","event":{"type":"content_block_delta"}}""")
        collector.noteLine("main", """{"type":"assistant","message":"a bare string"}""")

        assertTrue(ledger.read { it.projects["p-test"] == null })
    }

    @Test
    fun `the payload names this project and the achievements`() {
        collector.noteLine("main", result(durationMs = 1_000))

        val payload = collector.payload()

        assertTrue(payload.contains("\"type\":\"statistics\""))
        assertTrue(payload.contains("\"key\":\"p-test\""))
        assertTrue(payload.contains("\"id\":\"hours-in-panel\""))
        assertTrue(payload.contains("\"date\":\"2026-08-26\""))
    }

    @Test
    fun `a move of the achievement lines forgets the tiers it moved and keeps the rest`() {
        val file = directory.resolve("older-book.json")
        Files.writeString(
            file,
            """{"version":1,"since":1,"earned":{"reader":{"1":10,"2":20},"steady-hand":{"1":30}}}""",
        )

        val older = StatsLedger(file)
        try {
            older.read { book ->
                // "Reader" is measured against lines that have moved: its moments go, to be earned again.
                assertNull(book.earned["reader"])
                // "Steady hand" is days in a row - the same days it always was.
                assertEquals<Set<Int>?>(setOf(1), book.earned["steady-hand"]?.keys)
                assertEquals(Achievements.RULES_VERSION, book.rulesVersion)
            }
        } finally {
            Disposer.dispose(older)
        }

        // And the version now stands in the file, so the next start forgets nothing.
        val again = StatsLedger(file)
        try {
            again.read { book -> assertEquals(Achievements.RULES_VERSION, book.rulesVersion) }
        } finally {
            Disposer.dispose(again)
        }
    }

    @Test
    fun `a project's key gives nothing of its path away`() {
        val key = StatsCollector.keyOf("/Users/somebody/secret-project")
        assertTrue(key.startsWith("p-"))
        assertEquals(18, key.length)
        assertEquals(key, StatsCollector.keyOf("/Users/somebody/secret-project"))
    }

    @Test
    fun `a model is known by its family`() {
        assertEquals("Sonnet", StatsCollector.familyOf("claude-sonnet-5"))
        assertEquals("Opus", StatsCollector.familyOf("claude-opus-5[1m]"))
        assertEquals("Fable", StatsCollector.familyOf("claude-fable-5"))
        assertEquals("", StatsCollector.familyOf(""))
        assertEquals("gpt-x", StatsCollector.familyOf("gpt-x"))
    }

    @Test
    fun `a slash command is read off the start of the message`() {
        assertEquals("compact", StatsCollector.slashCommandOf("  /compact keep the tests"))
        assertEquals("model", StatsCollector.slashCommandOf("/model"))
        assertEquals(null, StatsCollector.slashCommandOf("say /compact later"))
        assertEquals(null, StatsCollector.slashCommandOf("/"))
    }

    @Test
    fun `a turn the CLI closed with its own words stays with the model that worked`() {
        collector.noteLine("main", toolUse("t1", "Read", """{"file_path":"src/app.ts"}"""))
        collector.noteLine("main", toolResult("t1"))
        // Interrupted: the last word of the turn is the CLI's own, and it is signed "<synthetic>".
        collector.noteLine(
            "main",
            """{"type":"assistant","message":{"model":"<synthetic>","content":[{"type":"text","text":"Request interrupted by user"}]}}""",
        )
        collector.noteLine("main", result(durationMs = 3_000))

        val day = today()
        assertEquals(1, day.models["Sonnet"])
        assertNull(day.models["<synthetic>"])
        assertEquals(setOf("Sonnet"), day.models.keys)
    }
}

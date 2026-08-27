package io.github.crmapache.amazingclaudecode.stats

import java.util.TreeMap
import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertNotNull
import kotlin.test.assertNull

class StatsDataTest {

    private fun snapshot(build: StatsSnapshot.() -> Unit = {}): StatsSnapshot = StatsSnapshot().apply(build)

    @Test
    fun `the book survives the file with every figure intact`() {
        val original = snapshot {
            since = 1_700_000_000_000
            devicesPaired = 2
            val day = project("p-1", "amazing").days.getOrPut("2026-08-26") { DayRecord() }
            day.minutes.mark(600)
            day.turns = 12
            day.turnMillis = 345_678
            day.cost = 1.25
            day.tools["Read"] = 5
            day.models["Sonnet"] = 3
            day.files.add("abc")
            day.slash.add("compact")
            day.ranOutWindows.add("five_hour:123")
            day.updatedAt = 42
            earned["big-diff"] = TreeMap(mapOf(1 to 10L, 2 to 20L))
        }

        val decoded = StatsJson.decode(StatsJson.encode(original))
        assertNotNull(decoded)

        assertEquals(1_700_000_000_000, decoded.since)
        assertEquals(2, decoded.devicesPaired)
        val project = decoded.projects["p-1"]
        assertNotNull(project)
        assertEquals("amazing", project.name)
        val day = project.days["2026-08-26"]
        assertNotNull(day)
        assertEquals(1, day.minutes.count())
        assertEquals(12, day.turns)
        assertEquals(345_678, day.turnMillis)
        assertEquals(1.25, day.cost)
        assertEquals(5, day.tools["Read"])
        assertEquals(3, day.models["Sonnet"])
        assertEquals(setOf("abc"), day.files)
        assertEquals(setOf("compact"), day.slash)
        assertEquals(setOf("five_hour:123"), day.ranOutWindows)
        assertEquals(42, day.updatedAt)
        assertEquals<Map<Int, Long>?>(mapOf(1 to 10L, 2 to 20L), decoded.earned["big-diff"])
    }

    @Test
    fun `an unreadable file is not a book`() {
        assertNull(StatsJson.decode("not json"))
        assertNull(StatsJson.decode("[1, 2]"))
    }

    @Test
    fun `a merge keeps every day only one side knows`() {
        val mine = snapshot {
            since = 200
            val project = project("p-1", "mine")
            project.days["2026-08-25"] = DayRecord().apply { turns = 5; updatedAt = 100 }
            project.days["2026-08-26"] = DayRecord().apply { turns = 1; updatedAt = 500 }
        }
        val theirs = snapshot {
            since = 100
            devicesPaired = 1
            val project = project("p-1", "")
            project.days["2026-08-25"] = DayRecord().apply { turns = 9; updatedAt = 300 }
            project.days["2026-08-24"] = DayRecord().apply { turns = 7; updatedAt = 50 }
            project("p-2", "theirs").days["2026-08-20"] = DayRecord().apply { turns = 2 }
        }

        val merged = mine.mergedWith(theirs)

        assertEquals(100, merged.since)
        assertEquals(1, merged.devicesPaired)
        val project = merged.projects["p-1"]
        assertNotNull(project)
        assertEquals("mine", project.name)
        assertEquals(9, project.days["2026-08-25"]?.turns)
        assertEquals(1, project.days["2026-08-26"]?.turns)
        assertEquals(7, project.days["2026-08-24"]?.turns)
        assertEquals(2, merged.projects["p-2"]?.days?.get("2026-08-20")?.turns)
    }

    /**
     * Two IDEs on the same project on the same evening. Taking the record touched last threw the other
     * one away whole: forty turns and five hours replaced by five turns and twenty minutes because that
     * copy happened to be saved a second later, with nothing anywhere saying so.
     */
    @Test
    fun `a day both sides know keeps the larger of every figure`() {
        val mine = DayRecord().apply {
            minutes.mark(600)
            minutes.mark(601)
            turns = 40
            turnMillis = 5 * 60 * 60_000L
            biggestEdit = 12
            cost = 1.5
            tools["Read"] = 30
            tools["Edit"] = 4
            models["Opus"] = 40
            files.add("aaa")
            slash.add("compact")
            updatedAt = 100
        }
        val theirs = DayRecord().apply {
            minutes.mark(601)
            minutes.mark(700)
            turns = 5
            turnMillis = 20 * 60_000L
            biggestEdit = 90
            cost = 0.2
            tools["Read"] = 2
            tools["Bash"] = 7
            models["Sonnet"] = 5
            files.add("bbb")
            slash.add("model")
            updatedAt = 900
        }

        val merged = mine.mergedWith(theirs)

        assertEquals(40, merged.turns)
        assertEquals(5 * 60 * 60_000L, merged.turnMillis)
        assertEquals(90, merged.biggestEdit)
        assertEquals(1.5, merged.cost)
        assertEquals(30, merged.tools["Read"])
        assertEquals(4, merged.tools["Edit"])
        assertEquals(7, merged.tools["Bash"])
        assertEquals(40, merged.models["Opus"])
        assertEquals(5, merged.models["Sonnet"])
        assertEquals(setOf("aaa", "bbb"), merged.files)
        assertEquals(setOf("compact", "model"), merged.slash)
        assertEquals(900, merged.updatedAt)
        // Minutes are the one figure that genuinely adds up: a minute both marked is still one minute.
        assertEquals(3, merged.minutes.count())
    }

    @Test
    fun `the windows that ran out are counted off the windows themselves`() {
        val mine = DayRecord().apply { ranOutWindows.add("five_hour:1"); ranOutFiveHour = 1 }
        val theirs = DayRecord().apply { ranOutWindows.add("five_hour:2"); ranOutFiveHour = 1 }

        val merged = mine.mergedWith(theirs)

        assertEquals(2, merged.ranOutFiveHour)
        assertEquals(setOf("five_hour:1", "five_hour:2"), merged.ranOutWindows)
    }

    @Test
    fun `two projects of one day add their counts and join their minutes`() {
        val one = DayRecord().apply {
            minutes.mark(600)
            minutes.mark(601)
            turns = 6
            prompts = 2
            sessions = 1
            turnMillis = 90_000
            longestTurnMillis = 60_000
            biggestEdit = 12
            maxTurnsInHour = 6
            longestSession = 40
            cost = 1.5
            tools["Read"] = 30
            models["Opus"] = 6
            files.add("aaa")
            slash.add("compact")
            ranOutWindows.add("five_hour:1")
            ranOutFiveHour = 1
            updatedAt = 100
        }
        val other = DayRecord().apply {
            minutes.mark(601)
            minutes.mark(602)
            turns = 8
            prompts = 11
            sessions = 4
            turnMillis = 30_000
            longestTurnMillis = 20_000
            biggestEdit = 90
            maxTurnsInHour = 4
            longestSession = 251
            cost = 0.25
            tools["Read"] = 1
            tools["Bash"] = 7
            models["Sonnet"] = 8
            files.add("bbb")
            slash.add("model")
            // The same five-hour window: the limit belongs to the account, not to either project.
            ranOutWindows.add("five_hour:1")
            ranOutFiveHour = 1
            updatedAt = 900
        }

        val folded = one.foldedWith(other)

        // Three minutes, not four: the minute both projects worked through was one minute of a life.
        assertEquals(3, folded.minutes.count())
        assertEquals(14, folded.turns)
        assertEquals(13, folded.prompts)
        assertEquals(5, folded.sessions)
        assertEquals(120_000, folded.turnMillis)
        assertEquals(1.75, folded.cost)
        assertEquals(31, folded.tools["Read"])
        assertEquals(7, folded.tools["Bash"])
        assertEquals(6, folded.models["Opus"])
        assertEquals(8, folded.models["Sonnet"])
        assertEquals(setOf("aaa", "bbb"), folded.files)
        assertEquals(setOf("compact", "model"), folded.slash)
        // The marks stand at the higher of the two rather than adding up.
        assertEquals(60_000, folded.longestTurnMillis)
        assertEquals(90, folded.biggestEdit)
        assertEquals(6, folded.maxTurnsInHour)
        assertEquals(251, folded.longestSession)
        assertEquals(1, folded.ranOutFiveHour)
        assertEquals(900, folded.updatedAt)
    }

    @Test
    fun `the days of every project come back as the days of the machine`() {
        val book = snapshot {
            project("p-1", "one").days["2026-08-26"] = DayRecord().apply {
                minutes.mark(600)
                minutes.mark(601)
                turns = 3
            }
            project("p-2", "two").days["2026-08-26"] = DayRecord().apply {
                minutes.mark(601)
                turns = 5
            }
            project("p-2", "two").days["2026-08-25"] = DayRecord().apply {
                minutes.mark(60)
                turns = 1
            }
        }

        val together = book.daysTogether()

        assertEquals(listOf("2026-08-25", "2026-08-26"), together.keys.toList())
        assertEquals(2, together["2026-08-26"]!!.minutes.count())
        assertEquals(8, together["2026-08-26"]!!.turns)
        assertEquals(1, together["2026-08-25"]!!.turns)
        // What comes back is a copy: the book's own record is not handed to whoever counts over it.
        together["2026-08-25"]!!.turns = 99
        assertEquals(1, book.projects["p-2"]!!.days["2026-08-25"]!!.turns)
    }

    @Test
    fun `a tier is earned at the earlier of two moments`() {
        val mine = snapshot { earned["reader"] = TreeMap(mapOf(1 to 500L, 2 to 900L)) }
        val theirs = snapshot { earned["reader"] = TreeMap(mapOf(1 to 300L, 3 to 1200L)) }

        val merged = mine.mergedWith(theirs)

        assertEquals<Map<Int, Long>?>(mapOf(1 to 300L, 2 to 900L, 3 to 1200L), merged.earned["reader"])
    }

    @Test
    fun `a since of zero means never, not the beginning of time`() {
        assertEquals(700, snapshot { since = 0 }.mergedWith(snapshot { since = 700 }).since)
        assertEquals(700, snapshot { since = 700 }.mergedWith(snapshot { since = 0 }).since)
    }

    @Test
    fun `a book written before the CLI's marks were known loses them as it is read`() {
        val original = snapshot {
            val day = project("p-1", "amazing").days.getOrPut("2026-08-26") { DayRecord() }
            day.models["Opus"] = 9
            day.models["<synthetic>"] = 2
        }

        val decoded = StatsJson.decode(StatsJson.encode(original))
        assertNotNull(decoded)
        val day = decoded.projects["p-1"]?.days?.get("2026-08-26")
        assertNotNull(day)
        assertEquals(9, day.models["Opus"])
        assertEquals(setOf("Opus"), day.models.keys)
    }

    @Test
    fun `a book measured against older lines does not bring its forgotten tiers back`() {
        // What the newest version of the rules moved, and something it did not touch.
        val since = Achievements.RULES_VERSION - 1
        val moved = Achievements.forgottenSince(since).first()
        val untouched = Achievements.IDS.first { it !in Achievements.forgottenSince(since) }

        val mine = snapshot { rulesVersion = Achievements.RULES_VERSION }
        // The IDE next door, still on the plugin whose lines these were, saving what it has.
        val theirs = snapshot {
            rulesVersion = since
            earned[moved] = TreeMap(mapOf(5 to 100L))
            earned[untouched] = TreeMap(mapOf(2 to 200L))
        }

        val merged = mine.mergedWith(theirs)

        assertNull(merged.earned[moved])
        assertEquals<Map<Int, Long>?>(mapOf(2 to 200L), merged.earned[untouched])
        assertEquals(Achievements.RULES_VERSION, merged.rulesVersion)
    }
}

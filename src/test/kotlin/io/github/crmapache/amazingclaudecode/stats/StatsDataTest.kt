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
}

package io.github.crmapache.amazingclaudecode.stats

import java.io.File
import java.time.LocalDate
import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertNull
import kotlin.test.assertTrue

class AchievementsTest {

    private fun definition(id: String): Achievements.Definition = Achievements.ALL.first { it.id == id }

    private fun day(date: String, build: DayRecord.() -> Unit = {}): Pair<String, DayRecord> =
        date to DayRecord().apply { minutes.mark(600); build() }

    private fun book(vararg days: Pair<String, DayRecord>, project: String = "p-1"): StatsSnapshot =
        StatsSnapshot().apply { days.forEach { (date, record) -> project(project, "x").days[date] = record } }

    @Test
    fun `there are fifty-one of them, ids unique`() {
        assertEquals(51, Achievements.ALL.size)
        assertEquals(51, Achievements.IDS.toSet().size)
    }

    @Test
    fun `the interface names the same fifty-one in the same order`() {
        // The words live in the interface, the rules here; the ids are what ties the two together.
        val catalogue = File("webview/src/stats/catalogue.ts").readText()
        // An achievement's id sits two levels in; a group's, one level in - the indent tells them apart.
        val ids = Regex("\n {8}id: '([a-z-]+)'").findAll(catalogue).map { it.groupValues[1] }.toList()

        assertEquals(Achievements.IDS, ids)
    }

    @Test
    fun `a ladder counts the lines crossed and names the next`() {
        val steady = definition("steady-hand")

        assertEquals(0, steady.tierOf(2))
        assertEquals(3, steady.tierOf(23))
        assertEquals(30, steady.targetOf(23))
        assertEquals(5, steady.tierOf(60))
        assertNull(steady.targetOf(75))
    }

    @Test
    fun `a milestone lights every tier at once`() {
        val forked = definition("forked")

        assertTrue(forked.isMilestone)
        assertEquals(0, forked.tierOf(0))
        assertEquals(1, forked.targetOf(0))
        assertEquals(Achievements.TIERS, forked.tierOf(1))
        assertNull(forked.targetOf(1))
    }

    @Test
    fun `the streak is the longest run of consecutive days`() {
        val dates = listOf("2026-08-01", "2026-08-02", "2026-08-03", "2026-08-10", "2026-08-11").map(LocalDate::parse)

        assertEquals(3, Achievements.bestStreak(dates))
    }

    @Test
    fun `a full week needs all seven days, and a return needs a week away`() {
        val week = (17..23).map { LocalDate.parse("2026-08-$it") }
        assertEquals(1, Achievements.fullWeeks(week))
        assertEquals(0, Achievements.fullWeeks(week.drop(1)))

        val away = listOf("2026-08-01", "2026-08-09", "2026-08-10", "2026-08-15").map(LocalDate::parse)
        // Aug 1 to Aug 9: seven quiet days between - a return. Aug 10 to 15: four - not one.
        assertEquals(1, Achievements.returns(away))
    }

    @Test
    fun `a holiday counts once it is over, quiet, and after counting began`() {
        val since = LocalDate.parse("2026-12-26")
        val active = listOf("2026-12-27", "2026-12-31", "2027-01-05").map(LocalDate::parse)

        // Dec 26 to Dec 31 are behind us on Dec 31: 26, 28, 29, 30 were quiet - four days. Dec 24 and 25
        // came before counting began, Dec 27 was worked, and Dec 31 is today.
        assertEquals(4, Achievements.holidayDaysOff(active, since, LocalDate.parse("2026-12-31")))
        // By spring the whole stretch is over: Jan 1 was quiet too.
        assertEquals(5, Achievements.holidayDaysOff(active, since, LocalDate.parse("2027-03-01")))
        // The winter after that adds its nine, none of them worked.
        assertEquals(14, Achievements.holidayDaysOff(active, since, LocalDate.parse("2028-02-01")))
        // Nothing counted before counting began.
        assertEquals(0, Achievements.holidayDaysOff(active, null, LocalDate.parse("2028-02-01")))
    }

    @Test
    fun `the figures fold every project's days together`() {
        val book = StatsSnapshot().apply {
            devicesPaired = 1
            project("p-1", "one").days["2026-08-25"] = DayRecord().apply {
                minutes.mark(1)
                linesAdded = 300
                tools["Read"] = 5
                tools["Grep"] = 2
                tools["Glob"] = 1
                slash.addAll(listOf("compact", "not-a-builtin"))
                longestStretch = 40
                forks = 2
                maxDepth = 2
            }
            project("p-2", "two").days["2026-08-26"] = DayRecord().apply {
                minutes.mark(1)
                minutes.mark(2)
                linesAdded = 700
                tools["Read"] = 1
                slash.add("clear")
                longestStretch = 25
                forks = 1
            }
        }

        val metrics = Achievements.Metrics.of(book, LocalDate.parse("2026-08-26"))

        assertEquals(1000, metrics.linesAdded)
        assertEquals(6, metrics.reads)
        assertEquals(3, metrics.searches)
        assertEquals(2, metrics.slashCommands)
        assertEquals(40, metrics.longestStretch)
        assertEquals(3, metrics.forks)
        assertEquals(2, metrics.maxDepth)
        assertEquals(3, metrics.minutes)
        assertEquals(2, metrics.activeDays)
        assertEquals(2, metrics.bestStreak)
        assertEquals(2, metrics.daysSinceFirst)
        assertEquals(1, metrics.devicesPaired)
    }

    @Test
    fun `the evaluation hands back every achievement with its tier and target`() {
        val book = book(day("2026-08-26") { linesAdded = 18_430; edits = 1 })

        val states = Achievements.evaluate(book, LocalDate.parse("2026-08-26"))

        assertEquals(51, states.size)
        val lines = states.first { it.id == "hundred-thousand" }
        assertEquals(0, lines.tier)
        assertEquals(18_430, lines.value)
        assertEquals(20_000, lines.target)
        val tenThousand = states.first { it.id == "ten-thousand" }
        assertEquals(5, tenThousand.tier)
        assertNull(tenThousand.target)
        assertEquals(5, states.first { it.id == "first-diff" }.tier)
    }
}

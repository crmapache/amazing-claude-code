package io.github.crmapache.amazingclaudecode.stats

import java.time.DayOfWeek
import java.time.Instant
import java.time.LocalDate
import java.time.ZoneId
import java.time.temporal.ChronoUnit
import java.time.temporal.WeekFields

/**
 * The fifty-two achievements, five tiers each, and the figures they are measured by.
 *
 * The rules live here, on the IDE's side, rather than in the interface: a tier is earned at the moment
 * the figure crosses the line, and that moment has to be written down whether or not a panel happens to
 * be open - a turn answered from a phone at night earns exactly as much as one at the desk. The words,
 * the icons and the paint live in the interface (see webview/src/stats/catalogue.ts), keyed by the same
 * ids; a test on either side fails if the two lists drift apart.
 *
 * Every figure is a count, a sum or a high-water mark over the day records (see [Metrics]), so none of
 * them goes down as the work goes on - and a tier once earned is not taken back even when the counting
 * itself changes under it, which is a rule of [evaluate] rather than a happy consequence of the figures.
 * A ladder names five lines to cross; a milestone names one and lights all five at once - "your first
 * fork" is not a thing that comes in fifths.
 */
internal object Achievements {

    class Definition(
        val id: String,
        /** Five thresholds in the metric's own unit, or null for a milestone. */
        val ladder: LongArray?,
        /** The single threshold of a milestone, or null for a ladder. */
        val milestone: Long?,
        val metric: (Metrics) -> Long,
    ) {
        val isMilestone: Boolean get() = milestone != null

        /**
         * How many lines there are to cross in all: a ladder's own length, and one for a milestone.
         *
         * Told to the panel with the rest (see [State]) because it is what the card is drawn from - as
         * many pips as there are steps, and the top step painted as the top. Most ladders have five, and
         * the ones that do not have a reason: the achievement about saying thanks has three, because there
         * are three ways to say it and no more.
         */
        val steps: Int get() = ladder?.size ?: 1

        /** How many tiers this value has crossed: 0..5. */
        fun tierOf(value: Long): Int = when {
            milestone != null -> if (value >= milestone) TIERS else 0
            else -> ladder!!.count { value >= it }
        }

        /** The next line to cross above a tier already standing, or null when there is none left. */
        fun targetOf(tier: Int): Long? = when {
            milestone != null -> if (tier > 0) null else milestone
            else -> ladder!!.getOrNull(tier)
        }

        /**
         * The line the standing tier was earned for, or null when nothing is earned yet.
         *
         * The panel is handed this beside the next one because a tier and a figure alone say nothing
         * about what was crossed: a third tier standing at six hours, read as "7h 23m", leaves the tier
         * unexplained. It is also what lets the progress bar fill from the line already crossed rather
         * than from zero.
         */
        fun lineOf(tier: Int): Long? = when {
            milestone != null -> if (tier > 0) milestone else null
            else -> if (tier > 0) ladder!!.getOrNull(tier - 1) else null
        }
    }

    /** One achievement as it stands right now. */
    class State(
        val id: String,
        val tier: Int,
        val value: Long,
        val target: Long?,
        val line: Long?,
        /** How many lines this one has in all - see [Definition.steps]. */
        val steps: Int,
    )

    const val TIERS = 5

    private fun ladder(vararg steps: Long, metric: (Metrics) -> Long) =
        { id: String -> Definition(id, steps, null, metric) }

    private fun milestone(threshold: Long, metric: (Metrics) -> Long) =
        { id: String -> Definition(id, null, threshold, metric) }

    /**
     * How far the fifth tier stands: about a year of steady heavy work, and the tiers below it spaced so
     * that the first comes in the first days.
     *
     * The lines were first drawn for a person typing, and a person does not write four thousand lines or
     * run a thousand commands in a day - an agent does. Against that rate a thousand lines, ten files in
     * one turn, five servers at once and a four-hour conversation were all a Tuesday, so half the screen
     * lit up in two days and there was nothing left to reach for. The habit ladders were never wrong that
     * way and are untouched: a week of days in a row takes a week however fast the agent writes.
     */
    private val CATALOGUE: List<Pair<String, (String) -> Definition>> = listOf(
        // --- Habit: coming back is the whole trick ---
        "steady-hand" to ladder(3, 7, 14, 30, 60) { it.bestStreak },
        "month-straight" to milestone(30) { it.bestStreak },
        "quarter" to ladder(7, 21, 45, 70, 90) { it.activeDays },
        "weekend-crew" to ladder(1, 5, 10, 25, 50) { it.weekendDays },
        "early-riser" to ladder(10, 50, 150, 500, 1200) { it.earlyPrompts },
        "night-shift" to ladder(10, 50, 150, 500, 1200) { it.latePrompts },
        "full-week" to ladder(1, 2, 4, 8, 16) { it.fullWeeks },
        "second-wind" to ladder(1, 2, 3, 5, 10) { it.returns },
        "two-hundred" to ladder(5, 25, 50, 100, 200) { it.sessions },
        "a-year-in" to ladder(7, 30, 90, 180, 365) { it.daysSinceFirst },
        // The one achievement earned by staying away: Christmas Eve to New Year's Day with the panel shut.
        "home-for-the-holidays" to ladder(1, 2, 5, 9, 18) { it.holidayDaysOff },
        // --- Hours: time the agent carried instead of you ---
        /*
         * The time spent in the panel: one card, five lines, each ten times the one below it - an hour,
         * ten hours, a hundred, a thousand, ten thousand.
         *
         * Four cards for one figure asked a person to work out what told them apart, exactly as the lines
         * written did. The first line still comes on the first day, and the last is the ten thousand hours
         * that are supposed to make a master of anybody - years of it, which is what a top tier is for.
         * In minutes, because that is what a day record counts.
         */
        "hours-in-panel" to ladder(60, 600, 6_000, 60_000, 600_000) { it.minutes },
        "deep-work" to ladder(15, 30, 60, 120, 240) { it.longestStretch },
        "marathon" to ladder(30, 60, 120, 240, 480) { it.longestSession },
        "full-day" to ladder(60, 120, 240, 480, 720) { it.longestDay },
        "sprint" to ladder(5, 10, 20, 35, 60) { it.maxTurnsInHour },
        "quick-turn" to ladder(25, 150, 600, 1500, 3000) { it.quickTurns },
        "long-haul" to ladder(5, 50, 250, 800, 2000) { it.longTurns },
        // --- Code: what actually landed in the files ---
        "first-diff" to milestone(1) { it.edits },
        /*
         * The lines the agent has written: one card, five lines, each about seven times the one below it.
         *
         * It used to be four cards and then three, which is four and three ways of saying the same thing -
         * the figure is one figure, and cutting it into chains only asked a person to work out what told
         * one card from the next. One ladder says it plainly, and the steps are spaced for the pace an
         * agent actually writes at: fifty thousand comes in a couple of weeks, and a hundred million is
         * the work of years rather than of a season.
         */
        "lines-written" to ladder(50_000, 350_000, 2_500_000, 15_000_000, 100_000_000) { it.linesAdded },
        "big-diff" to ladder(150, 400, 900, 1600, 2500) { it.biggestEdit },
        "surgeon" to ladder(10, 50, 150, 400, 1000) { it.singleLineEdits },
        "refactor" to ladder(3, 8, 16, 30, 50) { it.maxFilesInTurn },
        "housekeeper" to ladder(500, 2500, 10000, 40000, 100000) { it.linesRemoved },
        "test-first" to ladder(10, 50, 150, 400, 1000) { it.testTurns },
        "rollback" to ladder(1, 10, 40, 100, 250) { it.editsRefused },
        // --- Tools: the panel has more of them than one remembers ---
        "reader" to ladder(100, 1000, 5000, 15000, 40000) { it.reads },
        "grep-hound" to ladder(50, 500, 2500, 8000, 25000) { it.searches },
        "shell" to ladder(100, 1000, 6000, 25000, 100000) { it.commands },
        "writer" to ladder(10, 100, 500, 2000, 7500) { it.writes },
        "todo-keeper" to ladder(5, 25, 75, 200, 500) { it.todosDone },
        "planner" to ladder(1, 10, 30, 80, 200) { it.plansApproved },
        "mcp" to ladder(1, 3, 6, 10, 15) { it.mcpConnected },
        "plugin-shelf" to ladder(1, 3, 6, 12, 20) { it.plugins },
        "slash" to ladder(1, 3, 7, 12, 20) { it.slashCommands },
        "attachment" to ladder(10, 100, 400, 1200, 4000) { it.attachments },
        // --- Around the panel: forks, history, the phone, the ceiling ---
        "forked" to milestone(1) { it.forks },
        "fork-master" to ladder(2, 5, 10, 25, 50) { it.maxForksInTree },
        "deep-tree" to ladder(1, 2, 3, 4, 5) { it.maxDepth },
        "quoted" to ladder(10, 50, 150, 400, 1000) { it.quotes },
        "historian" to ladder(1, 5, 15, 40, 100) { it.historian },
        "remote" to milestone(1) { it.devicesPaired },
        "on-the-road" to ladder(5, 50, 150, 400, 1000) { it.phonePrompts },
        "watched" to ladder(1, 5, 15, 40, 100) { it.watched },
        "ceiling" to ladder(1, 5, 20, 60, 150) { it.ranOutFiveHour },
        // Three lines rather than five, one for each way there is: a star on GitHub, a review on the
        // plugin's page, a word passed to somebody who has not heard of it (see StatsCollector, "thanks").
        "thanks" to ladder(1, 2, 3) { it.thanks },
    )

    val ALL: List<Definition> = CATALOGUE.map { (id, make) -> make(id) }

    /**
     * Which set of lines the book was last measured against - see [RECALIBRATED] and StatsLedger.load.
     *
     * Raised whenever a threshold moves. Nothing else in the book is versioned, and nothing else needs to
     * be: every other figure means the same thing it always did.
     */
    const val RULES_VERSION = 4

    /**
     * What [RULES_VERSION] 2 forgets, once: the achievements whose lines moved, and the ones whose figure
     * itself now means something else.
     *
     * A tier is not taken back when the counting is merely corrected - that is the floor in [evaluate],
     * and it is there for every recount to come. This release is both cases at once, though: the lines of
     * half the ladders moved, and the hours themselves were being added up across projects, so an hour
     * with two agents running counted as two. A fifth tier standing against a line that no longer exists,
     * or against twice the hours anybody spent, says nothing true - and the four hour ladders are the ones
     * that were most flattered by it. Everything not named here keeps its moments.
     */
    val RECALIBRATED: Set<String> = setOf(
        "first-hour", "ten-hours", "hundred-hours", "five-hundred",
        "early-riser", "night-shift", "deep-work", "marathon", "full-day", "sprint", "quick-turn",
        "long-haul", "big-diff", "surgeon", "refactor", "housekeeper", "test-first", "rollback", "reader",
        "grep-hound", "shell", "writer", "todo-keeper", "planner", "mcp", "plugin-shelf", "slash",
        "attachment", "quoted", "historian", "on-the-road", "watched", "ceiling", "thanks",
    )

    /**
     * What each version of the rules forgot, by the version that did it - see [forgottenSince].
     *
     * By version rather than in one heap, because a book only has to forget what moved after it was last
     * measured. Version 3 moved a single ladder; a book already measured against 2 has earned the other
     * thirty-odd back by honest work, and taking them away a second time would be the screen lying in the
     * other direction.
     */
    private val RECALIBRATIONS: Map<Int, Set<String>> = mapOf(
        2 to RECALIBRATED,
        // "thanks" is no longer counted in presses at all: there are two ways to say it and the ladder now
        // has one line for each, so a hundred and fifty presses of the heart say nothing about either.
        3 to setOf("thanks"),
        /*
         * Both figures that were kept in chains are single ladders now, and the eight ids the chains were
         * written under are gone: the lines the agent writes end at a hundred million rather than a
         * million, and the hours in the panel at ten thousand rather than five hundred. What stood against
         * the old ids goes with them.
         */
        4 to setOf(
            "thousand-lines", "ten-thousand", "hundred-thousand", "million-lines",
            "first-hour", "ten-hours", "hundred-hours", "five-hundred",
        ),
    )

    /** The achievements whose lines have moved since a book was last measured, at [version]. */
    fun forgottenSince(version: Int): Set<String> =
        if (version >= RULES_VERSION) emptySet() else RECALIBRATIONS.filterKeys { it > version }.values.flatten().toSet()

    val IDS: List<String> = ALL.map { it.id }

    /**
     * The slash commands that count as built in - the CLI's own, as opposed to a skill from a file. Only
     * these are counted for the "Slash" achievement: a person's own commands are theirs already.
     */
    val BUILT_IN_COMMANDS: Set<String> = setOf(
        "clear", "compact", "context", "cost", "doctor", "effort", "fork", "help", "init", "memory", "model",
        "permissions", "plugins", "release-notes", "resume", "review", "status", "usage", "mcp", "config",
        "hooks", "agents", "skills", "rewind", "export", "stats", "todos", "bug", "login", "logout",
    )

    /**
     * Where every achievement stands, given the book - and given the tiers already earned, which are a
     * floor under the answer.
     *
     * The floor is what keeps the promise on this class when the counting changes rather than the work.
     * The hours in the panel used to be every project's minutes added up, which counted an hour with two
     * agents running as two hours; counting them honestly makes an old figure smaller, and a tier that
     * was crossed and celebrated would have quietly gone out again. The moments are already written down
     * (see StatsLedger.achievements) - so what was earned stays earned, and the figure beside it tells
     * the truth as it stands now.
     */
    fun evaluate(snapshot: StatsSnapshot, today: LocalDate, earned: Map<String, Int> = emptyMap()): List<State> {
        val metrics = Metrics.of(snapshot, today)
        return ALL.map { definition ->
            val value = definition.metric(metrics)
            val tier = maxOf(definition.tierOf(value), earned[definition.id] ?: 0)
            State(
                definition.id,
                tier,
                value,
                definition.targetOf(tier),
                definition.lineOf(tier),
                definition.steps,
            )
        }
    }

    /**
     * The figures every achievement is measured by, folded out of all the day records at once - every
     * project's, because the person is one and the same whichever project they are in.
     */
    class Metrics private constructor() {
        var bestStreak = 0L
        var activeDays = 0L
        var weekendDays = 0L
        var earlyPrompts = 0L
        var latePrompts = 0L
        var fullWeeks = 0L
        var returns = 0L
        var sessions = 0L
        var daysSinceFirst = 0L
        var holidayDaysOff = 0L
        var minutes = 0L
        var longestStretch = 0L
        var longestSession = 0L
        var longestDay = 0L
        var maxTurnsInHour = 0L
        var quickTurns = 0L
        var longTurns = 0L
        var edits = 0L
        var linesAdded = 0L
        var linesRemoved = 0L
        var biggestEdit = 0L
        var singleLineEdits = 0L
        var maxFilesInTurn = 0L
        var testTurns = 0L
        var editsRefused = 0L
        var reads = 0L
        var searches = 0L
        var commands = 0L
        var writes = 0L
        var todosDone = 0L
        var plansApproved = 0L
        var mcpConnected = 0L
        var plugins = 0L
        var slashCommands = 0L
        var attachments = 0L
        var forks = 0L
        var maxForksInTree = 0L
        var maxDepth = 0L
        var quotes = 0L
        var historian = 0L
        var devicesPaired = 0L
        var phonePrompts = 0L
        var watched = 0L
        var ranOutFiveHour = 0L
        var thanks = 0L

        companion object {
            fun of(snapshot: StatsSnapshot, today: LocalDate): Metrics {
                val metrics = Metrics()
                val activeDates = sortedSetOf<LocalDate>()
                val slash = HashSet<String>()
                val thanks = HashSet<String>()

                // The machine's days rather than each project's own: an hour with two projects working at
                // once is an hour of a person's life, and the ladders of hours are about the person. See
                // StatsSnapshot.daysTogether - the minutes are joined there rather than added.
                for ((day, record) in snapshot.daysTogether()) {
                    val date = runCatching { LocalDate.parse(day) }.getOrNull() ?: continue
                    if (record.isActive()) activeDates.add(date)
                    metrics.longestDay = maxOf(metrics.longestDay, record.minutes.count().toLong())

                    metrics.earlyPrompts += record.earlyPrompts
                    metrics.latePrompts += record.latePrompts
                    metrics.sessions += record.sessions
                    metrics.minutes += record.minutes.count()
                    metrics.longestStretch = maxOf(metrics.longestStretch, record.longestStretch.toLong())
                    metrics.longestSession = maxOf(metrics.longestSession, record.longestSession.toLong())
                    metrics.maxTurnsInHour = maxOf(metrics.maxTurnsInHour, record.maxTurnsInHour.toLong())
                    metrics.quickTurns += record.quickTurns
                    metrics.longTurns += record.longTurns
                    metrics.edits += record.edits
                    metrics.linesAdded += record.linesAdded
                    metrics.linesRemoved += record.linesRemoved
                    metrics.biggestEdit = maxOf(metrics.biggestEdit, record.biggestEdit.toLong())
                    metrics.singleLineEdits += record.singleLineEdits
                    metrics.maxFilesInTurn = maxOf(metrics.maxFilesInTurn, record.maxFilesInTurn.toLong())
                    metrics.testTurns += record.testTurns
                    metrics.editsRefused += record.editsRefused
                    metrics.reads += record.tools[READ] ?: 0
                    metrics.searches += (record.tools[GREP] ?: 0) + (record.tools[GLOB] ?: 0)
                    metrics.commands += record.tools[BASH] ?: 0
                    metrics.writes += record.tools[WRITE] ?: 0
                    metrics.todosDone += record.todosDone
                    metrics.plansApproved += record.plansApproved
                    metrics.mcpConnected = maxOf(metrics.mcpConnected, record.mcpConnected.toLong())
                    metrics.plugins = maxOf(metrics.plugins, record.plugins.toLong())
                    slash.addAll(record.slash.filter { it in BUILT_IN_COMMANDS })
                    thanks.addAll(record.thanksWays)
                    metrics.attachments += record.attachments
                    metrics.forks += record.forks
                    metrics.maxForksInTree = maxOf(metrics.maxForksInTree, record.maxForksInTree.toLong())
                    metrics.maxDepth = maxOf(metrics.maxDepth, record.maxDepth.toLong())
                    metrics.quotes += record.quotes
                    metrics.historian += record.historian
                    metrics.phonePrompts += record.phonePrompts
                    metrics.watched += record.watched
                    metrics.ranOutFiveHour += record.ranOutFiveHour
                }

                metrics.slashCommands = slash.size.toLong()
                // The ways, not the presses: pressing the same one twice is thanking once.
                metrics.thanks = thanks.size.toLong()
                metrics.devicesPaired = snapshot.devicesPaired.toLong()
                metrics.activeDays = activeDates.size.toLong()
                metrics.weekendDays = activeDates.count { it.dayOfWeek == DayOfWeek.SATURDAY || it.dayOfWeek == DayOfWeek.SUNDAY }.toLong()
                metrics.bestStreak = bestStreak(activeDates).toLong()
                metrics.fullWeeks = fullWeeks(activeDates).toLong()
                metrics.returns = returns(activeDates).toLong()
                metrics.daysSinceFirst = activeDates.firstOrNull()
                    ?.let { ChronoUnit.DAYS.between(it, today) + 1 }
                    ?.coerceAtLeast(0)
                    ?: 0L
                metrics.holidayDaysOff = holidayDaysOff(activeDates, sinceDay(snapshot), today).toLong()

                return metrics
            }

            /** The day counting began, by the machine's calendar - or null while it never has. */
            private fun sinceDay(snapshot: StatsSnapshot): LocalDate? =
                snapshot.since.takeIf { it > 0 }?.let { Instant.ofEpochMilli(it).atZone(ZoneId.systemDefault()).toLocalDate() }
        }
    }

    /** The longest run of consecutive calendar days with something happening on each. */
    fun bestStreak(dates: Collection<LocalDate>): Int {
        var best = 0
        var run = 0
        var previous: LocalDate? = null

        for (date in dates.sorted()) {
            run = if (previous != null && previous.plusDays(1) == date) run + 1 else 1
            best = maxOf(best, run)
            previous = date
        }

        return best
    }

    /** Weeks, Monday to Sunday, with all seven days active. */
    fun fullWeeks(dates: Collection<LocalDate>): Int {
        val fields = WeekFields.ISO
        return dates
            .groupBy { it.get(fields.weekBasedYear()) to it.get(fields.weekOfWeekBasedYear()) }
            .count { (_, days) -> days.toSet().size == 7 }
    }

    /** Times the person came back after a week or more away. */
    fun returns(dates: Collection<LocalDate>): Int {
        var count = 0
        var previous: LocalDate? = null

        for (date in dates.sorted()) {
            if (previous != null && ChronoUnit.DAYS.between(previous, date) - 1 >= AWAY_DAYS) count++
            previous = date
        }

        return count
    }

    /** A week away: seven days without a single mark between two active ones. */
    const val AWAY_DAYS = 7

    /**
     * The quiet days of the holiday stretch - Christmas Eve to New Year's Day, the American calendar's
     * one - that have already gone by since counting began.
     *
     * Three conditions, each for a reason. The day has to be over: today may yet be worked, and the days
     * still ahead are nobody's to claim. It has to fall after counting began: a plugin installed in
     * March knows nothing about last December, and crediting it would be a made-up holiday. And it has to
     * be quiet across every project - a Christmas spent in one project is still a Christmas spent. The
     * count runs across the years: this winter's nine days and the next winter's nine are eighteen.
     */
    fun holidayDaysOff(activeDates: Collection<LocalDate>, since: LocalDate?, today: LocalDate): Int {
        if (since == null) return 0
        val active = activeDates.toSet()
        var count = 0

        for (year in since.year - 1..today.year) {
            var day = LocalDate.of(year, HOLIDAYS_FROM.first, HOLIDAYS_FROM.second)
            val end = LocalDate.of(year + 1, HOLIDAYS_TO.first, HOLIDAYS_TO.second)
            while (!day.isAfter(end)) {
                if (!day.isBefore(since) && day.isBefore(today) && day !in active) count++
                day = day.plusDays(1)
            }
        }

        return count
    }

    /** December 24 through January 1: the stretch a person is meant to be away for. */
    val HOLIDAYS_FROM = 12 to 24

    val HOLIDAYS_TO = 1 to 1

    const val READ = "Read"
    const val GREP = "Grep"
    const val GLOB = "Glob"
    const val BASH = "Bash"
    const val WRITE = "Write"
}

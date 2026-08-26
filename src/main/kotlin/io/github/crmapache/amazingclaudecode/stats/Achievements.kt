package io.github.crmapache.amazingclaudecode.stats

import java.time.DayOfWeek
import java.time.Instant
import java.time.LocalDate
import java.time.ZoneId
import java.time.temporal.ChronoUnit
import java.time.temporal.WeekFields

/**
 * The fifty-one achievements, five tiers each, and the figures they are measured by.
 *
 * The rules live here, on the IDE's side, rather than in the interface: a tier is earned at the moment
 * the figure crosses the line, and that moment has to be written down whether or not a panel happens to
 * be open - a turn answered from a phone at night earns exactly as much as one at the desk. The words,
 * the icons and the paint live in the interface (see webview/src/stats/catalogue.ts), keyed by the same
 * ids; a test on either side fails if the two lists drift apart.
 *
 * Every figure is a count, a sum or a high-water mark over the day records (see [Metrics]) - none of
 * them can go down, so no tier is ever taken back. A ladder names five lines to cross; a milestone names
 * one and lights all five at once - "your first fork" is not a thing that comes in fifths.
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

        /** How many tiers this value has crossed: 0..5. */
        fun tierOf(value: Long): Int = when {
            milestone != null -> if (value >= milestone) TIERS else 0
            else -> ladder!!.count { value >= it }
        }

        /** The next line to cross, or null when there is none left. */
        fun targetOf(value: Long): Long? = when {
            milestone != null -> if (value >= milestone) null else milestone
            else -> ladder!!.firstOrNull { value < it }
        }
    }

    /** One achievement as it stands right now. */
    class State(val id: String, val tier: Int, val value: Long, val target: Long?)

    const val TIERS = 5

    private fun ladder(vararg steps: Long, metric: (Metrics) -> Long) =
        { id: String -> Definition(id, steps, null, metric) }

    private fun milestone(threshold: Long, metric: (Metrics) -> Long) =
        { id: String -> Definition(id, null, threshold, metric) }

    private val CATALOGUE: List<Pair<String, (String) -> Definition>> = listOf(
        // --- Habit: coming back is the whole trick ---
        "steady-hand" to ladder(3, 7, 14, 30, 60) { it.bestStreak },
        "month-straight" to milestone(30) { it.bestStreak },
        "quarter" to ladder(7, 21, 45, 70, 90) { it.activeDays },
        "weekend-crew" to ladder(1, 5, 10, 25, 50) { it.weekendDays },
        "early-riser" to ladder(5, 20, 50, 100, 250) { it.earlyPrompts },
        "night-shift" to ladder(5, 20, 50, 100, 250) { it.latePrompts },
        "full-week" to ladder(1, 2, 4, 8, 16) { it.fullWeeks },
        "second-wind" to ladder(1, 2, 3, 5, 10) { it.returns },
        "two-hundred" to ladder(5, 25, 50, 100, 200) { it.sessions },
        "a-year-in" to ladder(7, 30, 90, 180, 365) { it.daysSinceFirst },
        // The one achievement earned by staying away: Christmas Eve to New Year's Day with the panel shut.
        "home-for-the-holidays" to ladder(1, 2, 5, 9, 18) { it.holidayDaysOff },
        // --- Hours: time the agent carried instead of you ---
        "first-hour" to ladder(10, 20, 30, 45, 60) { it.minutes },
        "ten-hours" to ladder(120, 240, 360, 480, 600) { it.minutes },
        "hundred-hours" to ladder(1200, 2400, 3600, 4800, 6000) { it.minutes },
        "five-hundred" to ladder(6000, 12000, 18000, 24000, 30000) { it.minutes },
        "deep-work" to ladder(15, 30, 60, 90, 120) { it.longestStretch },
        "marathon" to ladder(30, 60, 120, 180, 240) { it.longestSession },
        "full-day" to ladder(60, 120, 240, 360, 480) { it.longestDay },
        "sprint" to ladder(3, 6, 10, 15, 20) { it.maxTurnsInHour },
        "quick-turn" to ladder(10, 50, 100, 250, 500) { it.quickTurns },
        "long-haul" to ladder(1, 3, 10, 25, 50) { it.longTurns },
        // --- Code: what actually landed in the files ---
        "first-diff" to milestone(1) { it.edits },
        "thousand-lines" to ladder(200, 400, 600, 800, 1000) { it.linesAdded },
        "ten-thousand" to ladder(2000, 4000, 6000, 8000, 10000) { it.linesAdded },
        "hundred-thousand" to ladder(20000, 40000, 60000, 80000, 100000) { it.linesAdded },
        "big-diff" to ladder(100, 250, 500, 750, 900) { it.biggestEdit },
        "surgeon" to ladder(5, 15, 30, 50, 100) { it.singleLineEdits },
        "refactor" to ladder(2, 4, 6, 8, 10) { it.maxFilesInTurn },
        "housekeeper" to ladder(100, 500, 1000, 5000, 10000) { it.linesRemoved },
        "test-first" to ladder(5, 20, 50, 100, 200) { it.testTurns },
        "rollback" to ladder(1, 5, 10, 25, 50) { it.editsRefused },
        // --- Tools: the panel has more of them than one remembers ---
        "reader" to ladder(50, 250, 1000, 2500, 5000) { it.reads },
        "grep-hound" to ladder(25, 100, 500, 1000, 2500) { it.searches },
        "shell" to ladder(25, 100, 500, 1000, 2500) { it.commands },
        "writer" to ladder(5, 25, 100, 250, 500) { it.writes },
        "todo-keeper" to ladder(5, 15, 30, 50, 100) { it.todosDone },
        "planner" to ladder(1, 5, 10, 25, 50) { it.plansApproved },
        "mcp" to ladder(1, 2, 3, 4, 5) { it.mcpConnected },
        "plugin-shelf" to ladder(1, 2, 4, 6, 10) { it.plugins },
        "slash" to ladder(1, 2, 3, 5, 7) { it.slashCommands },
        "attachment" to ladder(5, 15, 30, 60, 100) { it.attachments },
        // --- Around the panel: forks, history, the phone, the ceiling ---
        "forked" to milestone(1) { it.forks },
        "fork-master" to ladder(2, 5, 10, 25, 50) { it.maxForksInTree },
        "deep-tree" to ladder(1, 2, 3, 4, 5) { it.maxDepth },
        "quoted" to ladder(5, 15, 30, 60, 100) { it.quotes },
        "historian" to ladder(1, 3, 6, 10, 20) { it.historian },
        "remote" to milestone(1) { it.devicesPaired },
        "on-the-road" to ladder(5, 15, 25, 50, 100) { it.phonePrompts },
        "watched" to ladder(1, 3, 5, 10, 25) { it.watched },
        "ceiling" to ladder(1, 2, 5, 10, 20) { it.ranOutFiveHour },
        "thanks" to ladder(1, 3, 5, 10, 25) { it.thanks },
    )

    val ALL: List<Definition> = CATALOGUE.map { (id, make) -> make(id) }

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

    fun evaluate(snapshot: StatsSnapshot, today: LocalDate): List<State> {
        val metrics = Metrics.of(snapshot, today)
        return ALL.map { definition ->
            val value = definition.metric(metrics)
            State(definition.id, definition.tierOf(value), value, definition.targetOf(value))
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
                val minutesByDay = HashMap<LocalDate, Int>()
                val slash = HashSet<String>()

                for (project in snapshot.projects.values) {
                    for ((day, record) in project.days) {
                        val date = runCatching { LocalDate.parse(day) }.getOrNull() ?: continue
                        if (record.isActive()) activeDates.add(date)
                        minutesByDay[date] = (minutesByDay[date] ?: 0) + record.minutes.count()

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
                        metrics.attachments += record.attachments
                        metrics.forks += record.forks
                        metrics.maxForksInTree = maxOf(metrics.maxForksInTree, record.maxForksInTree.toLong())
                        metrics.maxDepth = maxOf(metrics.maxDepth, record.maxDepth.toLong())
                        metrics.quotes += record.quotes
                        metrics.historian += record.historian
                        metrics.phonePrompts += record.phonePrompts
                        metrics.watched += record.watched
                        metrics.ranOutFiveHour += record.ranOutFiveHour
                        metrics.thanks += record.thanks
                    }
                }

                metrics.slashCommands = slash.size.toLong()
                metrics.devicesPaired = snapshot.devicesPaired.toLong()
                metrics.longestDay = (minutesByDay.values.maxOrNull() ?: 0).toLong()
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

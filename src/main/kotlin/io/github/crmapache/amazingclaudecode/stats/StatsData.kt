package io.github.crmapache.amazingclaudecode.stats

import java.util.TreeMap
import kotlin.reflect.KMutableProperty1
import kotlinx.serialization.json.Json
import kotlinx.serialization.json.JsonArray
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.JsonPrimitive
import kotlinx.serialization.json.add
import kotlinx.serialization.json.buildJsonArray
import kotlinx.serialization.json.buildJsonObject
import kotlinx.serialization.json.contentOrNull
import kotlinx.serialization.json.doubleOrNull
import kotlinx.serialization.json.intOrNull
import kotlinx.serialization.json.jsonPrimitive
import kotlinx.serialization.json.longOrNull
import kotlinx.serialization.json.put

/**
 * What the statistics remember: one record per project per calendar day, and the achievements' tiers
 * with the moment each was reached.
 *
 * A day is the unit on purpose. Every figure the tab shows for "the last 7 days", "the last 30 days" or
 * "all time" is a sum, a maximum or a count over these records, so the range is chosen at the moment of
 * looking rather than at the moment of counting - and the achievements, which are about all time, fold
 * the same records. Nothing is kept twice.
 *
 * Every field grows or stays: a count, a sum, a high-water mark. That is what lets two records of the
 * same day be merged by taking the larger of each (see [StatsSnapshot.mergedWith]) when two IDEs turn
 * out to have been writing the same file.
 *
 * Two records of the same day in different projects are put together the other way - counts added, marks
 * kept at the higher, minutes joined (see [foldedWith]) - and that is what the tab counts over: the day
 * of a person rather than of a project.
 */
internal class DayRecord {

    /** The minutes of the day something was going on in the panel. */
    var minutes = MinuteSet()

    /** Answers the agent finished. */
    var turns = 0

    /** Messages a person sent - turns started, as opposed to finished. */
    var prompts = 0

    /**
     * Conversations begun: a tab that came to life - a message, a turn, an answer. Once a day each, however
     * much moves through it, and never for the opening alone: a tab opened and never written in is an empty
     * tab, not a conversation. Reopening a past conversation in a tab is that tab reading, not a
     * conversation starting (see StatsCollector.countSession).
     */
    var sessions = 0

    var forks = 0

    /** Messages that came from a paired phone rather than from the desk. */
    var phonePrompts = 0

    /** Messages sent before eight in the morning, and after midnight. */
    var earlyPrompts = 0

    var latePrompts = 0

    /** How long the agent worked, summed over the turns, and the longest single turn. */
    var turnMillis = 0L

    var longestTurnMillis = 0L

    /** Turns that finished in under half a minute, and turns that ran past ten minutes. */
    var quickTurns = 0

    var longTurns = 0

    /** The most turns that ended within one hour of each other. */
    var maxTurnsInHour = 0

    /** Tool calls by the tool's own name. */
    val tools = LinkedHashMap<String, Int>()

    /** Edits that landed: not refused, not failed. */
    var edits = 0

    var linesAdded = 0

    var linesRemoved = 0

    /** The most lines one edit added. */
    var biggestEdit = 0

    /** Edits that swapped one line for one line. */
    var singleLineEdits = 0

    /** The most distinct files edited inside one turn. */
    var maxFilesInTurn = 0

    /** Turns that edited or wrote a test file. */
    var testTurns = 0

    /** The files edited that day, as short hashes: distinct within the day, and no path leaves the IDE. */
    val files = LinkedHashSet<String>()

    var permissionsAsked = 0

    var permissionsAllowed = 0

    var permissionsDenied = 0

    /** Permission refused for an edit - the diff the person turned down at the door. */
    var editsRefused = 0

    var plansApproved = 0

    /** Task lists the agent carried to the end: every entry done. */
    var todosDone = 0

    /** Files, folders and images put into a message. */
    var attachments = 0

    /** Selections carried into a message: a quote of the agent's words, a reference from the editor. */
    var quotes = 0

    /**
     * The ways of saying thanks that were used: "github" for the star, "rate" for the review, "share" for
     * the line copied to pass on.
     *
     * A set rather than a count, because doing one of them twice is thanking once - and pressing "share"
     * is a press, not a friend told (see Thanks.tsx for the three, and Achievements for the two lines they
     * are measured against).
     */
    val thanksWays = LinkedHashSet<String>()

    /** Past conversations reopened after a month or more. */
    var historian = 0

    /** Times somebody else began watching this project. */
    var watched = 0

    /** Built-in slash commands used that day, by name. */
    val slash = LinkedHashSet<String>()

    var tokensIn = 0L

    var tokensOut = 0L

    var tokensCacheRead = 0L

    var tokensCacheWrite = 0L

    /** What the turns would have cost at API prices, in dollars. */
    var cost = 0.0

    /** Turns by the model that answered them, by family: Sonnet, Opus and so on. */
    val models = LinkedHashMap<String, Int>()

    /** Times the five-hour window ran out that day - each window counted once, by its reset time. */
    var ranOutFiveHour = 0

    val ranOutWindows = LinkedHashSet<String>()

    /** The most MCP servers connected at once, and the most plugins installed at once. */
    var mcpConnected = 0

    var plugins = 0

    /** The longest a single conversation ran, in active minutes, and its longest unbroken stretch. */
    var longestSession = 0

    var longestStretch = 0

    /** The most forks in one conversation's tree, and the deepest fork of a fork. */
    var maxForksInTree = 0

    var maxDepth = 0

    /** When this record last changed. Two copies keep the later moment - see [mergedWith]. */
    var updatedAt = 0L

    /** Whether anything at all happened: a day without a single mark is not a day at work. */
    fun isActive(): Boolean = !minutes.isEmpty() || turns > 0 || prompts > 0

    /**
     * This day and another copy of it, folded into one - the larger of every figure, and everything
     * either of them saw of the lists.
     *
     * The larger rather than the sum, and that is the correct answer here rather than a compromise. An
     * IDE reads the whole book when it starts and adds to what it found, so its copy already holds
     * everything it has ever merged in from the other one; adding the two would count the shared part
     * twice, and an evening would grow by itself every time either of them saved. Every field only ever
     * climbs (see the note on this class), so of two copies the larger is simply the better informed.
     *
     * What this does not recover is the slice one IDE did while the other was not looking - forty turns
     * here and five there make forty, not forty-five. Against that stands what it replaced: taking the
     * record touched last and throwing the other one away whole, which lost the entire evening rather
     * than the overlap.
     */
    fun mergedWith(other: DayRecord): DayRecord {
        val merged = DayRecord()

        // The one thing two IDEs can add up honestly: a minute both marked is still one minute.
        merged.minutes = minutes.union(other.minutes)

        for (field in INT_FIELDS) field.set(merged, maxOf(field.get(this), field.get(other)))
        for (field in LONG_FIELDS) field.set(merged, maxOf(field.get(this), field.get(other)))
        merged.cost = maxOf(cost, other.cost)

        merged.files += files
        merged.files += other.files
        merged.slash += slash
        merged.slash += other.slash
        merged.thanksWays += thanksWays
        merged.thanksWays += other.thanksWays
        merged.ranOutWindows += ranOutWindows
        merged.ranOutWindows += other.ranOutWindows
        // Counted off the windows themselves rather than by the larger of two counts: the count is the
        // set's size on both sides, and reading it off the union keeps the two from drifting apart.
        merged.ranOutFiveHour = merged.ranOutWindows.size

        for (name in tools.keys + other.tools.keys) {
            merged.tools[name] = maxOf(tools[name] ?: 0, other.tools[name] ?: 0)
        }
        for (name in models.keys + other.models.keys) {
            merged.models[name] = maxOf(models[name] ?: 0, other.models[name] ?: 0)
        }

        merged.updatedAt = maxOf(updatedAt, other.updatedAt)
        return merged
    }

    /**
     * This day and the same day of another project, put together - one day of the machine rather than of
     * a project.
     *
     * This is the other way of folding two records, and the opposite of [mergedWith] on purpose: there
     * the two are copies of one day and the answer is the larger of each, here they are two different
     * days' worth of work and the counts add up. What does not add up is the minutes: the panel cannot
     * be open twice in the same minute, so they are joined as sets. Adding them is exactly what made an
     * afternoon of two hours in two projects at once read as four (see [MinuteSet.union]).
     *
     * Two things are floors rather than answers, and both for the same reason - a day keeps the mark and
     * not what stands behind it. The busiest hour's turns can only be the larger of two projects', never
     * their sum; and the same holds for the longest conversation, which belongs to one project anyway.
     */
    fun foldedWith(other: DayRecord): DayRecord {
        val folded = DayRecord()

        folded.minutes = minutes.union(other.minutes)

        for (field in SUM_INT_FIELDS) field.set(folded, field.get(this) + field.get(other))
        for (field in MAX_INT_FIELDS) field.set(folded, maxOf(field.get(this), field.get(other)))
        for (field in SUM_LONG_FIELDS) field.set(folded, field.get(this) + field.get(other))
        for (field in MAX_LONG_FIELDS) field.set(folded, maxOf(field.get(this), field.get(other)))
        folded.cost = cost + other.cost

        folded.files += files
        folded.files += other.files
        folded.slash += slash
        folded.slash += other.slash
        folded.thanksWays += thanksWays
        folded.thanksWays += other.thanksWays
        folded.ranOutWindows += ranOutWindows
        folded.ranOutWindows += other.ranOutWindows
        // The five-hour window belongs to the account, not to a project: one window that ran out while
        // three projects were working ran out once, and the set of windows is what says so.
        folded.ranOutFiveHour = folded.ranOutWindows.size

        for (name in tools.keys + other.tools.keys) {
            folded.tools[name] = (tools[name] ?: 0) + (other.tools[name] ?: 0)
        }
        for (name in models.keys + other.models.keys) {
            folded.models[name] = (models[name] ?: 0) + (other.models[name] ?: 0)
        }

        folded.updatedAt = maxOf(updatedAt, other.updatedAt)
        return folded
    }

    /**
     * Every count, sum and high-water mark, by the name it is written under - and which of the two kinds
     * it is.
     *
     * The kinds matter when two records are put together. Two copies of the same day take the larger of
     * everything ([mergedWith]); two projects' days add their counts and take the larger of their marks
     * ([foldedWith]). Both walk these lists, so a field added to the class is either a count or a mark
     * and is answered for in one place.
     */
    companion object {
        /** Counts and sums: two projects' turns are two lots of turns. */
        val SUM_INT_FIELDS: List<KMutableProperty1<DayRecord, Int>> = listOf(
            DayRecord::turns,
            DayRecord::prompts,
            DayRecord::sessions,
            DayRecord::forks,
            DayRecord::phonePrompts,
            DayRecord::earlyPrompts,
            DayRecord::latePrompts,
            DayRecord::quickTurns,
            DayRecord::longTurns,
            DayRecord::edits,
            DayRecord::linesAdded,
            DayRecord::linesRemoved,
            DayRecord::singleLineEdits,
            DayRecord::testTurns,
            DayRecord::permissionsAsked,
            DayRecord::permissionsAllowed,
            DayRecord::permissionsDenied,
            DayRecord::editsRefused,
            DayRecord::plansApproved,
            DayRecord::todosDone,
            DayRecord::attachments,
            DayRecord::quotes,
            DayRecord::historian,
            DayRecord::watched,
            DayRecord::ranOutFiveHour,
        )

        /** High-water marks: the biggest edit of two days is the bigger of the two, not their sum. */
        val MAX_INT_FIELDS: List<KMutableProperty1<DayRecord, Int>> = listOf(
            DayRecord::maxTurnsInHour,
            DayRecord::biggestEdit,
            DayRecord::maxFilesInTurn,
            DayRecord::mcpConnected,
            DayRecord::plugins,
            DayRecord::longestSession,
            DayRecord::longestStretch,
            DayRecord::maxForksInTree,
            DayRecord::maxDepth,
        )

        val INT_FIELDS: List<KMutableProperty1<DayRecord, Int>> = SUM_INT_FIELDS + MAX_INT_FIELDS

        val SUM_LONG_FIELDS: List<KMutableProperty1<DayRecord, Long>> = listOf(
            DayRecord::turnMillis,
            DayRecord::tokensIn,
            DayRecord::tokensOut,
            DayRecord::tokensCacheRead,
            DayRecord::tokensCacheWrite,
        )

        val MAX_LONG_FIELDS: List<KMutableProperty1<DayRecord, Long>> = listOf(
            DayRecord::longestTurnMillis,
        )

        val LONG_FIELDS: List<KMutableProperty1<DayRecord, Long>> = SUM_LONG_FIELDS + MAX_LONG_FIELDS
    }
}

internal class ProjectRecord(var name: String) {

    /** By calendar day, "2026-08-26", in order. */
    val days = TreeMap<String, DayRecord>()
}

/**
 * Everything on disk, in memory: the projects with their days, the achievements with their moments.
 */
internal class StatsSnapshot {

    /** When counting began - the day the tab first existed on this machine. Zero until then. */
    var since = 0L

    /** By the project's key (see StatsCollector.keyOf) - never by its path. */
    val projects = LinkedHashMap<String, ProjectRecord>()

    /** Achievement id -> tier -> when it was reached. */
    val earned = LinkedHashMap<String, TreeMap<Int, Long>>()

    /** Phones paired with this IDE, ever. Not about any one project. */
    var devicesPaired = 0

    /**
     * Which set of achievement lines the moments in [earned] were written against - see
     * Achievements.RULES_VERSION. Zero in a file written before the lines had a version at all.
     */
    var rulesVersion = 0

    fun project(key: String, name: String): ProjectRecord {
        val record = projects.getOrPut(key) { ProjectRecord(name) }
        if (name.isNotBlank()) record.name = name
        return record
    }

    /**
     * Every project's days folded together by date - the machine's own days, which is what the tab counts.
     *
     * The statistics are about a person's day, not a project's: a day at work is a day at work whichever
     * project it was spent in, and a figure that changes when another window is in front is not a figure
     * about the person. Where the hours went by project is still shown - out of the minutes each project
     * keeps (see StatsPayload), and that list is the one place the tab breaks the day up.
     *
     * Records of their own, never the book's own: a day only one project knows is folded with an empty one
     * rather than handed over, so nothing that reads this can write into the book by accident.
     *
     * Worked out once and kept until the book changes (see [daysChanged]). Every fold builds a record
     * field by field through reflection, so a year across a few projects is a thousand records and tens of
     * thousands of property reads - and this used to run afresh on every pass: the achievements are
     * re-read a couple of seconds after any change, the tab's payload asks for the same thing again right
     * after, and all of it happens under the ledger's lock, which is the lock the thread reading the
     * agent's output wants at that same moment.
     */
    fun daysTogether(): TreeMap<String, DayRecord> {
        folded?.let { return it }

        val out = TreeMap<String, DayRecord>()
        for (project in projects.values) {
            for ((day, record) in project.days) {
                out[day] = out[day]?.foldedWith(record) ?: record.foldedWith(DayRecord())
            }
        }

        folded = out
        return out
    }

    /**
     * Something in the book changed, so the folded days are no longer what it says.
     *
     * Called from the one door every change goes through (see StatsLedger.update). A day record handed out
     * by [day] is written to directly afterwards, so there is no telling from here that it happened.
     */
    fun daysChanged() {
        folded = null
    }

    private var folded: TreeMap<String, DayRecord>? = null

    /**
     * This and another copy of the same file, folded into one.
     *
     * Two IDEs on one machine write one file - WebStorm and IntelliJ open on the same evening, say. Each
     * holds its own copy in memory and would overwrite the other's day. So before writing, the file is
     * read again and merged: a day only one of them knows is kept, and a day both know is folded figure
     * by figure (see [DayRecord.mergedWith]).
     *
     * Figure by figure rather than "the copy touched last wins", which is what this was and which threw
     * away a whole evening's work: an IDE that saved a second later than another replaced its forty turns
     * and five hours with its own five turns and twenty minutes, and nothing anywhere said so. The note on
     * DayRecord promised the larger of each all along - the code simply did not do it.
     *
     * A tier is earned at the earlier of two moments, and a count of phones at the larger of the two.
     */
    fun mergedWith(other: StatsSnapshot): StatsSnapshot {
        val merged = StatsSnapshot()
        merged.since = when {
            since == 0L -> other.since
            other.since == 0L -> since
            else -> minOf(since, other.since)
        }
        merged.devicesPaired = maxOf(devicesPaired, other.devicesPaired)
        merged.rulesVersion = maxOf(rulesVersion, other.rulesVersion)

        for (key in projects.keys + other.projects.keys) {
            val mine = projects[key]
            val theirs = other.projects[key]
            val name = mine?.name?.takeIf { it.isNotBlank() } ?: theirs?.name.orEmpty()
            val record = merged.project(key, name)

            for (day in (mine?.days?.keys ?: emptySet()) + (theirs?.days?.keys ?: emptySet())) {
                val a = mine?.days?.get(day)
                val b = theirs?.days?.get(day)
                record.days[day] = when {
                    a == null -> b!!
                    b == null -> a
                    else -> a.mergedWith(b)
                }
            }
        }

        for (id in earned.keys + other.earned.keys) {
            val tiers = TreeMap<Int, Long>()
            for ((source, version) in listOf(earned to rulesVersion, other.earned to other.rulesVersion)) {
                /*
                 * The half measured against older lines does not get to bring back what the other half has
                 * already forgotten.
                 *
                 * The forgetting is a once-only thing at startup (see StatsLedger.recalibrate) and the file
                 * is shared with every JetBrains IDE on the machine, so the one next door - still running
                 * the plugin whose lines these were - writes them again the moment it saves. Merged in,
                 * they would stand a fifth tier against a ladder that no longer ends there, and the version
                 * on the merged whole is the newer of the two, so nothing would ever run the forgetting
                 * again.
                 *
                 * Against the merged version rather than against the current rules: two halves equally old
                 * agree with each other, and the book they make is forgotten in the ordinary way the next
                 * time it is loaded.
                 */
                if (id in Achievements.forgottenSince(version) && version < merged.rulesVersion) continue
                for ((tier, at) in source[id] ?: continue) {
                    val known = tiers[tier]
                    tiers[tier] = if (known == null) at else minOf(known, at)
                }
            }
            if (tiers.isNotEmpty()) merged.earned[id] = tiers
        }

        return merged
    }
}

/**
 * The file's shape. Written by hand rather than through a serializer, as everything in this plugin is:
 * the fields are named once, in DayRecord's own lists, and an older file missing a newer field reads as
 * zero rather than as a failure.
 */
internal object StatsJson {

    private const val VERSION = 1

    fun encode(snapshot: StatsSnapshot): String = buildJsonObject {
        put("version", VERSION)
        put("since", snapshot.since)
        put("devicesPaired", snapshot.devicesPaired)
        put("rules", snapshot.rulesVersion)
        put(
            "projects",
            buildJsonObject {
                for ((key, project) in snapshot.projects) {
                    put(
                        key,
                        buildJsonObject {
                            put("name", project.name)
                            put(
                                "days",
                                buildJsonObject {
                                    for ((day, record) in project.days) put(day, encodeDay(record))
                                },
                            )
                        },
                    )
                }
            },
        )
        put(
            "earned",
            buildJsonObject {
                for ((id, tiers) in snapshot.earned) {
                    put(id, buildJsonObject { for ((tier, at) in tiers) put(tier.toString(), at) })
                }
            },
        )
    }.toString()

    fun encodeDay(record: DayRecord): JsonObject = buildJsonObject {
        val minutes = record.minutes.encode()
        if (minutes.isNotEmpty()) put("minutes", minutes)
        for (field in DayRecord.INT_FIELDS) {
            val value = field.get(record)
            if (value != 0) put(field.name, value)
        }
        for (field in DayRecord.LONG_FIELDS) {
            val value = field.get(record)
            if (value != 0L) put(field.name, value)
        }
        if (record.cost != 0.0) put("cost", record.cost)
        if (record.tools.isNotEmpty()) put("tools", counts(record.tools))
        if (record.models.isNotEmpty()) put("models", counts(record.models))
        if (record.files.isNotEmpty()) put("files", strings(record.files))
        if (record.slash.isNotEmpty()) put("slash", strings(record.slash))
        if (record.thanksWays.isNotEmpty()) put("thanksWays", strings(record.thanksWays))
        if (record.ranOutWindows.isNotEmpty()) put("ranOutWindows", strings(record.ranOutWindows))
        put("updatedAt", record.updatedAt)
    }

    fun decode(text: String): StatsSnapshot? {
        val root = runCatching { Json.parseToJsonElement(text) as? JsonObject }.getOrNull() ?: return null
        val snapshot = StatsSnapshot()

        snapshot.since = root["since"]?.jsonPrimitive?.longOrNull ?: 0L
        snapshot.devicesPaired = root["devicesPaired"]?.jsonPrimitive?.intOrNull ?: 0
        snapshot.rulesVersion = root["rules"]?.jsonPrimitive?.intOrNull ?: 0

        val projects = root["projects"] as? JsonObject ?: JsonObject(emptyMap())
        for ((key, element) in projects) {
            val project = element as? JsonObject ?: continue
            val record = snapshot.project(key, project["name"]?.jsonPrimitive?.contentOrNull.orEmpty())
            val days = project["days"] as? JsonObject ?: continue
            for ((day, dayElement) in days) {
                val dayObject = dayElement as? JsonObject ?: continue
                record.days[day] = decodeDay(dayObject)
            }
        }

        val earned = root["earned"] as? JsonObject ?: JsonObject(emptyMap())
        for ((id, element) in earned) {
            val tiers = element as? JsonObject ?: continue
            val known = snapshot.earned.getOrPut(id) { TreeMap() }
            for ((tier, at) in tiers) {
                val number = tier.toIntOrNull() ?: continue
                val moment = at.jsonPrimitive.longOrNull ?: continue
                known[number] = moment
            }
        }

        return snapshot
    }

    fun decodeDay(day: JsonObject): DayRecord {
        val record = DayRecord()
        record.minutes = MinuteSet.decode(day["minutes"]?.jsonPrimitive?.contentOrNull.orEmpty())
        for (field in DayRecord.INT_FIELDS) {
            day[field.name]?.jsonPrimitive?.intOrNull?.let { field.set(record, it) }
        }
        for (field in DayRecord.LONG_FIELDS) {
            day[field.name]?.jsonPrimitive?.longOrNull?.let { field.set(record, it) }
        }
        record.cost = day["cost"]?.jsonPrimitive?.doubleOrNull ?: 0.0
        readCounts(day["tools"], record.tools)
        readCounts(day["models"], record.models)
        // A book written before the CLI's own marks were told apart from models holds rows like
        // "<synthetic>" (see StatsCollector.isRealModel). They are dropped as the file is read rather
        // than once at startup: this file is shared with the other JetBrains IDEs on the machine, and one
        // of them running an older plugin would write them again.
        record.models.keys.removeAll { !StatsCollector.isRealModel(it) }
        readStrings(day["files"], record.files)
        readStrings(day["slash"], record.slash)
        readStrings(day["thanksWays"], record.thanksWays)
        readStrings(day["ranOutWindows"], record.ranOutWindows)
        record.updatedAt = day["updatedAt"]?.jsonPrimitive?.longOrNull ?: 0L
        return record
    }

    private fun counts(map: Map<String, Int>): JsonObject =
        buildJsonObject { for ((name, count) in map) put(name, count) }

    private fun strings(values: Collection<String>): JsonArray = buildJsonArray { values.forEach { add(it) } }

    private fun readCounts(element: kotlinx.serialization.json.JsonElement?, into: MutableMap<String, Int>) {
        val map = element as? JsonObject ?: return
        for ((name, value) in map) {
            (value as? JsonPrimitive)?.intOrNull?.let { into[name] = it }
        }
    }

    private fun readStrings(element: kotlinx.serialization.json.JsonElement?, into: MutableSet<String>) {
        val list = element as? JsonArray ?: return
        for (value in list) {
            (value as? JsonPrimitive)?.contentOrNull?.let { into.add(it) }
        }
    }
}

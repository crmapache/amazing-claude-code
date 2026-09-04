package io.github.crmapache.amazingclaudecode.stats

import com.intellij.openapi.Disposable
import com.intellij.openapi.diagnostic.thisLogger
import com.intellij.openapi.util.Disposer
import com.intellij.util.concurrency.AppExecutorUtil
import io.github.crmapache.amazingclaudecode.claude.ClaudeHistory
import io.github.crmapache.amazingclaudecode.claude.ClaudeRateLimit
import java.nio.charset.StandardCharsets
import java.security.MessageDigest
import java.time.Instant
import java.time.LocalDate
import java.time.LocalDateTime
import java.time.ZoneId
import java.util.Base64
import java.util.TreeSet
import java.util.concurrent.ConcurrentHashMap
import java.util.concurrent.TimeUnit
import kotlinx.serialization.json.Json
import kotlinx.serialization.json.JsonArray
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.JsonPrimitive
import kotlinx.serialization.json.booleanOrNull
import kotlinx.serialization.json.contentOrNull
import kotlinx.serialization.json.doubleOrNull
import kotlinx.serialization.json.jsonPrimitive
import kotlinx.serialization.json.longOrNull

/**
 * What one project contributes to the statistics: it watches the conversations and writes what it sees
 * into the ledger, day by day.
 *
 * It is told about things rather than asking: the hub hands it every line of the agent's stream, every
 * message a person sends, every permission decided, every tab opened. What arrives here is turned into
 * the figures of a day record (see DayRecord) and nothing else is remembered - except what a figure
 * cannot be made from one event alone: the tool calls of a turn waiting for their results, the minutes
 * of a conversation that add up to its longest stretch, the ends of the last hour's turns.
 *
 * Time in the panel is marked by minute (see MinuteSet) from three sources at once: a turn running (the
 * ticker marks every half-minute while one does), a person acting (a message, a decision), and a hand on
 * the keyboard or the wheel (the panel reports that itself, once in a while). None of the three can
 * count a minute the others already counted.
 */
internal class StatsCollector(
    private val projectKey: String,
    private val projectName: String,
    private val workingDirectory: String?,
    parentDisposable: Disposable,
    /** The book itself - the machine-wide one unless a test hands over one of its own. */
    private val ledger: StatsLedger = StatsLedger.getInstance(),
    /** Where "now" comes from - a test moves the clock; the IDE reads the wall. */
    private val clock: () -> Long = System::currentTimeMillis,
    /**
     * Which Claude account a conversation runs on - asked rather than held, because the conversations
     * belong to the hub and this counter must not start owning them.
     *
     * Used for one thing: telling two accounts' exhausted windows apart (see [noteRateLimit]). The book
     * itself is deliberately NOT split by account - it counts the person at the keyboard, and per-account
     * books would visibly reset their streaks and hours on the first switch.
     */
    private val accountOf: (String) -> String = { "" },
) {

    /** A tool call whose result has not arrived: what it would count for, if it lands. */
    private class ToolCall(
        val name: String,
        val path: String,
        val added: Int,
        val removed: Int,
        val singleLine: Boolean,
    ) {
        val isEdit: Boolean get() = name in EDIT_TOOLS
    }

    /** What one turn has done so far - folded into the day when its result arrives. */
    private class Turn {
        val files = HashSet<String>()
        var touchedTest = false
    }

    private class Conversation {
        val pending = HashMap<String, ToolCall>()
        var turn = Turn()
        var lastModel = ""
        var conversationId = ""
        /** The session's running cost as the CLI reports it - a turn's cost is the difference. */
        var lastCost = 0.0
        /** Whether the last task list the agent wrote was complete: a complete one is counted once. */
        var todoComplete = false
        /** The minutes this conversation was alive in, on one scale across days (epoch minutes). */
        val minutes = TreeSet<Long>()

        /** The stretch being extended right now: where it began and where it has reached. */
        private var start = 0L
        private var end = 0L

        /** The longest unbroken stretch this conversation has managed, in minutes. */
        var longestStretch = 0
            private set

        /**
         * One more minute of this conversation, and what it does to its longest stretch.
         *
         * Carried along as the minutes arrive rather than worked out afresh each time. It used to copy
         * the whole set into an array and walk it from the beginning - twice a minute, for every live
         * conversation, over a set that is never trimmed. A tab left open for a week held thousands of
         * minutes, and every tick paid for all of them; the answer, meanwhile, changes by at most one.
         *
         * A minute earlier than the stretch's own end means the machine's clock moved backwards: it is
         * counted in the total, but it cannot lengthen a stretch that is running now.
         */
        fun mark(minute: Long, bridge: Int) {
            if (!minutes.add(minute)) return
            if (minute < end) return

            if (start == 0L || minute - end > bridge + 1) start = minute
            end = minute
            longestStretch = maxOf(longestStretch, (minute - start + 1).toInt())
        }
    }

    private val conversations = ConcurrentHashMap<String, Conversation>()

    /** The tabs whose turn is running right now - what the ticker marks minutes for. */
    private val running: MutableSet<String> = ConcurrentHashMap.newKeySet()

    /**
     * The day each conversation was last counted under - what makes the count of conversations the number
     * of conversations there were.
     *
     * Every tab is counted at its first sign of life, and none of them at the moment it appeared. Opening
     * used to be the moment for tabs somebody asked for, which had it both ways and neither way right:
     * the panel's first tab is nobody's request - it stands there before anything is asked for (see
     * SessionRegistry) - so a day worked in the tab that was already open counted six turns and no
     * conversations at all, while a "+" pressed and thought better of counted a conversation that never
     * happened. Life is the same event for all of them.
     *
     * Remembered by the day rather than for good: an IDE left open over midnight begins a new day's count
     * with the same tab.
     */
    private val countedSessions = ConcurrentHashMap<String, String>()

    /** When the last turns ended - the last hour's worth, for "twenty turns inside one hour". */
    private val turnEnds = ArrayDeque<Long>()

    /** Forks made in each conversation tree, by the tree's root - "forks in one conversation tree". */
    private val forksByGroup = ConcurrentHashMap<String, Int>()

    @Volatile
    private var watchers = 0

    /**
     * When the last watcher left - what tells somebody looking in from a phone that keeps dropping the
     * line, see [noteWatchers].
     */
    @Volatile
    private var watchersLeftAt = 0L

    init {
        val ticker = AppExecutorUtil.getAppScheduledExecutorService().scheduleWithFixedDelay(
            { runCatching { tick() }.onFailure { thisLogger().warn("The statistics ticker failed", it) } },
            TICK_SECONDS,
            TICK_SECONDS,
            TimeUnit.SECONDS,
        )
        Disposer.register(parentDisposable) { ticker.cancel(false) }
    }

    // --- The stream --------------------------------------------------------------------

    /** A line of the agent's stream, live - a replay of the past is not handed here at all. */
    fun noteLine(sessionId: String, line: String) {
        // The deltas of an answer being typed are most of the stream and hold nothing to count.
        if (line.contains(STREAM_EVENT_MARKER)) return

        val event = runCatching { Json.parseToJsonElement(line) as? JsonObject }.getOrNull() ?: return
        val conversation = conversations.getOrPut(sessionId) { Conversation() }

        when (event.string("type")) {
            "assistant" -> noteAssistant(conversation, event)
            "user" -> noteToolResults(conversation, event)
            "result" -> noteResult(sessionId, conversation, event)
            "system" -> noteSystem(conversation, event)
            "rate_limit_event" -> noteRateLimit(sessionId, line, event)
        }
    }

    private fun noteAssistant(conversation: Conversation, event: JsonObject) {
        val message = event["message"] as? JsonObject ?: return
        message.string("model").takeIf { isRealModel(it) }?.let { conversation.lastModel = it }

        val blocks = message["content"] as? JsonArray ?: return
        for (element in blocks) {
            val block = element as? JsonObject ?: continue
            if (block.string("type") != "tool_use") continue
            noteToolUse(conversation, block)
        }
    }

    private fun noteToolUse(conversation: Conversation, block: JsonObject) {
        val name = block.string("name")
        if (name.isEmpty()) return
        val id = block.string("id")
        val input = block["input"] as? JsonObject ?: JsonObject(emptyMap())

        update { day ->
            val counted = if (name.startsWith(MCP_PREFIX)) MCP_TOOL else name
            day.tools[counted] = (day.tools[counted] ?: 0) + 1
        }

        // A task list with every entry done is carried to the end - once: the agent may write the same
        // finished list again, and that is the same list, not a second one carried.
        if (name == TODO_TOOL) {
            val todos = input["todos"] as? JsonArray
            val complete = todos != null && todos.isNotEmpty() && todos.all { entry ->
                (entry as? JsonObject)?.string("status") == "completed"
            }
            if (complete && !conversation.todoComplete) update { it.todosDone++ }
            conversation.todoComplete = complete
            return
        }

        if (id.isEmpty() || name !in EDIT_TOOLS) return

        val path = input.string("file_path").ifEmpty { input.string("notebook_path") }
        val call = when (name) {
            WRITE_TOOL -> ToolCall(name, path, added = EditLines.written(input.string("content")), removed = 0, singleLine = false)
            MULTI_EDIT_TOOL -> {
                var added = 0
                var removed = 0
                for (edit in (input["edits"] as? JsonArray).orEmpty()) {
                    val one = edit as? JsonObject ?: continue
                    val change = EditLines.of(one.string("old_string"), one.string("new_string"))
                    added += change.added
                    removed += change.removed
                }
                ToolCall(name, path, added, removed, singleLine = false)
            }
            else -> {
                val change = EditLines.of(input.string("old_string"), input.string("new_string"))
                ToolCall(name, path, change.added, change.removed, change.isSingleLine)
            }
        }

        synchronized(conversation) { conversation.pending[id] = call }
    }

    private fun noteToolResults(conversation: Conversation, event: JsonObject) {
        val message = event["message"] as? JsonObject ?: return
        val blocks = message["content"] as? JsonArray ?: return

        for (element in blocks) {
            val block = element as? JsonObject ?: continue
            if (block.string("type") != "tool_result") continue

            val call = synchronized(conversation) { conversation.pending.remove(block.string("tool_use_id")) } ?: continue
            val failed = block["is_error"]?.jsonPrimitive?.booleanOrNull == true
            if (failed || !call.isEdit) continue

            noteEdit(conversation, call)
        }
    }

    /** An edit that landed: refused ones and failed ones never get here. */
    private fun noteEdit(conversation: Conversation, call: ToolCall) {
        val hash = if (call.path.isEmpty()) "" else hashOf(call.path)
        val isTest = call.path.isNotEmpty() && EditLines.isTestPath(call.path)

        synchronized(conversation) {
            if (hash.isNotEmpty()) conversation.turn.files.add(hash)
            if (isTest) conversation.turn.touchedTest = true
        }

        ledger.update { snapshot ->
            val day = today(snapshot)
            day.edits++
            day.linesAdded += call.added
            day.linesRemoved += call.removed
            day.biggestEdit = maxOf(day.biggestEdit, call.added)
            if (call.singleLine) day.singleLineEdits++
            if (hash.isNotEmpty()) day.files.add(hash)
            day.minutes.mark(minuteOfDay())
        }
    }

    private fun noteResult(sessionId: String, conversation: Conversation, event: JsonObject) {
        val duration = event["duration_ms"]?.jsonPrimitive?.longOrNull ?: 0L
        val usage = event["usage"] as? JsonObject
        val total = event["total_cost_usd"]?.jsonPrimitive?.doubleOrNull
        val model = familyOf(conversation.lastModel)

        val turn: Turn
        val cost: Double
        synchronized(conversation) {
            turn = conversation.turn
            conversation.turn = Turn()
            conversation.pending.clear()
            // The CLI reports the conversation's running total: a turn's own cost is what the total grew
            // by. A total smaller than the last one is a conversation started over - then it is all new.
            cost = when {
                total == null -> 0.0
                total < conversation.lastCost -> total
                else -> total - conversation.lastCost
            }
            if (total != null) conversation.lastCost = total
        }

        val now = clock()
        val withinHour = synchronized(turnEnds) {
            turnEnds.addLast(now)
            while (turnEnds.isNotEmpty() && now - turnEnds.first() > HOUR_MS) turnEnds.removeFirst()
            turnEnds.size
        }

        ledger.update { snapshot ->
            val day = today(snapshot)
            day.turns++
            day.turnMillis += duration
            day.longestTurnMillis = maxOf(day.longestTurnMillis, duration)
            if (duration in 1 until QUICK_TURN_MS) day.quickTurns++
            if (duration >= LONG_TURN_MS) day.longTurns++
            day.maxTurnsInHour = maxOf(day.maxTurnsInHour, withinHour)
            day.maxFilesInTurn = maxOf(day.maxFilesInTurn, turn.files.size)
            if (turn.touchedTest) day.testTurns++
            if (usage != null) {
                day.tokensIn += usage.long("input_tokens")
                day.tokensOut += usage.long("output_tokens")
                day.tokensCacheRead += usage.long("cache_read_input_tokens")
                day.tokensCacheWrite += usage.long("cache_creation_input_tokens")
            }
            if (cost > 0) day.cost += cost
            if (model.isNotEmpty()) day.models[model] = (day.models[model] ?: 0) + 1
            day.minutes.mark(minuteOfDay())
        }

        markConversation(sessionId, now)
    }

    private fun noteSystem(conversation: Conversation, event: JsonObject) {
        if (event.string("subtype") != "init") return
        val id = event.string("session_id")
        if (id.isEmpty() || id == conversation.conversationId) return

        synchronized(conversation) {
            conversation.conversationId = id
            // A fresh conversation starts its running cost from nothing.
            conversation.lastCost = 0.0
        }
    }

    /**
     * The five-hour window ran out - the genuine "stopped" of a limit event, not the warning before it
     * and not the work carrying on past it for money (see ClaudeRateLimit). The CLI repeats the event on
     * every turn while the window stays out, so each window is counted once, by its reset time. A weekly
     * window running out is not counted: the "Ceiling" achievement is about the one that runs out several
     * times a day.
     */
    private fun noteRateLimit(sessionId: String, line: String, event: JsonObject) {
        val verdict = ClaudeRateLimit.of(line, now = clock()) ?: return
        if (!verdict.stopped || verdict.window.startsWith("seven_day")) return

        val info = event["rate_limit_info"] as? JsonObject
        val resetsAt = info?.get("resetsAt")?.jsonPrimitive?.contentOrNull.orEmpty()
        // The account is part of the mark: five-hour windows are aligned to the wall clock, so two
        // accounts can run out in the same second, and without it the second one would not be counted
        // at all. Adding to the key can only raise the count, never take a tier back.
        val mark = "${accountOf(sessionId)}:${verdict.window}:$resetsAt"

        update { day -> if (day.ranOutWindows.add(mark)) day.ranOutFiveHour++ }
    }

    // --- What people do -----------------------------------------------------------------

    /**
     * A message sent into a conversation - a turn started. The hour it was sent in is what "early riser"
     * and "night shift" are made of; whether it came from a phone, what "on the road" is.
     */
    fun notePrompt(sessionId: String, text: String, images: Int, remote: Boolean) {
        val now = LocalDateTime.ofInstant(Instant.ofEpochMilli(clock()), ZoneId.systemDefault())
        val slash = slashCommandOf(text)

        ledger.update { snapshot ->
            val day = today(snapshot)
            day.prompts++
            if (remote) day.phonePrompts++
            if (now.hour in EARLY_HOURS) day.earlyPrompts++
            if (now.hour in LATE_HOURS) day.latePrompts++
            if (images > 0) day.attachments += images
            if (slash != null) day.slash.add(slash)
            day.minutes.mark(minuteOfDay())
        }

        markConversation(sessionId, clock())
    }

    /**
     * What the panel itself counts and reports: a hand on the keyboard, the chips in a message, the heart
     * pressed. These are things only the interface can see - what a chip is, is its business, not the
     * shell's (see the stat message in protocol.ts).
     */
    fun noteClientEvent(payload: JsonObject) {
        when (payload.string("kind")) {
            "activity" -> {
                markMinute()
                // The minute is the person's wherever they are in the panel; the chat's only if it is one.
                markConversation(payload.string("sessionId"), clock(), born = false)
            }
            "prompt" -> {
                val attachments = payload["attachments"]?.jsonPrimitive?.longOrNull?.toInt() ?: 0
                val quotes = payload["quotes"]?.jsonPrimitive?.longOrNull?.toInt() ?: 0
                if (attachments <= 0 && quotes <= 0) return
                update { day ->
                    day.attachments += attachments.coerceAtLeast(0)
                    day.quotes += quotes.coerceAtLeast(0)
                }
            }
            // Which way was taken - a star on GitHub, a review on the plugin's page, or the line about it
            // copied for a friend. The panel names it; an unnamed one is nothing to write down, since what
            // the ladder counts is the different ways rather than the presses.
            "thanks" -> payload.string("way").takeIf { it.isNotEmpty() }?.let { way ->
                update { it.thanksWays.add(way) }
            }
        }
    }

    /**
     * A tab opened: an ordinary one, or a fork of another.
     *
     * Opening one is not yet a conversation, and it is not counted as one here. A tab opened and never
     * written in is an empty tab - it is the "+" pressed by somebody looking for a clean sheet, and half
     * of those are closed again without a word being said. Counted at the moment it appeared, such a tab
     * put a conversation in the day's figures that never happened, and - because a hand on the keyboard
     * marks the minutes of whichever tab is in front - went on collecting time in a chat with nothing in
     * it, which is what "the most time spent in a single chat" was quietly being won with.
     *
     * So the conversation is counted at its first sign of life instead, wherever the tab came from (see
     * [markConversation]). The fork is written down here, because forking is a thing somebody did whether
     * or not the new tab is ever used, and so is the minute - the person is in the panel.
     */
    fun noteSessionOpened(sessionId: String, parentId: String?, groupId: String, depth: Int) {
        val inTree = if (parentId != null) forksByGroup.merge(groupId, 1, Int::plus) ?: 1 else 0

        ledger.update { snapshot ->
            val day = today(snapshot)
            if (parentId != null) {
                day.forks++
                day.maxForksInTree = maxOf(day.maxForksInTree, inTree)
                day.maxDepth = maxOf(day.maxDepth, depth)
            }
            day.minutes.mark(minuteOfDay())
        }
    }

    fun noteSessionClosed(sessionId: String) {
        conversations.remove(sessionId)
        running.remove(sessionId)
        // Identifiers are not handed out twice, so what was counted under this one will never be asked
        // about again - and a day of branching conversations leaves a good many of them behind.
        countedSessions.remove(sessionId)
    }

    /**
     * A past conversation reopened in a tab - and if it is a month old, a historian's find.
     *
     * Through [countSession] rather than counting one straight off: the conversation arrives in the tab
     * the person is already in (see ClaudeSessionHub.resumeConversation), and a tab counted this morning
     * counted twice for it - once for its own work and once for what it was asked to read. Reopening is
     * not starting anyway: the conversation being read was begun on the day it was begun.
     */
    fun noteResumed(sessionId: String, conversationId: String) {
        val file = ClaudeHistory.transcriptFile(workingDirectory, conversationId)
        val age = file?.lastModified()?.let { clock() - it } ?: 0L
        val old = age >= HISTORIAN_AGE_MS

        conversations.remove(sessionId)
        countSession(sessionId)

        ledger.update { snapshot ->
            val day = today(snapshot)
            if (old) day.historian++
            day.minutes.mark(minuteOfDay())
        }
    }

    /** A permission answered: allowed or not, and if not, whether it was an edit turned away. */
    fun notePermission(toolName: String, decision: String) {
        val denied = decision == "deny"
        val edit = toolName in EDIT_TOOLS

        update { day ->
            day.permissionsAsked++
            if (denied) day.permissionsDenied++ else day.permissionsAllowed++
            if (denied && edit) day.editsRefused++
            day.minutes.mark(minuteOfDay())
        }
    }

    fun notePlan(decision: String) {
        update { day ->
            if (decision == "approve") day.plansApproved++
            day.minutes.mark(minuteOfDay())
        }
    }

    fun noteMcp(connected: Int) {
        if (connected <= 0) return
        update { day -> day.mcpConnected = maxOf(day.mcpConnected, connected) }
    }

    fun notePlugins(installed: Int) {
        if (installed <= 0) return
        update { day -> day.plugins = maxOf(day.plugins, installed) }
    }

    /**
     * Somebody else began watching - counted on the moment the count leaves zero, and not again while the
     * same visit is merely reconnecting.
     *
     * A phone in a pocket takes the line and drops it all day long, and every return of it used to be a
     * new person looking in: two days of that came to twenty-seven of them, which is not a figure about
     * anybody watching anything. A gap shorter than [WATCH_GAP_MS] is the same visit carrying on.
     */
    fun noteWatchers(count: Int) {
        val before = watchers
        watchers = count

        if (before > 0 && count == 0) {
            watchersLeftAt = clock()
            return
        }
        if (before > 0 || count == 0) return
        if (watchersLeftAt != 0L && clock() - watchersLeftAt < WATCH_GAP_MS) return

        update { it.watched++ }
    }

    /** A turn began or ended in a tab - the ticker follows this set. */
    fun noteStatus(sessionId: String, running: Boolean) {
        if (running) {
            this.running.add(sessionId)
            markMinute()
            markConversation(sessionId, clock())
        } else {
            this.running.remove(sessionId)
        }
    }

    // --- Minutes ------------------------------------------------------------------------

    private fun tick() {
        if (running.isEmpty()) return
        val now = clock()
        markMinute()
        for (sessionId in running) markConversation(sessionId, now)
    }

    /**
     * One more conversation, unless this one was already counted today - see [countedSessions].
     */
    private fun countSession(sessionId: String) {
        if (sessionId.isEmpty()) return
        val date = localDate().toString()
        if (countedSessions.put(sessionId, date) == date) return
        update { it.sessions++ }
    }

    /** This minute counts, for this project. */
    private fun markMinute() {
        update { day -> day.minutes.mark(minuteOfDay()) }
    }

    /**
     * This minute counts for one conversation too - and with it the conversation's total and its longest
     * unbroken stretch, which are written down as the day's high-water marks.
     *
     * [born] is what tells a conversation from a tab. Everything the agent and the person do in a chat -
     * a prompt, a turn beginning, a turn ending - brings one into being; a hand on the keyboard does not,
     * because the panel reports that for whichever tab is in front, and an empty tab in front of somebody
     * reading the statistics beside it would otherwise grow a conversation of its own, minute by minute,
     * and hold the record for the longest one. So the keyboard extends a chat that is already alive and
     * starts nothing.
     */
    private fun markConversation(sessionId: String, now: Long, born: Boolean = true) {
        if (sessionId.isEmpty()) return

        val conversation = (if (born) conversations.getOrPut(sessionId) { Conversation() } else conversations[sessionId]) ?: return
        countSession(sessionId)

        val total: Int
        val stretch: Int

        synchronized(conversation) {
            conversation.mark(now / MINUTE_MS, STRETCH_BRIDGE_MINUTES)
            total = conversation.minutes.size
            stretch = conversation.longestStretch
        }

        update { day ->
            day.longestSession = maxOf(day.longestSession, total)
            day.longestStretch = maxOf(day.longestStretch, stretch)
        }
    }

    // --- The payload ---------------------------------------------------------------------

    fun payload(): String = StatsPayload.build(ledger, projectKey)

    // --- Helpers -------------------------------------------------------------------------

    private fun update(change: (DayRecord) -> Unit) {
        ledger.update { snapshot -> change(today(snapshot)) }
    }

    private fun today(snapshot: StatsSnapshot): DayRecord =
        ledger.day(snapshot, projectKey, projectName, localDate())

    /** Today by the machine's own calendar - the day everything written down belongs to. */
    private fun localDate(): LocalDate = LocalDate.ofInstant(Instant.ofEpochMilli(clock()), ZoneId.systemDefault())

    private fun minuteOfDay(now: Long = clock()): Int {
        val local = Instant.ofEpochMilli(now).atZone(ZoneId.systemDefault()).toLocalTime()
        return local.hour * 60 + local.minute
    }

    private fun JsonObject.string(name: String): String = (this[name] as? JsonPrimitive)?.contentOrNull.orEmpty()

    private fun JsonObject.long(name: String): Long = (this[name] as? JsonPrimitive)?.longOrNull ?: 0L

    companion object {
        const val TICK_SECONDS = 30L

        const val MINUTE_MS = 60_000L

        const val HOUR_MS = 60L * MINUTE_MS

        /** A turn under half a minute is a quick one; one past ten minutes is a long haul. */
        const val QUICK_TURN_MS = 30_000L

        const val LONG_TURN_MS = 10L * MINUTE_MS

        /** A line taken again this soon after it dropped is the same visit, not a new one. */
        const val WATCH_GAP_MS = 30L * 60_000L

        /** A pause this long between two minutes still belongs to one stretch of work. */
        const val STRETCH_BRIDGE_MINUTES = 5

        /** A conversation untouched for this long counts as history when reopened. */
        const val HISTORIAN_AGE_MS = 30L * 24 * 60 * 60 * 1000

        /** Before eight in the morning, and after midnight - each hour goes to one of the two. */
        val EARLY_HOURS = 5..7

        val LATE_HOURS = 0..4

        const val WRITE_TOOL = "Write"

        const val MULTI_EDIT_TOOL = "MultiEdit"

        const val TODO_TOOL = "TodoWrite"

        val EDIT_TOOLS = setOf("Edit", MULTI_EDIT_TOOL, WRITE_TOOL, "NotebookEdit")

        const val MCP_PREFIX = "mcp__"

        const val MCP_TOOL = "MCP"

        private const val STREAM_EVENT_MARKER = "\"type\":\"stream_event\""

        /** The name of a built-in command at the start of a message: "/compact" -> "compact". */
        fun slashCommandOf(text: String): String? {
            val trimmed = text.trimStart()
            if (!trimmed.startsWith("/")) return null
            val name = trimmed.drop(1).takeWhile { !it.isWhitespace() }.lowercase()
            return name.takeIf { it.isNotEmpty() }
        }

        /**
         * A real model - not one of the CLI's own marks.
         *
         * Some answers are signed not with a model but with a name in angle brackets: "<synthetic>" is
         * what the CLI closes a turn with when the words are its own - a turn the person interrupted, an
         * unknown command, the text of an API error. No model of that name exists, and taking it for one
         * gets two things wrong at once: the models card grows a row for something nobody ran, and the
         * turn is taken away from the model that did the work up to that point. The panel's feed drops
         * the same marks for the same reason (realModel in feed/build.ts).
         */
        fun isRealModel(model: String): Boolean = model.isNotEmpty() && !model.startsWith("<")

        /** The model's family in one word: "claude-sonnet-5" -> "Sonnet". */
        fun familyOf(model: String): String {
            val lower = model.lowercase()
            return when {
                lower.isEmpty() -> ""
                "opus" in lower -> "Opus"
                "sonnet" in lower -> "Sonnet"
                "haiku" in lower -> "Haiku"
                "fable" in lower -> "Fable"
                "mythos" in lower -> "Mythos"
                else -> model
            }
        }

        /**
         * A project's name on the ledger: the same path always gives the same key, and the key gives
         * nothing away about the path.
         */
        fun keyOf(path: String): String = "p-" + digest(path).take(16)

        /** A file's name on the ledger: twelve characters of its hash, enough to tell files apart within a day. */
        fun hashOf(text: String): String = digest(text).take(12)

        private fun digest(text: String): String {
            val bytes = MessageDigest.getInstance("SHA-256").digest(text.toByteArray(StandardCharsets.UTF_8))
            return Base64.getUrlEncoder().withoutPadding().encodeToString(bytes)
        }
    }
}

package io.github.crmapache.amazingclaudecode.remote

import kotlinx.serialization.json.Json
import kotlinx.serialization.json.JsonArray
import kotlinx.serialization.json.JsonElement
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.JsonPrimitive
import kotlinx.serialization.json.add
import kotlinx.serialization.json.addJsonObject
import kotlinx.serialization.json.buildJsonObject
import kotlinx.serialization.json.contentOrNull
import kotlinx.serialization.json.jsonArray
import kotlinx.serialization.json.jsonObject
import kotlinx.serialization.json.jsonPrimitive
import kotlinx.serialization.json.put
import kotlinx.serialization.json.putJsonArray

/**
 * Which of a project's messages a phone is sent, decided by reading them.
 *
 * Textual rather than parsed, exactly as the journal's own stamping is (see SessionMessages): these
 * are messages this IDE has just built itself, they pass through here by the thousand, and parsing
 * every one of them to answer "is this the tab that phone is watching" would be work for nothing.
 *
 * Apart from RelayClient because the rules are three string comparisons that decide whether a screen
 * on the other side of the city shows anything at all - and because a running IDE, a relay and a phone
 * in hand is a poor way to find out that one of them was wrong by a quotation mark.
 */
internal object RemoteFeed {

    /**
     * Whether this message is about the conversation a device asked for.
     *
     * By an exact identifier, quotes included: every project's first tab is called "main" by the IDE
     * itself, and a "starts with" match would hand one project's feed to a device watching another's.
     */
    fun wantedBy(message: String, sessionId: String): Boolean =
        message.contains("\"sessionId\":\"$sessionId\"")

    /**
     * A fact cut down to what genuinely fits through the relay.
     *
     * One frame is capped at 256 KB and an oversized one is not shortened but thrown away whole (see
     * relay/src/config.ts and wire/frame.ts). The file list is the only fact anywhere near that: a
     * large repository's four thousand paths seal to more than the cap, and the phone would end up
     * with no file hints at all rather than with most of them.
     *
     * The panel keeps the whole list - it is on the same machine and pays nothing for it. What is cut
     * here is the tail of a walk that is already truncated at four thousand entries upstream (see
     * ClaudeFileSearch), so this is one more notch on the same compromise rather than a new kind of
     * one.
     */
    fun forPhone(type: String, message: String): Outgoing =
        when (type) {
            FILES -> Outgoing(type, trimmedFiles(message))
            MCP_SERVERS -> Outgoing(type, serversWithoutCommands(message))
            PLUGINS -> Outgoing(type, trimmedPlugins(message))
            MARKETPLACES -> Outgoing(type, marketplacesWithoutPaths(message))
            SCENARIOS -> Outgoing(type, trimmedScenarios(message))
            SCENARIO_LIVE -> Outgoing(type, trimmedLive(message))
            SCENARIO_RUN -> trimmedRun(message)
            SCENARIO_FETCHED, SCENARIO_DRAFTED -> Outgoing(type, wholeScenario(type, message))
            SCENARIO_LOG -> Outgoing(type, trimmedLog(message))
            else -> Outgoing(type, message)
        }

    /**
     * A fact ready to leave: what a device should remember it under, and what it is actually sent.
     *
     * The two travel together because the name depends on what is INSIDE the message, and reading that
     * twice is both a second parse of a record several times a second and - the part that bit - a second
     * way of reading it. See [Outgoing.slot].
     */
    data class Outgoing(
        /**
         * The type, for everything but a scenario run.
         *
         * There is one branch, one list of files, one set of limits per project, so "the last `project`
         * this device was sent" is a complete question. There may be several runs, and they take the
         * heartbeat in turn: remembered under one name, the frame for run A is compared against the frame
         * for run B, never matches, and the whole point of remembering - not sealing and sending four
         * frames a second at a phone for the hours a round of work takes - is lost exactly when a second
         * run starts.
         *
         * It used to be pulled out of the text by searching for `"run":{"id":"`, which held only while
         * `id` happened to be the first field written. One field added above it and every run fell into
         * one slot again, silently and with nothing to fail - so it is read off the record that has
         * already been parsed to be trimmed.
         */
        val slot: String,
        val message: String,
    )

    private fun trimmedFiles(message: String): String {
        if (message.length <= PHONE_FILES_BUDGET) return message

        val files = runCatching {
            Json.parseToJsonElement(message).jsonObject["files"]?.jsonArray.orEmpty()
                .mapNotNull { it.jsonPrimitive.contentOrNull }
        }.getOrNull() ?: return message

        var spent = 0
        val kept = files.takeWhile { path ->
            spent += path.length + 3
            spent <= PHONE_FILES_BUDGET
        }

        return buildJsonObject {
            put("type", FILES)
            putJsonArray("files") { kept.forEach { add(it) } }
        }.toString()
    }

    /**
     * The MCP list with every server's command line taken out.
     *
     * That field is what a server is started by, and on a `stdio` server it is a command line off this
     * machine: absolute paths through somebody's home directory, and now and then a token sitting in an
     * argument. It is the one thing this side does not send outwards, and the phone has no use for it -
     * the screen there names a server by what it is and what state it is in (see mobile/screens/Mcp),
     * which is the question somebody away from the machine is asking. The transport survives, because
     * "stdio" and "http" are a kind rather than a place.
     *
     * A server that fails still says why: the CLI's error is about the connection, not about the disk.
     */
    private fun serversWithoutCommands(message: String): String {
        val servers = runCatching {
            Json.parseToJsonElement(message).jsonObject["servers"]?.jsonArray.orEmpty()
        }.getOrNull() ?: return message

        return buildJsonObject {
            put("type", MCP_SERVERS)
            putJsonArray("servers") {
                for (element in servers) {
                    val server = element as? JsonObject ?: continue
                    addJsonObject {
                        for ((name, value) in server) if (name != "command") put(name, value)
                        put("command", "")
                    }
                }
            }
        }.toString()
    }

    /**
     * The plugin catalogue cut to what a frame will carry.
     *
     * The installed list is a handful and always travels; the available one is whatever the connected
     * marketplaces hold, which on an ordinary machine is hundreds of entries with descriptions. Over the
     * cap the relay does not shorten a frame, it throws it away - so the screen would show nothing at
     * all rather than most of it, and the installed half would go down with the catalogue it was
     * bundled with. Trimmed here, the phone gets everything it came for and a browse list it can search
     * inside, which is the same compromise the file list is already under.
     */
    private fun trimmedPlugins(message: String): String {
        if (message.length <= PHONE_PLUGINS_BUDGET) return message

        val root = runCatching { Json.parseToJsonElement(message).jsonObject }.getOrNull() ?: return message
        val installed = root["installed"]?.jsonArray.orEmpty()
        val available = root["available"]?.jsonArray.orEmpty()

        var spent = installed.sumOf { it.toString().length }
        val kept = available.takeWhile { entry ->
            spent += entry.toString().length + 1
            spent <= PHONE_PLUGINS_BUDGET
        }

        return buildJsonObject {
            put("type", PLUGINS)
            putJsonArray("installed") { installed.forEach { add(it) } }
            putJsonArray("available") { kept.forEach { add(it) } }
        }.toString()
    }

    /**
     * The marketplaces with a folder on this machine named as a folder rather than by its path.
     *
     * A marketplace's source is a repository, an address, or a directory somebody cloned - and the third
     * is a path, which never leaves. The phone is told which kind it is, which is all its row says.
     */
    private fun marketplacesWithoutPaths(message: String): String {
        val marketplaces = runCatching {
            Json.parseToJsonElement(message).jsonObject["marketplaces"]?.jsonArray.orEmpty()
        }.getOrNull() ?: return message

        return buildJsonObject {
            put("type", MARKETPLACES)
            putJsonArray("marketplaces") {
                for (element in marketplaces) {
                    val marketplace = element as? JsonObject ?: continue
                    val source = marketplace["source"]?.jsonPrimitive?.contentOrNull.orEmpty()
                    addJsonObject {
                        for ((name, value) in marketplace) if (name != "source") put(name, value)
                        put("source", if (isPath(source)) LOCAL_SOURCE else source)
                    }
                }
            }
        }.toString()
    }

    /**
     * Whether this source is a place on the disk rather than something on the network.
     *
     * By what it is not: the CLI writes a repository as `github: org/repo` and an address with its
     * scheme, so anything left that starts at a root or at a home directory is a folder. Erring towards
     * "a path" costs a marketplace's name being replaced by a word; erring the other way sends a
     * directory listing of somebody's disk across the city.
     */
    private fun isPath(source: String): Boolean =
        source.startsWith("/") || source.startsWith("~") || source.startsWith(".") ||
            (source.length > 1 && source[1] == ':')

    /**
     * The scenarios of a project, with everything only the editor reads taken out.
     *
     * The shelves are the phone's answer to "what rounds of work does this project have and which of
     * them is going" - names, shapes and the list of past runs. What a card actually says to its agent is
     * pages of prose and no list draws a word of it, while it is the whole weight of this message: every
     * prompt of every card of every scenario a project has.
     *
     * The editor on the phone is not left without it - it ASKS, by name, and gets that one scenario whole
     * (see `scenarioFetch` and [wholeScenario]). Which is the same shape a run has: listed as a summary,
     * fetched whole.
     *
     * The past runs are cut to a screenful and a bit. A project run every morning for a year carries
     * three hundred summaries, and the row somebody wants is one of the first ten.
     */
    private fun trimmedScenarios(message: String): String {
        val root = runCatching { Json.parseToJsonElement(message).jsonObject }.getOrNull() ?: return message

        return buildJsonObject {
            for ((name, value) in root) {
                when (name) {
                    "scenarios" -> put(name, mapObjects(value, ::scenarioBody))
                    "runs" -> put(
                        name,
                        mapObjects(JsonArray((value as? JsonArray).orEmpty().take(PHONE_RUNS)), ::summaryBody),
                    )
                    /*
                     * The scheduled runs, capped in number and with their answers shortened.
                     *
                     * A scenario may carry as many arrangements as somebody wants, and each of them holds
                     * the answers to its questions - free text a person typed. Left whole, a morning's
                     * worth of them is the one thing here with no ceiling at all, and a frame over the
                     * relay's 256 KB is not shortened but thrown away, taking the shelves and the past
                     * runs with it.
                     */
                    "schedules" -> put(
                        name,
                        mapObjects(JsonArray((value as? JsonArray).orEmpty().take(PHONE_SCHEDULES)), ::scheduleBody),
                    )
                    else -> put(name, value)
                }
            }
        }.toString()
    }

    /** An arrangement with its answers shortened - emptied rather than removed, like everything else here. */
    private fun scheduleBody(schedule: JsonObject): JsonObject = answersCut(schedule)

    /**
     * The answers to a scenario's questions, shortened wherever they are carried.
     *
     * One rule for the three places that carry them - a scheduled run, a live run's summary, a past run's
     * summary - because it is one thing: free text a person typed, with no ceiling on it, on a message
     * that goes out again and again.
     */
    private fun answersCut(holder: JsonObject): JsonObject {
        val answers = (holder["inputs"] as? JsonObject) ?: return holder

        return JsonObject(
            holder + mapOf(
                "inputs" to JsonObject(
                    answers.entries.take(PHONE_ANSWERS)
                        .associate { (name, value) -> name to cut(value, words = true, max = PHONE_ANSWER_CHARS) },
                ),
            ),
        )
    }

    /**
     * One run, cut to what a phone draws.
     *
     * This is the only message on the list that a machine sends by itself several times a second: a run
     * moves on every word its agents write, and the panel at the desk wants exactly that (see
     * ScenarioDesk's heartbeat). What is dropped here is therefore not only weight but CHANGE - and the
     * change is what would cost somebody's mobile data for the hours a run lasts.
     *
     * `said` - what the card's agent is saying this second - is the field that changes on every beat and
     * the only one that does. Emptied, the trimmed run is identical from one beat to the next until
     * something genuinely happens, and the fingerprint that decides whether a fact is worth sending at
     * all then does the throttling for nothing (see RemoteAgent.newFacts, which fingerprints what comes
     * out of here rather than what went in). What the phone loses by it is a line of prose; what it
     * keeps is every state, every time and every verdict, which is what the screen is read for.
     *
     * Everything else is a length rather than a field: a step's prompt is written once when the step
     * starts and never moves again, so it is cheap to carry and it is the only thing a card that has not
     * spoken yet has to show.
     *
     * Emptied rather than removed, the way a server's command line is above: the shape a client parses
     * must not depend on which side of the wire it came from.
     */
    private fun trimmedRun(message: String): Outgoing {
        val root = runCatching { Json.parseToJsonElement(message).jsonObject }.getOrNull()
            ?: return Outgoing(SCENARIO_RUN, message)
        val run = root["run"] as? JsonObject ?: return Outgoing(SCENARIO_RUN, message)

        // Off the record itself rather than out of the text around it - see Outgoing.slot.
        val slot = "$SCENARIO_RUN\u0000${(run["id"] as? JsonPrimitive)?.contentOrNull.orEmpty()}"

        val trimmed = envelope(runBody(run, words = true))
        if (trimmed.length <= PHONE_RUN_BUDGET) return Outgoing(slot, trimmed)

        // A run of a hundred cards, over the cap even with the prose cut. The shape goes on without the
        // words: a timeline with no lines on it is still a timeline, and a frame over the cap is not
        // shortened by the relay but thrown away whole - which is no timeline at all.
        return Outgoing(slot, envelope(runBody(run, words = false)))
    }

    /**
     * One scenario, whole - or honestly not at all.
     *
     * The editor on a phone is the one screen that needs every word of a card's prompt, and it is also
     * the one screen that SAVES: whatever it was shown is what it writes back to the file. So this is the
     * single place on the way out where shortening is forbidden. A prompt quietly cut to fit a frame and
     * then saved would take a paragraph out of somebody's repository, and nothing on either screen would
     * say it had happened.
     *
     * A scenario over the budget is therefore sent WITHOUT its body and marked as too large, which the
     * screen says out loud and points at the desk. Reached only by something enormous - a five-stage
     * round of work is a few kilobytes - so what this really guards is the honesty of the road, not a
     * case anybody meets.
     *
     * The same rule serves what a model just wrote (`scenarioDrafted`), for the same reason: that too
     * opens in the editor and is saved from it.
     */
    private fun wholeScenario(type: String, message: String): String {
        if (message.length <= PHONE_SCENARIO_BUDGET) return message

        val root = runCatching { Json.parseToJsonElement(message).jsonObject }.getOrNull() ?: return message

        return buildJsonObject {
            for ((name, value) in root) if (name != "scenario") put(name, value)
            put("tooBig", true)
        }.toString()
    }

    /**
     * What one step said, cut to a frame from the END.
     *
     * A step that walked a repository leaves a transcript in megabytes, and this used to be the reason
     * the phone was refused it outright - a frame over the relay's 256 KB is not shortened but thrown
     * away whole, so asking for one was asking for silence. Refusing it was the wrong answer to a real
     * problem: what somebody wants off a step at three in the morning is the end of it, which is exactly
     * the part that fits.
     *
     * So the oldest events go until what is left fits, and the message says so - `truncated` is already
     * the word for "the beginning is not shown", and a log that silently begins in the middle reads as a
     * step that began in the middle.
     */
    private fun trimmedLog(message: String): String {
        if (message.length <= PHONE_LOG_BUDGET) return message

        val root = runCatching { Json.parseToJsonElement(message).jsonObject }.getOrNull() ?: return message
        val events = (root["events"] as? JsonArray) ?: return message

        // From the end backwards, which is the half a person is reading.
        val kept = ArrayDeque<JsonElement>()
        var spent = 0
        for (event in events.asReversed()) {
            val size = event.toString().length + 1
            if (spent + size > PHONE_LOG_BUDGET) break
            spent += size
            kept.addFirst(event)
        }

        return buildJsonObject {
            for ((name, value) in root) {
                when (name) {
                    "events" -> put(name, JsonArray(kept.toList()))
                    "truncated" -> put(name, JsonPrimitive(true))
                    else -> put(name, value)
                }
            }
        }.toString()
    }

    /**
     * The list of what is going right now, cut to the same ceiling as everything else.
     *
     * It looked small enough to leave alone and is not: every summary on it carries the answers somebody
     * typed at the start form - free text with no length to it - and this is the message rebuilt every
     * second for the hours a round of work takes. Three runs with a paragraph pasted into each is a frame
     * over the relay's cap, and an oversized frame is not shortened but thrown away whole, which puts the
     * phone back to saying "nothing is going here" while three things are going.
     */
    private fun trimmedLive(message: String): String {
        val root = runCatching { Json.parseToJsonElement(message).jsonObject }.getOrNull() ?: return message

        return buildJsonObject {
            for ((name, value) in root) {
                if (name == "runs") {
                    put(name, mapObjects(JsonArray((value as? JsonArray).orEmpty().take(PHONE_RUNS)), ::summaryBody))
                } else {
                    put(name, value)
                }
            }
        }.toString()
    }

    /**
     * One run's summary with its answers shortened - the same cut a scheduled run's get, and the same
     * reason: they are the same free text, typed into the same form.
     */
    private fun summaryBody(summary: JsonObject): JsonObject = answersCut(summary)

    private fun envelope(run: JsonObject): String =
        buildJsonObject {
            put("type", SCENARIO_RUN)
            put("run", run)
        }.toString()

    private fun runBody(run: JsonObject, words: Boolean): JsonObject = buildJsonObject {
        for ((name, value) in run) {
            when (name) {
                "snapshot" -> put(name, (value as? JsonObject)?.let(::scenarioBody) ?: value)
                "steps" -> put(name, mapObjects(value) { step -> stepBody(step, words) })
                "notes" -> put(name, mapObjects(value) { note -> JsonObject(note + ("text" to cut(note["text"], words, NOTE_CHARS))) })
                else -> put(name, value)
            }
        }
    }

    private fun stepBody(step: JsonObject, words: Boolean): JsonObject = buildJsonObject {
        for ((name, value) in step) {
            when (name) {
                // The two that no screen on a phone draws, and the first of them is the reason this
                // whole function exists - see the note above.
                "said", "handoff" -> put(name, "")
                "prompt", "summary", "verdictReason", "error" -> put(name, cut(value, words, LINE_CHARS))
                "nudges" -> put(
                    name,
                    JsonArray((value as? JsonArray).orEmpty().map { one -> cut(one, words, NUDGE_CHARS) }),
                )
                "slots" -> put(
                    name,
                    JsonObject((value as? JsonObject).orEmpty().mapValues { (_, slot) -> cut(slot, words, SLOT_CHARS) }),
                )
                else -> put(name, value)
            }
        }
    }

    /**
     * A scenario with everything only its editor reads emptied out.
     *
     * A card's prompt, what has to be true at the end and what to carry forward, and the head's own
     * briefing: between them they are all the weight a scenario has, and none of them is drawn anywhere
     * but in the editor - which is at the desk. What is left is the skeleton a timeline is built from
     * (see scenarios/timeline.ts): the stages in order, how many passes each is given, and the titles.
     */
    private fun scenarioBody(scenario: JsonObject): JsonObject = buildJsonObject {
        for ((name, value) in scenario) {
            when (name) {
                "head" -> put(name, JsonObject((value as? JsonObject).orEmpty() + ("briefing" to BLANK)))
                "stages" -> put(
                    name,
                    mapObjects(value) { stage -> JsonObject(stage + ("cards" to mapObjects(stage["cards"], ::cardBody))) },
                )
                else -> put(name, value)
            }
        }

        /*
         * Said out loud, because the rules on the other side would otherwise read a skeleton and answer
         * confidently that every card is missing its prompt: a shelf where every row reads "needs fixing
         * before it can run" while those very scenarios run perfectly at the desk.
         */
        put("trimmed", true)
    }

    private fun cardBody(card: JsonObject): JsonObject =
        JsonObject(card + mapOf("prompt" to BLANK, "dod" to BLANK, "after" to BLANK))

    /** Every object of an array through one rule, and anything that is not an array left alone. */
    private fun mapObjects(value: JsonElement?, transform: (JsonObject) -> JsonObject): JsonElement {
        val array = value as? JsonArray ?: return value ?: JsonArray(emptyList())
        return JsonArray(array.map { element -> (element as? JsonObject)?.let(transform) ?: element })
    }

    /** A string shortened to what a small screen shows of it - or dropped entirely, when even that is too much. */
    private fun cut(value: JsonElement?, words: Boolean, max: Int): JsonPrimitive {
        if (!words) return BLANK
        val text = (value as? JsonPrimitive)?.contentOrNull.orEmpty()
        return JsonPrimitive(if (text.length <= max) text else text.take(max))
    }

    /**
     * Whether this message is one of the project's own facts a phone is allowed to have, and which.
     *
     * These belong to no conversation at all, so the rule above leaves them with no address and they
     * were dropped: a phone knew the feed of the tab it watched and nothing else - not the branch, not
     * the limits, not the project's files. The composer on the phone draws all three.
     *
     * A list of what may go rather than of what may not, for the same reason RemoteCommands is written
     * that way: the protocol grows, and a message that carries something private must not become
     * reachable from outside merely because nobody remembered this file. `init` is the case in point -
     * it carries this machine's working directory, and the path is the one thing that never leaves it
     * (see RemoteAgent.recents).
     *
     * By the message's beginning rather than by a search inside it: every one of these is built with
     * its type first (see ProjectCatalog and ProjectUsage), and a bare `contains` would also match a
     * tool call that happened to mention the word.
     */
    fun projectFact(message: String): String? =
        PROJECT_FACTS.firstOrNull { type -> message.startsWith("{\"type\":\"$type\"") }

    /**
     * The branch and its pull request, the subscription's usage windows, the slash commands with their
     * descriptions, the project's file list - what the composer on the phone is drawn from - the two
     * machine-wide facts the phone obeys without being able to set them (the language, the colour mode
     * and the hand-added models), and the
     * answers of the three screens a phone may now drive: the MCP servers, the plugins and the Claude
     * accounts (see RemoteCommands, where the decision to open them is argued).
     *
     * Two of those carry something this side does not send outwards, and neither is on this list
     * untouched: a server's command line and a marketplace's local folder are taken out in [forPhone]
     * before the message leaves. The accounts do carry the person's own addresses, and that is the
     * point - it is the owner's address on the owner's own paired device, and a screen that cannot say
     * which account it is about to switch away from is not a screen anybody should press.
     *
     * The scenarios, what is going right now and the record of one run are on it for a reason of their
     * own: a round of work started at the desk goes on for hours with nobody in front of it, which is the
     * definition of something worth seeing from elsewhere. The shelves and the record are the heaviest
     * things on this list, and the record is the only one a machine sends by itself several times a
     * second, so both are cut down in [forPhone] - and the run's trimming is what makes it a fact a phone
     * can afford at all. The live list is neither: it is a few summaries, which is exactly why it exists
     * apart from the other two.
     */
    private val PROJECT_FACTS = listOf(
        "project",
        "usage",
        "commandHints",
        "commands",
        FILES,
        LOCALE,
        CALM_COLORS,
        CUSTOM_MODELS,
        MCP_SERVERS,
        "mcpActionResult",
        PLUGINS,
        "pluginActionResult",
        MARKETPLACES,
        "accounts",
        "accountOutcome",
        SCENARIOS,
        SCENARIO_LIVE,
        SCENARIO_RUN,
    )

    /**
     * A line of a past conversation being replayed into a tab.
     *
     * They are the one thing not forwarded as it happens: opening a past conversation puts its whole
     * transcript through the feed line by line, and a phone wants the conversation rather than the
     * reading of it - it is handed the end of the result instead, once the replay is over.
     */
    fun isReplayLine(message: String): Boolean = message.contains(REPLAY_LINE)

    /** The conversations whose replay has just ended - the moment there is a result to hand over. */
    fun replayed(messages: List<String>, sessions: Collection<String>): List<String> {
        val finished = messages.filter { it.contains(REPLAY_FINISHED) }
        if (finished.isEmpty()) return emptyList()

        return sessions.distinct().filter { sessionId -> finished.any { wantedBy(it, sessionId) } }
    }

    private const val FILES = "files"

    private const val MCP_SERVERS = "mcpServers"
    private const val PLUGINS = "plugins"
    private const val MARKETPLACES = "marketplaces"

    /** What a marketplace kept in a folder on that machine is called instead of by its path. */
    const val LOCAL_SOURCE = "a local path"

    /**
     * The language the panel speaks, so the phone speaks it too.
     *
     * It carries a language tag and nothing else - no path, no name, nothing about the machine - which
     * is why it can be on this list at all. `init`, which also names the language, cannot: it carries
     * the working directory.
     */
    private const val LOCALE = "locale"

    /**
     * The no-stress colour mode, so the gauges on the phone are as calm as the ones at the desk. A
     * single boolean, and on this list for the same reason the language is: it says nothing about the
     * machine it came from.
     */
    private const val CALM_COLORS = "calmColors"

    /**
     * The models added by hand at the desk (see CustomModels.tsx), so the sheet on the phone offers the
     * same list the menu there does. On this list beside the two above and on the same terms: shown on
     * the phone, set only at the machine whose Claude Code will be launched with the name.
     *
     * It is a handful of short strings and carries nothing about the machine - no path, no account.
     */
    private const val CUSTOM_MODELS = "customModels"

    /**
     * How much of the file list a phone is sent. Forty-eight kilobytes is upwards of a thousand paths
     * - more than the "@" hint on a small screen can usefully offer - and it leaves the sealed frame
     * comfortably inside the relay's 256 KB rather than near it.
     */
    private const val PHONE_FILES_BUDGET = 48 * 1024

    /**
     * How much of the plugin catalogue a phone is sent. The same order as the file list and for the same
     * reason: it leaves the sealed frame well inside the relay's 256 KB, and what is cut is the tail of
     * a catalogue nobody scrolls to the end of.
     */
    private const val PHONE_PLUGINS_BUDGET = 48 * 1024

    /** The scenario messages. Public because three of them are trimmed on their answering road too - see ScenarioDesk. */
    const val SCENARIOS = "scenarios"
    const val SCENARIO_RUN = "scenarioRun"

    /** One scenario, asked for by name and answered whole - what the editor on a phone opens on. */
    const val SCENARIO_FETCHED = "scenarioFetched"

    /** And one a model just wrote, which opens in the same editor and is saved from it. */
    const val SCENARIO_DRAFTED = "scenarioDrafted"

    /** One step's own conversation, read off this machine's disk. */
    const val SCENARIO_LOG = "scenarioLog"

    /**
     * What is going right now, as summaries - the light half of the scenarios (see ScenarioDesk.sendLive).
     *
     * Nothing is taken out of it here and nothing needs to be: it is a handful of names, states and
     * counts, and it carries no prose at all. It is on the list because it is what every screen that is
     * not looking at a timeline actually reads.
     */
    const val SCENARIO_LIVE = "scenarioLive"


    /**
     * How much of a run a phone is sent. The same order as the lists above and for the same reason: it
     * leaves the sealed frame well inside the relay's 256 KB rather than near it.
     *
     * Reached only by a run of some dozens of cards - an ordinary one of five is a couple of kilobytes -
     * and what happens then is that the prose goes and the shape stays (see [trimmedRun]).
     */
    private const val PHONE_RUN_BUDGET = 48 * 1024

    /**
     * How much of one scenario a phone is sent - and the one budget here that is a REFUSAL rather than a
     * cut, because what is shown is what gets saved back (see [wholeScenario]).
     */
    private const val PHONE_SCENARIO_BUDGET = 48 * 1024

    /** And how much of one step's conversation. The end of it, which is the half anybody reads. */
    private const val PHONE_LOG_BUDGET = 48 * 1024

    /** How many past runs travel. A year of a morning routine is three hundred; the row wanted is near the top. */
    private const val PHONE_RUNS = 40

    /**
     * How many scheduled runs travel, and how much of the answers each of them carries.
     *
     * The one list on this message with no natural ceiling: a scenario may be given as many arrangements
     * as somebody wants, and each carries free text they typed.
     */
    private const val PHONE_SCHEDULES = 40
    private const val PHONE_ANSWERS = 8
    private const val PHONE_ANSWER_CHARS = 120

    /**
     * How much of each line of a step a phone is shown.
     *
     * Two hundred and forty characters is three or four lines under a thumb, which is as much of a card's
     * prompt or of its summary as anybody reads on a list; the rest is read at the desk, where the step's
     * whole conversation can be opened.
     */
    private const val LINE_CHARS = 240
    private const val NOTE_CHARS = 400
    private const val NUDGE_CHARS = 160
    private const val SLOT_CHARS = 160

    private val BLANK = JsonPrimitive("")

    private const val REPLAY_LINE = "\"replay\":true,\"event\":"

    private const val REPLAY_FINISHED = "\"type\":\"replayFinished\""
}

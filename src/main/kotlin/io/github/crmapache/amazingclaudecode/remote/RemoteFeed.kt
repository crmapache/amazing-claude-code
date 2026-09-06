package io.github.crmapache.amazingclaudecode.remote

import kotlinx.serialization.json.Json
import kotlinx.serialization.json.JsonObject
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
    fun forPhone(type: String, message: String): String =
        when (type) {
            FILES -> trimmedFiles(message)
            MCP_SERVERS -> serversWithoutCommands(message)
            PLUGINS -> trimmedPlugins(message)
            MARKETPLACES -> marketplacesWithoutPaths(message)
            else -> message
        }

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
     * descriptions, the project's file list - what the composer on the phone is drawn from - and the
     * answers of the three screens a phone may now drive: the MCP servers, the plugins and the Claude
     * accounts (see RemoteCommands, where the decision to open them is argued).
     *
     * Two of those carry something this side does not send outwards, and neither is on this list
     * untouched: a server's command line and a marketplace's local folder are taken out in [forPhone]
     * before the message leaves. The accounts do carry the person's own addresses, and that is the
     * point - it is the owner's address on the owner's own paired device, and a screen that cannot say
     * which account it is about to switch away from is not a screen anybody should press.
     */
    private val PROJECT_FACTS = listOf(
        "project",
        "usage",
        "commandHints",
        "commands",
        FILES,
        LOCALE,
        MCP_SERVERS,
        "mcpActionResult",
        PLUGINS,
        "pluginActionResult",
        MARKETPLACES,
        "accounts",
        "accountOutcome",
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

    private const val REPLAY_LINE = "\"replay\":true,\"event\":"

    private const val REPLAY_FINISHED = "\"type\":\"replayFinished\""
}

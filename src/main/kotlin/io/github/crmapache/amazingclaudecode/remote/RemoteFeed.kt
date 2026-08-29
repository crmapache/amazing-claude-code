package io.github.crmapache.amazingclaudecode.remote

import kotlinx.serialization.json.Json
import kotlinx.serialization.json.add
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
    fun forPhone(type: String, message: String): String {
        if (type != FILES || message.length <= PHONE_FILES_BUDGET) return message

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
     * descriptions and the project's file list - what the composer on the phone is drawn from and
     * nothing besides.
     */
    private val PROJECT_FACTS = listOf("project", "usage", "commandHints", "commands", FILES, LOCALE)

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

    private const val REPLAY_LINE = "\"replay\":true,\"event\":"

    private const val REPLAY_FINISHED = "\"type\":\"replayFinished\""
}

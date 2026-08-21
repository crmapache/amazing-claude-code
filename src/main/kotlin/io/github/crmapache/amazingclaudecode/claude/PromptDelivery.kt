package io.github.crmapache.amazingclaudecode.claude

import com.intellij.openapi.diagnostic.thisLogger
import java.time.Instant
import kotlinx.serialization.json.Json
import kotlinx.serialization.json.JsonArray
import kotlinx.serialization.json.JsonElement
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.JsonPrimitive
import kotlinx.serialization.json.contentOrNull
import kotlinx.serialization.json.jsonObject
import kotlinx.serialization.json.jsonPrimitive

/**
 * Whether a person's message reached the conversation itself.
 *
 * Needed because a message written into a running turn goes missing at the CLI: it travels into its
 * input stream, the CLI takes it, and after that it is luck. When the agent is printing an answer at
 * that moment, the CLI defers the message and starts a new turn with it; when it is busy with a tool,
 * the message often disappears entirely. No refusal, no event in the stream: to all appearances the
 * person wrote something and the agent simply says nothing.
 *
 * In the event stream an accepted message leaves no trace - the CLI does not echo it. In the
 * conversation's file it does: what it accepted it always writes there, and one of two kinds of record
 * shows exactly how it got there.
 *
 * - `type: user` - the message became a new turn;
 * - `type: attachment` with `queued_command` - it went to the running turn, and the agent saw it at its
 *   next step.
 *
 * Neither of the two means the message was swallowed and has to be sent again (see
 * ClaudeSession.checkDeliveries).
 */
internal object PromptDelivery {

    /**
     * Whether this text's delivery can be checked at all.
     *
     * A slash command has nothing to check against: it is not in the conversation word for word. A
     * known one the CLI rewrites into an internal record with tags
     * (`<command-name>/context</command-name>`), and an unknown one it does not record at all - it
     * answers "Unknown command" and that is that. Counting such a send as lost means repeating commands
     * over nothing, and a repeated `/compact` is an extra compaction of the context, that is, a worse
     * break than the original one.
     *
     * So commands are left unwatched, honestly at the CLI's mercy: what gets lost when written into a
     * running turn is an ordinary message from a person, and that is what we check.
     */
    fun traceable(text: String): Boolean = !text.trimStart().startsWith("/")

    /** Something sent whose record we are looking for in the conversation: what went out and when. */
    internal data class Sent(val text: String, val sentAt: Long)

    /**
     * What a look into the conversation was able to tell us.
     *
     * Three outcomes rather than two, because "the record is not there" and "we could not look" pull a
     * resend in opposite directions, and the difference between them is the difference between a
     * message delivered once and a `deploy` carried out twice. A conversation's file goes unreadable
     * for reasons that have nothing to do with the message: it is locked, it has just been rotated, the
     * rights are wrong, or the conversation has no file on disk yet at all. Counting any of those as
     * "the message was swallowed" means resending something that already ran.
     */
    internal sealed interface Lookup {
        /** The conversation was read: [found] holds the indices in `sent` whose records are in it. */
        data class Read(val found: Set<Int>) : Lookup

        /** Nothing can be said about anything: the conversation itself could not be read. */
        data object Unreadable : Lookup
    }

    /**
     * Which of the sent messages are already in the conversation - by their index in [sent] itself.
     *
     * Indices rather than texts: a person writes identical messages in a row all the time ("yes", "go
     * on", "next"), and one record found closes exactly one wait. Otherwise everything but the first
     * would count as delivered on someone else's record and vanish silently - precisely the loss this
     * check exists for.
     *
     * The whole list in one pass rather than one message at a time: a long conversation's file weighs
     * tens of megabytes, and re-reading it once per waiting message and once per attempt is seconds of
     * reading on the IDE's shared scheduler for nothing.
     *
     * Each send has its own time, and a record older than it does not count: the person could have sent
     * that same line an hour ago too. The slack backwards is for the millisecond rounding in the CLI's
     * record: our clocks are shared with it, so no wider tolerance is needed, and a wider one would only
     * raise the risk of taking a past record for the present one.
     */
    fun arrived(workingDirectory: String?, conversationId: String?, sent: List<Sent>): Lookup {
        // Nothing was asked about, so nothing is missing: this is an answer, not a failure to look.
        if (sent.isEmpty()) return Lookup.Read(emptySet())

        val id = conversationId ?: return Lookup.Unreadable
        val file = ClaudeHistory.transcriptFile(workingDirectory, id) ?: return Lookup.Unreadable

        return runCatching {
            file.useLines { lines -> Lookup.Read(match(lines, sent)) as Lookup }
        }.onFailure { thisLogger().warn("Failed to check delivery in conversation $id", it) }
            .getOrDefault(Lookup.Unreadable)
    }

    /** Parsing the conversation file's lines - apart from the disk, so a test can check it. */
    internal fun match(lines: Sequence<String>, sent: List<Sent>): Set<Int> {
        val wanted = sent.map { it.text.trim() }
        val matched = mutableSetOf<Int>()

        for (line in lines) {
            // Everything found - no reason to read the file to the end.
            if (matched.size == sent.size) break

            // A cheap cut-off: a conversation's file weighs megabytes, and we care about two kinds of
            // record out of dozens.
            if (!line.startsWith("{")) continue
            if (!line.contains(USER_MARK) && !line.contains(QUEUED_MARK)) continue

            val payload = runCatching { Json.parseToJsonElement(line).jsonObject }.getOrNull() ?: continue
            val at = timestampOf(payload)

            for (text in promptText(payload)) {
                val trimmed = text.trim()
                if (trimmed.isEmpty()) continue

                // Close the earliest matching wait: records in the file run in time order, sends in the
                // list do too, so the first record goes to the first send, the second to the second.
                val index = wanted.indices.firstOrNull { i ->
                    i !in matched && wanted[i] == trimmed && at >= sent[i].sentAt - CLOCK_SLACK_MS
                } ?: continue

                matched += index
            }
        }

        return matched
    }

    /** The person's message text - in whichever of the two shapes the record came. */
    private fun promptText(payload: JsonObject): List<String> =
        when (payload["type"]?.jsonPrimitive?.contentOrNull) {
            "user" -> {
                val message = payload["message"]?.jsonObject
                if (message?.get("role")?.jsonPrimitive?.contentOrNull != "user") {
                    emptyList()
                } else {
                    textBlocks(message["content"])
                }
            }

            "attachment" -> {
                val attachment = payload["attachment"]?.jsonObject
                if (attachment?.get("type")?.jsonPrimitive?.contentOrNull != "queued_command") {
                    emptyList()
                } else {
                    textBlocks(attachment["prompt"])
                }
            }

            else -> emptyList()
        }

    /**
     * A record's text: an array of blocks, or - for a message without attachments - simply a string.
     * As a bare string the CLI writes what had nothing but text in its input (see
     * [ClaudeHistory.normalizeContent]).
     */
    private fun textBlocks(content: JsonElement?): List<String> =
        when (content) {
            is JsonPrimitive -> listOfNotNull(content.contentOrNull)
            is JsonArray -> content.mapNotNull { block ->
                val obj = block as? JsonObject ?: return@mapNotNull null
                if (obj["type"]?.jsonPrimitive?.contentOrNull != "text") return@mapNotNull null
                obj["text"]?.jsonPrimitive?.contentOrNull
            }

            else -> emptyList()
        }

    /**
     * When the CLI wrote this line. Records without a time do not count: there is nothing to say they
     * are newer than the send, and crediting an old record means silently losing a message exactly
     * where this whole check was started.
     */
    private fun timestampOf(payload: JsonObject): Long {
        val stamp = payload["timestamp"]?.jsonPrimitive?.contentOrNull ?: return Long.MIN_VALUE
        return runCatching { Instant.parse(stamp).toEpochMilli() }.getOrDefault(Long.MIN_VALUE)
    }

    private const val USER_MARK = "\"type\":\"user\""
    private const val QUEUED_MARK = "queued_command"

    /** The slack backwards in time - see [arrived]. */
    private const val CLOCK_SLACK_MS = 1_000L
}

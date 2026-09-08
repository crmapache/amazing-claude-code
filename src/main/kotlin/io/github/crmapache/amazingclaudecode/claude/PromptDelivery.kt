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
 * Which of the two it was matters: an ordinary message is delivered either way, while a slash command
 * absorbed into a running turn carried out nothing at all - see [verdict] and
 * ClaudeSession.checkDeliveries.
 */
internal object PromptDelivery {

    /**
     * A slash command rather than an ordinary message from a person.
     *
     * The two are told apart because a command only means anything as the first word of a turn. Written
     * into a turn already running it is not expanded at all: the CLI hands the agent the bare text
     * "/compact" as a remark made mid-work, and the agent - quite rightly - does nothing with it. An
     * ordinary message in that same place is delivered properly: the agent is asked to take it up as it
     * carries on.
     *
     * Hence the rule in two places: a command is not written into a running turn at all (see
     * ClaudeSessionHub.prompt), and one that got in there all the same is not delivered but lost (see
     * [verdict]).
     */
    fun isCommand(text: String): Boolean = text.trimStart().startsWith("/")

    /**
     * Whether this message has to wait for the running turn rather than go into it.
     *
     * The rule of the two places above, in one line and under a test, because it breaks silently: sent
     * into a running turn a command does nothing at all, and nothing on the screen says so - the person
     * sees their "/compact" in the feed, the work carries on, and the context is never compacted.
     */
    fun waitsForTheTurn(text: String, turnRunning: Boolean): Boolean = turnRunning && isCommand(text)

    /** Where a send's record landed - the shape of the record in the conversation says which. */
    enum class Landing {
        /** `type: user` - the message became a turn of its own, and a command in it was carried out. */
        NEW_TURN,

        /** `attachment` with `queued_command` - it went into the turn that was already running. */
        ABSORBED,
    }

    /** What is to be done about one send. */
    enum class Verdict {
        /** It reached the conversation, and nothing more is owed to it. */
        DELIVERED,

        /** It did not, or it did in a shape that carried out nothing: send it again. */
        LOST,

        /** Nothing can be said yet - the record may simply not have been written. */
        WAIT,
    }

    /**
     * The verdict on one send, by where its record landed and whether this look is the last one.
     *
     * The last look is not simply the last attempt: it is a look taken after the turn has ended (see
     * ClaudeSession.checkDeliveries). A message taken into a running turn reaches the conversation's
     * file only when the CLI shows it to the agent, a whole tool call later - judged before that, it is
     * indistinguishable from one that left no record at all.
     *
     * The two kinds of message part ways here, and both directions of the difference cost something.
     * An ordinary message absorbed into a running turn is delivered: the CLI shows it to the agent at
     * its next step, and sending it again means carrying the same request out twice. A command in that
     * same place did nothing at all, and staying quiet about it is what a person sees as "I asked for a
     * compaction and nothing happened".
     *
     * With no record at all the two part ways again. Ordinary text always leaves one, so its absence
     * after the last look is a loss. A command leaves none: a known one the CLI rewrites into a record
     * with tags (`<command-name>/compact</command-name>`), an unknown one it does not write down at
     * all. So silence about a command is not evidence of anything, and a repeat on a guess is a second
     * compaction of the context - worse than the break it was meant to mend.
     */
    fun verdict(text: String, landing: Landing?, lastLook: Boolean): Verdict =
        when {
            landing == Landing.NEW_TURN -> Verdict.DELIVERED
            landing == Landing.ABSORBED -> if (isCommand(text)) Verdict.LOST else Verdict.DELIVERED
            !lastLook -> Verdict.WAIT
            else -> if (isCommand(text)) Verdict.DELIVERED else Verdict.LOST
        }

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
        /**
         * The conversation was read: [landed] holds, for the sends whose records are in it, where each
         * one landed. What is not in the map has no record at all - which means different things for a
         * command and for ordinary text (see [verdict]).
         */
        data class Read(val landed: Map<Int, Landing>) : Lookup

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
        if (sent.isEmpty()) return Lookup.Read(emptyMap())

        val id = conversationId ?: return Lookup.Unreadable
        val file = ClaudeHistory.transcriptFile(workingDirectory, id) ?: return Lookup.Unreadable

        return runCatching {
            file.useLines { lines -> Lookup.Read(match(lines, sent)) as Lookup }
        }.onFailure { thisLogger().warn("Failed to check delivery in conversation $id", it) }
            .getOrDefault(Lookup.Unreadable)
    }

    /** Parsing the conversation file's lines - apart from the disk, so a test can check it. */
    internal fun match(lines: Sequence<String>, sent: List<Sent>): Map<Int, Landing> {
        val wanted = sent.map { it.text.trim() }
        val matched = mutableMapOf<Int, Landing>()

        for (line in lines) {
            // Everything found - no reason to read the file to the end.
            if (matched.size == sent.size) break

            // A cheap cut-off: a conversation's file weighs megabytes, and we care about two kinds of
            // record out of dozens.
            if (!line.startsWith("{")) continue
            if (!line.contains(USER_MARK) && !line.contains(QUEUED_MARK)) continue

            val payload = runCatching { Json.parseToJsonElement(line).jsonObject }.getOrNull() ?: continue
            val record = record(payload) ?: continue
            val at = timestampOf(payload)

            for (text in record.texts) {
                val trimmed = text.trim()
                if (trimmed.isEmpty()) continue

                // Close the earliest matching wait: records in the file run in time order, sends in the
                // list do too, so the first record goes to the first send, the second to the second.
                val index = wanted.indices.firstOrNull { i ->
                    i !in matched && wanted[i] == trimmed && at >= sent[i].sentAt - CLOCK_SLACK_MS
                } ?: continue

                matched[index] = record.landing
            }
        }

        return matched
    }

    /** One record of a person's message: how it got into the conversation, and what it said. */
    private data class Record(val landing: Landing, val texts: List<String>)

    /** The person's message - in whichever of the two shapes the record came, or nothing. */
    private fun record(payload: JsonObject): Record? =
        when (payload["type"]?.jsonPrimitive?.contentOrNull) {
            "user" -> {
                val message = payload["message"]?.jsonObject
                if (message?.get("role")?.jsonPrimitive?.contentOrNull != "user") {
                    null
                } else {
                    Record(Landing.NEW_TURN, textBlocks(message["content"]))
                }
            }

            "attachment" -> {
                val attachment = payload["attachment"]?.jsonObject
                if (attachment?.get("type")?.jsonPrimitive?.contentOrNull != "queued_command") {
                    null
                } else {
                    Record(Landing.ABSORBED, textBlocks(attachment["prompt"]))
                }
            }

            else -> null
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

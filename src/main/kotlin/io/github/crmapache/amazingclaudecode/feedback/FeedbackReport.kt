package io.github.crmapache.amazingclaudecode.feedback

import io.github.crmapache.amazingclaudecode.claude.SessionJournal
import kotlinx.serialization.json.Json
import kotlinx.serialization.json.JsonArray
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.JsonPrimitive
import kotlinx.serialization.json.booleanOrNull
import kotlinx.serialization.json.contentOrNull
import kotlinx.serialization.json.intOrNull
import kotlinx.serialization.json.jsonObject
import kotlinx.serialization.json.jsonPrimitive
import kotlinx.serialization.json.longOrNull
import java.nio.charset.StandardCharsets
import java.util.Locale
import java.util.concurrent.TimeUnit

/**
 * The debug report a person may attach to a piece of feedback - and the promise that goes with it.
 *
 * The promise is that it carries technical facts only: what versions were in play, what shape the
 * conversation had, and anything that failed. Not what was asked, not what was answered, not which files
 * were touched, not where the project lives on the disk.
 *
 * That promise is kept by how this is built rather than by care taken while building it. The journal of
 * a conversation is the whole conversation - every message a person typed, every answer, and the
 * contents of every file the agent read (see SessionJournal). So nothing is copied out of it. Each entry
 * is read for its shape - which event, which tool, how many bytes, did it fail, how long since the last
 * one - and a line is written from those facts. A field this file does not know about contributes
 * nothing; the way to leak something new is to add it here on purpose.
 *
 * File names are the one thing in between. Which files were involved matters when reading a bug ("it
 * read the same file four times"), and their names cannot travel. So a path becomes twelve characters of
 * its hash, exactly as the statistics already do it (see StatsCollector.hashOf): the same file reads as
 * the same file, and no hash says which one.
 *
 * The whole thing is shown to the person before it goes anywhere, and what they read is this string.
 * There is no second, fuller version for the wire.
 */
internal object FeedbackReport {

    /**
     * Build the report.
     *
     * Deliberately a function over data rather than something that reaches for the IDE itself: the
     * environment arrives as ready lines (see FeedbackEnvironment), and then the part that must not leak
     * anything can be handed a journal full of secrets by a test and checked line by line (see
     * FeedbackReportTest).
     */
    fun build(
        environment: List<String>,
        journal: List<SessionJournal.Entry>,
        events: List<DiagnosticsLog.Entry>,
    ): String {
        val out = StringBuilder()

        environment.forEach { out.append(it).append('\n') }

        out.append('\n').append(CONVERSATION_HEAD).append('\n').append('\n')
        val outline = outlineOf(journal)
        if (outline.isEmpty()) out.append("nothing yet in this conversation\n")
        else outline.forEach { out.append(it).append('\n') }

        out.append('\n').append(TROUBLE_HEAD).append('\n').append('\n')
        if (events.isEmpty()) out.append("nothing went wrong\n")
        else events.forEach { out.append(lineOf(it)).append('\n') }

        return trimToBudget(out.toString())
    }

    /**
     * The conversation as a column of events, timed from the first one kept.
     *
     * Relative times rather than clock ones: what is being read here is "how long did it sit there
     * before it failed", and a wall clock answers that by subtraction. The clock is kept for the trouble
     * column below, where the question is the opposite one - when, so it can be lined up against
     * something else that happened.
     */
    private fun outlineOf(journal: List<SessionJournal.Entry>): List<String> {
        val start = journal.firstOrNull()?.at ?: return emptyList()

        return journal.flatMap { entry ->
            val payload = runCatching { Json.parseToJsonElement(entry.json).jsonObject }.getOrNull()
                ?: return@flatMap listOf(stamp(entry.at - start) + "unreadable entry")

            shapesOf(payload).map { stamp(entry.at - start) + it }
        }
    }

    /**
     * What one journal entry amounts to, in words that give nothing away. A list, because one message
     * from the agent may carry several blocks - three tool calls in a row arrive as one entry.
     */
    private fun shapesOf(payload: JsonObject): List<String> {
        val type = payload.string("type")

        if (type != "agent") return listOf(panelShape(payload, type))

        val event = payload["event"] as? JsonObject ?: return listOf("agent event")
        val kind = event.string("subtype").ifEmpty { event.string("type") }

        return when (event.string("type")) {
            "assistant", "user" -> blockShapes(event).ifEmpty { listOf("${event.string("type")} message") }
            "result" -> listOf(resultShape(event))
            "system" -> listOf(systemShape(event, kind))
            else -> listOf(kind.ifEmpty { "agent event" })
        }
    }

    /**
     * A message from the plugin itself rather than from the agent - a status, a prompt going out, a
     * permission being asked for.
     *
     * Only the ones worth a line get a detail, and the details are chosen one at a time. `echo` is the
     * message a person just typed, so what is said about it is how long it was and nothing else;
     * `permission` names the tool, which is a tool's name, and never the command, which is the command.
     */
    private fun panelShape(payload: JsonObject, type: String): String = when (type) {
        "echo" -> "prompt sent" + chars(payload.textLength("text"))
        "status" -> "status ${payload.string("status")}"
        "permission" -> "permission asked  ${payload.string("target")}"
        "permissionResolved" -> "permission ${payload.string("decision")}"
        "error" -> "error  ${payload.string("message").take(MAX_REASON)}"
        "queue" -> "queue  ${(payload["items"] as? JsonArray)?.size ?: 0} waiting"
        "" -> "entry with no type"
        else -> type
    }

    /** The blocks of one message: a tool going out, a result coming back, text, thinking. */
    private fun blockShapes(event: JsonObject): List<String> {
        val message = event["message"] as? JsonObject ?: return emptyList()
        val content = message["content"] as? JsonArray ?: return emptyList()

        return content.mapNotNull { element ->
            val block = element as? JsonObject ?: return@mapNotNull null

            when (block.string("type")) {
                "tool_use" -> toolShape(block)
                "tool_result" -> {
                    val failed = block["is_error"]?.jsonPrimitive?.booleanOrNull == true
                    "result  ${if (failed) "fail" else "ok"}  ${size(block.contentBytes())}"
                }
                // A length of nothing is not worth printing: thinking arrives in pieces over the live
                // stream and the assembled block is often empty, and "thinking 0 chars" reads as a fault
                // in the plugin rather than as the shape of the stream.
                "text" -> "text" + chars(block.textLength("text"))
                "thinking" -> "thinking" + chars(block.textLength("thinking"))
                else -> null
            }
        }
    }

    /**
     * A tool call: which tool, how much went in, and which file it was about if it was about one.
     *
     * The size of the input rather than the input: a Write of forty kilobytes and a Write of forty bytes
     * fail in different ways, and neither reason is the text itself.
     */
    private fun toolShape(block: JsonObject): String {
        val name = block.string("name").ifEmpty { "tool" }
        val input = block["input"] as? JsonObject
        val bytes = input?.toString()?.toByteArray(StandardCharsets.UTF_8)?.size ?: 0
        val subject = input?.let(::subjectOf).orEmpty()

        return "$name  in ${size(bytes)}$subject"
    }

    /**
     * The file a call was about, as a hash. Only the fields that are known to hold a path are looked at -
     * a tool of somebody else's making may put anything in anything, and a field this list has not heard
     * of is left alone rather than guessed about.
     */
    private fun subjectOf(input: JsonObject): String {
        val path = PATH_FIELDS.firstNotNullOfOrNull { field -> input.string(field).takeIf { it.isNotEmpty() } }
        return if (path == null) "" else "  f:" + ShortHash.of(path, 6)
    }

    /** A turn's own result: how long it took and how much of it there was. */
    private fun resultShape(event: JsonObject): String {
        val duration = event["duration_ms"]?.jsonPrimitive?.longOrNull
        val turns = event["num_turns"]?.jsonPrimitive?.intOrNull
        val failed = event["is_error"]?.jsonPrimitive?.booleanOrNull == true

        return buildString {
            append("turn ended")
            if (failed) append("  failed")
            duration?.let { append("  ").append(seconds(it)) }
            turns?.let { append("  ").append(it).append(" turns") }
        }
    }

    /**
     * A system event. Two of them carry a shape worth naming outright: the CLI waiting out a refusal
     * from the API (which looks, in the panel, exactly like the plugin having hung) and a compaction.
     */
    private fun systemShape(event: JsonObject, kind: String): String = when (kind) {
        "api_retry" -> {
            val attempt = event["attempt"]?.jsonPrimitive?.intOrNull
            val max = event["max_retries"]?.jsonPrimitive?.intOrNull
            val delay = event["retry_delay_ms"]?.jsonPrimitive?.longOrNull
            val status = event["error_status"]?.jsonPrimitive?.intOrNull

            buildString {
                append("api retry")
                if (attempt != null) append("  ").append(attempt).append('/').append(max ?: '?')
                if (status != null) append("  ").append(status)
                if (delay != null) append("  in ").append(seconds(delay))
            }
        }
        "init" -> "system init  model ${event.string("model").ifEmpty { "?" }}"
        else -> "system ${kind.ifEmpty { "event" }}"
    }

    /** One line of the trouble column: when it happened, who said it, and what they said. */
    private fun lineOf(entry: DiagnosticsLog.Entry): String {
        val clock = java.time.Instant.ofEpochMilli(entry.at)
            .atZone(java.time.ZoneId.systemDefault())
            .toLocalTime()

        return String.format(
            Locale.ROOT,
            "%02d:%02d:%02d %-7s %s",
            clock.hour,
            clock.minute,
            clock.second,
            entry.source,
            entry.text,
        )
    }

    /**
     * The report's ceiling, taken off the front.
     *
     * The front is the environment, which is the part one reads first - so the cut is made inside the
     * conversation's outline instead, and says so where it cut. A long day at the keyboard should not
     * turn a note about a button into a megabyte, and Telegram would not carry it anyway.
     */
    private fun trimToBudget(report: String): String {
        if (report.length <= MAX_CHARS) return report

        val at = report.indexOf(CONVERSATION_HEAD)
        if (at < 0) return report.take(MAX_CHARS)

        // Up to and including the outline's own heading. Cutting from the very front took the heading with
        // it, and what came out read as a broken file rather than a shortened one: the environment, the
        // note about the cut, then loose lines of events under no heading at all - and further down a
        // closing section that nothing had opened.
        val head = report.take(at + CONVERSATION_HEAD.length) + "\n\n"
        val rest = report.drop(at + CONVERSATION_HEAD.length).trimStart('\n')
        val room = MAX_CHARS - head.length - CUT_NOTE.length
        if (room <= 0) return report.take(MAX_CHARS)

        // The end of the outline, not the start: what went wrong is what happened last.
        return head + CUT_NOTE + rest.takeLast(room)
    }

    private fun chars(length: Int): String = if (length <= 0) "" else "  $length chars"

    /*
     * Every number in this report is formatted against a fixed locale, the way the token counter already
     * does it (see ClaudeTokenUsage). The report is read by somebody else, on another machine: a decimal
     * comma instead of a point is merely odd, but an Arabic or Devanagari locale renders the digits
     * themselves in its own script, and the column of timings stops being readable at all. Nothing here
     * is shown to the person whose locale it is - it is a wire format that happens to be text.
     */
    private fun stamp(elapsed: Long): String = String.format(Locale.ROOT, "%-7s", "+" + seconds(elapsed))

    private fun seconds(millis: Long): String {
        val whole = TimeUnit.MILLISECONDS.toSeconds(millis)
        return if (whole >= 100) "${whole}s" else String.format(Locale.ROOT, "%.1fs", millis / 1000.0)
    }

    private fun size(bytes: Int): String = when {
        bytes < 1024 -> "$bytes B"
        bytes < 1024 * 1024 -> "${(bytes + 512) / 1024} KB"
        else -> String.format(Locale.ROOT, "%.1f MB", bytes / (1024.0 * 1024.0))
    }


    private fun JsonObject.string(field: String): String =
        (this[field] as? JsonPrimitive)?.contentOrNull.orEmpty()

    private fun JsonObject.textLength(field: String): Int = string(field).length

    /**
     * How much came back from a tool. A result arrives either as a bare string or as a list of blocks,
     * and both shapes have to be measured - a panel that expected one of them used to break on the other.
     */
    private fun JsonObject.contentBytes(): Int {
        val content = this["content"] ?: return 0

        val text = if (content is JsonPrimitive) content.contentOrNull.orEmpty() else content.toString()
        return text.toByteArray(StandardCharsets.UTF_8).size
    }

    /** The fields a path is known to arrive in. Everything else in a tool's input is left unread. */
    private val PATH_FIELDS = listOf("file_path", "path", "notebook_path", "filePath")

    private const val CONVERSATION_HEAD = "--- this conversation, in outline ---"
    private const val TROUBLE_HEAD = "--- what the plugin ran into ---"
    private const val CUT_NOTE = "(the earlier part of the outline was cut to keep this short)\n\n"

    /** A ceiling a person can still read through, and one Telegram will carry as a file without fuss. */
    const val MAX_CHARS = 120_000

    /** How much of a reason is kept when a message brings one. */
    private const val MAX_REASON = 160
}

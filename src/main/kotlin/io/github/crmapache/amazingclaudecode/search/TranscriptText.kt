package io.github.crmapache.amazingclaudecode.search

import io.github.crmapache.amazingclaudecode.claude.ClaudeHistory
import java.time.Instant
import kotlinx.serialization.json.Json
import kotlinx.serialization.json.JsonArray
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.JsonPrimitive
import kotlinx.serialization.json.contentOrNull
import kotlinx.serialization.json.jsonPrimitive

/** Who said it - the two voices a search can find, named as the wire names them. */
internal enum class Speaker(val wire: String) {
    YOU("you"),
    CLAUDE("claude"),
}

/**
 * One message as the search knows it: enough to find it, to show it and to jump to it, and nothing
 * else. `uuid` is the transcript's own name for the line - the feed opens a conversation at it (see
 * feed/search.ts), and a page of older messages is asked for by it (see ClaudeHistory.page).
 */
internal data class IndexedMessage(
    val conversation: String,
    val uuid: String,
    /** Epoch milliseconds; zero when the line carried no time. */
    val at: Long,
    val speaker: Speaker,
    val text: String,
)

/**
 * What a transcript line contributes to the search: the person's words and the model's, and nothing
 * of the machinery between them.
 *
 * A transcript is mostly machinery. On this machine six hundred megabytes of it hold four megabytes of
 * words - the rest is tool results, file contents, command output, hooks talking to themselves - and
 * a search over all of it finds every file the agent ever read before it finds the sentence somebody
 * remembers writing. So the rule is stated the positive way, as the history's own count is (see
 * ClaudeHistory.scan): a message is what was said, by either side, on the screen.
 *
 * The cheap checks go first and by substring, exactly as the history does them: these lines number in
 * the tens of thousands per project and some of them run to a hundred kilobytes, and parsing each one
 * to find out it is a tool result is most of the cost of building the index at all.
 */
internal object TranscriptText {

    /** The words in this line, or null when it holds none worth finding. */
    fun messageOf(conversation: String, line: String): IndexedMessage? {
        if (!line.startsWith("{")) return null

        val spoken = line.contains(MESSAGE)
        val answered = line.contains(REPLY)
        if (!spoken && !answered) return null

        // The CLI's own marks: a skill's body, a caption under an image, a reminder to itself - written
        // by the shell, seen by nobody. And a subagent's side of the conversation, filed in the same
        // file by older CLIs: the person never wrote to it and never read it.
        if (line.contains(META) || line.contains(SIDECHAIN)) return null
        // A tool's result is a message from the person by shape only. A line that also carries a text
        // block is looked into: the person may have typed while a call was still open.
        if (spoken && line.contains(TOOL_RESULT) && !line.contains(TEXT_BLOCK)) return null
        // An answer without a word in it - a lone tool call, an empty thought.
        if (answered && !line.contains(TEXT_BLOCK)) return null

        val payload = runCatching { Json.parseToJsonElement(line) as? JsonObject }.getOrNull() ?: return null
        val uuid = payload.string("uuid") ?: return null
        val message = payload["message"] as? JsonObject ?: return null

        // The CLI signs its own lines with a model in angle brackets: an interrupted turn, an API error
        // put into the model's mouth. Neither was said by anybody (see StatsCollector.isRealModel).
        if (answered && message.string("model")?.startsWith("<") == true) return null

        val raw = textOf(message["content"]) ?: return null
        val text = (if (spoken) personWords(raw) else answerWords(raw))?.trim()?.take(MAX_TEXT_CHARS) ?: return null
        if (text.isEmpty()) return null

        val at = payload.string("timestamp")?.let { runCatching { Instant.parse(it).toEpochMilli() }.getOrNull() } ?: 0L

        return IndexedMessage(conversation, uuid, at, if (spoken) Speaker.YOU else Speaker.CLAUDE, text)
    }

    /**
     * The text of a message's content, whichever shape the transcript keeps it in: a bare string for a
     * person's plain message, an array of blocks for everything else. Only the text blocks count - a
     * tool call, a thought, an image and a tool's result are not words anybody said.
     */
    private fun textOf(content: Any?): String? = when (content) {
        is JsonPrimitive -> content.contentOrNull.takeIf { content.isString }
        is JsonArray ->
            content
                .mapNotNull { block -> (block as? JsonObject)?.takeIf { it.string("type") == "text" }?.string("text") }
                .filter { it.isNotBlank() }
                .joinToString("\n")
                .takeIf { it.isNotEmpty() }
        else -> null
    }

    /**
     * A person's message with the shell's wrapping taken off.
     *
     * A slash command arrives wrapped in tags and is kept as the command it was: "/deploy staging" is
     * something somebody may well search for. A command run through "!" keeps its command line and
     * loses its output - the output is the machine's, and a `git status` pasted a hundred times would
     * answer every query about a file name. The CLI's own reminders and notifications go entirely.
     */
    internal fun personWords(raw: String): String? {
        val text = raw.trim()

        if (text.startsWith("<command-name>") || text.startsWith("<command-message>")) {
            return ClaudeHistory.commandTitle(text).takeIf { it.isNotEmpty() }
        }
        if (text.startsWith("<local-command-") || text.startsWith("<task-notification>")) return null
        if (text.startsWith(INTERRUPTED)) return null

        val words = text
            .replace(REMINDER, "")
            .replace(SHELL_INPUT) { match -> "! ${match.groupValues[1].trim()}" }
            .replace(SHELL_REST, "")
            .replace(BLANK_LINES, "\n\n")
            .trim()

        return words.takeIf { it.isNotEmpty() }
    }

    /** An answer, minus the placeholder the CLI closes a turn with when there was nothing to say. */
    private fun answerWords(raw: String): String? {
        val text = raw.trim()
        if (text == NO_CONTENT) return null
        return text.replace(BLANK_LINES, "\n\n")
    }

    private fun JsonObject.string(name: String): String? = (this[name] as? JsonPrimitive)?.jsonPrimitive?.contentOrNull

    private const val MESSAGE = "\"type\":\"user\""
    private const val REPLY = "\"type\":\"assistant\""
    private const val TOOL_RESULT = "\"type\":\"tool_result\""
    private const val TEXT_BLOCK = "\"type\":\"text\""
    private const val META = "\"isMeta\":true"
    private const val SIDECHAIN = "\"isSidechain\":true"
    private const val NO_CONTENT = "(no content)"
    private const val INTERRUPTED = "[Request interrupted"

    /**
     * How much of one message is kept. A pasted log runs to a hundred kilobytes, and its hundredth
     * kilobyte is not what anybody will search for; the index is copied to every client that asks and
     * held in memory whole.
     */
    internal const val MAX_TEXT_CHARS = 20_000

    private val REMINDER = Regex("<system-reminder>[\\s\\S]*?</system-reminder>")
    private val SHELL_INPUT = Regex("<bash-input>([\\s\\S]*?)</bash-input>")
    private val SHELL_REST = Regex("<bash-(stdout|stderr|exit-code)>[\\s\\S]*?</bash-\\1>")
    private val BLANK_LINES = Regex("\\n[ \\t]*\\n(?:[ \\t]*\\n)+")
}

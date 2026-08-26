package io.github.crmapache.amazingclaudecode.claude

import com.intellij.openapi.diagnostic.thisLogger
import java.io.File
import kotlinx.serialization.json.Json
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.JsonPrimitive
import kotlinx.serialization.json.addJsonObject
import kotlinx.serialization.json.buildJsonArray
import kotlinx.serialization.json.buildJsonObject
import kotlinx.serialization.json.contentOrNull
import kotlinx.serialization.json.jsonArray
import kotlinx.serialization.json.jsonObject
import kotlinx.serialization.json.jsonPrimitive
import kotlinx.serialization.json.put
import kotlinx.serialization.json.putJsonObject

/**
 * This project's past conversations.
 *
 * Claude Code keeps them itself: a file per conversation in its own folder, the file name being the
 * identifier a conversation is resumed by. The panel starts no database of its own - otherwise the
 * history in the panel and in the terminal would drift apart.
 *
 * The resume slash command is unavailable in streaming mode - it opens an interactive list. Hence a
 * button of our own.
 */
internal object ClaudeHistory {

    data class Entry(
        val id: String,
        val title: String,
        val updatedAt: Long,
        val messages: Int,
        /**
         * The name was picked by a model rather than guessed from the first line. It matters past the
         * list itself: a conversation carried on in a tab keeps this name, and one that is only a guess
         * is worth replacing with a real one (see ClaudeSession.requestTitle).
         */
        val named: Boolean = false,
    )

    fun list(workingDirectory: String?, limit: Int = 40): List<Entry> =
        directoriesFor(workingDirectory)
            .flatMap { directory -> (directory.listFiles { file -> file.extension == "jsonl" } ?: emptyArray()).asList() }
            .sortedByDescending { it.lastModified() }
            .take(limit)
            .mapNotNull { file -> entryFor(file) }

    /**
     * The conversation's file on disk - if the CLI has started one already.
     *
     * Needed outside for more than the history: it is also what tells whether a message written into a
     * running turn reached the conversation (see [PromptDelivery]).
     */
    fun transcriptFile(workingDirectory: String?, id: String): File? =
        directoriesFor(workingDirectory)
            .map { it.resolve("$id.jsonl") }
            .firstOrNull { it.isFile }

    /**
     * The conversation's lines the panel knows how to draw - messages and replies - handed over one at a
     * time as they are read.
     *
     * A line at a time rather than a list of them all, because a long conversation's file runs to tens of
     * megabytes: read whole it was three lists of it in memory at once (the file, the lines kept, the
     * lines normalized) for a tab that is merely being opened. [onLine] is called in the file's own
     * order, and the caller is free to treat the moment it returns as "the replay is over" - that is what
     * closes the cards left unfinished inside it (see ClaudePanel.resumeConversation).
     *
     * A file that breaks off mid-read leaves what was already handed over in the feed rather than
     * throwing the conversation away whole. That is the better of the two: the agent remembers the whole
     * talk either way, and a tab showing most of it beats a tab showing none of it.
     */
    fun replay(workingDirectory: String?, id: String, onLine: (String) -> Unit) {
        val file = transcriptFile(workingDirectory, id) ?: return

        runCatching { file.useLines { lines -> replayable(lines).forEach(onLine) } }
            .onFailure { thisLogger().warn("Failed to replay conversation $id", it) }
    }

    /**
     * Which of the conversation's lines the feed can draw, and in the shape it expects them - apart from
     * the disk, so a test can check it.
     *
     * A lazy sequence rather than a list on purpose: it is the whole point of reading a transcript by
     * lines at all, and it is easy to undo by accident with a stray toList().
     */
    internal fun replayable(lines: Sequence<String>): Sequence<String> =
        lines
            .filter { line -> line.startsWith("{") && REPLAYABLE.any { mark -> line.contains(mark) } }
            .mapNotNull { line ->
                commandOutput(line) ?: line.takeIf { it.contains(MESSAGE) || it.contains(REPLY) }?.let(::normalizeContent)
            }

    private const val MESSAGE = "\"type\":\"user\""
    private const val REPLY = "\"type\":\"assistant\""
    private const val COMMAND = "\"subtype\":\"local_command\""

    private val REPLAYABLE = listOf(MESSAGE, REPLY, COMMAND)

    /** What a command the CLI ran itself printed - the wrapping the transcript keeps it in. */
    private val STDOUT = Regex("<local-command-stdout>([\\s\\S]*?)</local-command-stdout>")

    /** The CLI's own preamble beside that output - internal, and never a part of what was printed. */
    private val CAVEAT = Regex("<local-command-caveat>[\\s\\S]*?</local-command-caveat>")

    /**
     * The output of a command the CLI ran by itself, turned back into what the panel saw when it ran.
     *
     * A slash command is not always a message to the model: `/code-review`, `/cost` and their like the CLI
     * carries out on its own and hands the whole outcome back through the stream as an ordinary answer -
     * which is what the feed drew at the time (a review's findings among them, see readReview). On disk
     * that same output is filed differently: as a `local_command` system entry, or - in transcripts of
     * older CLIs - as the person's own message with the output wrapped in a tag. Neither is a shape the
     * feed draws, so a conversation opened from the history lost every such answer: the command stood in
     * it with nothing after it, as though it had never run.
     *
     * null means this line is not that: an ordinary message, or a command that printed nothing. Anything
     * standing outside the wrapping means the entry is not merely output - it is left alone rather than
     * silently reduced to the part inside.
     */
    internal fun commandOutput(line: String): String? {
        val payload = runCatching { Json.parseToJsonElement(line).jsonObject }.getOrNull() ?: return null

        val content = when (payload["type"]?.jsonPrimitive?.contentOrNull) {
            "system" ->
                payload["content"]
                    ?.jsonPrimitive
                    ?.contentOrNull
                    .takeIf { payload["subtype"]?.jsonPrimitive?.contentOrNull == "local_command" }

            "user" -> (payload["message"]?.jsonObject?.get("content") as? JsonPrimitive)?.takeIf { it.isString }?.content

            else -> null
        } ?: return null

        val printed = STDOUT.find(content)?.groupValues?.get(1)?.trim().orEmpty()
        if (printed.isEmpty()) return null
        if (content.replace(STDOUT, "").replace(CAVEAT, "").isNotBlank()) return null

        return buildJsonObject {
            put("type", "assistant")
            // The transcript's own name for this line travels with it. A phone asks for the page above
            // what it already has by naming its topmost line (see pageOf), and rebuilt without a name such
            // a line matched nothing in the file - the request was then answered with the end of the
            // conversation, which is exactly what was already on the screen. The tap did nothing, twice
            // over: the anchor was unusable, and the page that came back was the wrong one.
            payload["uuid"]?.let { put("uuid", it) }
            putJsonObject("message") {
                put("content", buildJsonArray { addJsonObject { put("type", "text"); put("text", printed) } })
            }
        }.toString()
    }

    /**
     * On disk a person's bare text message is a string in message.content, not an array of blocks: that
     * is how Claude Code writes it when the input held neither attachments nor a tool_result. The live
     * stream hands the panel arrays of blocks only - the feed parses nothing but those and breaks on a
     * string. Since this is the one place where the old shape turns into a live event, the shape is
     * brought into line here, rather than by defensive checks all over the feed.
     */
    internal fun normalizeContent(line: String): String {
        val payload = runCatching { Json.parseToJsonElement(line).jsonObject }.getOrNull() ?: return line
        val message = payload["message"]?.jsonObject ?: return line
        val content = message["content"] as? JsonPrimitive ?: return line
        if (!content.isString) return line

        val textBlock = buildJsonArray { addJsonObject { put("type", "text"); put("text", content.content) } }
        val normalizedMessage = JsonObject(message + ("content" to textBlock))
        val normalizedPayload = JsonObject(payload + ("message" to normalizedMessage))
        return normalizedPayload.toString()
    }

    /** A page of a conversation's messages, and where the next one would start - see [page]. */
    data class Page(val lines: List<String>, val cursor: String?)

    /**
     * A page of the conversation's messages, older than [before] - the same lines [replay] would hand
     * over, sliced by a caller that already has the tail (delivered live, through the journal's own
     * catch-up - see ClaudeSessionHub.CatchUp) and wants what came before it.
     *
     * Anchored on a message's own `uuid` rather than a position: the live journal and this file agree on
     * no shared numbering - the journal interleaves status and permission events that never touch disk at
     * all - so a count would drift the moment the two diverge, which is on the very first status change.
     * A uuid is unambiguous on either side of it, and Claude Code stamps every line with one.
     *
     * [before] of null asks for the file's own last page - right only for a conversation whose live tail
     * was never seen. A boundary that cannot be found is treated the same way rather than as an empty
     * page: the caller asked for "more before this", and the safer answer to "I don't know where that is"
     * is the file's own end, not nothing.
     */
    fun page(workingDirectory: String?, id: String, before: String?, pageSize: Int = 60): Page {
        val file = transcriptFile(workingDirectory, id) ?: return Page(emptyList(), null)

        // Shortened exactly as the live journal shortens what goes through it (see JournalTrim): a single
        // tool result can weigh a megabyte on disk, and this page is on its way to a phone, where a
        // message over the size limit is not shortened but dropped whole and in silence.
        val all = runCatching { file.useLines { lines -> replayable(lines).map(JournalTrim::trim).toList() } }
            .onFailure { thisLogger().warn("Failed to page conversation $id", it) }
            .getOrDefault(emptyList())

        return pageOf(all, before, pageSize)
    }

    /**
     * The slicing itself, apart from the disk - so a test can check it without a transcript file.
     *
     * Two limits rather than one, and the second is the one that matters. A page is counted in messages
     * because that is what a person scrolls, but it travels to a phone in a single frame capped at 256 KB
     * (see RelayLink.MAX_FRAME_BYTES), and a frame over the cap is dropped by the relay with a line in its
     * log and nothing else: the tap on "load more" simply did nothing, again and again. Sixty messages of
     * an ordinary conversation are a few tens of kilobytes; sixty messages of a working day full of file
     * reads were two megabytes.
     *
     * At least one message is always returned, even an outsized one on its own: a page that comes back
     * empty because its first message did not fit would leave the cursor where it was and the button
     * dead - which is the very thing this exists to stop.
     */
    internal fun pageOf(all: List<String>, before: String?, pageSize: Int, maxChars: Int = MAX_PAGE_CHARS): Page {
        val boundary = before?.let { uuid -> all.indexOfFirst { it.contains("\"uuid\":\"$uuid\"") } }
        val end = if (boundary != null && boundary >= 0) boundary else all.size
        val floor = (end - pageSize).coerceAtLeast(0)

        // Backwards from the newest of the page: what has to survive a tight budget is the end of the
        // conversation, the part that stands right above what is already on screen.
        var start = end
        var spent = 0
        while (start > floor) {
            val length = all[start - 1].length
            if (start < end && spent + length > maxChars) break
            spent += length
            start--
        }

        // A page has to begin on a line the next request can name. A line with no name of its own would be
        // handed over as "there is nothing further back", the button to load more would disappear, and the
        // rest of the conversation above it would become unreachable - over a budget, so the boundary can
        // fall anywhere. Such a line is taken along with the page instead: a few characters over the
        // budget cost far less than a page nobody can ask for.
        while (start in 1 until end && uuidOf(all[start]) == null) start--

        val slice = all.subList(start, end)

        return Page(slice, if (start > 0) uuidOf(slice.first()) else null)
    }

    /**
     * How much of a page may travel at once. Half the frame's own cap: the JSON around the lines, the
     * seal's overhead and the base64 of the transport all come on top, and being wrong here costs the
     * whole page rather than its tail.
     */
    internal const val MAX_PAGE_CHARS = 128 * 1024

    private fun uuidOf(line: String): String? = UUID_FIELD.find(line)?.groupValues?.get(1)

    private val UUID_FIELD = Regex(""""uuid":"([^"]+)"""")

    /**
     * The conversations folder's name for a project path - by Claude Code's own rule exactly: anything
     * that is not a letter or a digit becomes a hyphen.
     *
     * This used to replace only slashes and dots, and on that the history drifted apart from the
     * terminal: a path with a space or an underscore ("my_project") got a folder of its own, and on
     * Windows always did, because the colon after the drive letter stayed where it was. The panel
     * looked into a folder that did not exist and showed an empty list, while the conversations lay
     * right beside it.
     */
    internal fun slugFor(path: String): String = path.map { if (it.isLetterOrDigit()) it else '-' }.joinToString("")

    /**
     * Where to look for this project's conversations. There are two candidates, because a project's
     * path and the path the CLI knows it by do not always match: `/tmp` on macOS is really
     * `/private/tmp`, and a project may well sit behind a symbolic link. The CLI files conversations
     * under the real path while the IDE hands over its own - so we look into both folders and show
     * whatever was found.
     */
    private fun directoriesFor(workingDirectory: String?): List<File> {
        val path = workingDirectory ?: return emptyList()
        val real = runCatching { File(path).canonicalPath }.getOrDefault(path)
        val projects = File(HostOs.configDirectory(), "projects")

        return listOf(path, real)
            .distinct()
            .map { File(projects, slugFor(it)) }
            .distinctBy { it.path }
            .filter { it.isDirectory }
    }

    private fun entryFor(file: File): Entry? {
        val id = file.nameWithoutExtension

        val scan = runCatching { file.useLines(block = ::scan) }
            .onFailure { thisLogger().warn("Failed to scan conversation $id", it) }
            .getOrDefault(Scan("", 0))

        // A conversation without a single message is an abandoned launch, with nothing to show.
        if (scan.messages == 0) return null

        return Entry(
            id = id,
            // The CLI's own name (see Scan.aiTitle) - preferred over the heuristic when there is one:
            // shorter, closer to the point, and independent of how well the person's first line came
            // out.
            title = scan.aiTitle?.takeIf { it.isNotBlank() } ?: scan.title.ifEmpty { "untitled" },
            updatedAt = file.lastModified(),
            messages = scan.messages,
            named = !scan.aiTitle.isNullOrBlank(),
        )
    }

    /** What could be learned about a conversation in a single pass over its file. */
    internal data class Scan(val title: String, val messages: Int, val aiTitle: String? = null)

    /**
     * The title and the message count - in one pass: a conversation's file weighs megabytes, and there
     * are forty of them in the list.
     *
     * A message here is what the person said: in their own words or as a command. The transcript
     * records everything internal as their messages too - every tool result, a command's wrapper, a
     * background task's notification - and such a count parts ways with what was on screen tenfold:
     * "375 messages" where a person wrote thirty.
     *
     * The filtering goes by the raw line, without parsing it: internal messages outnumber all the
     * others many times over, and some of them run to a hundred kilobytes. The substrings are taken in
     * the shape the CLI writes them - inside a person's own text such a substring cannot occur, the
     * quotes there are escaped.
     */
    internal fun scan(lines: Sequence<String>): Scan {
        var title = ""
        // The conversation is all /compact or a similar command, with not a single message from the
        // person: then the command's name is the only meaningful title there is.
        var fallbackCommand = ""
        var aiTitle: String? = null
        var messages = 0

        for (line in lines) {
            if (!line.startsWith("{")) continue

            // The CLI's own name repeats many times over through the file with the same value - we keep
            // the last one seen: if the conversation's topic has changed since, it has had time to
            // change too.
            val named = AgentStream.aiTitle(line)
            if (named != null) {
                aiTitle = named
                continue
            }

            if (!line.contains("\"type\":\"user\"")) continue
            // A tool call's result: a person's message by shape only.
            if (line.contains("\"type\":\"tool_result\"")) continue
            // The CLI's own mark: written not by the person but by the shell - a skill's body, a
            // warning before a command, a caption under an image.
            if (line.contains("\"isMeta\":true")) continue
            // The rest of the commands' wrapping and background task notifications: the person neither
            // wrote them nor saw them on screen.
            if (SERVICE_CONTENT.any { line.contains(it) }) continue

            messages += 1
            if (title.isNotEmpty()) continue

            val payload = runCatching { Json.parseToJsonElement(line).jsonObject }.getOrNull() ?: continue

            when (val wrapper = serviceReplica(payload)) {
                // A real message from the person - not a command's wrapping.
                null -> firstText(payload).takeIf { it.isNotEmpty() }?.let { title = it }
                else -> if (wrapper.isNotEmpty() && fallbackCommand.isEmpty()) fallbackCommand = wrapper
            }
        }

        return Scan(title.ifEmpty { fallbackCommand }, messages, aiTitle)
    }

    /**
     * Internal messages that look like a person's words in the transcript but are not: a slash
     * command's wrapping, the warning and output of a local command, a background task's notification.
     * None of them will do as a title literally: null means a real message from the person, not an
     * internal one; "" means internal, with nothing to show; a non-empty string is the command itself,
     * the one meaningful thing the wrapping holds.
     */
    private fun serviceReplica(payload: JsonObject): String? {
        val content = payload["message"]?.jsonObject?.get("content") as? JsonPrimitive ?: return null
        if (!content.isString) return null
        val text = content.content.trim()

        return when {
            // The order of tags in the wrapping is not fixed: built-in commands (/model, /compact) put
            // the name first, skills and plugins the caption. The parsing used to expect only the first
            // order, and a conversation started by a skill was listed as a raw
            // "<command-message>task</command-message>".
            text.startsWith("<command-name>") || text.startsWith("<command-message>") -> commandTitle(text)
            text.startsWith("<local-command-") || text.startsWith("<task-notification>") -> ""
            else -> null
        }
    }

    /**
     * The command's name with its argument - that is how a conversation is recognised in the list: a
     * dozen runs of one and the same skill differ from each other by nothing else.
     */
    private fun commandTitle(text: String): String {
        val name = tag(COMMAND_NAME_TAG, text).ifEmpty { tag(COMMAND_MESSAGE_TAG, text) }
        if (name.isEmpty()) return ""

        // The name arrives both with and without a slash - it depends on which tag it was written in;
        // in a title a command should look like a command.
        val command = if (name.startsWith("/")) name else "/$name"
        val arguments = tag(COMMAND_ARGS_TAG, text)

        return (if (arguments.isEmpty()) command else "$command $arguments").take(120)
    }

    private fun tag(pattern: Regex, text: String): String =
        pattern.find(text)?.groupValues?.get(1)?.trim().orEmpty()

    /**
     * The title is the person's first message - not as it stands, but its meaningful lines. Attachments
     * (`@path`, `[Image #N]`, a quote) the panel puts into the text BEFORE the person's real words
     * rather than instead of them - taking the literally first line often means showing one short word
     * ("Right") instead of what the person actually asked a line below. So we join every meaningful
     * line rather than take only the first. When there is no meaningful line at all (a lone attachment
     * or a bare command), that is the whole substance of the message - we take the last line, exactly
     * as the native picker shows it.
     */
    private fun firstText(payload: JsonObject): String {
        val content = payload["message"]?.jsonObject?.get("content") ?: return ""

        val text = runCatching {
            content.jsonArray
                .mapNotNull { block -> block.jsonObject["text"]?.jsonPrimitive?.contentOrNull }
                .firstOrNull { it.isNotBlank() }
        }.getOrNull() ?: runCatching { content.jsonPrimitive.contentOrNull }.getOrNull()

        val rawLines = withoutShellText(text.orEmpty()).lineSequence().filter { it.isNotBlank() }.toList()
        val meaningful = rawLines
            .map { stripImageTags(it) }
            .filter { it.isNotEmpty() && !isAttachmentLine(it) }

        val joined = meaningful.ifEmpty { rawLines.takeLast(1) }.joinToString(" ")

        return truncateAtWord(joined, 120)
    }

    /**
     * `[Image #N]` is an attachment placeholder the composer inserts right in the middle of a sentence
     * ("look [Image #1] here"), not only on a line of its own. The filter used to recognise a line made
     * entirely of a placeholder and missed this case - the tag leaked into the title as it was.
     */
    private fun stripImageTags(line: String): String =
        line.replace(IMAGE_PLACEHOLDER, " ").replace(MULTIPLE_SPACES, " ").trim()

    /**
     * The output of bash-mode commands the panel puts at the START of the person's next message (see
     * shellText in the webview): the agent needs it, and because of it a conversation was listed as
     * "<bash-input>git pull</bash-input> <bash-stdout>Already up to date.</bash-stdout> Now let's move…"
     * instead of what the person asked a line below.
     *
     * Cut out as whole blocks rather than as lines carrying tags: a command's output is multi-line, and
     * its middle holds no tags at all - that middle is what would have leaked into the title.
     */
    private fun withoutShellText(text: String): String = text.replace(SHELL_BLOCK, "").trim()

    private fun isAttachmentLine(line: String): Boolean = line.startsWith("@") || line.startsWith("> ")

    /** Cut on a word boundary - otherwise a title can break off mid-word. */
    private fun truncateAtWord(text: String, max: Int): String {
        if (text.length <= max) return text
        val cut = text.take(max)
        val lastSpace = cut.lastIndexOf(' ')
        return if (lastSpace > 0) cut.take(lastSpace) else cut
    }

    /** The start of internal messages that do not count towards the message total (see scan). */
    private val SERVICE_CONTENT = listOf(
        "\"content\":\"<local-command-",
        "\"content\":\"<task-notification>",
    )

    private val SHELL_BLOCK =
        Regex("""<bash-(input|stdout|stderr|exit-code)>.*?</bash-\1>""", RegexOption.DOT_MATCHES_ALL)
    private val IMAGE_PLACEHOLDER = Regex("\\[Image #\\d+]")
    private val MULTIPLE_SPACES = Regex(" {2,}")
    private val COMMAND_NAME_TAG = Regex("""<command-name>(.*?)</command-name>""")
    private val COMMAND_MESSAGE_TAG = Regex("""<command-message>(.*?)</command-message>""")
    private val COMMAND_ARGS_TAG = Regex("""<command-args>(.*?)</command-args>""", RegexOption.DOT_MATCHES_ALL)
}

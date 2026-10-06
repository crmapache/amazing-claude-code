package io.github.crmapache.amazingclaudecode.claude

import com.intellij.openapi.diagnostic.thisLogger
import io.github.crmapache.amazingclaudecode.scenario.ScenarioConversations
import java.io.File
import java.io.RandomAccessFile
import java.nio.file.Files
import java.nio.file.StandardOpenOption
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
         * Where the name came from - one of SessionSnapshot's TITLE_ values: the person's own, the
         * model's, or a guess off the first line. It matters past the list itself: a conversation carried
         * on in a tab keeps this name at this rank, a guess is worth replacing with a real one (see
         * ClaudeSession.requestTitle), and a name the person gave must not be replaced by the model's.
         */
        val titleSource: String = SessionSnapshot.TITLE_HEURISTIC,
    )

    /**
     * This project's past conversations, newest first - without the ones the panel raised for itself.
     *
     * A scenario run is a dozen conversations of the CLI's, kept in this same folder because that is
     * where the CLI keeps everything (see ScenarioConversations), and none of them is a conversation
     * anybody held. A night of runs pushed an evening's own three off the top of this list, which is the
     * one list that answers "what was I doing".
     *
     * Thrown out BEFORE the newest are taken, and that is the whole of it working: cut afterwards, a
     * night of runs would leave a page of four rows and the conversations under them would stay
     * unreachable - the same complaint with a shorter list.
     */
    fun list(workingDirectory: String?, limit: Int = 40): List<Entry> {
        val hidden = ScenarioConversations(workingDirectory).all()

        val files = directoriesFor(workingDirectory)
            .flatMap { directory -> (directory.listFiles { file -> file.extension == "jsonl" } ?: emptyArray()).asList() }

        return newest(files, hidden, limit).mapNotNull { file -> entryFor(file) }
    }

    /** Which transcripts the list is built from, apart from the disk so a test can hold it to the order. */
    internal fun newest(files: List<File>, hidden: Set<String>, limit: Int): List<File> =
        files
            .filterNot { it.nameWithoutExtension in hidden }
            .sortedByDescending { it.lastModified() }
            .take(limit)

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
     * The name a person gave the conversation, as its file says last - null when none stands. Read after
     * the CLI renamed a conversation itself (see ClaudeSession.readRename): the stream says so only in a
     * sentence meant for the eye, and the file is where the name actually lands.
     */
    fun ownTitleOf(file: File): String? = runCatching {
        var title: String? = null
        file.useLines { lines ->
            for (line in lines) AgentStream.customTitle(line)?.let { title = it.ifEmpty { null } }
        }
        title
    }
        .onFailure { thisLogger().warn("Could not read the name of conversation ${file.nameWithoutExtension}", it) }
        .getOrNull()

    /**
     * Name a conversation nobody is running: the record the CLI writes when a running one is renamed,
     * appended the way the CLI's own SDK appends it for a session with no process (`renameSession`), and
     * the one [scan] reads back. See ClaudeSession.rename for why a running one is asked instead.
     *
     * Appended, never rewritten - the file is the CLI's, and the last name in it is the one that counts.
     * A file whose last line was cut short, by a process killed mid-write, gets the record after a line
     * break of its own: glued onto that torn tail it would take both lines down with it.
     */
    fun rename(file: File, conversationId: String, title: String): Boolean = runCatching {
        val record = buildJsonObject {
            put("type", "custom-title")
            put("customTitle", title)
            put("sessionId", conversationId)
        }.toString()

        val torn = RandomAccessFile(file, "r").use { transcript ->
            transcript.length() > 0 && transcript.run { seek(length() - 1); read() != '\n'.code }
        }

        // APPEND without CREATE: a file that vanished in between is not one to start over.
        Files.writeString(
            file.toPath(),
            (if (torn) "\n" else "") + record + "\n",
            Charsets.UTF_8,
            StandardOpenOption.APPEND,
        )
    }
        .onFailure { thisLogger().warn("Could not write the name of conversation $conversationId", it) }
        .isSuccess

    /**
     * The end of a conversation, as the panel opens it from the history - the same lines [page] hands
     * over, with the budget a tab at the desk can take rather than a phone's.
     *
     * The whole transcript used to travel here instead, line by line, and that is what made opening an
     * old conversation from the history come up empty: a working day's file is tens of megabytes, and it
     * left the plugin as a few dozen batches of about a megabyte each, all of them within a millisecond
     * of one another. A batch that size does not fit into a single trip into the page, so each was cut
     * into pieces and glued back together there - and a piece that failed to arrive took its whole batch
     * of two hundred messages with it, silently, JSON.parse choking on the join (see WebviewHost). At the
     * desk on macOS it went through; on Windows, whose channel into the page is narrower, the feed came
     * up empty while the list of conversations beside it was perfectly fine.
     *
     * So the tab is handed the end of the conversation and asks for the rest itself, page by page - the
     * route the phone has taken all along (see ProjectCatalog.sendHistoryPage). The agent's own memory
     * has nothing to do with this: it is resumed from its transcript whole either way.
     */
    fun opening(workingDirectory: String?, id: String): Page =
        page(workingDirectory, id, before = null, pageSize = OPENING_PAGE_MESSAGES, maxChars = OPENING_PAGE_CHARS)

    /**
     * The end of what a fork not born yet carries - its source up to the line the fork ends on, and the seam
     * after it (see ForkLineage.unborn). What a fork's tab opens with the moment it is made: the fork is the
     * same conversation going on, and its feed shows what its agent will remember.
     */
    fun forkOpening(workingDirectory: String?, origin: ForkOrigin): Page =
        page(lineages(workingDirectory).unborn(origin), before = null, pageSize = OPENING_PAGE_MESSAGES, maxChars = OPENING_PAGE_CHARS)

    /** A page of the same, further back than [before] - see [earlier] for the sizes. */
    fun forkEarlier(workingDirectory: String?, origin: ForkOrigin, before: String?, local: Boolean): Page =
        if (local) {
            page(lineages(workingDirectory).unborn(origin), before, pageSize = OPENING_PAGE_MESSAGES, maxChars = OPENING_PAGE_CHARS)
        } else {
            page(lineages(workingDirectory).unborn(origin), before, maxChars = MAX_PHONE_PAGE_BYTES, weigh = ::utf8Bytes)
        }

    /**
     * A page further back than [before], sized for whoever asked.
     *
     * [local] means the IDE's own panel: its channel into the page is ours to manage, while a phone's
     * page has to survive a relay frame capped at 256 KB, and a frame over the cap is dropped whole and
     * in silence (see [MAX_PHONE_PAGE_BYTES]). One page for both would have to be the smaller of the two, and
     * that turns reading back through a long conversation at the desk into a row of taps.
     */
    fun earlier(workingDirectory: String?, id: String, before: String?, local: Boolean): Page =
        if (local) {
            page(workingDirectory, id, before, pageSize = OPENING_PAGE_MESSAGES, maxChars = OPENING_PAGE_CHARS)
        } else {
            page(workingDirectory, id, before, maxChars = MAX_PHONE_PAGE_BYTES, weigh = ::utf8Bytes)
        }

    /**
     * How much of a conversation a tab opens with, and how much one press of "load earlier" brings -
     * counted in messages rather than in the transcript's lines (see [drawsOwnRow]).
     */
    internal const val OPENING_PAGE_MESSAGES = 60

    /**
     * And the same for a phone. Smaller because its page has to survive a relay frame - see [earlier].
     */
    internal const val PAGE_MESSAGES = 30

    /**
     * And its budget in characters. Four times a phone's page: nothing here has to survive a relay's
     * frame, and a conversation of ordinary length is then on screen whole, without a single tap.
     */
    internal const val OPENING_PAGE_CHARS = 512 * 1024

    /**
     * Which of the conversation's lines the feed can draw, and in the shape it expects them - apart from
     * the disk, so a test can check it.
     *
     * A lazy sequence rather than a list on purpose: it is the whole point of reading a transcript by
     * lines at all, and it is easy to undo by accident with a stray toList().
     */
    internal fun replayable(lines: Sequence<String>): Sequence<String> = candidates(lines).mapNotNull(::replayLine)

    /**
     * The lines a page may be cut out of, told by their shape alone - not parsed, and that is the point
     * (see [page]). A few of them turn out to draw nothing once looked into - a command that printed
     * nothing - and are dropped then; the window keeps a little slack for that (see windowOf).
     */
    internal fun candidates(lines: Sequence<String>): Sequence<String> =
        lines.filter { line -> line.startsWith("{") && REPLAYABLE.any { mark -> line.contains(mark) } }

    /** One candidate line in the shape the feed draws, or null when it draws nothing after all. */
    internal fun replayLine(line: String): String? {
        // A fork's seam is the panel's own line and travels as it is (see ForkOrigin.seamLine).
        if (ForkOrigin.isSeam(line)) return line
        // The summary a compaction hands the model is a message in the person's name on disk - and never was
        // one on screen: the live feed draws the compaction as its mark (see [compaction]).
        if (line.contains(COMPACT_SUMMARY)) return null
        compaction(line)?.let { return it }
        return commandOutput(line) ?: line.takeIf { it.contains(MESSAGE) || it.contains(REPLY) }?.let(::normalizeContent)
    }

    /**
     * A compaction's boundary, turned into the event the live stream announced it with.
     *
     * The live feed draws a compaction as its mark with its figures ("compacted 51.2k of context into a 5.8k
     * summary"), from the `compact_boundary` event. On disk the same boundary is a system line with the figures
     * under other names (`compactMetadata`, camel case), and the history used to drop it as a line that draws
     * nothing - while the summary under it, filed as the person's message, stood in the feed as a wall of the
     * person's "words". A compacted conversation opened from the history, or inherited by a fork, showed that
     * instead of the mark. null when this line is not a boundary.
     */
    internal fun compaction(line: String): String? {
        if (!line.contains(COMPACTED)) return null
        val payload = runCatching { Json.parseToJsonElement(line).jsonObject }.getOrNull() ?: return null
        if (payload["type"]?.jsonPrimitive?.contentOrNull != "system") return null
        if (payload["subtype"]?.jsonPrimitive?.contentOrNull != "compact_boundary") return null

        val meta = payload["compactMetadata"] as? JsonObject
        return buildJsonObject {
            put("type", "system")
            put("subtype", "compact_boundary")
            payload["uuid"]?.let { put("uuid", it) }
            putJsonObject("compact_metadata") {
                meta?.get("trigger")?.let { put("trigger", it) }
                meta?.get("preTokens")?.let { put("pre_tokens", it) }
                meta?.get("postTokens")?.let { put("post_tokens", it) }
                meta?.get("durationMs")?.let { put("duration_ms", it) }
            }
        }.toString()
    }

    private const val MESSAGE = "\"type\":\"user\""
    private const val REPLY = "\"type\":\"assistant\""
    private const val COMMAND = "\"subtype\":\"local_command\""
    private const val SEAM = "\"type\":\"${ForkOrigin.SEAM_TYPE}\""
    private const val COMPACTED = "\"subtype\":\"compact_boundary\""
    private const val COMPACT_SUMMARY = "\"isCompactSummary\":true"

    private val REPLAYABLE = listOf(MESSAGE, REPLY, COMMAND, SEAM, COMPACTED)

    /** What a command the CLI ran itself printed - the wrapping the transcript keeps it in. */
    private const val STDOUT_TAG = "<local-command-stdout>"
    private val STDOUT = Regex("$STDOUT_TAG([\\s\\S]*?)</local-command-stdout>")

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
        // Without the wrapping in it the line cannot be that, and the answer is known before parsing a
        // line that may run to a megabyte.
        if (!line.contains(STDOUT_TAG)) return null
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

    /**
     * Whether this line draws a row of its own in the feed.
     *
     * A page is counted in what a person scrolls past, and that is not lines. One step of the agent is two
     * lines on disk - the call inside its answer, and the result filed as a message from the person - and
     * a whole burst of such steps collapses on screen into a single folded row (see appendToolCall in
     * feed/build.ts). Half the lines of a busy page draw nothing at all: a result only closes a card that
     * already stands, an empty thinking block is dropped, the CLI's own marks and the commands' wrappers
     * were never on screen to begin with. Counted in lines, a page of two hundred came out as one row -
     * the press did nothing visible, which is the very thing this exists to fix.
     *
     * Stated the positive way on purpose. Everything that draws nothing sticks to its neighbours and the
     * whole run of them counts as one message, so a shape that draws nothing needs no rule of its own
     * here - and there are more of those than one would think (a task list, a question, a subagent's
     * launch all live outside the feed, see FeedRowItem in components/Feed.tsx).
     *
     * Read off the raw line without parsing it, exactly as [scan] does: these lines outnumber the rest
     * many times over, and some of them run to kilobytes. Being off by one message here changes the size
     * of a page and nothing else - the boundary between pages is a uuid either way.
     */
    internal fun drawsOwnRow(line: String): Boolean {
        // A fork's seam and a compaction: marks of their own in the feed.
        if (ForkOrigin.isSeam(line) || line.contains(COMPACTED)) return true
        // A tool call's result: a message from the person by shape only, and on screen not a row but the
        // closing of one that already stands.
        if (line.contains(TOOL_RESULT)) return false
        // The CLI's own mark: written by the shell rather than by the person - a skill's body, a warning
        // before a command, a caption under an image.
        if (line.contains(META)) return false
        if (line.contains(MESSAGE)) return UNDRAWN_CONTENT.none { line.contains(it) }

        // An answer draws a row when it has words in it. A lone tool call has none, and neither has an
        // empty thinking block - the CLI writes plenty of those, only a signature inside. The output of a
        // local command is by now an answer with a text block of its own (see commandOutput).
        return line.contains(REPLY) && line.contains(TEXT_BLOCK)
    }

    private const val TOOL_RESULT = "\"type\":\"tool_result\""
    private const val META = "\"isMeta\":true"
    private const val TEXT_BLOCK = "\"type\":\"text\""

    /**
     * A page of a conversation's messages, and where the next one would start - see [page].
     *
     * [model] is the one the conversation carries on at: the model that last answered, in the fullest
     * spelling the file has for it (see [modelOf]) - empty when nothing in the file named one. Right only
     * for the conversation's end, which is what the tab opens with (see [opening]): that is the model a
     * resumed conversation is launched on.
     */
    data class Page(val lines: List<String>, val cursor: String?, val model: String = "")

    /**
     * The model that last answered in [lines], by the signature under the answer - the same field the
     * feed reads the model from (see realModel in feed/build.ts). The CLI's own placeholders sign as
     * <synthetic> and are not a model anybody can be launched on.
     *
     * The signature names the model and nothing more - never its window: that comes from a line of the
     * CLI's own (see [modelIdentity]), and the two are put together by [modelOf].
     */
    internal fun lastModel(lines: List<String>): String {
        for (line in lines.asReversed()) {
            if (!line.contains(REPLY)) continue
            val model = MODEL_FIELD.find(line)?.groupValues?.get(1) ?: continue
            if (model.isNotBlank() && !model.startsWith("<")) return model
        }
        return ""
    }

    private val MODEL_FIELD = Regex("\"model\":\"([^\"]+)\"")

    /**
     * The model the CLI says it is running, from a line of its own - the one name that carries the window
     * mark.
     *
     * The signature under an answer names the model and nothing more: an answer on "Opus (1M context)" is
     * signed `claude-opus-5`, exactly like one on plain Opus - verified on CLI 2.1.268 launched with
     * `claude-opus-5[1m]`, and across two hundred thousand answers on this machine not one signature
     * carries the mark. The mark lives here instead: an attachment of type `model`, which CLIs from 2.1.257
     * write when a conversation starts and again whenever the model changes, the mark alone included -
     * `{"attachment":{"type":"model","identity":{"modelId":"claude-opus-5[1m]",…}},"type":"attachment",…}`.
     * Read by the signature alone, a conversation held on the large window came back on the ordinary one,
     * and the CLI honestly reported a window a fifth the size: a conversation at 8% reopened at 44%, a
     * longer one at a red 100% (see ClaudeSessionHub.resumeConversation).
     *
     * Parsed rather than matched: the two substrings only say the line is worth parsing - a handful per
     * file - and the shape decides. null when the line is not that.
     */
    internal fun modelIdentity(line: String): String? {
        if (!line.contains(ATTACHMENT) || !line.contains(MODEL_ID)) return null

        return runCatching {
            Json.parseToJsonElement(line).jsonObject["attachment"]?.jsonObject
                ?.takeIf { it["type"]?.jsonPrimitive?.contentOrNull == "model" }
                ?.get("identity")?.jsonObject
                ?.get("modelId")?.jsonPrimitive?.contentOrNull
                ?.takeIf { it.isNotBlank() }
        }.getOrNull()
    }

    private const val ATTACHMENT = "\"type\":\"attachment\""
    private const val MODEL_ID = "\"modelId\""

    /**
     * The model a conversation carries on at, out of the two places its transcript names one.
     *
     * The signature decides WHICH model: it stands under every answer, so it is never behind. The identity
     * line supplies the fuller spelling when it names that same model - that is where the window mark is,
     * and the signature never has it (see [modelIdentity]). An identity line naming another model is one
     * the conversation has since moved off without a new line being written (a CLI older than the line
     * writes none on a switch), and is not believed over the answer. With no answer at all the identity
     * line is all there is: a conversation written into and never answered was still opened on that model.
     */
    internal fun modelOf(signature: String, identity: String): String = when {
        signature.isEmpty() -> identity
        identity.isEmpty() -> signature
        ModelNames.same(identity, signature) -> identity
        else -> signature
    }

    /**
     * What one pass over the file yields: the window a page is cut from, and the CLI's last word on the model.
     * [rewound] says the pass met a rewind's mark - the window may hold lines the rewind took out, and the
     * page is read again without them (see [page]).
     */
    internal data class Tail(val window: Window, val identity: String, val rewound: Boolean = false)

    /**
     * One pass over the transcript, for two things at once.
     *
     * The window is cut out of the messages (see [windowOf]); the model's full name is read off EVERY line
     * on the way there, because the line that carries it is not a message and the window never holds it
     * (see [modelIdentity]): written once when the conversation starts and again on every change, the last
     * of them may lie thousands of lines above the window. The pass reads the whole file to find its tail
     * anyway, so the second reading costs a substring check per line.
     *
     * For a page asked for by a boundary the pass stops there, and what was read of the identity stops with
     * it - which is fine, because a page's model is right only for the conversation's end (see [Page]).
     */
    internal fun tailOf(lines: Sequence<String>, before: String?, pageSize: Int): Tail {
        var identity = ""
        var rewound = false
        val read = lines.onEach { line ->
            modelIdentity(line)?.let { identity = it }
            if (!rewound && TranscriptRewinds.marks(line)) rewound = true
        }
        val window = windowOf(candidates(read), before, pageSize)

        return Tail(window, identity, rewound)
    }

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
    private fun page(
        workingDirectory: String?,
        id: String,
        before: String?,
        pageSize: Int = PAGE_MESSAGES,
        maxChars: Int = MAX_PAGE_CHARS,
        weigh: (String) -> Int = String::length,
    ): Page = lineages(workingDirectory).page(id, before, pageSize, maxChars, weigh)

    /** Where a project's transcripts and forks are looked up - apart from the disk, so a test can hand its own. */
    internal class Lineages(
        private val transcript: (String) -> File?,
        private val origins: (String) -> ForkOrigin?,
    ) {
        fun unborn(origin: ForkOrigin): ForkLineage.Lineage = ForkLineage.unborn(origin, transcript, origins)

        /**
         * A page of conversation [id], read across what it inherited when the page reaches past its own
         * transcript (see ForkLineage).
         *
         * Its own transcript first, alone: nearly every page is cut out of it, and reaching into a source costs a
         * pass over the source's file. Only a page that climbed to the top of its own file - or was asked for by a
         * line its own file does not hold, one of the source's - is read again across the whole lineage.
         */
        fun page(
            id: String,
            before: String?,
            pageSize: Int = PAGE_MESSAGES,
            maxChars: Int = MAX_PAGE_CHARS,
            weigh: (String) -> Int = String::length,
        ): Page {
            val own = ForkLineage.own(id, transcript, origins) ?: return Page(emptyList(), null)
            val first = tailAcross(own, before, pageSize, id)
            if (first.window.reached && (first.window.moreAbove || !ForkLineage.inherits(id, transcript, origins))) {
                return pageOut(first, pageSize, maxChars, weigh)
            }

            val whole = ForkLineage.of(id, transcript, origins)?.let { tailAcross(it, before, pageSize, id) } ?: first
            return pageOut(whole, pageSize, maxChars, weigh)
        }
    }

    /** The disk's answers to [Lineages] - the CLI's folder for this project and this machine's book of forks. */
    private fun lineages(workingDirectory: String?): Lineages {
        val book = ForkBook(workingDirectory)
        return Lineages({ transcriptFile(workingDirectory, it) }, book::origin)
    }

    /**
     * A page out of [lineage] - its own transcript, or that and the transcripts it inherited from.
     *
     * The window is cut out of the raw lines, and only the lines it kept are looked into. Every line
     * before the boundary used to be parsed - twice, for the command output and for the shape of the
     * content - and shortened, only to be thrown away by the window a moment later. On a working day's
     * transcript of fifty megabytes that was seconds for one page, and a jump to a search hit above
     * what the tab holds asks for its pages one after another: the veil stood over the feed for as
     * long as it took to read the whole file that many times over. Told by their shape alone, the
     * lines cost a pass of string checks; the parsing is paid for a page's worth of them.
     */
    internal fun page(
        lineage: ForkLineage.Lineage,
        before: String?,
        pageSize: Int = PAGE_MESSAGES,
        maxChars: Int = MAX_PAGE_CHARS,
        weigh: (String) -> Int = String::length,
    ): Page = pageOut(tailAcross(lineage, before, pageSize, "a fork"), pageSize, maxChars, weigh)

    /**
     * The window of [lineage], read the way it has to be.
     *
     * A file already known to be rewound skips the pass that would only find that out (see below): a live
     * conversation's pages come one after another, and each used to read the whole file three times.
     *
     * A conversation that was rewound is read once more, without what the rewind took out (see
     * TranscriptRewinds): the CLI leaves the dropped turns in the file, and a conversation reopened
     * from here would otherwise bring back exactly what the person rewound to be rid of. Only such a
     * file pays for the second pass, and its cuts are read on from where the last reading stopped. A
     * mark always stands after what it cut, so a page asked for by a boundary has met every mark that
     * matters to it before the boundary stopped the pass.
     */
    private fun tailAcross(lineage: ForkLineage.Lineage, before: String?, pageSize: Int, label: String): Tail {
        val nothing = Tail(Window(emptyList(), moreAbove = false), identity = "")

        val first = if (lineage.stretches.any { TranscriptRewinds.known(it.file) }) {
            null
        } else {
            runCatching { ForkLineage.read(lineage, cuts = false) { lines -> tailOf(lines, before, pageSize) } }
                .onFailure { thisLogger().warn("Failed to page conversation $label", it) }
                .getOrDefault(nothing)
        }
        if (first != null && !first.rewound) return first

        return runCatching { ForkLineage.read(lineage, cuts = true) { lines -> tailOf(lines, before, pageSize) } }
            .onFailure { thisLogger().warn("Failed to page rewound conversation $label", it) }
            .getOrDefault(first ?: nothing)
    }

    /** The page itself, sliced out of a window that has already met its boundary. */
    private fun pageOut(scanned: Tail, pageSize: Int, maxChars: Int, weigh: (String) -> Int): Page {
        val prepared = scanned.window.lines.mapNotNull(::replayLine).map(::shortened)

        // The boundary has already done its work inside the window, so the slicing is asked for the
        // window's own end rather than for it a second time.
        val sliced = pageOf(
            prepared,
            before = null,
            pageSize = pageSize,
            maxChars = maxChars,
            moreAbove = scanned.window.moreAbove,
            weigh = weigh,
        )
        return sliced.copy(model = modelOf(lastModel(sliced.lines), scanned.identity))
    }

    /**
     * One line of a page, shortened the way the live journal shortens what goes through it (see
     * JournalTrim), only harder.
     *
     * A single tool result can weigh a megabyte on disk, and a page travels under a budget in characters -
     * on a phone one such result used to be the whole page. What a folded row shows is a preview, so a few
     * kilobytes of it are enough, and the rest of the budget goes on messages, which is what the person
     * came for. The full text stays on disk; how much was left out is said in the text itself.
     *
     * The messages themselves are never cut here: an answer, the person's message, a plan come back whole,
     * however long. They used to be cut at the same eight kilobytes as a file read whole, and an answer of
     * thirty thousand characters came back from the history as its first quarter and a line about the
     * rest - while the same answer had stood whole in the feed when it was written.
     */
    internal fun shortened(line: String): String = JournalTrim.trim(line, HISTORY_ENTRY_CHARS, HISTORY_STRING_CHARS)

    /** The stretch of a transcript one page can be cut out of - see [windowOf]. */
    internal data class Window(
        val lines: List<String>,
        val moreAbove: Boolean,
        /** The boundary asked for was met - or none was asked for. A page of a fork asked for by its source's line has to look there (see Lineages.page). */
        val reached: Boolean = true,
    )

    /**
     * The lines a page may come out of, and whether the conversation goes on above them.
     *
     * Read in one pass with only a page's worth of lines held at a time. A transcript of a working day
     * is tens of megabytes, and it used to be turned into a list whole - three copies of it in memory
     * (the file, the lines kept, the lines shortened) for the sake of the forty messages at its end. It
     * is the end that is wanted here, always: a page is asked for either from the conversation's tail or
     * from a boundary somewhere above it, and in both cases everything before the boundary is read only
     * to be thrown away.
     *
     * The window is a few lines longer than a page on purpose: the slicing may have to step further back
     * to begin on a line the next request can name (see [pageOf]), and a window cut exactly to size would
     * leave it nowhere to step.
     *
     * A window that had to drop lines starts on a line with a uuid of its own - that is what the cursor
     * out of this page is built from, and without one the rest of the conversation above would become
     * unreachable.
     */
    internal fun windowOf(
        lines: Sequence<String>,
        before: String?,
        pageSize: Int,
        maxLines: Int = MAX_WINDOW_LINES,
        maxChars: Long = MAX_WINDOW_CHARS,
    ): Window {
        val limit = pageSize + WINDOW_SLACK
        // Messages rather than lines: a message is one line that draws a row of its own, or the whole
        // unbroken run of lines that draw nothing (see [drawsOwnRow]). Kept as groups so that the oldest
        // message can be dropped whole - counting them over a flat queue would mean recounting the run at
        // every step.
        val kept = ArrayDeque<MutableList<String>>()
        var held = 0
        var weight = 0L
        var run = false
        var dropped = false
        var reached = before == null

        for (line in lines) {
            if (before != null && uuidOf(line) == before) {
                reached = true
                break
            }

            val draws = drawsOwnRow(line)
            if (!draws && run) kept.last().add(line) else kept.addLast(mutableListOf(line))
            run = !draws
            held += 1
            weight += line.length

            // The newest line is never given up, however heavy: a window with nothing in it is a page with
            // nothing in it, and the button over the feed dead.
            while ((kept.size > limit || held > maxLines || weight > maxChars) && held > 1) {
                val oldest = kept.first()
                // A single run longer than the whole ceiling gives up its oldest lines rather than itself:
                // dropping it whole would leave nothing to cut a page out of.
                if (kept.size == 1 && oldest.size > 1) {
                    weight -= oldest.removeAt(0).length
                    held -= 1
                } else {
                    held -= oldest.size
                    weight -= oldest.sumOf { it.length.toLong() }
                    kept.removeFirst()
                }
                dropped = true
            }
        }

        val window = kept.flatten().toMutableList()
        while (dropped && window.isNotEmpty() && uuidOf(window.first()) == null) window.removeAt(0)

        return Window(window, dropped, reached)
    }

    /** How many messages past a page the window leaves for the slicing to step back into. */
    private const val WINDOW_SLACK = 8

    /**
     * And the ceiling in lines, whatever the messages come out to. One message can be an unbroken run of
     * hundreds of calls, and the window is held in memory whole - a page's worth of such messages would be
     * tens of megabytes, which is exactly what reading a transcript by lines exists to avoid.
     */
    private const val MAX_WINDOW_LINES = 4000

    /**
     * And the ceiling in characters, whatever the lines come out to. The window holds the transcript's
     * lines as they are on disk - shortening them first is what made a page cost seconds (see [page]) -
     * and a line on disk is a tool's result whole: a file read in one go, a build log, half a megabyte
     * each. Four thousand of those are a couple of gigabytes, on exactly the conversations the paging was
     * made for, and the IDE's heap does not have them. A window cut by weight is at worst a shorter page -
     * the button over the feed simply has to be pressed once more - and at this size that takes a run of
     * results heavier than anything the CLI ordinarily writes.
     */
    private const val MAX_WINDOW_CHARS = 32L * 1024 * 1024

    /**
     * The slicing itself, apart from the disk - so a test can check it without a transcript file.
     *
     * Two limits rather than one. The first counts messages, because that is what a person scrolls, and
     * a message is not a line: see [drawsOwnRow]. The second is the weight, because a page travels to a
     * phone in a single frame capped at 256 KB (see RelayLink.MAX_FRAME_BYTES), and a frame over the cap
     * is dropped by the relay with a line in its log and nothing else: the tap on "load more" simply did
     * nothing, again and again. Thirty messages of an ordinary conversation are a few tens of kilobytes;
     * thirty messages of a working day full of file reads are megabytes.
     *
     * At least one message is always returned, even an outsized one on its own: a page that comes back
     * empty because its first message did not fit would leave the cursor where it was and the button
     * dead - which is the very thing this exists to stop.
     */
    internal fun pageOf(
        all: List<String>,
        before: String?,
        pageSize: Int,
        maxChars: Int = MAX_PAGE_CHARS,
        moreAbove: Boolean = false,
        /** What one line weighs against [maxChars] - its characters by default, its bytes for a phone. */
        weigh: (String) -> Int = String::length,
    ): Page {
        val boundary = before?.let { uuid -> all.indexOfFirst { it.contains("\"uuid\":\"$uuid\"") } }
        val end = if (boundary != null && boundary >= 0) boundary else all.size

        // How far back [pageSize] messages reach. A line that draws a row of its own is a message by
        // itself; a line that draws nothing is taken together with the whole run it belongs to, because
        // on screen that run is a single folded row (see [drawsOwnRow]).
        var floor = end
        var messages = 0
        while (floor > 0 && messages < pageSize) {
            var start = floor - 1
            if (!drawsOwnRow(all[start])) {
                while (start > 0 && !drawsOwnRow(all[start - 1])) start--
            }
            floor = start
            messages += 1
        }

        // Backwards from the newest of the page: what has to survive a tight budget is the end of the
        // conversation, the part that stands right above what is already on screen.
        var start = end
        var spent = 0
        while (start > floor) {
            val length = weigh(all[start - 1])
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

        // [moreAbove] says the list itself begins mid-conversation (see windowOf), so a page reaching its
        // first line is not the conversation's beginning: without this the button to load more would
        // disappear on the very first page, and everything above it with the button.
        return Page(slice, if (start > 0 || moreAbove) slice.firstOrNull()?.let(::uuidOf) else null)
    }

    /**
     * How much of a page may travel at once. Half the frame's own cap: the JSON around the lines, the
     * seal's overhead and the base64 of the transport all come on top, and being wrong here costs the
     * whole page rather than its tail.
     */
    internal const val MAX_PAGE_CHARS = 128 * 1024

    /**
     * The same half of a frame for a page that goes to a phone, only counted in what the frame is counted
     * in. A character is a byte only in English: the text of a Russian conversation is two bytes a
     * character, so a page within its budget in characters came out at the full 256 KB and over it once
     * the envelope was added - dropped whole, and the button over the feed dead on exactly the
     * conversations whose messages are longest.
     */
    internal const val MAX_PHONE_PAGE_BYTES = 128 * 1024

    /** What a line weighs on the wire - see [MAX_PHONE_PAGE_BYTES]. */
    internal fun utf8Bytes(line: String): Int {
        var bytes = 0
        var index = 0
        while (index < line.length) {
            val char = line[index]
            bytes += when {
                char.code < 0x80 -> 1
                char.code < 0x800 -> 2
                // A surrogate pair is one character of four bytes, however many chars it takes here.
                Character.isHighSurrogate(char) && index + 1 < line.length && Character.isLowSurrogate(line[index + 1]) -> {
                    index += 1
                    4
                }
                else -> 3
            }
            index += 1
        }
        return bytes
    }

    /**
     * Above this an entry of a page is looked into, and this is how much of one string inside it survives
     * - see [page]. Far below what the live journal allows itself (JournalTrim.MAX_ENTRY_CHARS): there the
     * point is to catch the rare monster, here it is to spend the budget on messages rather than on one
     * file read whole. Eight kilobytes are some two hundred lines of text under a folded row nobody has
     * opened yet, and the note about what was left out comes with them.
     */
    internal const val HISTORY_ENTRY_CHARS = 8 * 1024

    internal const val HISTORY_STRING_CHARS = 8 * 1024

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
     * Where to look for this project's conversations - inside the CLI's own directory, under the name the
     * CLI gives the project.
     *
     * Both are asked of [ClaudeHome] rather than of this machine: for a project opened out of WSL the CLI
     * runs inside the distribution, keeps its files there and names the project by its Linux path, and
     * the history looked into a folder on Windows that could not exist and showed an empty list without a
     * word (the whole story is in ClaudeHome). There are two candidate folders, because a project's path
     * and the path the CLI knows it by do not always match: `/tmp` on macOS is really `/private/tmp`, and
     * a project may well sit behind a symbolic link. The CLI files conversations under the real path
     * while the IDE hands over its own - so we look into both and show whatever was found.
     */
    internal fun directoriesFor(workingDirectory: String?): List<File> = directoriesFor(ClaudeHome.of(workingDirectory))

    internal fun directoriesFor(home: ClaudeHome): List<File> =
        home.projectPaths
            .map { File(home.projectsDirectory, slugFor(it)) }
            .distinctBy { it.path }
            .filter { it.isDirectory }

    private fun entryFor(file: File): Entry? {
        val id = file.nameWithoutExtension

        // A file already known to be rewound is counted once, without the pass that would only find that out.
        val first = if (TranscriptRewinds.known(file)) {
            null
        } else {
            runCatching { file.useLines(block = ::scan) }
                .onFailure { thisLogger().warn("Failed to scan conversation $id", it) }
                .getOrDefault(Scan("", 0))
        }

        // Counted again without what a rewind took out, when one did - see [page] and TranscriptRewinds.
        val scan = if (first != null && !first.rewound) {
            first
        } else {
            runCatching { file.useLines { lines -> scan(TranscriptRewinds.alive(lines, TranscriptRewinds.cutLines(file))) } }
                .getOrDefault(first ?: Scan("", 0))
        }

        // A conversation without a single message is an abandoned launch, with nothing to show.
        if (scan.messages == 0) return null

        return Entry(
            id = id,
            // The person's own name first, then the CLI's (see Scan.aiTitle) - both preferred over the
            // heuristic: shorter, closer to the point, and independent of how well the person's first
            // line came out. The order is the CLI's own: its resume list puts a rename above the model.
            title = scan.customTitle ?: scan.aiTitle ?: scan.title.ifEmpty { "untitled" },
            updatedAt = file.lastModified(),
            messages = scan.messages,
            titleSource = scan.titleSource,
        )
    }

    /** What could be learned about a conversation in a single pass over its file. */
    internal data class Scan(
        val title: String,
        val messages: Int,
        val aiTitle: String? = null,
        /** The name a person gave the conversation - see AgentStream.customTitle. */
        val customTitle: String? = null,
        /** The pass met a rewind's mark, so the count may hold what the rewind took out - see [entryFor]. */
        val rewound: Boolean = false,
    ) {
        /** Which of the three names the history shows - see [Entry.titleSource]. */
        val titleSource: String
            get() = when {
                customTitle != null -> SessionSnapshot.TITLE_USER
                aiTitle != null -> SessionSnapshot.TITLE_LLM
                else -> SessionSnapshot.TITLE_HEURISTIC
            }
    }

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
        var customTitle: String? = null
        var messages = 0
        var rewound = false

        for (line in lines) {
            if (!line.startsWith("{")) continue

            if (!rewound && TranscriptRewinds.marks(line)) rewound = true

            // The CLI's own name repeats many times over through the file with the same value - we keep
            // the last one seen: if the conversation's topic has changed since, it has had time to
            // change too.
            val named = AgentStream.aiTitle(line)
            if (named != null) {
                aiTitle = named
                continue
            }

            // And the person's, by the same rule: the last one stands, and an empty one takes it back.
            val given = AgentStream.customTitle(line)
            if (given != null) {
                customTitle = given.ifEmpty { null }
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

        return Scan(title.ifEmpty { fallbackCommand }, messages, aiTitle, customTitle, rewound)
    }

    /**
     * Internal messages that look like a person's words in the transcript but are not: a slash
     * command's wrapping, the warning and output of a local command, a background task's notification.
     * None of them will do as a title literally: null means a real message from the person, not an
     * internal one; "" means internal, with nothing to show; a non-empty string is the command itself,
     * the one meaningful thing the wrapping holds.
     */
    internal fun serviceReplica(payload: JsonObject): String? {
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
    internal fun commandTitle(text: String): String {
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
    internal fun firstText(payload: JsonObject): String {
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

    /**
     * And the same as the feed draws it - see [drawsOwnRow]. One more than the list above: a reminder the
     * CLI writes to itself is a message the person never sent and never saw, but it is still one of the
     * conversation's own records, so the count in the history list leaves it alone (see SERVICE_BLOCK in
     * feed/build.ts).
     */
    private val UNDRAWN_CONTENT = SERVICE_CONTENT + "\"content\":\"<system-reminder>"

    private val SHELL_BLOCK =
        Regex("""<bash-(input|stdout|stderr|exit-code)>.*?</bash-\1>""", RegexOption.DOT_MATCHES_ALL)
    private val IMAGE_PLACEHOLDER = Regex("\\[Image #\\d+]")
    private val MULTIPLE_SPACES = Regex(" {2,}")
    private val COMMAND_NAME_TAG = Regex("""<command-name>(.*?)</command-name>""")
    private val COMMAND_MESSAGE_TAG = Regex("""<command-message>(.*?)</command-message>""")
    private val COMMAND_ARGS_TAG = Regex("""<command-args>(.*?)</command-args>""", RegexOption.DOT_MATCHES_ALL)
}

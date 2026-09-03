package io.github.crmapache.amazingclaudecode.search

import com.intellij.openapi.diagnostic.thisLogger
import io.github.crmapache.amazingclaudecode.claude.AgentStream
import io.github.crmapache.amazingclaudecode.claude.ClaudeHistory
import java.io.ByteArrayOutputStream
import java.io.File
import java.nio.charset.StandardCharsets
import java.nio.file.Files
import java.nio.file.Path
import java.nio.file.StandardCopyOption
import java.time.Instant
import java.time.ZoneId
import java.time.format.DateTimeFormatter
import kotlinx.serialization.json.Json
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.JsonPrimitive
import kotlinx.serialization.json.buildJsonObject
import kotlinx.serialization.json.contentOrNull
import kotlinx.serialization.json.jsonObject
import kotlinx.serialization.json.jsonPrimitive
import kotlinx.serialization.json.longOrNull
import kotlinx.serialization.json.put
import kotlinx.serialization.json.putJsonObject

/**
 * Everything one project's conversations said, kept where a search can reach it in a moment.
 *
 * The transcripts themselves cannot be searched as they lie: on this machine a heavy project is six
 * hundred megabytes of them, of which the words are four (see TranscriptText). So the words are taken
 * out once and kept - in memory for the search, and on disk beside the statistics so the next start of
 * the IDE does not read six hundred megabytes again. A transcript is only ever appended to, which is
 * what makes keeping up cheap: a file that grew is read from where the last reading stopped, and a
 * conversation under way costs the kilobytes it added rather than the megabytes it is.
 *
 * The copy on disk is a cache and is treated as one: a file that cannot be read is rebuilt from the
 * transcripts rather than complained about, and nothing anywhere depends on its being there.
 *
 * One instance per project, under one lock: refreshing and searching are both quick, and a search that
 * ran over a half-refreshed list would be the kind of fault nobody could reproduce.
 */
internal class SearchIndex(
    /** Where the copy lives - a folder of this project's own, see SearchDesk.directoryFor. */
    private val directory: Path,
    /** The transcripts of this project, asked for afresh on every refresh: a new conversation is a new file. */
    private val transcripts: () -> List<File>,
) {

    /** What was known about a transcript file when its words were last taken. */
    private data class Seen(val size: Long, val modified: Long, val offset: Long)

    private class Conversation(val id: String) {
        val messages = ArrayList<IndexedMessage>()
        var aiTitle: String? = null
        var firstText: String = ""
        var fallbackCommand: String = ""
        var seen = Seen(0, 0, 0)
        /**
         * What the copy on disk is good for - as far as the transcript had been read when it was last
         * written successfully. Behind [seen] while a write has failed, and that is what the manifest
         * records: an offset the copy has not caught up with would be read back as caught up, and the
         * messages of the failed write would never be found again (see [keep]).
         */
        var kept = Seen(0, 0, 0)
        /** The copy on disk is behind the words in memory - a write failed - and is rewritten whole next time. */
        var stale = false
        /** The index's version this conversation was last written into the model's corpus at. */
        var corpusVersion = -1L

        val title: String
            get() = aiTitle?.takeIf { it.isNotBlank() } ?: firstText.ifEmpty { fallbackCommand }.ifEmpty { "untitled" }

        val named: Boolean
            get() = !aiTitle.isNullOrBlank()
    }

    private val conversations = LinkedHashMap<String, Conversation>()

    /** Built when first asked for after a change, and dropped by the next change. */
    private var index: TextIndex? = null

    /** Moves on every change, so that whatever was built off the index knows whether it is current. */
    private var version = 0L

    private var loaded = false

    private var lastRefresh = 0L

    /** How many messages the index holds - for the tests and the diagnostics, never the words. */
    val size: Int
        @Synchronized get() {
            if (!loaded) load()
            return conversations.values.sumOf { it.messages.size }
        }

    /**
     * Bring the index up to date with the transcripts. Returns whether anything changed.
     *
     * Not more often than [REFRESH_INTERVAL_MS] unless [force]: a search that answers as one types would
     * otherwise stat two hundred files on every keystroke.
     */
    @Synchronized
    fun refresh(force: Boolean = false, now: Long = System.currentTimeMillis()): Boolean {
        if (!loaded) load()
        if (!force && now - lastRefresh < REFRESH_INTERVAL_MS) return false
        lastRefresh = now

        var changed = false
        val present = HashSet<String>()

        for (file in transcripts()) {
            val id = file.nameWithoutExtension
            present.add(id)

            val size = file.length()
            val modified = file.lastModified()
            val conversation = conversations[id]
            if (conversation != null && conversation.seen.size == size && conversation.seen.modified == modified) {
                // Nothing new in the transcript, but the copy on disk may still owe it a write.
                if (conversation.stale && keep(conversation)) manifestDue = true
                continue
            }

            val target = conversation ?: Conversation(id).also { conversations[id] = it }
            // The file only ever grows; when it did not, something rewrote it and it is read afresh.
            val appended = conversation != null && size >= conversation.seen.offset && conversation.seen.offset > 0
            if (!appended) {
                target.messages.clear()
                target.aiTitle = null
                target.firstText = ""
                target.fallbackCommand = ""
            }

            val from = if (appended) target.seen.offset else 0L
            val consumed = runCatching { read(file, from, target) }
                .onFailure { thisLogger().warn("Could not read the transcript $id for the search", it) }
                .getOrDefault(from)

            target.seen = Seen(size, modified, consumed)
            if (!appended) target.stale = true
            keep(target)
            changed = true
        }

        val gone = conversations.keys.filter { it !in present }
        for (id in gone) {
            conversations.remove(id)
            runCatching { Files.deleteIfExists(messagesFile(id)) }
            changed = true
        }

        if (changed) {
            version += 1
            index = null
        }
        if (changed || manifestDue) {
            manifestDue = false
            runCatching { storeManifest() }
                .onFailure { thisLogger().warn("Could not write the search manifest", it) }
        }

        return changed
    }

    /** The manifest owes the disk a write that no change of the index called for - a copy caught up late. */
    private var manifestDue = false

    /**
     * Write the conversation's words to the copy on disk, and only then say the copy has them.
     *
     * The mark of how far the copy reaches used to move before the write, and a write that failed - a
     * full disk, a file held by an antivirus, a moment of trouble in the file system - only left a line
     * in the log. The next start read a copy that stopped short and a manifest that said it did not, went
     * on from the manifest's mark, and the messages of the failed write were not in the search from then
     * on: nothing would ever read them again, and nothing said so. Now the mark follows the write. A
     * failed one leaves the conversation [Conversation.stale], the copy is written whole on the next
     * refresh - appending after a failed append could put half a line before the rest - and until it
     * succeeds the manifest keeps the mark the copy really reaches, so the next start reads on from
     * there, out of the transcript, exactly as a cache is supposed to be read.
     */
    private fun keep(conversation: Conversation): Boolean {
        val written = runCatching { store(conversation, rewrite = conversation.stale) }
            .onFailure { thisLogger().warn("Could not keep the search index for ${conversation.id}", it) }
            .isSuccess
        conversation.stale = !written
        if (written) conversation.kept = conversation.seen
        return written
    }

    /**
     * The messages matching [query]. [conversation] is the chat the window stands over - its matches are
     * counted apart from the rest, and with [onlyThatChat] the list holds nothing else (see TextIndex).
     */
    @Synchronized
    fun search(
        query: String,
        conversation: String?,
        onlyThatChat: Boolean,
        limit: Int,
        matchCase: Boolean = false,
        wholeWords: Boolean = false,
    ): Found {
        if (!loaded) load()
        val built = index ?: TextIndex(conversations.values.flatMap { it.messages }).also { index = it }
        return built.search(query, conversation, onlyThatChat, limit, matchCase, wholeWords)
    }

    /** One message by its names - how a hit the model found is turned into a hit the panel can show. */
    @Synchronized
    fun lookup(conversation: String, uuid: String): IndexedMessage? {
        if (!loaded) load()
        return conversations[conversation]?.messages?.firstOrNull { it.uuid == uuid }
    }

    @Synchronized
    fun titleOf(conversation: String): String {
        if (!loaded) load()
        return conversations[conversation]?.title ?: "untitled"
    }

    /** How many messages the conversation holds - what the list of results says under its title. */
    @Synchronized
    fun messagesIn(conversation: String): Int {
        if (!loaded) load()
        return conversations[conversation]?.messages?.size ?: 0
    }

    /** Whether the title is the model's own rather than a guess - see ClaudeHistory.Entry.named. */
    @Synchronized
    fun isNamed(conversation: String): Boolean {
        if (!loaded) load()
        return conversations[conversation]?.named ?: false
    }

    /**
     * The conversations as plain text, for the model to read: a folder of one file per conversation
     * and a list of them all. What the model searches is this and never the transcripts themselves -
     * those are megabyte-long lines of JSON, and a grep over them fills a context window with one hit.
     *
     * Written only for the conversations that changed since it was last written: the folder outlives
     * the run, and a project that has not moved costs nothing.
     */
    @Synchronized
    fun corpus(): Path {
        if (!loaded) load()
        val folder = directory.resolve(CORPUS_DIR)
        Files.createDirectories(folder)

        val wanted = HashSet<String>()
        for (conversation in conversations.values) {
            val name = "${conversation.id}.txt"
            wanted.add(name)
            if (conversation.corpusVersion == version && Files.exists(folder.resolve(name))) continue
            writeAtomically(folder.resolve(name), corpusText(conversation))
            conversation.corpusVersion = version
        }

        writeAtomically(folder.resolve(SESSIONS_FILE), sessionsText())
        wanted.add(SESSIONS_FILE)

        // A conversation whose transcript went away leaves the corpus too - a hit in it could not be opened.
        Files.list(folder).use { files ->
            files.filter { it.fileName.toString() !in wanted }.forEach { runCatching { Files.deleteIfExists(it) } }
        }

        return folder
    }

    private fun corpusText(conversation: Conversation): String = buildString {
        append("# ").append(conversation.title).append('\n')
        append("# conversation ").append(conversation.id).append('\n')
        for (message in conversation.messages) {
            append('\n')
            append("## ").append(message.uuid).append(' ')
            append(if (message.at > 0) Instant.ofEpochMilli(message.at).toString() else "-").append(' ')
            append(message.speaker.wire).append('\n')
            append(message.text).append('\n')
        }
    }

    private fun sessionsText(): String {
        val format = DateTimeFormatter.ofPattern("yyyy-MM-dd HH:mm").withZone(ZoneId.systemDefault())
        val when_ = { at: Long -> if (at > 0) format.format(Instant.ofEpochMilli(at)) else "-" }

        return buildString {
            append("# One line per conversation: id | first message .. last message | messages | title\n")
            append("# Every conversation is in <id>.txt; there each message starts with a header line: ## <uuid> <time> <you|claude>\n")
            conversations.values
                .filter { it.messages.isNotEmpty() }
                .sortedByDescending { it.messages.last().at }
                .forEach { conversation ->
                    append(conversation.id).append(" | ")
                    append(when_(conversation.messages.first().at)).append(" .. ")
                    append(when_(conversation.messages.last().at)).append(" | ")
                    append(conversation.messages.size).append(" | ")
                    append(conversation.title.replace('\n', ' ')).append('\n')
                }
        }
    }

    // --- Reading the transcripts ----------------------------------------------------

    /**
     * Read [file] from [from], line by line, and return where the last complete line ended.
     *
     * By bytes rather than through a reader, because the answer has to be a byte offset: the CLI is
     * writing the file while we read it, and the last line may be half there. That line is left for
     * the next reading, which starts exactly where this one stopped.
     */
    private fun read(file: File, from: Long, into: Conversation): Long {
        var consumed = from
        val line = ByteArrayOutputStream()
        val chunk = ByteArray(CHUNK_BYTES)

        Files.newInputStream(file.toPath()).use { input ->
            var skipped = 0L
            while (skipped < from) {
                val step = input.skip(from - skipped)
                if (step <= 0) break
                skipped += step
            }

            // By chunks rather than by bytes: a byte at a time through a stream is a method call per
            // byte, and a heavy project is six hundred million of them - measured here, that was most
            // of an eight-second first build.
            while (true) {
                val got = input.read(chunk)
                if (got < 0) break

                var start = 0
                for (index in 0 until got) {
                    if (chunk[index] != NEWLINE) continue
                    line.write(chunk, start, index - start)
                    consumed += line.size() + 1
                    take(into, line.toString(StandardCharsets.UTF_8))
                    line.reset()
                    start = index + 1
                }
                if (start < got) line.write(chunk, start, got - start)
            }
        }

        return consumed
    }

    /** One transcript line into the conversation: a message, a title, or nothing. */
    private fun take(conversation: Conversation, line: String) {
        val named = AgentStream.aiTitle(line)
        if (named != null) {
            // The CLI's own name repeats through the file; the last one seen is the current one.
            conversation.aiTitle = named
            return
        }

        val message = TranscriptText.messageOf(conversation.id, line) ?: return
        conversation.messages.add(message)

        // The title, by the history's own rule (see ClaudeHistory.scan): the person's first real words,
        // or the first command when there were none.
        if (message.speaker == Speaker.YOU && conversation.firstText.isEmpty()) {
            val payload = runCatching { Json.parseToJsonElement(line).jsonObject }.getOrNull() ?: return
            when (val wrapper = ClaudeHistory.serviceReplica(payload)) {
                null -> ClaudeHistory.firstText(payload).takeIf { it.isNotEmpty() }?.let { conversation.firstText = it }
                else -> if (wrapper.isNotEmpty() && conversation.fallbackCommand.isEmpty()) conversation.fallbackCommand = wrapper
            }
        }
    }

    // --- The copy on disk -------------------------------------------------------------

    private fun load() {
        loaded = true
        val manifest = runCatching { readManifest() }
            .onFailure { thisLogger().warn("The search manifest could not be read; rebuilding", it) }
            .getOrNull() ?: return

        for ((id, entry) in manifest) {
            val conversation = Conversation(id)
            conversation.seen = entry.seen
            conversation.kept = entry.seen
            conversation.aiTitle = entry.aiTitle
            conversation.firstText = entry.firstText
            conversation.fallbackCommand = entry.fallbackCommand

            val file = messagesFile(id)
            if (!Files.isRegularFile(file)) continue
            val ok = runCatching {
                Files.newBufferedReader(file, StandardCharsets.UTF_8).useLines { lines ->
                    for (line in lines) decodeMessage(id, line)?.let { conversation.messages.add(it) }
                }
            }.isSuccess
            // A copy that cannot be read is read again from the transcript, which is what a cache is for.
            if (!ok) {
                conversation.seen = Seen(0, 0, 0)
                conversation.kept = Seen(0, 0, 0)
            }

            conversations[id] = conversation
        }
    }

    private class ManifestEntry(val seen: Seen, val aiTitle: String?, val firstText: String, val fallbackCommand: String)

    private fun readManifest(): Map<String, ManifestEntry>? {
        val file = directory.resolve(MANIFEST_FILE)
        if (!Files.isRegularFile(file)) return null

        val root = Json.parseToJsonElement(Files.readString(file, StandardCharsets.UTF_8)).jsonObject
        if (root["format"]?.jsonPrimitive?.longOrNull != FORMAT) return null

        val files = root["files"]?.jsonObject ?: return null
        return files.entries.associate { (id, value) ->
            val entry = value.jsonObject
            id to ManifestEntry(
                seen = Seen(
                    size = entry["size"]?.jsonPrimitive?.longOrNull ?: 0,
                    modified = entry["modified"]?.jsonPrimitive?.longOrNull ?: 0,
                    offset = entry["offset"]?.jsonPrimitive?.longOrNull ?: 0,
                ),
                aiTitle = entry["aiTitle"]?.jsonPrimitive?.contentOrNull,
                firstText = entry["firstText"]?.jsonPrimitive?.contentOrNull.orEmpty(),
                fallbackCommand = entry["fallbackCommand"]?.jsonPrimitive?.contentOrNull.orEmpty(),
            )
        }
    }

    private fun storeManifest() {
        val text = buildJsonObject {
            put("format", FORMAT)
            putJsonObject("files") {
                for (conversation in conversations.values) {
                    putJsonObject(conversation.id) {
                        // How far the copy on disk reaches, not how far the reading did - see [keep].
                        put("size", conversation.kept.size)
                        put("modified", conversation.kept.modified)
                        put("offset", conversation.kept.offset)
                        conversation.aiTitle?.let { put("aiTitle", it) }
                        if (conversation.firstText.isNotEmpty()) put("firstText", conversation.firstText)
                        if (conversation.fallbackCommand.isNotEmpty()) put("fallbackCommand", conversation.fallbackCommand)
                    }
                }
            }
        }.toString()

        writeAtomically(directory.resolve(MANIFEST_FILE), text)
    }

    /** The conversation's messages on disk - whole when [rewrite], else only what the last reading added. */
    private fun store(conversation: Conversation, rewrite: Boolean) {
        Files.createDirectories(directory)
        val file = messagesFile(conversation.id)

        if (rewrite || !Files.isRegularFile(file)) {
            writeAtomically(file, conversation.messages.joinToString("") { encodeMessage(it) + "\n" })
            return
        }

        // Only the lines the transcript grew by: what the copy already holds is the head of the list, so
        // the tail past it is exactly what this reading added.
        val known = countLines(file)
        val tail = conversation.messages.drop(known.coerceAtMost(conversation.messages.size))
        if (tail.isEmpty()) return
        Files.write(
            file,
            tail.joinToString("") { encodeMessage(it) + "\n" }.toByteArray(StandardCharsets.UTF_8),
            java.nio.file.StandardOpenOption.APPEND,
        )
    }

    private fun countLines(file: Path): Int =
        Files.newBufferedReader(file, StandardCharsets.UTF_8).useLines { lines -> lines.count() }

    private fun encodeMessage(message: IndexedMessage): String = buildJsonObject {
        put("u", message.uuid)
        put("t", message.at)
        put("s", message.speaker.wire)
        put("x", message.text)
    }.toString()

    private fun decodeMessage(conversation: String, line: String): IndexedMessage? {
        val entry = runCatching { Json.parseToJsonElement(line).jsonObject }.getOrNull() ?: return null
        val uuid = (entry["u"] as? JsonPrimitive)?.contentOrNull ?: return null
        val speaker = Speaker.entries.firstOrNull { it.wire == (entry["s"] as? JsonPrimitive)?.contentOrNull } ?: return null
        val text = (entry["x"] as? JsonPrimitive)?.contentOrNull ?: return null
        return IndexedMessage(conversation, uuid, entry["t"]?.jsonPrimitive?.longOrNull ?: 0L, speaker, text)
    }

    private fun messagesFile(id: String): Path = directory.resolve("$id.jsonl")

    private fun writeAtomically(file: Path, text: String) {
        Files.createDirectories(file.parent)
        val temporary = file.resolveSibling("${file.fileName}.tmp")
        Files.write(temporary, text.toByteArray(StandardCharsets.UTF_8))
        runCatching {
            Files.move(temporary, file, StandardCopyOption.REPLACE_EXISTING, StandardCopyOption.ATOMIC_MOVE)
        }.recover {
            Files.move(temporary, file, StandardCopyOption.REPLACE_EXISTING)
        }.getOrThrow()
    }

    companion object {
        /** The shape of the copy on disk; a change here rebuilds every project's copy from the transcripts. */
        const val FORMAT = 1L

        const val MANIFEST_FILE = "manifest.json"
        const val CORPUS_DIR = "corpus"
        const val SESSIONS_FILE = "sessions.txt"

        /** How long a refresh is trusted for - a search that answers as one types asks many times a second. */
        const val REFRESH_INTERVAL_MS = 1_500L

        private const val CHUNK_BYTES = 1 shl 18

        private const val NEWLINE = '\n'.code.toByte()

        /** The transcripts of a project, as the history finds them: top-level files only, no subagents. */
        fun transcriptsOf(workingDirectory: String?): List<File> =
            ClaudeHistory.directoriesFor(workingDirectory)
                .flatMap { directory -> (directory.listFiles { file -> file.isFile && file.extension == "jsonl" } ?: emptyArray()).asList() }
                .distinctBy { it.nameWithoutExtension }
    }
}

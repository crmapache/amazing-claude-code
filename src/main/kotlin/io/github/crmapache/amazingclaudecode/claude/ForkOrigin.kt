package io.github.crmapache.amazingclaudecode.claude

import java.io.File
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.JsonPrimitive
import kotlinx.serialization.json.booleanOrNull
import kotlinx.serialization.json.buildJsonObject
import kotlinx.serialization.json.contentOrNull
import kotlinx.serialization.json.put

/**
 * Where a fork comes from: the conversation it branched off, and the line of that conversation's transcript
 * it ends on.
 *
 * Fixed the moment the fork is made, not when its process first comes up - and that is the whole point. A
 * fork's process is raised by its first message, which may come minutes after the button was pressed, and a
 * fork of the whole conversation used to carry whatever the parent held by THEN: a parent still working put
 * its later turns into the fork, past everything the person saw when they pressed. Now that the fork's feed
 * shows what it inherited (see ForkLineage), that would be a feed lying about what the agent remembers. So
 * the end is pinned at the press and handed to the CLI by `--resume-session-at` for the whole conversation
 * too (see ClaudeSession.start).
 *
 * Kept beside the fork as long as it lives: by the tab before its first message (see TabMemory.Tab), and by
 * the book after it (see ForkBook) - its transcript holds the inherited lines but never says where its own
 * begin, and the seam in the feed has to stand there after a restart, in a conversation opened from the
 * history and on a phone.
 */
internal data class ForkOrigin(
    /** The conversation forked. */
    val source: String,
    /** Its name when the fork was made - what the seam in the fork's feed calls it. */
    val title: String,
    /** Forked from a chosen message rather than whole - the seam says which (see feed/build.ts). */
    val cut: Boolean,
    /**
     * The last line of [source]'s transcript the fork carries - what `--resume-session-at` is given, and
     * where the seam stands. Null when the fork carries nothing at all: one made from the very first
     * message, or of a conversation nothing was said in yet.
     */
    val at: String?,
) {
    fun json(): JsonObject = buildJsonObject {
        put("source", source)
        put("title", title)
        put("cut", cut)
        at?.let { put("at", it) }
    }

    /**
     * The seam as a line of the conversation's history: where a fork's own part begins, read and paged like
     * any other line (see ClaudeHistory.page) and drawn by the feed as the fork's mark.
     *
     * A line rather than a message of its own because a line is what every road to the feed already
     * carries in order: the replay into a tab, a page of history and the tail handed to a phone. A mark sent
     * beside them would have to be put in its place three times over. Its type is the first key, which is
     * what tells it apart cheaply ([isSeam]); it has no uuid, so no page can begin on it or be asked for by it.
     */
    fun seamLine(): String = buildJsonObject {
        put("type", SEAM_TYPE)
        put("source", source)
        put("title", title)
        put("cut", cut)
    }.toString()

    /** A fork worked out against its source - and whether the message it was to stop at was not found. */
    data class Resolved(val origin: ForkOrigin?, val missed: Boolean = false)

    companion object {
        const val SEAM_TYPE = "fork_seam"

        /**
         * A fork asked to stop at a message came up with the whole conversation instead - see [resolve] and
         * ClaudeSession.forkLaunch. A code rather than a sentence: the panel words it in the person's language
         * (see errorWords in webview/src/components/items/Rows.tsx).
         */
        const val WHOLE = "FORK_WHOLE"

        private const val SEAM_PREFIX = "{\"type\":\"$SEAM_TYPE\""

        fun isSeam(line: String): Boolean = line.startsWith(SEAM_PREFIX)

        fun decode(json: JsonObject?): ForkOrigin? {
            if (json == null) return null
            val source = json.text("source")?.takeIf(Rewind::isUuid) ?: return null
            val at = json.text("at")
            if (at != null && !Rewind.isUuid(at)) return null

            return ForkOrigin(
                source = source,
                title = json.text("title").orEmpty(),
                cut = (json["cut"] as? JsonPrimitive)?.booleanOrNull ?: false,
                at = at,
            )
        }

        /**
         * A fork of [source] worked out against its transcript: of the whole conversation when [before] is
         * null, otherwise up to and not including that message (see TranscriptRewinds.anchorBefore).
         *
         * A message the transcript does not hold may still be the conversation's own: one inherited from the
         * conversation it was itself forked from, before a compaction, lives only in THAT transcript (see
         * ForkLineage). It is looked for there, and the fork is then a fork of that conversation - which is
         * exactly what the person forked. Found nowhere, the fork carries the whole conversation and says so
         * ([Resolved.missed]): a fork that quietly holds the turns somebody forked to get away from is the one
         * outcome worse than an explained one.
         */
        fun resolve(
            transcript: (String) -> File?,
            origins: (String) -> ForkOrigin?,
            source: String,
            title: String,
            before: String?,
        ): Resolved = resolve(transcript, origins, source, title, before, depth = 0)

        private fun resolve(
            transcript: (String) -> File?,
            origins: (String) -> ForkOrigin?,
            source: String,
            title: String,
            before: String?,
            depth: Int,
        ): Resolved {
            // Nothing on disk is nothing to carry - and nothing to resume either: the CLI refuses a
            // conversation it has no file for (see ClaudeSessions.moveTo).
            val file = transcript(source) ?: return Resolved(ForkOrigin(source, title, cut = before != null, at = null))

            if (before == null) return Resolved(ForkOrigin(source, title, cut = false, at = leafOf(file)))

            val anchor = runCatching { file.useLines { TranscriptRewinds.anchorBefore(it, before) } }
                .getOrDefault(TranscriptRewinds.Anchor.NotFound)

            return when (anchor) {
                TranscriptRewinds.Anchor.Start -> Resolved(ForkOrigin(source, title, cut = true, at = null))
                is TranscriptRewinds.Anchor.At ->
                    Resolved(ForkOrigin(source, title, cut = true, at = resumable(file, anchor.uuid)))
                TranscriptRewinds.Anchor.NotFound -> {
                    val older = origins(source)
                        ?.takeIf { depth < MAX_DEPTH }
                        ?.let { resolve(transcript, origins, it.source, it.title, before, depth + 1) }
                        ?.takeIf { !it.missed }

                    older ?: Resolved(ForkOrigin(source, title, cut = false, at = leafOf(file)), missed = true)
                }
            }
        }

        /**
         * Where the conversation in [file] goes on from right now: the last line of its chain, past whatever a
         * rewind took out - the line the next message would hang off, and so the end of a fork of all of it.
         * Null when the file holds no line of the chain at all.
         */
        fun leafOf(file: File): String? = runCatching {
            val cut = TranscriptRewinds.cutLines(file)
            file.useLines { lines -> Chain().run { TranscriptRewinds.alive(lines, cut).forEach(::add); resumable(last) } }
        }.getOrNull()

        /** [uuid], or the nearest line above it a fork can be cut at - see [Chain.resumable]. */
        private fun resumable(file: File, uuid: String): String? = runCatching {
            file.useLines { lines -> Chain().apply { lines.forEach(::add) }.resumable(uuid) }
        }.getOrDefault(uuid)

        /** How far back through forks of forks a message is looked for - see [resolve]. */
        private const val MAX_DEPTH = 16

        private fun JsonObject.text(key: String): String? = (this[key] as? JsonPrimitive)?.takeIf { it.isString }?.contentOrNull
    }

    /**
     * What one pass over a transcript learns about the lines a fork may end on.
     *
     * `--resume-session-at` is strict: a uuid the CLI does not hold among the messages it resumes is refused
     * outright ("No message found with message.uuid of"), and the process exits - a fork that never comes up
     * at all. Measured on 2.1.280: an answer, a tool's call left without its result, the result itself, an
     * attachment and the hook summary closing a turn are all taken, and the fork carries exactly the chain up
     * to that line. The CLI's other system lines (an API error, a local command's output) were never measured,
     * so a fork does not end on one: it steps up to the nearest line above that was.
     */
    private class Chain {
        val parents = HashMap<String, String?>()
        val doubtful = HashSet<String>()

        /** The last line of the main chain - a subagent's lines in an old transcript are not where it goes on. */
        var last: String? = null

        fun add(line: String) {
            if (!line.startsWith(PARENT_KEY)) return
            val uuid = TranscriptRewinds.uuidOf(line) ?: return

            parents[uuid] = TranscriptRewinds.parentOf(line)
            if ((line.contains(SYSTEM) && !line.contains(HOOK_SUMMARY)) || line.contains(PROGRESS)) doubtful += uuid
            if (!line.contains(SIDECHAIN)) last = uuid
        }

        fun resumable(uuid: String?): String? {
            var at = uuid
            val seen = HashSet<String>()
            while (at != null && at in doubtful && seen.add(at)) at = parents[at]
            return at
        }

        private companion object {
            const val PARENT_KEY = "{\"parentUuid\":"
            const val SYSTEM = "\"type\":\"system\""
            const val HOOK_SUMMARY = "\"subtype\":\"stop_hook_summary\""
            const val PROGRESS = "\"type\":\"progress\""
            const val SIDECHAIN = "\"isSidechain\":true"
        }
    }
}

package io.github.crmapache.amazingclaudecode.claude

import com.intellij.openapi.diagnostic.thisLogger
import io.github.crmapache.amazingclaudecode.scenario.ScenarioFile
import java.util.concurrent.ConcurrentHashMap
import kotlinx.serialization.json.Json
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.buildJsonObject
import kotlinx.serialization.json.jsonObject
import kotlinx.serialization.json.put
import kotlinx.serialization.json.putJsonObject

/**
 * Which of this project's conversations are forks, and of what - by the fork's own conversation id.
 *
 * The CLI does not say. A fork's transcript holds what it inherited under the same uuids its source has, and
 * nothing in it marks where the fork's own part begins or which conversation the rest came from (checked on
 * 2.1.280). The panel knows both at the moment the fork is born, and this is where it puts them down: the
 * seam in the feed has to stand in its place long after the tab that made the fork is gone - after a restart,
 * in a conversation opened from the history, on a phone - and a fork of a compacted conversation has to reach
 * back into its source for what its own transcript was never given (see ForkLineage).
 *
 * One small file per project, machine-wide rather than per IDE, beside the scenarios' books and by their rules
 * (see ScenarioFile): two IDEs open on one project read the same transcripts and owe them the same answer.
 */
internal class ForkBook(private val store: ScenarioFile) {

    /** The ordinary way in: this machine's book for this project. */
    constructor(workingDirectory: String?) : this(ScenarioFile.of(FOLDER, workingDirectory, FILE))

    /** Where [conversationId] was forked from - null for a conversation that is no fork, or one made before this book. */
    fun origin(conversationId: String): ForkOrigin? = all()[conversationId]

    /**
     * A fork has been born - said the moment its process names its conversation (see ClaudeSession.start).
     *
     * A fork raised again before anything was said in it is born again under a new id; the old entry then
     * names a conversation that never reached the disk, and costs a line until the cap takes it.
     */
    fun remember(conversationId: String, origin: ForkOrigin) {
        if (!Rewind.isUuid(conversationId)) return

        store.underLock {
            val known = when (val stored = store.read()) {
                ScenarioFile.Stored.Missing -> emptyMap()
                // Not written over: an unreadable book is somebody's forks, and the next good read gets them back.
                ScenarioFile.Stored.Unreadable -> return@underLock
                is ScenarioFile.Stored.Text -> decode(stored.text) ?: return@underLock
            }
            if (known[conversationId] == origin) return@underLock

            val kept = (known - conversationId).toList().takeLast(LIMIT - 1) + (conversationId to origin)
            store.put(
                buildJsonObject {
                    put("version", VERSION)
                    putJsonObject("forks") { for ((id, fork) in kept) put(id, fork.json()) }
                }.toString(),
            )
        }
    }

    /**
     * The whole book, read again only when the file changed: a page of history asks it once for every
     * transcript the page reaches into, and the answer is the same nearly always.
     */
    private fun all(): Map<String, ForkOrigin> {
        val file = store.file
        val stamp = file.lastModified() to file.length()
        read[file.path]?.takeIf { it.first == stamp }?.let { return it.second }

        val book = when (val stored = store.read()) {
            is ScenarioFile.Stored.Text -> decode(stored.text).orEmpty()
            else -> emptyMap()
        }
        read[file.path] = stamp to book
        return book
    }

    private fun decode(text: String): Map<String, ForkOrigin>? = runCatching {
        val forks = Json.parseToJsonElement(text).jsonObject["forks"] as? JsonObject ?: return@runCatching emptyMap()
        forks.mapNotNull { (id, fork) -> ForkOrigin.decode(fork as? JsonObject)?.let { id to it } }.toMap(LinkedHashMap())
    }.onFailure { thisLogger().warn("Could not read the fork book", it) }.getOrNull()

    private companion object {
        const val FOLDER = "forks"
        const val FILE = "forks.json"
        const val VERSION = 1

        /**
         * The newest forks kept, the oldest dropped. A fork thousands of forks old still opens - only without
         * its seam, the way every fork made before this book does.
         */
        const val LIMIT = 4_000

        val read = ConcurrentHashMap<String, Pair<Pair<Long, Long>, Map<String, ForkOrigin>>>()
    }
}

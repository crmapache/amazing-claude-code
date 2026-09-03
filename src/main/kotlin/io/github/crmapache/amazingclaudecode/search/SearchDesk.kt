package io.github.crmapache.amazingclaudecode.search

import com.intellij.execution.process.ProcessHandler
import com.intellij.openapi.application.ApplicationManager
import com.intellij.openapi.diagnostic.thisLogger
import com.intellij.openapi.project.Project
import io.github.crmapache.amazingclaudecode.claude.ClaudeHistory
import io.github.crmapache.amazingclaudecode.claude.ClaudeSessionHub
import io.github.crmapache.amazingclaudecode.feedback.DiagnosticsLog
import io.github.crmapache.amazingclaudecode.stats.StatsLedger
import com.intellij.util.concurrency.AppExecutorUtil
import java.nio.file.Path
import java.util.concurrent.TimeUnit
import kotlinx.serialization.json.add
import kotlinx.serialization.json.addJsonArray
import kotlinx.serialization.json.addJsonObject
import kotlinx.serialization.json.buildJsonObject
import kotlinx.serialization.json.put
import kotlinx.serialization.json.putJsonArray
import kotlinx.serialization.json.putJsonObject

/**
 * The search over one project's conversations, as the clients see it: a request in, a list of hits
 * out, addressed to whoever asked (see ClaudeSessionHub.emitTo - what somebody is looking for is of no
 * interest to the other windows on the project).
 *
 * Three requests and one answer. A typed query is matched against the index (see SearchIndex and
 * TextIndex), in one conversation or in all of them; a described one is handed to a model with the
 * conversations as plain text (see AiSearch); and the model's run can be taken back. The answer is one
 * shape for all three, so the screen that lists the hits is one screen.
 *
 * Everything here runs off the thread the request came in on: the index reads the disk, and the model
 * runs a process.
 */
internal class SearchDesk(private val project: Project, private val hub: ClaudeSessionHub) {

    private val index: SearchIndex by lazy {
        SearchIndex(directoryFor(project), transcripts = { SearchIndex.transcriptsOf(project.basePath) })
    }

    /**
     * The model's runs, by the request's number - what a cancel names. Known from the moment they are
     * asked rather than from the moment their process starts: the seconds between the two are exactly
     * when a person changes their mind (see AiRuns).
     */
    private val runs = AiRuns<ProcessHandler> { it.destroyProcess() }

    /** What the window's tabs and its field's counter say - see the answer below. */
    private data class Counts(val chat: Int = 0, val project: Int = 0, val conversations: Int = 0)

    init {
        /*
         * The first build of a project's index reads its transcripts whole - six hundred megabytes on this
         * machine, a few seconds even by chunks - and paid at the first keystroke that would be a search
         * that answers nothing for as long. So it is paid here, a little after the project opens, off any
         * thread anybody is waiting on. Every later start reads the copy on disk instead (see SearchIndex).
         */
        AppExecutorUtil.getAppScheduledExecutorService().schedule(
            {
                runCatching { index.refresh(force = true) }
                    .onFailure { thisLogger().warn("The search index could not be warmed up", it) }
            },
            WARM_UP_DELAY_SECONDS,
            TimeUnit.SECONDS,
        )
    }

    /**
     * A typed query. [scope] is "chat" for the conversation in the tab [sessionId], anything else for the
     * project. [matchCase] and [wholeWords] are the field's two switches (see TextIndex.search).
     *
     * Both counts travel back whatever the scope: the window's tabs carry one each, and a person decides
     * which list to look at by them (see Search.tsx). They come out of one search rather than two - the
     * scoring is the same work for either scope (see TextIndex.search).
     */
    fun find(
        clientId: String,
        asker: String,
        id: String,
        sessionId: String,
        scope: String,
        query: String,
        matchCase: Boolean = false,
        wholeWords: Boolean = false,
    ) {
        if (id.isBlank()) return
        val local = hub.isLocal(clientId)
        val onlyThatChat = scope == SCOPE_CHAT
        val conversation = hub.conversations.conversationIdOf(sessionId)

        ApplicationManager.getApplication().executeOnPooledThread {
            runCatching {
                index.refresh()
                val found = index.search(query, conversation, onlyThatChat, if (local) LIMIT_LOCAL else LIMIT_REMOTE, matchCase, wholeWords)
                answer(
                    clientId,
                    asker,
                    id,
                    found.hits.map { hitJson(it, local) },
                    found.terms,
                    counts = Counts(found.chatTotal, found.total, found.conversations),
                    total = if (onlyThatChat) found.chatTotal else found.total,
                )
            }.onFailure {
                thisLogger().warn("The search failed", it)
                DiagnosticsLog.note(DiagnosticsLog.SEARCH, "a search failed (${it::class.simpleName ?: "unknown failure"})")
                answer(clientId, asker, id, emptyList(), emptyList(), error = "The search failed: ${it.message ?: "unknown error"}")
            }
        }
    }

    /** A described query, for the model. */
    fun ask(clientId: String, asker: String, id: String, query: String) {
        if (id.isBlank()) return
        val local = hub.isLocal(clientId)
        runs.asked(id)

        ApplicationManager.getApplication().executeOnPooledThread {
            val corpus = runCatching {
                index.refresh(force = true)
                index.corpus()
            }.getOrElse {
                thisLogger().warn("The corpus for the model's search could not be written", it)
                if (runs.finished(id)) return@executeOnPooledThread
                answer(clientId, asker, id, emptyList(), emptyList(), error = "The conversations could not be prepared for the search.")
                return@executeOnPooledThread
            }

            // Taken back while the corpus was being written: the run is not started at all. Started, it
            // would work to the end and be paid for, and its answer would be thrown away by a window that
            // had moved on the moment Cancel was pressed.
            if (runs.isCancelled(id)) {
                runs.finished(id)
                return@executeOnPooledThread
            }

            DiagnosticsLog.note(DiagnosticsLog.SEARCH, "a model search started")
            AiSearch.find(
                corpus,
                query,
                onStarted = { handler -> runs.started(id, handler) },
                onStep = { step -> if (!runs.isCancelled(id)) sendStep(clientId, asker, id, step) },
                onError = { message ->
                    if (runs.finished(id)) return@find
                    DiagnosticsLog.note(DiagnosticsLog.SEARCH, "a model search failed")
                    answer(clientId, asker, id, emptyList(), emptyList(), error = shortError(message))
                },
                onResult = { picked ->
                    if (runs.finished(id)) return@find
                    DiagnosticsLog.note(DiagnosticsLog.SEARCH, "a model search found ${picked.size}")
                    val hits = picked.mapNotNull { hit ->
                        // The model names a message; the index says what it is. One it cannot find was
                        // invented, and an invented hit opens nothing.
                        index.lookup(hit.conversation, hit.uuid)?.let { message ->
                            val (snippet, spans) = Snippets.around(message.text, emptyMap())
                            hitJson(Hit(message, 0.0, snippet, spans), local, hit.reason)
                        }
                    }
                    answer(clientId, asker, id, hits, emptyList())
                },
            )
        }
    }

    /**
     * The person pressed Cancel on the model's search: the process goes, and its answer with it - or, if
     * there is no process yet, it never comes (see AiRuns).
     */
    fun cancel(id: String) {
        runs.cancel(id)
    }

    private fun answer(
        clientId: String,
        asker: String,
        id: String,
        hits: List<kotlinx.serialization.json.JsonObject>,
        /** The words the feed paints, each with how far - see Painted. */
        terms: List<Painted>,
        /** How many matched in this chat and in the project - the numbers on the window's tabs. */
        counts: Counts = Counts(),
        /** How many matched in the scope that was asked for, before the list was cut to its limit. */
        total: Int = hits.size,
        error: String? = null,
    ) {
        hub.emitTo(
            clientId,
            buildJsonObject {
                put("type", "searchResults")
                put("id", id)
                putJsonArray("hits") { hits.forEach { add(it) } }
                putJsonArray("terms") {
                    for (painted in terms) addJsonObject {
                        put("term", painted.term)
                        put("paint", painted.paint)
                        painted.text?.let { put("text", it) }
                        if (painted.whole) put("whole", true)
                    }
                }
                putJsonObject("counts") {
                    put("chat", counts.chat)
                    put("project", counts.project)
                    put("conversations", counts.conversations)
                }
                put("total", total)
                error?.let { put("error", it) }
            }.toString(),
            asker,
        )
    }

    /**
     * One step of the model's search, on its way to the window (see AiStep).
     *
     * A conversation is named by its title rather than by the file the model opened: the id is this
     * side's business, and a line of hexadecimal in a progress list tells nobody anything.
     */
    private fun sendStep(clientId: String, asker: String, id: String, step: AiStep) {
        val subject = when (step.kind) {
            AiStep.Kind.READ -> index.titleOf(step.subject)
            else -> step.subject
        }

        hub.emitTo(
            clientId,
            buildJsonObject {
                put("type", "searchProgress")
                put("id", id)
                put("kind", step.kind.wire)
                put("subject", subject)
            }.toString(),
            asker,
        )
    }

    private fun hitJson(hit: Hit, local: Boolean, reason: String? = null) = buildJsonObject {
        val message = hit.message
        val budget = if (local) TEXT_LOCAL else TEXT_REMOTE
        put("conversationId", message.conversation)
        put("uuid", message.uuid)
        put("speaker", message.speaker.wire)
        put("at", message.at)
        put("title", index.titleOf(message.conversation))
        put("named", index.isNamed(message.conversation))
        // What the list says under a conversation's title when it groups by conversation.
        put("messages", index.messagesIn(message.conversation))
        put("snippet", hit.snippet)
        putJsonArray("spans") {
            for (span in hit.spans) addJsonArray { add(span.first); add(span.last + 1) }
        }
        put("text", message.text.take(budget))
        put("truncated", message.text.length > budget)
        // The whole message's length, so an unfolded one can say how much of it is on screen.
        put("length", message.text.length)
        reason?.takeIf { it.isNotBlank() }?.let { put("reason", it) }
    }

    /** The CLI can be verbose when it is unhappy; the strip above the results has room for one line. */
    private fun shortError(message: String): String {
        val line = message.lineSequence().map { it.trim() }.firstOrNull { it.isNotEmpty() } ?: "The search failed."
        return if (line.length > ERROR_LIMIT) "${line.take(ERROR_LIMIT)}…" else line
    }

    companion object {
        const val SCOPE_CHAT = "chat"

        /** How many hits a list is worth: past fifty nobody reads on, and a phone's frame has a cap. */
        const val LIMIT_LOCAL = 50
        const val LIMIT_REMOTE = 30

        /** How much of a message travels with its hit - enough to read it in the list before opening it. */
        const val TEXT_LOCAL = 3_000
        const val TEXT_REMOTE = 1_200

        private const val ERROR_LIMIT = 160

        /** Late enough not to compete with the IDE's own opening of the project, early enough to be done before anybody searches. */
        private const val WARM_UP_DELAY_SECONDS = 20L

        /**
         * Where a project's index lives: beside the statistics, in a folder named as Claude Code names the
         * project's own folder (see ClaudeHistory.slugFor), so two IDEs on one project share one copy.
         */
        fun directoryFor(project: Project): Path =
            StatsLedger.directory().resolve("search").resolve(ClaudeHistory.slugFor(project.basePath ?: project.name))
    }
}

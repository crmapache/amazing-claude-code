package io.github.crmapache.amazingclaudecode.claude

import com.intellij.openapi.Disposable
import com.intellij.openapi.application.PathManager
import com.intellij.openapi.diagnostic.thisLogger
import com.intellij.openapi.util.Disposer
import com.intellij.util.Alarm
import java.io.File
import java.nio.file.AtomicMoveNotSupportedException
import java.nio.file.Files
import java.nio.file.StandardCopyOption
import java.security.MessageDigest
import kotlinx.serialization.json.Json
import kotlinx.serialization.json.JsonArray
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.JsonPrimitive
import kotlinx.serialization.json.addJsonObject
import kotlinx.serialization.json.buildJsonObject
import kotlinx.serialization.json.contentOrNull
import kotlinx.serialization.json.jsonObject
import kotlinx.serialization.json.jsonPrimitive
import kotlinx.serialization.json.put
import kotlinx.serialization.json.putJsonArray

/**
 * The tabs a project had open, kept on disk so that they come back when it is opened again.
 *
 * Asked for in so many words: close the IDE - or lose it to a crash, a force-quit, a dead battery - and the
 * conversations that were open, and the half-written prompt in one of them, are gone from the panel. The
 * conversations themselves never were gone (the CLI keeps every transcript), only the list of which ones
 * were on the strip, and the draft, which lived in the page and nowhere else.
 *
 * Written on every change rather than when the project closes, and that is the whole point of the
 * design: a close is the one moment of a crash that never comes. A change is remembered at once and put
 * on disk a moment later ([WRITE_DELAY_MS]), so a burst of changes - a tab opened, named, given a model -
 * is one write, and what is lost to a kill is at most the last fraction of a second.
 *
 * The file is replaced whole through a sibling and a move, never written over in place: a process killed
 * halfway through a write in place leaves half a file, and half a file restores nothing.
 *
 * It lives in the IDE's system folder rather than in the project: a list of one's open conversations and
 * a draft of what one was about to ask are nobody else's business, and a plugin writing into a working
 * copy is a plugin one notices in `git status`.
 */
internal class TabMemory(
    private val file: File,
    parentDisposable: Disposable,
) : Disposable {

    /** One tab as it is kept - enough to put it back where it stood, holding what it held. */
    data class Tab(
        val id: String,
        /** The tab it was forked from, if it was and that tab is kept too - see [restorable]. */
        val parentId: String?,
        val title: String,
        val titleSource: String,
        /** The conversation it held, if one had been born in it. */
        val conversationId: String?,
        /** What it ran on - put back rather than re-read from the transcript (see ClaudeSessionHub.restoreTabs). */
        val model: String,
        val effort: String,
        val mode: String,
        /** What was being written in its input field, as the panel sent it (see draftMemory.ts). */
        val draft: JsonObject?,
    )

    data class State(
        /** The tab the panel had on screen - it comes back on screen. */
        val active: String?,
        val tabs: List<Tab>,
    )

    private val alarm = Alarm(Alarm.ThreadToUse.POOLED_THREAD, this)

    /** What is to be written next, and what the file holds now - so an unchanged list costs nothing. */
    private var pending: String? = null
    private var written: String? = null

    /** The project is closing: nothing more is taken, and what is waiting goes to disk now. */
    @Volatile
    private var closed = false

    init {
        Disposer.register(parentDisposable, this)
    }

    /**
     * The tabs as they stand now, to be put on disk a moment later.
     *
     * Encoded here, on the caller's thread and at the moment of the change, rather than when the write
     * comes round: by then the project may be closing and the conversations already taken down, and a
     * list read off them in that state is a list of empty tabs written over the real one.
     */
    fun remember(state: State) {
        if (closed) return

        val text = encode(state)
        synchronized(this) {
            if (text == pending || (pending == null && text == written)) return
            pending = text
        }

        alarm.cancelAllRequests()
        alarm.addRequest(::flush, WRITE_DELAY_MS)
    }

    /** What the file holds - nothing when there is no file, or none this version can read. */
    fun load(): State? = runCatching { if (file.isFile) decode(file.readText()) else null }
        .onFailure { thisLogger().warn("The remembered tabs could not be read", it) }
        .getOrNull()
        ?.also { synchronized(this) { written = encode(it) } }

    /**
     * Forget the tabs altogether - the setting has just been switched off. Deleted rather than left
     * standing: "don't bring my tabs back" is also "don't keep what I was typing", and a file of drafts
     * nobody will ever be shown is exactly what should not be lying about.
     */
    fun forget() {
        alarm.cancelAllRequests()
        synchronized(this) {
            pending = null
            written = null
            runCatching { file.delete() }
        }
    }

    private fun flush() {
        val text = synchronized(this) { pending.also { pending = null } } ?: return

        synchronized(this) {
            if (text == written) return
            runCatching { replace(text) }
                .onSuccess { written = text }
                .onFailure { thisLogger().warn("The open tabs could not be remembered", it) }
        }
    }

    private fun replace(text: String) {
        file.parentFile?.mkdirs()
        val next = File(file.parentFile, "${file.name}.next")
        next.writeText(text)

        try {
            Files.move(next.toPath(), file.toPath(), StandardCopyOption.REPLACE_EXISTING, StandardCopyOption.ATOMIC_MOVE)
        } catch (_: AtomicMoveNotSupportedException) {
            Files.move(next.toPath(), file.toPath(), StandardCopyOption.REPLACE_EXISTING)
        }
    }

    override fun dispose() {
        closed = true
        alarm.cancelAllRequests()
        flush()
    }

    companion object {

        /** Long enough to fold a burst of changes into one write, short enough that a kill loses nothing felt. */
        private const val WRITE_DELAY_MS = 400

        /**
         * The largest draft kept on disk. A pasted log folded into a chip can be long, and that is fine;
         * a draft past this is a paste of a whole file of data, which the panel keeps for as long as it is
         * open but which is not worth a file of megabytes rewritten on every keystroke.
         */
        private const val MAX_DRAFT_CHARS = 1_000_000

        private const val VERSION = 1

        /**
         * The file for a project: its name, readable in a listing, and a hash of its path, which is what
         * tells two checkouts of one repository apart.
         */
        fun fileFor(basePath: String?, root: File = File(PathManager.getSystemPath(), "amazing-claude-code/tabs")): File {
            val path = basePath.orEmpty()
            val name = File(path).name.replace(Regex("[^A-Za-z0-9._-]"), "_").take(40).ifEmpty { "project" }
            val hash = MessageDigest.getInstance("SHA-256").digest(path.toByteArray())
                .take(8)
                .joinToString("") { "%02x".format(it) }
            return File(root, "$name-$hash.json")
        }

        fun encode(state: State): String = buildJsonObject {
            put("version", VERSION)
            state.active?.let { put("active", it) }
            putJsonArray("tabs") {
                for (tab in state.tabs) {
                    addJsonObject {
                        put("id", tab.id)
                        tab.parentId?.let { put("parentId", it) }
                        put("title", tab.title)
                        put("titleSource", tab.titleSource)
                        tab.conversationId?.let { put("conversationId", it) }
                        if (tab.model.isNotEmpty()) put("model", tab.model)
                        if (tab.effort.isNotEmpty()) put("effort", tab.effort)
                        if (tab.mode.isNotEmpty()) put("mode", tab.mode)
                        tab.draft?.takeIf { it.toString().length <= MAX_DRAFT_CHARS }?.let { put("draft", it) }
                    }
                }
            }
        }.toString()

        /**
         * The file read back - leniently. A field this version does not know is skipped, a tab without an
         * identifier is dropped, and a file that is not JSON at all is no state rather than an error: a
         * list of tabs is a convenience, and a broken one must never stand between a person and the panel.
         */
        fun decode(text: String): State? {
            val root = runCatching { Json.parseToJsonElement(text).jsonObject }.getOrNull() ?: return null
            val tabs = (root["tabs"] as? JsonArray).orEmpty().mapNotNull { element ->
                val tab = element as? JsonObject ?: return@mapNotNull null
                val id = tab.string("id").takeIf { it.isNotEmpty() } ?: return@mapNotNull null

                Tab(
                    id = id,
                    parentId = tab.string("parentId").takeIf { it.isNotEmpty() },
                    title = tab.string("title"),
                    titleSource = tab.string("titleSource").ifEmpty { SessionSnapshot.TITLE_DEFAULT },
                    conversationId = tab.string("conversationId").takeIf { it.isNotEmpty() },
                    model = tab.string("model"),
                    effort = tab.string("effort"),
                    mode = tab.string("mode"),
                    draft = tab["draft"] as? JsonObject,
                )
            }

            return State(active = root.string("active").takeIf { it.isNotEmpty() }, tabs = tabs)
        }

        /**
         * The tabs worth bringing back, in their order, and the one to show.
         *
         * A tab comes back for one of two reasons: it held a conversation, or something was being written
         * in it. A tab with neither is an empty "New chat", and bringing back a strip of those restores
         * nothing anybody lost.
         *
         * Whether the conversation's transcript is still on disk is not asked here: finding it can take a
         * process on a WSL project (see ClaudeHome), and this runs while the panel is being built. It is
         * asked where the transcript is read anyway, off that thread (see ClaudeSessionHub.lostTranscript).
         *
         * A fork whose parent is not coming back stands on its own: its conversation is its own either
         * way, and a group headed by a tab that is not there is a group nothing on the strip can show.
         */
        fun restorable(state: State): State {
            val kept = ArrayList<Tab>()

            for (tab in state.tabs) {
                if (tab.conversationId == null && !hasDraft(tab.draft)) continue

                kept += tab.copy(parentId = tab.parentId?.takeIf { parent -> kept.any { it.id == parent } })
            }

            return State(active = state.active?.takeIf { active -> kept.any { it.id == active } }, tabs = kept)
        }

        /** Whether a draft holds anything at all - a word, an attachment or a quote. */
        fun hasDraft(draft: JsonObject?): Boolean {
            if (draft == null) return false

            val tokens = (draft["tokens"] as? JsonArray).orEmpty()
            val quotes = (draft["quotes"] as? JsonArray).orEmpty()
            return quotes.isNotEmpty() || tokens.any { token ->
                val body = token as? JsonObject ?: return@any false
                body["kind"]?.jsonPrimitive?.contentOrNull != "text" ||
                    body["value"]?.jsonPrimitive?.contentOrNull.orEmpty().isNotBlank()
            }
        }

        private fun JsonObject.string(key: String): String =
            (this[key] as? JsonPrimitive)?.takeIf { it.isString }?.content.orEmpty()
    }
}

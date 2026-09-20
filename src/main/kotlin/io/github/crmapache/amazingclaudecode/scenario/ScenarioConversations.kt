package io.github.crmapache.amazingclaudecode.scenario

import com.intellij.openapi.diagnostic.thisLogger
import kotlinx.serialization.Serializable
import kotlinx.serialization.json.Json

/**
 * The conversations this project raised for scenario runs rather than for the person.
 *
 * A run is made of ordinary CLI conversations - one for the main thread and one for every card it hands
 * out - and the CLI keeps them where it keeps everybody's, in the project's own folder of transcripts.
 * Which is right: the log of a card is read from there, and a copy of our own could only go stale (see
 * RunStore). The price shows up on the one screen that lists that folder: a night of work puts a dozen
 * conversations nobody held into the list of past conversations, and the person's own three from that
 * evening are somewhere underneath them. That list answers "what was I doing", and a machine's night is
 * not an answer to it.
 *
 * So the identifiers are written down as they are learned, and the history skips them (see
 * ClaudeHistory.list). Written down rather than recognised in the transcript: the main thread's first
 * message is ours and could be spotted, but a card's first message is the prompt somebody wrote in their
 * own scenario, and there is nothing in it to tell it from a question typed by hand.
 *
 * One small file per project, beside the queue and the scheduled hours and by their rules - kept on this
 * machine, keyed by a hash of the path, locked across IDE windows (see ScenarioFile).
 */
internal class ScenarioConversations(private val store: ScenarioFile, private val past: () -> List<String>) {

    /** The ordinary way in: this machine's book for this project. */
    constructor(workingDirectory: String?) : this(
        ScenarioFile.of(FOLDER, workingDirectory, FILE),
        { RunStore(workingDirectory).conversations() },
    )

    private val json = Json { ignoreUnknownKeys = true; encodeDefaults = true }

    @Serializable
    private data class Book(val ids: List<String> = emptyList())

    /**
     * Everything the history should skip, and an empty set when the file cannot be read.
     *
     * Empty is the safe half of not knowing here, which is the opposite of what the queue and the hours
     * do with an unreadable file. Theirs decide whether work RUNS, so not knowing has to stop them; this
     * one decides whether a row is drawn, and a run's conversation shown by mistake is one line in a
     * list, while a person's conversation hidden by mistake is their own work gone from the only place
     * they look for it.
     */
    fun all(): Set<String> = store.underLock { known()?.toSet() ?: emptySet() }

    /**
     * One more conversation belongs to a run - said the moment the process announces its identifier (see
     * ScenarioEngine.rememberConversationIds), not when the run is over.
     *
     * A run goes on for hours and the history is opened while it does; written at the end, every card of
     * the night would sit in that list until morning, which is the very thing this is for.
     */
    fun note(id: String) {
        if (id.isBlank()) return

        store.underLock {
            val known = known() ?: return@underLock
            if (id !in known) write(known + id)
        }
    }

    /**
     * That conversation is the person's now: they carried a run's main thread on in a tab of their own
     * and wrote into it (see ClaudeSessions.releasedRole).
     *
     * Kept hidden, it would be work of theirs reachable only through the run it began as - and the
     * reason that door exists is to go on working, usually on something the run itself never did. Only
     * ever the main thread: a card has no door into a chat.
     */
    fun release(id: String) {
        if (id.isBlank()) return

        store.underLock {
            val known = known() ?: return@underLock
            if (id in known) write(known - id)
        }
    }

    /**
     * What the book says, filled in from the runs themselves the first time it is opened.
     *
     * The book is new and the nights are not: every conversation a scenario ever raised on this machine
     * is already named in the run records, and without this the feature would begin by hiding tomorrow's
     * runs while every past one stayed in the list - the complaint that asked for it, still on the
     * screen where it was made. Once only, because from then on there is a file.
     *
     * Null means the file could not be read, which is NOT an empty book - see [all].
     */
    private fun known(): List<String>? =
        when (val stored = store.read()) {
            ScenarioFile.Stored.Missing -> filled()
            ScenarioFile.Stored.Unreadable -> null
            is ScenarioFile.Stored.Text ->
                runCatching { json.decodeFromString<Book>(stored.text).ids }.onFailure(::grumble).getOrNull()
        }

    /**
     * Nothing is written for a project that has never run a scenario: the history and the search ask this
     * of every project they are opened over, and a file apiece for the ones with nothing to say is litter
     * in a folder somebody may one day have to look through. Reading the runs again costs a look at a
     * folder that is not there.
     */
    private fun filled(): List<String> {
        val found = runCatching(past).onFailure(::grumble).getOrDefault(emptyList())
        return if (found.isEmpty()) found else write(found)
    }

    private fun grumble(failure: Throwable) = thisLogger().warn("Could not read the scenario conversations", failure)

    /**
     * Keep the newest and drop the rest.
     *
     * The book grows by a handful every night and never shrinks by itself: a transcript deleted by hand
     * leaves an identifier here that hides nothing at all. A cap is the whole of the tidying, and it is
     * enough because the history is a list of the NEWEST conversations - an identifier thousands of
     * conversations old has nothing left to hide. Oldest first, so the newest are the ones kept.
     */
    private fun write(ids: List<String>): List<String> {
        val kept = ids.distinct().takeLast(LIMIT)
        store.put(json.encodeToString(Book(kept)))
        return kept
    }

    private companion object {
        const val FILE = "conversations.json"

        /** Where on this machine a project's book of run conversations is kept - see ScenarioFile.of. */
        const val FOLDER = "scenario-conversations"

        const val LIMIT = 4_000
    }
}

package io.github.crmapache.amazingclaudecode.feedback

import com.intellij.openapi.components.Service
import com.intellij.openapi.components.service

/**
 * The last few hundred technical things that happened, kept so that a person reporting a bug has
 * something to attach to it.
 *
 * Until this existed there was nothing to attach. Every one of the plugin's ninety-odd log calls goes
 * straight into the IDE's own idea.log, which a person has to find, open, and read past everything the
 * platform and every other plugin wrote into it - and then decide for themselves which lines were about
 * this. Asking that of somebody who has just hit a bug is asking them not to report it.
 *
 * One buffer for the whole application rather than one per project, for the same reason the statistics
 * are kept that way: a bug does not belong to a project, and the thing worth seeing is usually the
 * order events happened in across everything the IDE had open.
 *
 * It holds nothing on disk and dies with the IDE. That is deliberate: this is a buffer for a report
 * written now, not a record of how the plugin has been used. A file would have to be trimmed, migrated,
 * and explained on the privacy page - and it would answer a question nobody asked.
 *
 * What must never come in here is content. The temptation is one line away: several places in the
 * plugin already log a whole message from the panel when they cannot make sense of it, and such a
 * message carries the text a person typed. The rule is that a caller passes what happened and how big
 * it was, never the thing itself - see the note beside "Unknown message from webview" in ClaudePanel.
 */
@Service(Service.Level.APP)
internal class DiagnosticsLog {

    data class Entry(val at: Long, val source: String, val text: String)

    private val entries = ArrayDeque<Entry>()

    /**
     * Put a line in. `source` is the part of the plugin speaking - one short word, so that a report
     * reads as a column rather than as prose.
     *
     * Whatever comes in is scrubbed of paths first (see [scrub]). That is not tidiness: most of what
     * arrives here is somebody else's text - a library warning printed by the CLI, the message of a file
     * error - and such text carries absolute paths, which carry a home directory, which carries a name.
     */
    fun note(source: String, text: String, at: Long = System.currentTimeMillis()) {
        val line = scrub(text.trim().replace(WHITESPACE, " "))
        if (line.isEmpty()) return

        synchronized(entries) {
            entries.addLast(Entry(at = at, source = source, text = line.take(MAX_TEXT)))
            while (entries.size > KEPT) entries.removeFirst()
        }
    }

    /** Everything held right now, oldest first. */
    fun tail(): List<Entry> = synchronized(entries) { entries.toList() }

    companion object {

        /**
         * Take the paths out of a line, and anything else that names the person.
         *
         * The screen promises that a debug report carries no paths and no file names. For the outline of a
         * conversation that promise is kept by construction - nothing is copied out of it at all (see
         * FeedbackReport). For these lines it cannot be: they are written by other programs, and a warning
         * printed by a Node library is a sentence with a path in the middle of it.
         *
         * So a path becomes a short hash of itself. The line keeps its shape - "could not read path:Ab3dEf
         * at line 12" is still a usable account of what happened, and two mentions of the same path still
         * read as the same path - while what the path said is gone. What is deliberately not attempted is
         * telling a "harmless" system path from a private one: /usr/lib is not worth the rule that would
         * have to make that call, and a rule that makes it wrongly leaks a home directory.
         *
         * Then the home directory and the user's own name, in case either turned up outside a path at all:
         * "permission denied for user maksim" has no slashes in it.
         */
        fun scrub(text: String): String {
            var line = PATH.replace(text) { match -> "path:" + ShortHash.of(match.value, 6) }

            home?.let { line = line.replace(it, "~") }
            user?.let { if (it.length >= MIN_NAME) line = line.replace(it, "<user>") }

            return line
        }

        /**
         * What counts as a path: two segments or more, starting at a root, at a drive, at the home
         * shorthand - or at the "file://" a Node stack trace writes its frames with.
         *
         * The four openings are four ways the same disk is written about, and a line leaks through the
         * one that is missing: "file:///Users/somebody/thing/index.js" begins with neither a root nor a
         * drive, and a drive written the way Node writes it - "C:/Users/…" rather than "C:\Users\…" -
         * begins with a slash that the lookbehind rules out as part of a scheme. Both used to pass whole,
         * carrying a project's name and a person's file names into a report the screen promises has
         * neither.
         *
         * The lookbehind keeps addresses out of it - "wss://relay.example.com/v1/agent" is a place on the
         * network rather than on this disk, and hashing it would take a line's whole meaning away. It is
         * also what keeps "file://" from being read as a drive: the letter before the colon of a scheme
         * is a word character, and a drive letter never is.
         * Punctuation ends a match, so "at /app/dist/index.js:12:5" keeps its line and column: those are
         * the useful part of it.
         */
        private val PATH =
            Regex(
                """(?<![:/\w~.])(?:file://|[A-Za-z]:[\\/]|~/|/)[^\s"'`,;:()\[\]{}]*(?:[/\\][^\s"'`,;:()\[\]{}]+)+"""
            )

        private val WHITESPACE = Regex("""\s+""")

        private val home: String? = System.getProperty("user.home")?.takeIf { it.length > 1 }

        private val user: String? = System.getProperty("user.name")?.takeIf { it.isNotBlank() }

        /**
         * A user name shorter than this is left alone. Plenty of machines have accounts called "n" or
         * "ci", and replacing every such letter in every line would turn a report into a puzzle.
         */
        private const val MIN_NAME = 3
        /**
         * How many lines are held. Enough to cover a working session's worth of trouble, and small
         * enough that the whole of it can be shown to a person on a 350-pixel screen before they send
         * it - a buffer nobody reads through is a buffer nobody can vouch for.
         */
        const val KEPT = 300

        /** One line's ceiling: a stack trace must not be able to push out everything before it. */
        const val MAX_TEXT = 400

        /** The sources, named in one place so a report's column stays a column. */
        const val AGENT = "agent"
        const val STDERR = "stderr"
        const val PANEL = "panel"
        const val RELAY = "relay"
        const val STATS = "stats"
        /** The search over the conversations: a run started, found, failed - never a query or a hit. */
        const val SEARCH = "search"

        fun getInstance(): DiagnosticsLog = service()

        /**
         * The short way in, for the call sites scattered around the plugin: they have a line and a
         * reason, and no interest in where the buffer lives.
         */
        fun note(source: String, text: String) {
            // A service that cannot be reached is not worth failing a conversation over: this is a
            // diagnostic buffer, and the worst case of losing a line is a thinner bug report.
            runCatching { getInstance().note(source, text) }
        }
    }
}

package io.github.crmapache.amazingclaudecode.scenario

import kotlinx.serialization.json.Json
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.JsonPrimitive
import kotlinx.serialization.json.contentOrNull
import kotlinx.serialization.json.jsonObject

/**
 * What a card is saying right now - the row's live line (`RunStep.said`), read off its stream as it is
 * written.
 *
 * Three things were wrong with the plain sum of the text deltas it used to be, all seen on one roas-radar
 * run at once.
 *
 * - **A block of text is a paragraph of its own.** The agent says a sentence, runs a tool, says the next
 *   one, and every one of those is a text block of a message of its own. Added up with nothing between
 *   them they read "Reading the migration.Writing the red tests", and two bold lines in a row became
 *   `**Context.****Finding 1**` - markup the screen can no longer make out. A new block starts after an
 *   empty line, so the screen parses it as the paragraph it is (see Glance in the webview).
 * - **Only the card's own words.** A card that launches reviewers in parallel gets their deltas on the same
 *   stream, a piece of each in turn, and a sum of those is no one's sentence. A subagent's events carry
 *   the call that spawned it, and they are left out by the same mark the feed and TurnEndings use.
 * - **The newest words are the ones kept.** The cap used to keep the first few hundred characters, so the
 *   line stopped moving after the first minute or two of a card's work and showed the same stale sentence
 *   for the remaining hour - the very "stuck or working?" question it exists to answer. Now the oldest
 *   words go, and the cut lands where a paragraph, a line or at least a word begins, so what is left
 *   still parses as markdown: a cut through `**bold**` puts a pair of bare asterisks on the screen.
 *
 * The same text is what the head is shown as "what it was saying when it stopped" when it takes a card
 * over (see HeadTalk.takeOverRequest), and there too the last words are the ones that matter.
 */
internal object LiveWords {

    private val json = Json { ignoreUnknownKeys = true; isLenient = true }

    /** What goes between two blocks of text: an empty line, which is a paragraph's end in markdown. */
    const val BREAK = "\n\n"

    /** A fence line, the same as the panel's own parsing reads it (FENCE in feed/markdown.ts). */
    private val FENCE = Regex("""^[ \t]*(`{3,})([^`]*)$""")

    /**
     * What one line of a card's stream adds to its words: a piece of text, [BREAK] before a new block of
     * text, or null for everything else.
     */
    fun piece(line: String): String? {
        // Most lines are not these, and a whole parse of every line just to be told so is wasted.
        if (!line.contains("\"stream_event\"")) return null
        if (!line.contains("\"text_delta\"") && !line.contains("\"content_block_start\"")) return null

        val event = runCatching { json.parseToJsonElement(line).jsonObject }.getOrNull() ?: return null
        if (event.str("type") != "stream_event" || event.str("parent_tool_use_id").isNotEmpty()) return null

        val inner = event["event"] as? JsonObject ?: return null
        return when (inner.str("type")) {
            "content_block_start" -> BREAK.takeIf { (inner["content_block"] as? JsonObject)?.str("type") == "text" }
            "content_block_delta" -> (inner["delta"] as? JsonObject)
                ?.takeIf { it.str("type") == "text_delta" }
                ?.str("text")
                ?.takeIf { it.isNotEmpty() }
            else -> null
        }
    }

    /** The words after one more [piece], no longer than [limit]. */
    fun add(said: String, piece: String, limit: Int): String {
        if (piece == BREAK) {
            // Nothing to stand apart from yet - a turn's first block starts the line, not an empty one.
            return if (said.isBlank()) said else said.trimEnd() + BREAK
        }
        return newest(said + piece, limit)
    }

    /**
     * The newest [limit] characters of [text], cut where something begins.
     *
     * A paragraph first, then a line, then a word - and never so deep into the window that less than half
     * of it is left: a paragraph that began just before the end would otherwise throw away the long one
     * above it and leave the row a line shorter than it has room for. A cut through the middle of a line
     * says so with an ellipsis, since the sentence it starts is not the agent's from its beginning.
     *
     * A cut inside a code block opens it again, with the fence it was opened with. Without that, the line
     * that closes the block reads as one that opens a block, and everything the agent says after it is
     * drawn as code.
     */
    fun newest(text: String, limit: Int): String {
        if (text.length <= limit) return text

        val from = text.length - limit
        val window = text.substring(from)
        val half = limit / 2

        val paragraph = window.indexOf(BREAK).takeIf { it in 0 until half }
        val line = window.indexOf('\n').takeIf { it in 0 until half }
        val word = window.indexOf(' ').takeIf { it in 0 until half }

        val cut = when {
            paragraph != null -> from + paragraph + BREAK.length
            line != null -> from + line + 1
            word != null -> from + word + 1
            else -> from
        }
        val kept = text.substring(cut).trimStart('\n')
        val midLine = paragraph == null && line == null

        val fence = openFence(text.substring(0, cut))
        return when {
            fence != null -> "$fence\n" + kept
            midLine -> "...$kept"
            else -> kept
        }
    }

    /**
     * The fence line of a code block still open at the end of [text], or null when it ends outside one.
     *
     * Read by the panel's rule: only a bare fence of the same length closes a block, so a block can hold a
     * shorter one (see the note on FENCE in feed/markdown.ts). The text this is asked about always starts
     * outside a block, because every cut before this one reopened what it cut through.
     */
    private fun openFence(text: String): String? {
        var open: String? = null
        var length = 0
        for (line in text.split('\n')) {
            val match = FENCE.matchEntire(line) ?: continue
            val ticks = match.groupValues[1].length
            if (open == null) {
                open = line.trim()
                length = ticks
            } else if (ticks == length && match.groupValues[2].isBlank()) {
                open = null
            }
        }
        return open
    }

    private fun JsonObject.str(name: String): String = (this[name] as? JsonPrimitive)?.contentOrNull.orEmpty()
}

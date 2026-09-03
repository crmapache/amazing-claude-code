package io.github.crmapache.amazingclaudecode.search

import java.text.Normalizer
import kotlin.math.ln
import kotlin.math.max
import kotlin.math.min

/**
 * A word out of a text, folded for matching, with where it stood in the text as written. [whole] tells
 * a run of its own from a camel-case part of a longer one - "Whole words" counts only the former.
 */
internal data class Token(val term: String, val start: Int, val end: Int, val whole: Boolean = true)

/**
 * How a text is cut into words for the search - the one rule both halves of it follow.
 *
 * The same rule is written a second time in the panel (see feed/searchText.ts): the IDE finds the
 * messages and says which words it matched, and the panel paints those words in the feed, so the two
 * have to agree on what a word is. There is no shared code between Kotlin and a browser page, so this
 * is the case of Frame.kt and frame.ts - change one, change the other. Keeping the rule simple is what
 * keeps that possible.
 *
 * A word is a run of letters and digits. An underscore ends a word, so `oldest_event` is two of them,
 * and a change of case or of kind inside a run makes the parts words as well as the whole: a query for
 * "event" should find `oldestEventUuid`, which is how the conversations in a code project are written.
 * Words are matched folded - lower case, accents dropped, the Russian ё as е - because that is how
 * people type them into a search field.
 */
internal object Words {

    fun of(text: String): List<Token> {
        val tokens = ArrayList<Token>()
        var index = 0
        val length = text.length

        while (index < length) {
            if (!isWordChar(text[index])) {
                index += 1
                continue
            }

            val start = index
            while (index < length && isWordChar(text[index])) index += 1
            addRun(text, start, index, tokens)
        }

        return tokens
    }

    /** One run of word characters: the whole of it, and its camel-case and letter-digit parts. */
    private fun addRun(text: String, start: Int, end: Int, into: MutableList<Token>) {
        val whole = fold(text.substring(start, end))
        into.add(Token(whole, start, end, whole = true))

        val parts = partsOf(text, start, end)
        if (parts.size < 2) return
        for ((from, to) in parts) {
            val part = fold(text.substring(from, to))
            if (part != whole) into.add(Token(part, from, to, whole = false))
        }
    }

    /**
     * Where a run breaks into parts: before an upper-case letter that follows a lower-case one or a
     * digit ("oldestEvent", "v2Beta"), before the last of a run of capitals that starts a lower-case
     * word ("HTTPServer" -> HTTP, Server), and between letters and digits ("utf8" -> utf, 8).
     */
    private fun partsOf(text: String, start: Int, end: Int): List<Pair<Int, Int>> {
        val parts = ArrayList<Pair<Int, Int>>()
        var from = start

        for (index in start + 1 until end) {
            val previous = text[index - 1]
            val current = text[index]
            val next = if (index + 1 < end) text[index + 1] else null

            val breaks = when {
                current.isUpperCase() && (previous.isLowerCase() || previous.isDigit()) -> true
                current.isUpperCase() && previous.isUpperCase() && next?.isLowerCase() == true -> true
                current.isDigit() != previous.isDigit() -> true
                else -> false
            }

            if (breaks) {
                parts.add(from to index)
                from = index
            }
        }

        parts.add(from to end)
        return parts
    }

    private fun isWordChar(c: Char): Boolean = c.isLetterOrDigit()

    /** Lower case, accents stripped, ё as е - what a word looks like in a search field. */
    fun fold(word: String): String {
        val lowered = word.lowercase()
        val plain = if (lowered.any { it.code > 0x7F }) {
            Normalizer.normalize(lowered, Normalizer.Form.NFD).filterNot { Character.getType(it) == Character.NON_SPACING_MARK.toInt() }
        } else {
            lowered
        }
        return if (plain.indexOf('ё') >= 0) plain.replace('ё', 'е') else plain
    }
}

/** A message that matched, with what to show of it. */
internal data class Hit(
    val message: IndexedMessage,
    val score: Double,
    /** A piece of the text around the first match, with an ellipsis where it was cut. */
    val snippet: String,
    /** Where the matched words stand in the snippet, as [start, end) pairs. */
    val spans: List<IntRange>,
)

/**
 * One matched term as the feed paints it (see matchSpans in feed/searchText.ts).
 *
 * [paint] is how many of its characters the query accounts for: the typed part of a word found by its
 * beginning, the stem of one found by its stem, the whole of one found by a typo. "use" typed paints the
 * "Use" of UserCard and no more - a person who typed three letters expects three letters lit, and a
 * whole identifier lit for a syllable of it reads as the search having matched something else. [text]
 * is what those characters have to be, exactly as typed, under Match case; [whole] keeps the paint to
 * whole runs under Whole words. The panel applies these and knows no rule of its own.
 */
internal data class Painted(val term: String, val paint: Int, val text: String? = null, val whole: Boolean = false)

/**
 * How many characters of [token] the search paints, or null when the token is no match under the
 * switches: a part of a longer word when whole words are wanted, or letters in another case than typed.
 */
internal fun paintOf(token: Token, painted: Painted, text: String): Int? {
    if (painted.whole && !token.whole) return null
    val length = min(painted.paint, token.end - token.start)
    val typed = painted.text
    if (typed != null && !text.regionMatches(token.start, typed, 0, min(typed.length, length))) return null
    return length
}

/**
 * The answer to one query: the messages to show, the words they were found by (for the feed to paint),
 * and how many matched in all.
 *
 * Two totals rather than one, because the window shows both at once: its tabs carry a count each, and
 * the person chooses which list to look at by them. Counted before the list is cut to its limit - a
 * badge saying "50" over two hundred matches is a badge that lies about the one thing it says.
 */
internal data class Found(
    val hits: List<Hit>,
    val terms: List<Painted>,
    /** Matches anywhere in the project. */
    val total: Int = 0,
    /** Matches in the conversation the window was opened over, when there is one. */
    val chatTotal: Int = 0,
    /** In how many conversations the project's matches stand - what the field's counter says. */
    val conversations: Int = 0,
)

/**
 * An index over the messages, and the search itself.
 *
 * An inverted index with BM25 scoring rather than a library, because the corpus is small and the
 * needs are exact: a few thousand short documents that have to answer as one types, with typos and
 * half-typed words, in Russian and English at once, and with the words matched named so the feed can
 * paint them. Every query word must be found (with one word missing from the conversation there is no
 * "close" answer worth showing), a word may be found by its beginning or by an edit or two, and a
 * phrase in quotation marks must stand in the text as written.
 *
 * Rebuilt whole rather than updated in place: on this machine the whole of a heavy project is six
 * thousand messages and takes a fraction of a second, and an index that cannot get out of step with the
 * messages is worth more than one that updates a little faster.
 */
internal class TextIndex(val messages: List<IndexedMessage>) {

    /** By term: the documents holding it, flattened as document, count, document, count... */
    private val postings: HashMap<String, IntArray>

    /** Every term, sorted, so a prefix is a range found by binary search. */
    private val vocabulary: Array<String>

    private val lengths: IntArray

    private val averageLength: Double

    init {
        val building = HashMap<String, ArrayList<Int>>()
        lengths = IntArray(messages.size)

        messages.forEachIndexed { document, message ->
            val counts = HashMap<String, Int>()
            val tokens = Words.of(message.text)
            for (token in tokens) counts[token.term] = (counts[token.term] ?: 0) + 1
            lengths[document] = tokens.size

            for ((term, count) in counts) {
                building.getOrPut(term) { ArrayList() }.apply {
                    add(document)
                    add(count)
                }
            }
        }

        postings = HashMap(building.size * 2)
        for ((term, list) in building) postings[term] = list.toIntArray()
        vocabulary = building.keys.toTypedArray().also { it.sort() }
        averageLength = if (messages.isEmpty()) 1.0 else max(1.0, lengths.sum().toDouble() / messages.size)
    }

    /**
     * The messages matching [query], best first, at most [limit] of them.
     *
     * [conversation] is the chat the window stands over: its matches are counted apart from the rest
     * (see [Found]), and with [onlyThatChat] the list holds nothing else. Both counts come out of the
     * one pass rather than two searches - the scoring is the expensive half and it is the same work for
     * either scope, so a second search to fill in a tab's badge would double the cost of every keystroke.
     *
     * [matchCase] and [wholeWords] are the field's two switches, the pair Find in Files has. Match case
     * wants the typed letters in the text exactly as typed - a word found by a typo has no such letters
     * and is not found at all. Whole words wants a word of its own: not a beginning, not a typo, not a
     * stem, and not a camel-case part of a longer word either, so "card" does not find UserCard. Both
     * are a look at the text of a candidate rather than a second index: the postings are folded, and a
     * message with the word in another case or inside a longer one is found by them like any other and
     * turned away here.
     *
     * Ties are broken by time, newest first: two messages that say the same thing equally well are told
     * apart by which one somebody is likelier to be looking for.
     */
    fun search(
        query: String,
        conversation: String? = null,
        onlyThatChat: Boolean = false,
        limit: Int = 50,
        matchCase: Boolean = false,
        wholeWords: Boolean = false,
    ): Found {
        val parsed = Query.parse(query)
        if (parsed.words.isEmpty() && parsed.phrases.isEmpty()) return Found(emptyList(), emptyList())

        // A phrase's own words are words of the query too: the phrase decides which documents may
        // answer, the words decide how well. Under Match case "Use" and "use" are two words to find.
        val words = (parsed.words + parsed.phrases.flatMap { it.words })
            .distinctBy { if (matchCase) it.term + '\u0000' + it.raw else it.term }
        if (words.isEmpty()) return Found(emptyList(), emptyList())

        val perWord = words.map { word -> scoresFor(word, matchCase, wholeWords) }
        // Every word has to be found somewhere in the message - see the class comment.
        val candidates = perWord.minByOrNull { it.scores.size }?.scores?.keys ?: return Found(emptyList(), emptyList())
        val checked = matchCase || wholeWords

        val scored = ArrayList<Pair<Int, Double>>()
        for (document in candidates) {
            var total = 0.0
            var everywhere = true
            for (scores in perWord) {
                val score = scores.scores[document]
                if (score == null) {
                    everywhere = false
                    break
                }
                total += score
            }
            if (!everywhere) continue

            val text = messages[document].text
            if (parsed.phrases.isNotEmpty()) {
                val haystack = if (matchCase) text else Words.fold(text)
                if (!parsed.phrases.all { phrase -> haystack.contains(if (matchCase) phrase.raw else phrase.folded) }) continue
            }

            // The switches are a look at the words as written: the postings say the folded word is
            // there, and only the text says in what case and whether on its own.
            if (checked) {
                val tokens = Words.of(text)
                val stands = perWord.all { scores ->
                    tokens.any { token -> scores.variants[token.term]?.let { paintOf(token, it, text) } != null }
                }
                if (!stands) continue
            }

            scored.add(document to total)
        }

        val inChat = if (conversation == null) 0 else scored.count { messages[it.first].conversation == conversation }
        val shownScored = if (onlyThatChat && conversation != null) {
            scored.filter { messages[it.first].conversation == conversation }
        } else {
            scored
        }

        val ordered = shownScored
            .sortedWith(compareByDescending<Pair<Int, Double>> { it.second }.thenByDescending { messages[it.first].at })
            .take(limit)

        // One way of painting per term, the widest: a term two query words reach ("use" and "user" both
        // begin usercard) is painted as far as the longer of them.
        val matched = HashMap<String, Painted>()
        for (scores in perWord) for (painted in scores.variants.values) {
            val known = matched[painted.term]
            if (known == null || painted.paint > known.paint) matched[painted.term] = painted
        }

        val hits = ordered.map { (document, score) ->
            val message = messages[document]
            val (snippet, spans) = Snippets.around(message.text, matched)
            Hit(message, score, snippet, spans)
        }

        // The words worth painting are the ones that actually stand in what is shown - a variant found
        // only in a message past the limit would paint nothing anywhere.
        val shown = HashSet<String>()
        for (hit in hits) for (token in Words.of(hit.message.text)) if (token.term in matched) shown.add(token.term)

        val spread = scored.mapTo(HashSet()) { messages[it.first].conversation }.size

        return Found(hits, shown.sorted().map { matched.getValue(it) }, total = scored.size, chatTotal = inChat, conversations = spread)
    }

    /** The best score of every document for one query word, over all the ways the word may be found. */
    private fun scoresFor(word: QueryWord, matchCase: Boolean, wholeWords: Boolean): WordScores {
        val variants = variantsOf(word, matchCase, wholeWords)
        val scores = HashMap<Int, Double>()
        val found = LinkedHashMap<String, Painted>()

        for (variant in variants) {
            val term = variant.painted.term
            val list = postings[term] ?: continue
            val documents = list.size / 2
            val idf = ln(1.0 + (messages.size - documents + 0.5) / (documents + 0.5))
            var used = false

            var index = 0
            while (index < list.size) {
                val document = list[index]
                val count = list[index + 1]
                index += 2
                used = true

                val saturated = count * (K1 + 1) / (count + K1 * (1 - B + B * lengths[document] / averageLength))
                val score = idf * saturated * variant.weight
                val known = scores[document]
                if (known == null || score > known) scores[document] = score
            }

            if (used) found[term] = variant.painted
        }

        return WordScores(scores, found)
    }

    /** One way a query word may be found: the term, how it is painted, and how much of a match it is. */
    private class Variant(val painted: Painted, val weight: Double)

    /**
     * The terms one query word may stand for, each with how much of a match it is.
     *
     * The word itself first. Then the terms it begins: what is typed is usually the start of a word,
     * and a search that answers as one types has to find "deepgr" before "deepgram" is finished. Then
     * the terms an edit or two away, for the typo everybody makes - only for words long enough that an
     * edit is a typo rather than a different word, and only when neither of the first two found the
     * term already.
     *
     * Each carries how far it is painted (see [Painted]): as far as the typed word reaches into it,
     * or - for a typo, where the typed letters stand nowhere - the whole of it.
     */
    private fun variantsOf(word: QueryWord, matchCase: Boolean, wholeWords: Boolean): List<Variant> {
        val variants = LinkedHashMap<String, Variant>()
        val typed = word.term

        // What the painted letters have to be, exactly as typed, when the case matters - and nothing
        // otherwise: the painter then compares folded, as the index does.
        fun painted(term: String, paint: Int) = Painted(term, paint, if (matchCase) word.raw.take(paint) else null, wholeWords)

        if (postings.containsKey(typed)) variants[typed] = Variant(painted(typed, typed.length), EXACT)
        // Whole words means the word itself and nothing that merely begins with it, resembles it or shares its stem.
        if (wholeWords) return variants.values.toList()

        if (typed.length >= PREFIX_MIN) {
            var count = 0
            var index = lowerBound(typed)
            while (index < vocabulary.size && vocabulary[index].startsWith(typed) && count < PREFIX_LIMIT) {
                val term = vocabulary[index]
                if (term !in variants) {
                    variants[term] = Variant(painted(term, typed.length), PREFIX)
                    count += 1
                }
                index += 1
            }
        }

        // A typo has no letters that stand in the text as typed - under Match case there is nothing for
        // it to match, and it is not looked for.
        val distance = when {
            matchCase -> 0
            typed.length >= FUZZY_TWO_MIN -> 2
            typed.length >= FUZZY_MIN -> 1
            else -> 0
        }
        if (distance > 0) {
            for (term in vocabulary) {
                if (term in variants) continue
                val gap = term.length - typed.length
                if (gap > distance || gap < -distance) continue
                if (Edits.within(typed, term, distance)) variants[term] = Variant(painted(term, term.length), FUZZY)
            }
        }

        /*
         * The word's stem, by truncation, as the last and faintest way in. Russian inflects: "наследует",
         * "наследовал" and "наследование" are one word to the person typing and three to an index, and
         * an edit or two does not bridge them. A real stemmer is a language each; cutting the ending
         * off and matching what is left as a prefix is the same trick for every language, and measured
         * here it is what turned "fork наследует модель" from nothing into the conversation meant. Kept
         * to words long enough that the stem still says something.
         */
        if (typed.length >= STEM_MIN) {
            val stem = typed.take(max(STEM_KEEP, typed.length - STEM_CUT))
            var count = 0
            var index = lowerBound(stem)
            while (index < vocabulary.size && vocabulary[index].startsWith(stem) && count < PREFIX_LIMIT) {
                val term = vocabulary[index]
                if (term !in variants) {
                    variants[term] = Variant(painted(term, stem.length), STEM)
                    count += 1
                }
                index += 1
            }
        }

        return variants.values.toList()
    }

    /** The first term in the vocabulary not less than [word]. */
    private fun lowerBound(word: String): Int {
        var low = 0
        var high = vocabulary.size
        while (low < high) {
            val middle = (low + high) ushr 1
            if (vocabulary[middle] < word) low = middle + 1 else high = middle
        }
        return low
    }

    /** What one query word scored per document, and the terms it was found by, each with its paint. */
    private class WordScores(val scores: Map<Int, Double>, val variants: Map<String, Painted>)

    private companion object {
        const val K1 = 1.2
        const val B = 0.6

        const val EXACT = 1.0
        const val PREFIX = 0.75
        const val FUZZY = 0.5
        const val STEM = 0.4

        /** From six letters a word has an ending worth cutting; the stem keeps at least five, minus at most three. */
        const val STEM_MIN = 6
        const val STEM_KEEP = 5
        const val STEM_CUT = 3

        /** A one-letter word begins half the vocabulary; a prefix has to say more than that. */
        const val PREFIX_MIN = 2

        /** How many terms a prefix may stand for - past this the word is too short to mean anything yet. */
        const val PREFIX_LIMIT = 400

        /** Below four letters an edit makes another word rather than a typo ("cat" is one from "cut"). */
        const val FUZZY_MIN = 4
        const val FUZZY_TWO_MIN = 7
    }
}

/** A word of the query: folded, for the index, and as typed, for Match case. */
internal data class QueryWord(val term: String, val raw: String)

/** A phrase in quotation marks: folded for the plain search, as typed for Match case, and its words. */
internal data class Phrase(val folded: String, val raw: String, val words: List<QueryWord>)

/** A query as typed: its words, and the phrases it put in quotation marks. */
internal data class Query(val words: List<QueryWord>, val phrases: List<Phrase>) {

    companion object {
        private val QUOTED = Regex("[\"«»“”„]([^\"«»“”„]+)[\"«»“”„]")

        fun parse(text: String): Query {
            val phrases = QUOTED.findAll(text)
                .map { it.groupValues[1].trim() }
                .map { raw -> Phrase(Words.fold(raw), raw, wordsOf(raw)) }
                .filter { it.folded.isNotEmpty() }
                .toList()
            val rest = text.replace(QUOTED, " ")
            return Query(wordsOf(rest).distinct(), phrases)
        }

        /**
         * The words as typed - whole runs only. A query is what somebody typed, and "UserCard" typed is
         * one word to look for, not that word and two halves of it that each have to be found as well.
         */
        private fun wordsOf(text: String): List<QueryWord> =
            Words.of(text).filter { it.whole }.map { QueryWord(it.term, text.substring(it.start, it.end)) }
    }
}

/**
 * Damerau-Levenshtein distance, bounded: the answer is only ever "within [limit]" or not, so the work
 * stops the moment a row of the table exceeds it.
 */
internal object Edits {

    fun within(a: String, b: String, limit: Int): Boolean {
        if (a == b) return true
        val gap = a.length - b.length
        if (gap > limit || gap < -limit) return false
        if (a.isEmpty() || b.isEmpty()) return true

        var previousPrevious: IntArray? = null
        var previous = IntArray(b.length + 1) { it }
        var current = IntArray(b.length + 1)

        for (i in 1..a.length) {
            current[0] = i
            var best = current[0]
            for (j in 1..b.length) {
                val cost = if (a[i - 1] == b[j - 1]) 0 else 1
                var value = min(min(previous[j] + 1, current[j - 1] + 1), previous[j - 1] + cost)
                val twoBack = previousPrevious
                if (twoBack != null && i > 1 && j > 1 && a[i - 1] == b[j - 2] && a[i - 2] == b[j - 1]) {
                    value = min(value, twoBack[j - 2] + 1)
                }
                current[j] = value
                if (value < best) best = value
            }
            if (best > limit) return false

            val recycled = previousPrevious ?: IntArray(b.length + 1)
            previousPrevious = previous
            previous = current
            current = recycled
        }

        return previous[b.length] <= limit
    }
}

/** The piece of a message shown in the list of results. */
internal object Snippets {

    /** How much of the text is shown around the first matched word. */
    const val WINDOW = 220

    /** How much of it stands before that word, so the match is read in its sentence. */
    private const val LEAD = 70

    private const val ELLIPSIS = "…"

    /**
     * The text around the first word in [matched], and where every matched word stands in that piece -
     * painted as far as its [Painted] says, and only where it passes the switches (see [paintOf]).
     * Without a match at all (a hit found by the model rather than by a word) it is the beginning.
     */
    fun around(text: String, matched: Map<String, Painted>): Pair<String, List<IntRange>> {
        val tokens = Words.of(text)
        val first = tokens.firstOrNull { token -> matched[token.term]?.let { paintOf(token, it, text) } != null }

        if (text.length <= WINDOW) return text to spansWithin(text, tokens, matched, 0, text.length, 0)

        var start = if (first == null) 0 else max(0, first.start - LEAD)
        var end = min(text.length, start + WINDOW)
        if (end == text.length) start = max(0, end - WINDOW)

        // Cut on a word boundary rather than in the middle of one - a piece that starts with "gram"
        // reads as somebody else's sentence.
        if (start > 0) {
            val boundary = text.lastIndexOf(' ', start + 20).takeIf { it in start..(start + 20) }
            if (boundary != null && (first == null || boundary <= first.start)) start = boundary + 1
        }
        if (end < text.length) {
            val boundary = text.lastIndexOf(' ', end).takeIf { it > start + WINDOW / 2 }
            if (boundary != null && (first == null || boundary >= first.end)) end = boundary
        }

        val lead = if (start > 0) ELLIPSIS else ""
        val tail = if (end < text.length) ELLIPSIS else ""
        val snippet = lead + text.substring(start, end).trim() + tail
        // The trim above may have moved the words along - measure against what is actually shown.
        val shift = lead.length - (text.substring(start, end).length - text.substring(start, end).trimStart().length)

        return snippet to spansWithin(text, tokens, matched, start, end, shift - start)
    }

    private fun spansWithin(
        text: String,
        tokens: List<Token>,
        matched: Map<String, Painted>,
        start: Int,
        end: Int,
        shift: Int,
    ): List<IntRange> {
        val spans = ArrayList<IntRange>()
        for (token in tokens) {
            if (token.start < start || token.end > end) continue
            val painted = matched[token.term] ?: continue
            val length = paintOf(token, painted, text) ?: continue
            val from = token.start + shift
            val to = from + length
            // A part of a longer word (the "event" in oldestEventUuid) paints the part alone; a part that
            // lies inside a span already painted adds nothing.
            if (spans.isNotEmpty() && spans.last().first <= from && to <= spans.last().last + 1) continue
            spans.add(from until to)
        }
        return spans
    }
}

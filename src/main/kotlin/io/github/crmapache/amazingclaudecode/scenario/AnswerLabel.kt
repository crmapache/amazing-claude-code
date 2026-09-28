package io.github.crmapache.amazingclaudecode.scenario

import java.net.URI

/**
 * What a run's first answer is called beside its scenario's name - here, in the notifications a run
 * sends while the panel is closed (see ScenarioDesk.markOf). The panel and the phone name their marks by
 * the same rule (answerLabel in webview/src/scenarios/runs.ts), and the two have to agree: the notification
 * and the row it leads to must call the run the same thing.
 *
 * The first line of the first answer given, cut to a label's length - an answer is free text and can be a
 * paragraph. And for a link, the part of it that names something. A pasted link is the commonest answer
 * there is - the ticket, the Notion page, the pull request - and its head is the same for every run:
 * "https://app.notion.com/p/" comes before anything that tells one page from another, so a label cut from
 * its start named two runs against two pages the same. A link is named by its last path segment instead,
 * and a bare number by the segment before it as well ("pull/45", "issues/123"). A link with no path is its
 * host.
 */
internal object AnswerLabel {

    fun of(inputs: Map<String, String>, chars: Int): String {
        val line = inputs.values
            .firstOrNull { it.isNotBlank() }
            ?.lineSequence()?.firstOrNull()?.trim()
            .orEmpty()
        return linkName(line).take(chars)
    }

    /** A line that is one http(s) link, named by what it points at. Anything else as it is. */
    private fun linkName(line: String): String {
        if (!LINK.matches(line)) return line

        // A link with a character URI will not take (a brace, a bar) stays the text it was.
        val uri = runCatching { URI(line) }.getOrNull() ?: return line
        // The decoded path: a segment reads the way a person would read it, "План" rather than "%D0%9F…".
        val parts = uri.path.orEmpty().split('/').filter { it.isNotEmpty() }
        val last = parts.lastOrNull() ?: return uri.host.orEmpty().removePrefix("www.").ifEmpty { line }

        return if (last.all(Char::isDigit) && parts.size > 1) "${parts[parts.size - 2]}/$last" else last
    }

    private val LINK = Regex("""(?i)https?://\S+""")
}

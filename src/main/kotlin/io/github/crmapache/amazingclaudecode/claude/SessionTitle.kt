package io.github.crmapache.amazingclaudecode.claude

/**
 * What a conversation is named by.
 *
 * In the terminal the CLI names a session itself, but that lives in its interactive loop. The panel
 * runs the CLI as a stream (see ClaudeLaunch), and there the name is a control request nobody was
 * making - which is why a tab here used to stay "new session" until the interface guessed something out
 * of the first line of the message, and then carry that guess: a whole sentence, or a command with its
 * arguments, cut at sixty characters. The guess is a stand-in; the name is asked for (see
 * ClaudeSession.requestTitle), and this is the rule for what is worth asking about.
 */
internal object SessionTitle {

    /**
     * The shortest message worth naming a conversation by. The same threshold the CLI applies on its
     * side: below it the answer comes back empty, so asking is a round trip for nothing.
     */
    const val MIN_LENGTH = 10

    /**
     * How much of the message the name is worked out from. What a conversation is about is set in its
     * opening lines; the rest is a pasted log or a specification, and sending it whole means paying for
     * tokens that change nothing in a five-word name.
     */
    const val SAMPLE_LENGTH = 1000

    /**
     * The piece of the message the name is asked for - or null when this message says nothing worth
     * naming a conversation by, and the next one should be waited for.
     *
     * A bare command is the one thing skipped: "/compact" or "/clear" is what was done to the
     * conversation, not what it is about. A command with arguments is another matter - "/fix
     * REVIEW-v1.md" does say what is going on - so only the wordless ones are let through.
     */
    fun describe(text: String): String? {
        val description = text.trim()
        if (description.length < MIN_LENGTH) return null
        if (description.startsWith("/") && description.none { it.isWhitespace() }) return null

        return description.take(SAMPLE_LENGTH)
    }
}

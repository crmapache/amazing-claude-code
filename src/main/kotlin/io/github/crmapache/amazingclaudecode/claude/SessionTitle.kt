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
     * The commands that say what was done TO the conversation, or to the tool around it, rather than what
     * the work is about. A conversation named after one of these carries the name of a housekeeping step
     * instead of its subject - and the question is asked once, so it goes to the next message instead.
     *
     * Everything else that starts with a slash is work: a skill or a command is what the person came to
     * do ("/code-review", "/deploy"), and it names the conversation as surely as a sentence would. Its
     * arguments are not required for that - the earlier rule let through only the commands that had them,
     * and a tab opened on a bare "/code-review" stayed "new session" for the whole run.
     *
     * Compared whole rather than by the part after the colon: a plugin's own "acme:status" is that
     * plugin's command and says what it is about, while the bare "/status" is the CLI's own.
     */
    private val HOUSEKEEPING = setOf(
        "clear", "compact", "resume", "rewind", "fork", "export",
        "login", "logout", "exit", "quit", "upgrade", "migrate-installer", "install-github-app",
        "model", "effort", "config", "permissions", "hooks", "agents", "todos", "memory", "mcp", "ide",
        "add-dir", "statusline", "output-style", "terminal-setup", "vim", "privacy-settings",
        "context", "cost", "usage", "status", "doctor", "help", "bug", "feedback", "release-notes",
    )

    /**
     * The piece of the message the name is asked for - or null when this message says nothing worth
     * naming a conversation by, and the next one should be waited for.
     *
     * A command is described by its own name rather than sent as typed: written out as a phrase it reads
     * to the model as a subject ("the /code-review command") instead of a line it may copy back verbatim,
     * slash and all - and it clears the length below, which a short "/cp" on its own would not. A command
     * with arguments already says what is going on in words ("/fix REVIEW-v1.md"), so it travels as it is.
     */
    fun describe(text: String): String? {
        val description = text.trim()
        if (description.startsWith("/")) return describeCommand(description)
        if (description.length < MIN_LENGTH) return null

        return description.take(SAMPLE_LENGTH)
    }

    private fun describeCommand(text: String): String? {
        val name = text.drop(1).takeWhile { !it.isWhitespace() }
        if (name.isEmpty() || name in HOUSEKEEPING) return null

        val argument = text.drop(name.length + 1).trim()
        return if (argument.isEmpty()) "the /$name command" else text.take(SAMPLE_LENGTH)
    }
}

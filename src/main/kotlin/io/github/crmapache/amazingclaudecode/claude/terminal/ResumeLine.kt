package io.github.crmapache.amazingclaudecode.claude.terminal

import io.github.crmapache.amazingclaudecode.claude.accounts.AccountStore

/**
 * The line `/status` offers for carrying a conversation on in a terminal of one's own (see SessionInfoRow):
 * `claude --resume <id>`, and for a tab on an added account, that account's drawer in front of it.
 *
 * Why the drawer has to be said at all. An added account is a credential drawer of its own (see AccountStore),
 * while the conversations are the ordinary folder's. `claude --resume <id>` pasted into a terminal finds the
 * conversation and carries it on as whoever the ordinary sign-in is - not the account the tab is on. Silently:
 * the conversation answers, and its turns are billed to the other subscription. The line the panel used to hand
 * out did exactly that.
 *
 * On macOS and Linux the line names the drawer the way the panel's own processes are given it (see
 * AccountStore.environmentFor): the drawer's variable before the command, and the three keys that would outrank
 * it cleared for that one command. All three rather than the ones the IDE happens to see: a terminal reads the
 * person's profile, and an IDE launched from the Dock does not, so a key exported there is invisible from here
 * and still outranks the drawer in the terminal. `NAME=value command` is one form for every shell a terminal
 * opens there - sh, bash, zsh, fish since 3.1 - and it sets the variables for that command alone: nothing stays
 * behind in the terminal. A shell that cannot read the form refuses the whole line out loud rather than run the
 * conversation on the default sign-in.
 *
 * On Windows there is no such form. PowerShell's `$env:` and cmd's `set` stay set for the rest of the terminal -
 * the next plain `claude` typed there would be billed to the account, as silently as the other way round - and
 * each is an error in the other. The IDE cannot know which one the line will be pasted into, so it does not
 * guess: the line stays plain, and the row says that it carries on on the default sign-in rather than on the
 * tab's account. Continue in terminal has no such trouble - it hands the environment to the process itself
 * (see TerminalDesk).
 */
internal object ResumeLine {

    /** What the row says about the terminal. */
    data class Line(
        /** The whole line to paste. */
        val command: String,
        /** The added account the tab runs on - its name, for the row's note. Null for the default sign-in. */
        val account: String?,
        /** The line carries on on the default sign-in rather than on [account] - see the file's note. */
        val onDefault: Boolean,
    )

    /**
     * The line for [conversationId] on [account] (its name; null for the default sign-in, empty when it has
     * none). [drawer] is the account's credential drawer - null when it would not resolve. [posix]: whether the
     * line goes into a shell that reads `NAME=value command` (see the file's note).
     */
    fun of(conversationId: String, account: String?, drawer: String?, posix: Boolean): Line {
        if (account == null) return Line(plain(conversationId), account = null, onDefault = false)

        val named = account.ifBlank { null }
        if (drawer.isNullOrBlank() || !posix) return Line(plain(conversationId), account = named, onDefault = true)

        val prefix = buildList {
            add("${AccountStore.STORE_VARIABLE}=${word(drawer)}")
            AccountStore.OUTRANKING_VARIABLES.forEach { add("$it=") }
        }
        return Line((prefix + plain(conversationId)).joinToString(" "), account = named, onDefault = false)
    }

    /** `claude --resume <id>`, for the default sign-in. */
    fun plain(conversationId: String): String = "claude --resume ${word(conversationId)}"

    /**
     * One word for a POSIX shell: as it is when nothing in it means anything to the shell, single-quoted
     * otherwise. A conversation's id and a drawer's path are almost always the first kind, and a line with
     * quotes nobody needed reads as something to be careful of. A model's name is the other kind: the brackets
     * of `opus[1m]` are a pattern to zsh, which refuses the whole line when nothing matches it.
     */
    fun word(text: String): String =
        if (text.isNotEmpty() && text.all { it.isLetterOrDigit() && it.code < 128 || it in PLAIN }) {
            text
        } else {
            "'" + text.replace("'", "'\\''") + "'"
        }

    private const val PLAIN = "-_./:@%+,"
}

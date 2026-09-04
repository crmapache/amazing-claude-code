package io.github.crmapache.amazingclaudecode.claude.accounts

import com.intellij.openapi.Disposable
import com.intellij.openapi.diagnostic.thisLogger
import com.intellij.openapi.project.Project
import io.github.crmapache.amazingclaudecode.claude.ClaudeExecutable
import io.github.crmapache.amazingclaudecode.feedback.DiagnosticsLog

/**
 * Authorizing Claude Design, which the panel cannot do and the terminal can.
 *
 * `/design-login` is one of the CLI's interactive commands: it draws a screen of its own, opens a
 * browser and waits for a code. A streaming launch is judged an unattended script, so the CLI does not
 * merely refuse the command there - it leaves it out of the command list altogether, and answers
 * "/design-login isn't available in this environment". Verified against CLI 2.1.260: the list a
 * streaming session receives has `design`, `design-sync`, `design-consent` and `design-revoke` in it and
 * no `design-login` at all. There is no subcommand either - `claude design-login` does not exist.
 *
 * The tool has a second road to the same authorization, straight out of a permission prompt ("Approving
 * opens your browser…"), and it is shut by the very same condition, so the panel cannot reach that one
 * either. Without one of the two, DesignSync fails every call with a sentence telling the person to go
 * and run a command that this session does not have.
 *
 * So the panel does what it already does for a Claude Code sign-in: it opens the IDE's terminal with the
 * command in it (see [AccountTerminal]). What makes this worth a file of its own is the drawer.
 *
 * **The Design credential lives in the account's drawer, so the terminal needs that account's
 * environment.** The CLI files it as `designOauth` inside the very credential object an ordinary sign-in
 * goes into, which means `CLAUDE_SECURESTORAGE_CONFIG_DIR` moves it along with everything else (see
 * [AccountStore]). Run in a plain terminal, `/design-login` therefore lands in the default drawer - and
 * a panel working on an added account would go on failing exactly as before, with the person certain
 * they had just authorized it. That failure is silent by nature: nothing on either side says which
 * drawer was written to.
 *
 * The command is one line with no quotation marks in it, for the reason [io.github.crmapache
 * .amazingclaudecode.claude.ClaudeLaunch] explains at length. A leading slash is safe: the CLI checks
 * whether a file by that name exists before treating the word as a path, and `/design-login` is not one.
 */
internal object DesignLogin {

    /** Why the terminal was not opened, or null when it was. Codes, never sentences - the panel translates. */
    fun open(project: Project, parentDisposable: Disposable): String? {
        val executable = ClaudeExecutable.find() ?: return "no-executable"

        val accounts = ClaudeAccounts.getInstance()

        // The account the panel is actually working on, and no fallback to the default drawer. A sign-in
        // that quietly lands somewhere else is worse than one that does not happen: the person watches a
        // browser flow succeed and DesignSync goes on failing.
        val variables = accounts.variablesFor(accounts.currentId, project.basePath)
            ?: return "design-no-account"

        val opened = runCatching {
            AccountTerminal.open(project, parentDisposable, variables, command(executable.absolutePath))
        }
            .onFailure { thisLogger().warn("Failed to open a terminal for the Claude Design sign-in", it) }
            .getOrDefault(false)

        // The shape of it and nothing else: this buffer travels outwards with a feedback report, so it
        // never carries an address, a drawer or a path (see DiagnosticsLog).
        if (opened) DiagnosticsLog.note(DiagnosticsLog.ACCOUNTS, "a Claude Design sign-in was opened")

        return if (opened) null else "no-terminal"
    }

    private fun command(executable: String): String = "${AccountTerminal.quoted(executable)} $COMMAND"

    /**
     * Typed as the session's first prompt rather than left for the person to write.
     *
     * An interactive launch takes a prompt as its argument and runs it as a slash command - confirmed
     * live: `claude /status` comes up with the status panel open. So the browser flow starts by itself
     * and the terminal is a window to finish in, not a place to be told what to type next.
     */
    private const val COMMAND = "/design-login"
}

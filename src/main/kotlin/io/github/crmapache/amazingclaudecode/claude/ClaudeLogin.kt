package io.github.crmapache.amazingclaudecode.claude

import com.intellij.openapi.Disposable
import com.intellij.openapi.application.ApplicationManager
import com.intellij.openapi.diagnostic.thisLogger
import com.intellij.openapi.project.Project
import io.github.crmapache.amazingclaudecode.claude.accounts.AccountTerminal
import io.github.crmapache.amazingclaudecode.claude.accounts.ClaudeAccounts
import io.github.crmapache.amazingclaudecode.feedback.DiagnosticsLog

/**
 * Signing in happens in the IDE's built-in terminal.
 *
 * The panel cannot have a sign-in screen of its own: `claude auth login` opens a browser and waits for
 * a code to come back, that is, it is a full dialogue with a process. The IDE's terminal already exists
 * for that - no reason to build a second one.
 *
 * **And it goes into the drawer the panel is actually on.** This used to open a plain shell, which is
 * the CLI's DEFAULT drawer - while the sign-in screen in front of it asks about the current account
 * (see ProjectAuth.check). With an added account in force those are two different drawers, so an
 * expired token turned into a dead end that looked like a broken button: the person signed in
 * correctly, the browser said "you are all set up", and the panel went on offering to open the terminal
 * again - for ever, because the credential had landed somewhere it was never going to be asked about.
 *
 * So the environment is [AccountTerminal]'s, exactly as when an account is added, and for the same
 * reasons - a typed map rather than a shell prefix, because guessing the quoting dialect wrong is what
 * sends a sign-in into the default drawer, that is, over the account the person is working on.
 *
 * A drawer that will not resolve is a refusal rather than a fallback. The alternative - opening a plain
 * terminal anyway - is the very bug above: a sign-in that goes somewhere nobody is looking.
 */
internal object ClaudeLogin {

    /** What came of asking for a terminal. The refusals are the panel's to say out loud. */
    enum class Outcome {
        OPENED,

        /** The current account has no usable credential store here - inside WSL, or its folder is gone. */
        NO_DRAWER,

        /** This IDE would not give us a terminal, and the sign-in has nowhere else to happen. */
        NO_TERMINAL,
    }

    fun login(project: Project, parentDisposable: Disposable, onOutcome: (Outcome) -> Unit) =
        openTerminal(project, parentDisposable, "login", onOutcome)

    /**
     * Signing out goes into the terminal too. The panel should not wipe the authorization with its own
     * hands: there are several ways to sign in, and only the CLI knows about them.
     *
     * Under the current account's drawer for a sharper reason than the sign-in's: a logout REVOKES the
     * credential on Anthropic's side. Run in a plain shell it would end the session of whichever account
     * the CLI signs in by default - that is, sign the person out of an account they never named, on
     * every machine they have.
     */
    fun logout(project: Project, parentDisposable: Disposable, onOutcome: (Outcome) -> Unit) =
        openTerminal(project, parentDisposable, "logout", onOutcome)

    private fun openTerminal(
        project: Project,
        parentDisposable: Disposable,
        verb: String,
        onOutcome: (Outcome) -> Unit,
    ) {
        val accounts = ClaudeAccounts.getInstance()
        val variables = accounts.variablesFor(accounts.currentId, project.basePath)

        if (variables == null) {
            DiagnosticsLog.note(DiagnosticsLog.ACCOUNTS, "a sign-in had no drawer to go into")
            onOutcome(Outcome.NO_DRAWER)
            return
        }

        ApplicationManager.getApplication().invokeLater {
            val opened = runCatching {
                AccountTerminal.open(project, parentDisposable, variables, command(verb))
            }.onFailure {
                thisLogger().warn("Failed to open a terminal for claude auth $verb", it)
            }.getOrDefault(false)

            onOutcome(if (opened) Outcome.OPENED else Outcome.NO_TERMINAL)
        }
    }

    /**
     * The full path rather than a bare name: the terminal takes PATH from its own shell, and if claude
     * was put into ~/.local/bin by the installer, the name alone may not be enough.
     */
    private fun command(verb: String): String {
        val executable = ClaudeExecutable.find()?.absolutePath ?: "claude"

        return "${AccountTerminal.quoted(executable)} auth $verb"
    }
}

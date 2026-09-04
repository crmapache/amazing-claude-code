package io.github.crmapache.amazingclaudecode.claude.accounts

import com.intellij.openapi.Disposable
import com.intellij.openapi.application.ApplicationManager
import com.intellij.openapi.diagnostic.thisLogger
import com.intellij.openapi.project.Project
import com.intellij.util.concurrency.AppExecutorUtil
import io.github.crmapache.amazingclaudecode.claude.ClaudeExecutable
import io.github.crmapache.amazingclaudecode.feedback.DiagnosticsLog
import java.util.concurrent.ScheduledFuture
import java.util.concurrent.TimeUnit
import java.util.concurrent.atomic.AtomicBoolean

/**
 * Adding an account: a terminal for the person, and a question for the CLI.
 *
 * The sign-in itself has to be a terminal. `claude auth login` opens a browser, waits for a code to
 * come back, and may take a detour through SSO - a full dialogue with a process, which is why the panel
 * has never had a sign-in form of its own. The one thing that changes for a second account is the
 * environment that terminal is given: a credential drawer, so the sign-in lands in that account's
 * drawer instead of overwriting the one the person already has.
 *
 * The terminal itself, and why the drawer travels as a typed map rather than as a shell prefix, are
 * [AccountTerminal]'s - the Claude Design sign-in stands on the same ground.
 *
 * **How the finish is noticed, and why not the obvious way.** The terminal offers a termination
 * callback, and it is the wrong signal: it fires when the SHELL session ends, not when the command
 * inside it finishes. A person who signs in and leaves the tab open would never be noticed at all,
 * while a person who closes the tab in confusion would be noticed as a failure. So nothing is read out
 * of the terminal - not the output, not its lifetime. Instead the drawer itself is asked, every few
 * seconds, whether a credential has appeared in it. That is the same question a conversation will ask
 * later, answered by the CLI rather than inferred by us, and it is true exactly when the sign-in is
 * genuinely usable.
 */
internal class AccountSignIn(
    private val project: Project,
    private val parentDisposable: Disposable,
) {

    /** What the screen is told while this runs. */
    sealed interface Outcome {
        data class Added(val account: AccountsState.Account) : Outcome

        /** [code] is for the panel to translate - it speaks ten languages and the IDE speaks one. */
        data class Failed(val code: String) : Outcome

        /**
         * The person stopped waiting. Not a failure and not worth a sentence on screen: they pressed
         * the button, and the only thing to say back is the list without the sign-in in it.
         */
        data object Cancelled : Outcome
    }

    private val running = AtomicBoolean(false)
    private var polling: ScheduledFuture<*>? = null

    /** The drawer minted for this sign-in while it is in flight - what [cancel] has to clear away. */
    @Volatile
    private var pending: AccountsState.Account? = null

    /** Whom to tell, once. Held here so [cancel] can answer as well as the poller. */
    @Volatile
    private var report: ((Outcome) -> Unit)? = null

    /**
     * When the credential first appeared while the shared profile still named the previous account.
     *
     * The gap is ordinary and short - two steps of one login - so it is waited out rather than treated
     * as a failure. Waited out with a limit, because there is one case in which the name genuinely never
     * moves: signing in again as the very account the file already named.
     */
    private var unsettledSince = 0L

    /** Whether a sign-in is in flight. One at a time per project: two would race for the same drawer. */
    val isRunning: Boolean get() = running.get()

    /**
     * Open a terminal signed in to a brand new drawer, and watch that drawer until it fills.
     *
     * [onOutcome] is called exactly once, off the interface thread.
     *
     * Under the same lock as the poller and as [cancel]'s clearing-up, which is what keeps a drawer from
     * being minted a moment after somebody has finished cancelling it. Everything here is quick - a
     * folder, two maps and a file read - so nothing waits on it for long.
     */
    @Synchronized
    fun start(onOutcome: (Outcome) -> Unit) {
        if (!running.compareAndSet(false, true)) {
            onOutcome(Outcome.Failed("already-running"))
            return
        }

        report = onOutcome

        val executable = ClaudeExecutable.find()
        if (executable == null) {
            finish(Outcome.Failed("no-executable"))
            return
        }

        val accounts = ClaudeAccounts.getInstance()

        val pending = accounts.beginSignIn()
        if (pending == null) {
            finish(Outcome.Failed("no-store"))
            return
        }

        // From here on the drawer exists, so [cancel] has something to clean up - and it is only from
        // here on that there is anything to cancel.
        this.pending = pending

        val variables = accounts.variablesFor(pending.id, project.basePath)
        if (variables == null) {
            accounts.abandonSignIn(pending)
            this.pending = null
            finish(Outcome.Failed("no-store"))
            return
        }

        // Who the shared profile names now, before a single thing has been signed into. The whole use of
        // it is downstream: the same answer after the sign-in means the file has not caught up yet, and
        // taking it for the newcomer's name replaces an existing account with them (see
        // ClaudeAccounts.completeSignIn).
        val before = AccountIdentity.current()

        ApplicationManager.getApplication().invokeLater {
            // Cancelled in the moment between asking for the terminal and getting the interface thread.
            // The drawer has already been cleared away by then (see [giveUp]); opening the terminal now
            // would sign somebody in to a drawer nothing points at.
            if (!running.get()) return@invokeLater

            val opened = runCatching { openTerminal(variables, command(executable.absolutePath)) }
                .onFailure { thisLogger().warn("Failed to open a terminal for adding an account", it) }
                .getOrDefault(false)

            if (!opened) {
                // Fails closed: no terminal means no sign-in, and the drawer we minted goes away with it.
                // It never falls back to typing the variable into a shell - see the class comment.
                accounts.abandonSignIn(pending)
                this.pending = null
                finish(Outcome.Failed("no-terminal"))
                return@invokeLater
            }

            watch(pending, before)
        }
    }

    /**
     * The person asked to stop waiting. The drawer goes with it; the terminal stays where it is.
     *
     * The drawer is the part that used to be missing. Stopping the poller alone left the provisional
     * record in the settings and its folder on disk, and the screen refused to start another sign-in for
     * as long as the wait had left to run - ten minutes with nothing on screen able to end it.
     *
     * Deliberately NOT holding this object's lock: the poller does, and it may be inside a
     * twenty-second question about the drawer right now. The caller is the thread carrying the panel's
     * messages, and waiting there would stall every conversation on it. So the flag is dropped here -
     * which is what stops the next tick - and the clearing-up goes to a thread that may wait.
     */
    fun cancel() {
        if (!running.compareAndSet(true, false)) return

        polling?.cancel(false)
        polling = null

        AppExecutorUtil.getAppExecutorService().submit { giveUp() }
    }

    /**
     * Clearing up after a cancelled sign-in, once whatever the poller was doing has finished.
     *
     * The order matters and is the reason this waits for the lock at all: the sign-in may have LANDED in
     * the moment the button was pressed, and then the drawer belongs to a real account - taking it away
     * would delete the credential just filed in it, on this machine and out of the keychain. [finish]
     * clears the record the instant that happens, so nothing left here means there is nothing to undo.
     */
    @Synchronized
    private fun giveUp() {
        pending?.let { ClaudeAccounts.getInstance().abandonSignIn(it) }
        DiagnosticsLog.note(DiagnosticsLog.ACCOUNTS, "a sign-in was cancelled")
        // Says nothing when the sign-in got there first: that outcome has already been reported.
        finish(Outcome.Cancelled)
    }

    private fun watch(pending: AccountsState.Account, before: AccountIdentity.Who) {
        val startedAt = System.currentTimeMillis()

        polling = AppExecutorUtil.getAppScheduledExecutorService().scheduleWithFixedDelay(
            { tick(pending, before, startedAt) },
            POLL_SECONDS,
            POLL_SECONDS,
            TimeUnit.SECONDS,
        )
    }

    /**
     * One look into the drawer.
     *
     * Under this object's lock from beginning to end, so that a cancel arriving mid-question cannot
     * clear away a drawer this very call is about to hand to a real account (see [giveUp]).
     */
    @Synchronized
    private fun tick(pending: AccountsState.Account, before: AccountIdentity.Who, startedAt: Long) {
        if (!running.get()) return

        val accounts = ClaudeAccounts.getInstance()

        val insist = unsettledSince != 0L && System.currentTimeMillis() - unsettledSince > SETTLE_MS
        val landing = runCatching { accounts.completeSignIn(pending, project.basePath, before, insist) }
            .onFailure { thisLogger().info("Could not ask a new drawer who signed into it") }
            .getOrDefault(ClaudeAccounts.Landing.NotYet)

        if (landing is ClaudeAccounts.Landing.Unsettled && unsettledSince == 0L) {
            unsettledSince = System.currentTimeMillis()
        }

        when {
            landing is ClaudeAccounts.Landing.Added -> {
                DiagnosticsLog.note(DiagnosticsLog.ACCOUNTS, "an account was added")
                finish(Outcome.Added(landing.account))
            }

            System.currentTimeMillis() - startedAt > GIVE_UP_MS -> {
                // Nothing landed in the drawer. On macOS the credential is in the keychain rather than
                // the folder, so abandoning has to take the record away too - otherwise a half-finished
                // sign-in leaves a credential nobody can point at or clean up.
                accounts.abandonSignIn(pending)
                DiagnosticsLog.note(DiagnosticsLog.ACCOUNTS, "a sign-in did not land")
                finish(Outcome.Failed("did-not-land"))
            }
        }
    }

    /** Told once, whoever gets here first: the poller, the person, or a step of the start itself. */
    @Synchronized
    private fun finish(outcome: Outcome) {
        polling?.cancel(false)
        polling = null
        pending = null
        running.set(false)

        val told = report ?: return
        report = null
        told(outcome)
    }

    /** Shared with the Claude Design sign-in, which needs a terminal for exactly the same reasons. */
    private fun openTerminal(variables: Map<String, String>, command: String): Boolean =
        AccountTerminal.open(project, parentDisposable, variables, command)

    private fun command(executable: String): String = "${AccountTerminal.quoted(executable)} auth login"

    companion object {
        private const val POLL_SECONDS = 3L

        /**
         * How long the shared profile is given to catch up with the credential before its answer is
         * believed as it stands.
         *
         * Generous against a write that takes milliseconds, and short against the ten minutes a sign-in
         * may take: this only delays the one sign-in that names the account the file already named.
         */
        private const val SETTLE_MS = 15_000L

        /**
         * How long a sign-in may take before the drawer is cleaned up.
         *
         * Generous on purpose: a browser round trip, a password manager and an SSO detour are all in
         * here, and giving up early on somebody who is halfway through is worse than waiting. There is a
         * visible cancel either way, so this is only the backstop for a tab nobody came back to.
         */
        private const val GIVE_UP_MS = 10 * 60 * 1000L
    }
}

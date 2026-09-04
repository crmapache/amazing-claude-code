package io.github.crmapache.amazingclaudecode.claude

import com.intellij.openapi.Disposable
import com.intellij.openapi.application.ApplicationManager
import com.intellij.openapi.project.Project
import com.intellij.openapi.util.Disposer
import com.intellij.util.concurrency.AppExecutorUtil
import io.github.crmapache.amazingclaudecode.claude.accounts.ClaudeAccounts
import java.util.concurrent.ScheduledFuture
import java.util.concurrent.TimeUnit
import kotlinx.serialization.json.add
import kotlinx.serialization.json.buildJsonObject
import kotlinx.serialization.json.put
import kotlinx.serialization.json.putJsonArray

/**
 * Whether the CLI is installed and signed in, and whether the loosest permission mode is allowed here.
 *
 * It sits beside the conversations rather than in the panel because both answers belong to the machine
 * and the project, not to a window: two clients watching one project must not each start their own
 * `claude auth status` to learn the same thing, and the answer has to outlive the window that first
 * asked for it. Until now re-opening the panel started that process again for nothing.
 */
internal class ProjectAuth(
    private val project: Project,
    private val hub: ClaudeSessionHub,
    /** What to do once a sign-in is confirmed - the usage and the model catalogue wait on it. */
    private val onSignedIn: () -> Unit,
    /**
     * The sign-in has moved to another account. Everything counted about the subscription was about the
     * previous one and has to be thrown away rather than merged with what the new one says (see
     * ProjectUsage.forget).
     */
    private val onAccountChanged: (accountId: String) -> Unit = {},
) {

    /**
     * Until the sign-in is confirmed we start no processes: without it the agent answers every question
     * with a single line about /login, and the panel shows the sign-in screen.
     */
    @Volatile
    var loggedIn = false
        private set

    /**
     * The whole of the CLI's last answer about the ordinary sign-in - who, on what plan.
     *
     * Kept so the accounts screen can name that account without starting a second `auth status` of its
     * own: this round already asked, at warm-up, and the answer is the same one.
     */
    @Volatile
    var lastStatus: ClaudeAuth.Status? = null
        private set

    /** Polling of the sign-in state while the user goes through it in the terminal. */
    private var polling: ScheduledFuture<*>? = null

    /**
     * The account last named - what a fresh answer is compared against (see [ClaudeAuth.switchedAccount]).
     * Kept here rather than in the usage itself: the sign-in is asked about in one place, and the figures
     * are only one of the things that belong to an account.
     *
     * Null for "nothing named yet", never an empty string, and that distinction is load-bearing. Empty
     * is a perfectly good NAME here - it is the CLI's ordinary sign-in - so reading it as "unknown" made
     * the one move away from that account invisible: nothing followed it, the rings went on showing the
     * previous subscription's shares and the new account's model catalogue was never asked for.
     */
    @Volatile
    private var account: String? = null

    /**
     * Whether [account] holds an id of ours or the CLI's own notion of who is signed in.
     *
     * The two are different alphabets - a digest against "address|org|method" - and which one is in use
     * changes the moment the first account is added or the last is forgotten. Compared across that
     * change, any two answers differ, which is not a switch but a change of subject.
     */
    @Volatile
    private var accountIsOurs = false

    /** Which outcome the polling is waiting for: signed in, or on the contrary signed out. */
    @Volatile
    private var awaited: Boolean? = null

    /** We ask the CLI in the background: this starts a process, which has no place on the interface thread. */
    fun check() {
        ApplicationManager.getApplication().executeOnPooledThread {
            val accounts = ClaudeAccounts.getInstance()
            val chosen = accounts.currentId

            // Asked under the current account's own environment, so `loggedIn` and the plan describe the
            // account the panel claims to be on rather than whatever the CLI's default drawer holds.
            val status = accounts.variablesFor(chosen, project.basePath)
                ?.let { ClaudeAuth.status(it, project.basePath) }
                ?: ClaudeAuth.Status(installed = true, loggedIn = false)

            val before = loggedIn
            loggedIn = status.loggedIn
            // Only the ordinary sign-in's own answer is worth keeping: asked under a drawer, `email` is
            // still the shared file's and names whoever signed in last (see ClaudeAuth.Status.identity).
            if (chosen.isEmpty()) lastStatus = status
            send(status, chosen)

            /*
             * Which account we are on.
             *
             * Once accounts exist this is OUR record, not the CLI's. Its `email` and `orgId` come from
             * the shared ~/.claude.json, which no drawer partitions, so under two accounts they name
             * whoever signed in last - and a background token refresh by the idle account would read as a
             * switch here and throw away the working account's figures (see ClaudeAuth.Status.identity).
             *
             * With no accounts of our own the CLI's notion is the only one there is, and it is still the
             * right answer: that is a person who switched accounts in a terminal, which this round exists
             * to notice.
             */
            val ours = accounts.list().isNotEmpty()
            val identity = if (ours) chosen else status.identity
            // Only an answer in the same alphabet is worth comparing against - see [accountIsOurs].
            val known = account.takeIf { accountIsOurs == ours }

            val switched = if (ours) {
                known != null && known != identity
            } else {
                known != null && ClaudeAuth.switchedAccount(known, status)
            }

            if (ours || identity.isNotEmpty()) {
                account = identity
                accountIsOurs = ours
            }
            if (switched) onAccountChanged(chosen)

            if (status.loggedIn == awaited) {
                awaited = null
                polling?.cancel(false)
                polling = null
            }

            // The model catalogue comes only after a confirmed sign-in: without one the CLI answers not
            // with a list but with "you are not signed in".
            //
            // On the transition rather than on the state, because what hangs on this is a one-off start:
            // the limits asked for past their own threshold, and every transcript on disk read again to
            // count the day's tokens. The round below watches for an account switched in a terminal and
            // asks this same question every few minutes - answering "signed in" each time set the whole
            // start going again, for every open project, for as long as the panel stayed open.
            if (status.loggedIn && (!before || switched)) onSignedIn()
        }
    }

    /**
     * The sign-in happens in the built-in terminal: a browser opens there and a return is awaited. When
     * it finishes, nobody will tell us - so we simply ask the CLI again until we see the sign-in, or
     * until we tire of it.
     */
    fun login() {
        ClaudeLogin.login(project)
        poll(expected = true)
    }

    fun logout() {
        ClaudeLogin.logout(project)
        poll(expected = false)
    }

    fun stopPolling() {
        polling?.cancel(false)
    }

    /**
     * The round that notices an account switched past the panel.
     *
     * Signing in and out from the panel is watched by [poll] - there the answer is awaited within
     * seconds. But the same switch can be made in a terminal, and then nobody tells the panel at all:
     * until now it went on showing the previous account's usage rings for the rest of the day.
     *
     * The round is rare and only while someone is watching: each turn of it starts a CLI process, and
     * without a person in front of the panel there is nothing for the answer to change.
     */
    fun scheduleUpdates(parentDisposable: Disposable) {
        val watch = AppExecutorUtil.getAppScheduledExecutorService().scheduleWithFixedDelay(
            { if (hub.hasClients()) check() },
            ACCOUNT_PERIOD_MINUTES,
            ACCOUNT_PERIOD_MINUTES,
            TimeUnit.MINUTES,
        )

        Disposer.register(parentDisposable) { watch.cancel(false) }
    }

    /**
     * The agent answers about the sign-in with ordinary text rather than a launch error, so we catch it
     * in the stream: otherwise the panel would be left with an input field there is no point writing
     * into.
     */
    fun noteLoggedOut(text: String) {
        if (!loggedIn || !text.contains(NOT_LOGGED_IN)) return

        loggedIn = false
        check()
    }

    /**
     * Whether the "no questions" mode is allowed on this machine - the Shift+Tab cycle in the panel
     * depends on it. The answer requires questioning the CLI itself, so it goes into the background and
     * arrives as a separate message: holding the panel's first frame for it serves nothing.
     */
    fun checkModeAvailability() {
        ApplicationManager.getApplication().executeOnPooledThread {
            val bypass = PermissionBypass.isAvailable(project.basePath)

            hub.broadcastProject(
                buildJsonObject {
                    put("type", "modeAvailability")
                    put("bypassPermissions", bypass)
                }.toString(),
            )
        }
    }

    /**
     * We wait for the person to finish in the terminal: there is nobody to tell us about it. And we wait
     * for the outcome we need - after a sign-out the polling should stop at "signed out" rather than
     * hammer away to the very limit.
     */
    private fun poll(expected: Boolean) {
        awaited = expected
        polling?.cancel(false)

        val started = AppExecutorUtil.getAppScheduledExecutorService().scheduleWithFixedDelay(
            { check() },
            POLL_SECONDS,
            POLL_SECONDS,
            TimeUnit.SECONDS,
        )
        polling = started

        // We stop this polling specifically, not whatever happens to be in its place: between these two
        // moments the person could have started a new sign-in (or a sign-out), and a limit set by the
        // previous one would cut short someone else's freshly started polling - the panel would then not
        // notice the sign-in at all.
        AppExecutorUtil.getAppScheduledExecutorService().schedule(
            { started.cancel(false) },
            POLL_LIMIT_MINUTES,
            TimeUnit.MINUTES,
        )
    }

    private fun send(status: ClaudeAuth.Status, accountId: String) {
        // The account's own label rather than what the CLI answered: with several accounts its `email`
        // is the shared config file's and names whoever signed in last.
        val named = ClaudeAccounts.getInstance().account(accountId)

        hub.broadcastProject(
            buildJsonObject {
                put("type", "auth")
                put("installed", status.installed)
                put("loggedIn", status.loggedIn)
                put("email", named?.email?.ifEmpty { status.email } ?: status.email)
                put("plan", named?.plan?.ifEmpty { status.plan } ?: status.plan)
                put("accountId", accountId)
                put("executablePath", ClaudePreferences.executablePath)
                // Not found - we show where we looked and what the system itself answered. Those two
                // lists show why we missed, even when the machine is someone else's and cannot be looked
                // at.
                if (!status.installed) {
                    putJsonArray("searched") {
                        add(ClaudeExecutable.systemAnswer())
                        ClaudeExecutable.searchedPlaces().forEach { add(it) }
                    }
                }
            }.toString(),
        )
    }

    private companion object {
        /** The line the agent answers with when the CLI has no sign-in - see [noteLoggedOut]. */
        const val NOT_LOGGED_IN = "Not logged in"

        const val POLL_SECONDS = 3L
        const val POLL_LIMIT_MINUTES = 10L

        /** How often the sign-in is re-checked by itself - see [scheduleUpdates]. */
        const val ACCOUNT_PERIOD_MINUTES = 5L
    }
}

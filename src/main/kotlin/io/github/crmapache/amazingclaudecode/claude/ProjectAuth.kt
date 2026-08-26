package io.github.crmapache.amazingclaudecode.claude

import com.intellij.openapi.Disposable
import com.intellij.openapi.application.ApplicationManager
import com.intellij.openapi.project.Project
import com.intellij.openapi.util.Disposer
import com.intellij.util.concurrency.AppExecutorUtil
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
    private val onAccountChanged: () -> Unit = {},
) {

    /**
     * Until the sign-in is confirmed we start no processes: without it the agent answers every question
     * with a single line about /login, and the panel shows the sign-in screen.
     */
    @Volatile
    var loggedIn = false
        private set

    /** Polling of the sign-in state while the user goes through it in the terminal. */
    private var polling: ScheduledFuture<*>? = null

    /**
     * The account last named by the CLI - what a fresh answer is compared against (see
     * [ClaudeAuth.switchedAccount]). Kept here rather than in the usage itself: the sign-in is asked
     * about in one place, and the figures are only one of the things that belong to an account.
     */
    @Volatile
    private var account = ""

    /** Which outcome the polling is waiting for: signed in, or on the contrary signed out. */
    @Volatile
    private var awaited: Boolean? = null

    /** We ask the CLI in the background: this starts a process, which has no place on the interface thread. */
    fun check() {
        ApplicationManager.getApplication().executeOnPooledThread {
            val status = ClaudeAuth.status()

            val before = loggedIn
            loggedIn = status.loggedIn
            send(status)

            // Before anything is asked of the new account: what is told about the switch clears the
            // memory of the previous one, and a fresh answer arriving into an uncleared memory would be
            // merged with somebody else's figures instead of replacing them.
            val switched = ClaudeAuth.switchedAccount(account, status)
            if (status.identity.isNotEmpty()) account = status.identity
            if (switched) onAccountChanged()

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

    private fun send(status: ClaudeAuth.Status) {
        hub.broadcastProject(
            buildJsonObject {
                put("type", "auth")
                put("installed", status.installed)
                put("loggedIn", status.loggedIn)
                put("email", status.email)
                put("plan", status.plan)
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

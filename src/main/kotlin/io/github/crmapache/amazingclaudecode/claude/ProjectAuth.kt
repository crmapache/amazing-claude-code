package io.github.crmapache.amazingclaudecode.claude

import com.intellij.openapi.application.ApplicationManager
import com.intellij.openapi.project.Project
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

    /** Which outcome the polling is waiting for: signed in, or on the contrary signed out. */
    @Volatile
    private var awaited: Boolean? = null

    /** We ask the CLI in the background: this starts a process, which has no place on the interface thread. */
    fun check() {
        ApplicationManager.getApplication().executeOnPooledThread {
            val status = ClaudeAuth.status()

            loggedIn = status.loggedIn
            send(status)

            if (status.loggedIn == awaited) {
                awaited = null
                polling?.cancel(false)
                polling = null
            }

            // The model catalogue comes only after a confirmed sign-in: without one the CLI answers not
            // with a list but with "you are not signed in".
            if (status.loggedIn) onSignedIn()
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
    }
}

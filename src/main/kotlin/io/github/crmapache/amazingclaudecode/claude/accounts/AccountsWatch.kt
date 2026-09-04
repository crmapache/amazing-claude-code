package io.github.crmapache.amazingclaudecode.claude.accounts

import com.intellij.openapi.application.ApplicationManager
import com.intellij.openapi.components.Service
import com.intellij.openapi.components.service
import com.intellij.openapi.diagnostic.thisLogger
import com.intellij.util.concurrency.AppExecutorUtil
import io.github.crmapache.amazingclaudecode.claude.ClaudeSessionHub
import io.github.crmapache.amazingclaudecode.feedback.DiagnosticsLog
import io.github.crmapache.amazingclaudecode.toolwindow.ClaudePanels
import java.util.concurrent.TimeUnit
import java.util.concurrent.atomic.AtomicBoolean

/**
 * Noticing that the account was switched in ANOTHER IDE on this machine.
 *
 * The register is one book for the whole machine now (see [AccountsState]), but a running IDE holds it in
 * memory: without something watching, WebStorm would go on working on the account IntelliJ has just left
 * until somebody restarted it. So the file is watched, and what it says is applied here exactly as a
 * local choice is applied - every conversation in every open project moves onto it.
 *
 * **It must never write anything back.** That is the whole rule of this file. The way in is the same one
 * the local choice uses MINUS its first line: AccountDesk.use sets the current account and then moves
 * everything; this moves everything and sets nothing. Writing back would be, at best, a storm of two IDEs
 * answering each other, and at worst one of them putting its own stale idea of "current" over the choice
 * the person made a second ago, with nothing on screen saying so.
 *
 * The poll is deliberately dull: a file's stamp is one `stat`, and this file changes a few times a day.
 * Only a changed stamp costs a read (see AccountsState.reload).
 */
@Service(Service.Level.APP)
internal class AccountsWatch {

    private val started = AtomicBoolean(false)

    /**
     * Begin watching, once per IDE.
     *
     * Called when a project's conversation hub is built rather than when a panel opens: a project a phone
     * attached to has conversations and no tool window, and those have to follow the account too.
     */
    fun start() {
        if (ApplicationManager.getApplication()?.isUnitTestMode == true) return
        if (!started.compareAndSet(false, true)) return

        AppExecutorUtil.getAppScheduledExecutorService().scheduleWithFixedDelay(
            { runCatching { look() }.onFailure { thisLogger().warn("The account register could not be re-read", it) } },
            PERIOD_SECONDS,
            PERIOD_SECONDS,
            TimeUnit.SECONDS,
        )
    }

    private fun look() {
        val reloaded = AccountsState.getInstance().reload()
        if (!reloaded.changed) return

        DiagnosticsLog.note(DiagnosticsLog.ACCOUNTS, "the account register changed in another IDE")

        // The conversations first, the screens after: what matters is that nothing goes on running on the
        // account this machine has left, and a list redrawn a moment before or after that is only a list.
        if (reloaded.currentChanged) ClaudeSessionHub.everyHub { it.conversations.switchAllTo() }

        // The list as it now stands, and nothing heavier. The local path re-asks the CLI who is signed in
        // and puts a usage question to every account; from here there is nothing to ask - the answer came
        // out of the file - and doing it anyway would mean a process per account per project per IDE
        // every time somebody in the next window presses Select.
        ClaudePanels.everyPanel { it.accountsChangedElsewhere() }
    }

    companion object {
        fun getInstance(): AccountsWatch = service()

        /** Often enough that a switch in the next window feels immediate, cheap enough to be dull. */
        private const val PERIOD_SECONDS = 2L
    }
}

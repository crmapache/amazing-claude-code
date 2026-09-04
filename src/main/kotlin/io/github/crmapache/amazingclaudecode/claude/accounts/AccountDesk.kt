package io.github.crmapache.amazingclaudecode.claude.accounts

import com.intellij.openapi.Disposable
import com.intellij.openapi.application.ApplicationManager
import com.intellij.openapi.diagnostic.thisLogger
import com.intellij.openapi.project.Project
import com.intellij.util.concurrency.AppExecutorUtil
import io.github.crmapache.amazingclaudecode.claude.ClaudeAuth
import io.github.crmapache.amazingclaudecode.claude.ClaudeCli
import io.github.crmapache.amazingclaudecode.claude.ClaudeSessionHub
import io.github.crmapache.amazingclaudecode.claude.ClaudeSessions
import io.github.crmapache.amazingclaudecode.toolwindow.ClaudePanels
import java.util.concurrent.ConcurrentHashMap
import java.util.concurrent.atomic.AtomicBoolean
import kotlinx.serialization.json.addJsonObject
import kotlinx.serialization.json.buildJsonObject
import kotlinx.serialization.json.put
import kotlinx.serialization.json.putJsonArray

/**
 * The accounts screen, from the plugin's side: the list it draws and the five things it can ask for.
 *
 * One per panel, beside VoiceDesk and FeedbackDesk and for the same reason - the register itself
 * ([ClaudeAccounts]) is the machine's and knows nothing about screens, while everything here is about
 * one window: which project's directory to probe from, whom to answer.
 *
 * **Nothing here reaches a network client.** The messages are handled at the window's own door (see
 * ClaudePanel), which a phone does not physically reach, and they are listed in RemoteCommands.DENIED
 * besides. What travels to a phone about accounts is one opaque id per conversation and nothing else.
 */
internal class AccountDesk(
    private val project: Project,
    private val hub: ClaudeSessionHub,
    private val parentDisposable: Disposable,
) {

    private val accounts: ClaudeAccounts get() = ClaudeAccounts.getInstance()

    @Volatile
    private var signIn: AccountSignIn? = null

    /**
     * Whether a sign-in has been asked for and not yet finished.
     *
     * Claimed before anything else, because the check that follows it now runs in the background: the
     * question "can this machine keep two sign-ins apart" costs up to two processes, and a second press
     * inside that gap used to mint a second credential drawer. It is also what the screen's "adding"
     * state is drawn from - truer than the poller's own flag, which is only raised once the terminal is
     * up.
     */
    private val adding = AtomicBoolean(false)

    /**
     * Whether this machine can keep two sign-ins apart, as last proven - see
     * ClaudeAccounts.capabilityIfKnown for why the screen is never drawn by asking.
     */
    @Volatile
    private var capability: ClaudeAccounts.Capability? = null

    /**
     * Who the CLI's own sign-in belongs to, as it last answered.
     *
     * Cached so the first paint of the screen is not empty while a process is asked. Learning it costs a
     * process, and the answer changes only when somebody signs in or out.
     */
    @Volatile
    private var defaultWho: ClaudeAuth.Status? = null

    /**
     * What each account's health last came back as, and when the round that asked finished.
     *
     * Kept because the list goes out twice - at once, then again with the answers - and the first of the
     * two would otherwise UNSAY what is already on screen: a card that knows it has no stored credential
     * would lose that line and get it back a second later, which is a flicker every time the screen is
     * opened. The clock stops a fresh round starting on every open: each answer costs a process.
     */
    private val knownHealth = ConcurrentHashMap<String, ClaudeAccounts.Health>()

    /**
     * Who each row really is, as the CLI wrote it down while answering about that account alone (see
     * ClaudeAccounts.probedIdentity).
     *
     * Kept beside the health and refreshed in the same round, for the same reason: reading it costs a
     * file per row, and the list goes out on every open.
     */
    private val knownIdentity = ConcurrentHashMap<String, AccountIdentity.Who>()

    @Volatile
    private var checkedAt = 0L

    /**
     * The list, as the screen draws it.
     *
     * Sent as a project fact so a client joining later gets it without asking (see
     * ClaudeSessionHub.PROJECT_ORDER). Health costs a process per account, so it is asked for in the
     * background and the list is sent twice: once at once, so the screen is never empty, and once with
     * the answers.
     */
    fun sendList(withHealth: Boolean = true) {
        broadcast(knownHealth)

        if (!withHealth) return

        // The figures and the names go out on every request, not once a minute with the round below.
        // While this screen is open the panel asks again on a timer, and a share standing still for
        // minutes on the screen opened to read shares is the whole complaint. Saying it often costs
        // nothing: how often an account may actually be ASKED is UsageProbes' business, and it counts
        // for the whole IDE rather than for this window.
        AppExecutorUtil.getAppExecutorService().submit {
            runCatching { figures() }
                .onFailure { thisLogger().warn("The accounts figures could not be refreshed", it) }
        }

        if (System.currentTimeMillis() - checkedAt < FRESH_MS) return

        // Written down BEFORE the round rather than after it. The round takes seconds and a process per
        // account, and until it is written down a second request passes this very check and does the
        // whole thing again - which is not hypothetical: the panel opens, sends the list, and the person
        // walks straight into the screen. A round that fails puts the clock back so the next request is
        // not turned away by an answer that never came.
        checkedAt = System.currentTimeMillis()

        AppExecutorUtil.getAppExecutorService().submit {
            val done = runCatching { round() }

            checkedAt = if (done.isSuccess) System.currentTimeMillis() else 0
            done.onFailure { thisLogger().warn("The accounts round did not finish", it) }
        }
    }

    /** Everything about the list that costs a process or a file. Background only. */
    private fun round() {
        // Whether this machine can keep two sign-ins apart. Here rather than where the list is drawn:
        // proving it starts processes, and the drawing happens on the thread that carries every message
        // between the panel and the IDE (see ClaudeAccounts.capabilityIfKnown).
        capability = accounts.capability(project.basePath)

        // Who the ordinary sign-in is. Without this the screen tells a person who is plainly signed in
        // - the chat beside it is running on that very account - that they have no accounts at all.
        //
        // Taken from the sign-in round when it has an answer: that round asks at start-up anyway, so
        // asking again here would be a second process for a fact already in memory.
        defaultWho = hub.auth.lastStatus
            ?: runCatching { ClaudeAuth.status(workingDirectory = project.basePath) }.getOrNull()

        knownHealth.keys.retainAll(accounts.list().map { it.id }.toSet())
        accounts.list().forEach { knownHealth[it.id] = accounts.health(it.id, project.basePath) }

        figures()
    }

    /**
     * What each row is worth and who it belongs to. Background only, and cheap enough to repeat.
     *
     * The figures are the whole reason an account can be asked anything without switching to it: the
     * credential travels per process, so a lightweight ping in that account's environment answers about
     * that account while the person goes on working on another. The answers come back as ordinary
     * `usage` messages carrying their account, which is what the rings are keyed by anyway.
     *
     * The names come from the same questions. A usage question runs with a config directory of its own,
     * and the CLI fills that file in with the account whose credential it just used - the only place the
     * ordinary sign-in's address is written down truthfully (see ClaudeAccounts.probedIdentity).
     *
     * The default sign-in is asked along with the rest: it is a row on this screen like any other, and a
     * row without figures is the one thing this screen exists to avoid.
     */
    private fun figures() {
        val asked = listOf("") + accounts.list().map { it.id }

        knownIdentity.keys.retainAll(asked.toSet())
        asked.forEach { id -> accounts.probedIdentity(id)?.let { knownIdentity[id] = it } }

        broadcast(knownHealth)

        asked.forEach { hub.usage.refreshLimits(urgent = true, viaPing = true, account = it) }

        // And which models each of them can run. Not for this screen - it shows no models - but for the
        // press that follows it: a conversation moved onto an account whose plan has no such model gives
        // a process that starts, replays, looks perfectly well and dies on the first message (see
        // ClaudeAccounts.canRun). The catalogue is what lets the move put the model right beforehand, and
        // this screen is the one place a person has to pass through to switch at all. Once per account -
        // ProjectUsage.refreshModels latches it.
        asked.forEach { hub.usage.refreshModels(ClaudeSessions.MAIN_SESSION, account = it) }
    }

    private fun broadcast(health: Map<String, ClaudeAccounts.Health>) {
        // A sign-in that was begun and never finished leaves a draft in the book, and the book is shared
        // by every IDE on this machine now - so an IDE that was closed halfway through one would leave
        // "Signing in…" sitting on every screen for ever. Nothing waits longer than the sign-in itself is
        // given (see AccountSignIn.GIVE_UP_MS), so past that it is not in progress, it is litter.
        val staleDrafts = System.currentTimeMillis() - STALE_DRAFT_MS
        // Whatever is already known, never a fresh proof: this runs on the thread that carries the
        // panel's messages, and proving it there stalls everything else for as long as two processes
        // take (see ClaudeAccounts.capabilityIfKnown). Not known yet means the field is left out, and
        // the screen draws the list without the sentence about it - the same shape the health of a row
        // has on the first of the two broadcasts.
        val proven = capability ?: accounts.capabilityIfKnown(project.basePath)?.also { capability = it }
        val current = accounts.currentId

        hub.broadcastProject(
            buildJsonObject {
                put("type", "accounts")
                proven?.let { put("capability", it.name.lowercase()) }
                put("current", current)
                put("pending", adding.get())
                putJsonArray("accounts") {
                    /*
                     * The sign-in Claude Code already had comes first, and it is a row like any other.
                     *
                     * It has no credential drawer - it IS the CLI's own store - so its id is empty, it can
                     * be switched back to and renamed, and it cannot be forgotten: the only thing that
                     * could mean is signing the person out of Claude Code altogether.
                     *
                     * Listed whenever the CLI reports a sign-in, whether or not this panel has ever added
                     * anything. Left out, the screen would deny the existence of the account paying for the
                     * conversation open next to it.
                     */
                    defaultWho?.takeIf { it.loggedIn }?.let { who ->
                        // The address and the organisation come out of a file every drawer shares, so
                        // after an account is added they may belong to the newcomer rather than to this
                        // row. What this row itself wrote down while being asked about its own usage is
                        // the straight answer; the guess by elimination stays as the fallback until such
                        // an answer exists (see ClaudeAccounts.probedIdentity and defaultIdentity). The
                        // plan needs neither: that one the CLI reads from the credential itself.
                        val email = knownIdentity[""]?.email ?: accounts.defaultIdentity(who.email)

                        addJsonObject {
                            put("id", "")
                            put("alias", accounts.defaultAlias)
                            put("email", email)
                            put("plan", who.plan)
                            put("isDefault", true)
                            put("health", ClaudeAccounts.Health.PRESENT.name.lowercase())
                        }
                    }

                    accounts.list().filterNot { it.isPending && it.addedAt < staleDrafts }.forEach { account ->
                        // The address harvested at sign-in is right, and the one the account wrote down
                        // while answering about itself is right too - but only the second survives an
                        // account added while the shared file named somebody else.
                        val identity = knownIdentity[account.id]

                        addJsonObject {
                            put("id", account.id)
                            // The person's own word for it, and the address underneath. The panel shows
                            // the alias when there is one and falls back to the address - never the other
                            // way round: a name given on purpose beats one Anthropic assigned.
                            put("alias", account.alias)
                            put("email", identity?.email ?: account.email)
                            put("plan", account.plan)
                            put("pending", account.isPending)
                            health[account.id]?.let { put("health", it.name.lowercase()) }
                        }
                    }
                }
            }.toString(),
        )
    }

    /**
     * The next list is asked for in full.
     *
     * Called wherever the SET of accounts changes rather than merely which one is current: the freshness
     * window above exists to stop repeated opens starting processes, and an account that has just
     * appeared has no answer for it to reuse.
     */
    private fun invalidate() {
        checkedAt = 0
    }

    /**
     * Choose an account: new conversations start on it, and the ones already open move onto it.
     *
     * Moving them is a new process over the same transcript - the CLI reads its credentials once, at
     * start - so a tab in the middle of a turn is left to finish and moves after (see
     * ClaudeSessions.switchAllTo). What a person means by choosing an account is "this is what I am
     * working on now", and a chat open in front of them going on being billed elsewhere is not that.
     */
    fun use(id: String) {
        // A row the register has never heard of - forgotten in another window while this list stood
        // still. Answered with the list rather than with silence: the screen marked that row "switching"
        // the moment it was pressed and takes the mark off when an answer arrives, and an answer that
        // never comes is a button that says "Switching…" until somebody leaves the screen and returns.
        // A row this machine cannot actually run on: forgotten in another window while this list stood
        // still, or a sign-in still in progress. Answered with the list rather than with silence - the
        // screen marked that row "switching" the moment it was pressed and takes the mark off when an
        // answer arrives, and an answer that never comes is a button that says "Switching…" until
        // somebody leaves the screen and returns.
        if (!accounts.canSelect(id)) {
            sendList(withHealth = false)
            return
        }

        accounts.currentId = id
        // Even when the register already named this account. Writing it moves the conversations only when
        // it CHANGES (see ClaudeAccounts.currentId), and pressing Select on the row already marked current
        // is how a person says "and yet the tab in front of me is somewhere else" - a tab left behind by
        // an older version of this, or by an IDE that was closed halfway through a move. The screens are
        // redrawn from here in any case.
        moveEverything()
    }

    /**
     * Every conversation on this machine onto the account now chosen, and every screen redrawn.
     *
     * Two fan-outs rather than one, and they cover different things. The conversations live in the hubs,
     * and a hub exists for every project a phone has attached to as well as for every open panel - those
     * were being walked past, and went on running on the account just left. The redraw is the panels':
     * everything counted about the subscription belongs to the account it was counted for, so a second
     * window would otherwise show the previous account's rings until somebody noticed.
     */
    private fun moveEverything() {
        ClaudeSessionHub.everyHub { it.conversations.switchAllTo() }
        ClaudePanels.everyPanel { it.accountsChanged() }
    }

    /** Sign in to another account, in a terminal of this project. */
    fun add() {
        // The slot is claimed here, on the thread that asked, and everything else happens off it: the
        // guard below can start two processes, and a second press inside that gap would mint a second
        // credential drawer for one sign-in.
        if (!adding.compareAndSet(false, true)) return

        sendList(withHealth = false)

        AppExecutorUtil.getAppExecutorService().submit {
            // Guarded here as well as on screen, because this is the one action that can damage what is
            // already there: on a machine that cannot keep two sign-ins apart, a second
            // `claude auth login` lands in the same drawer and overwrites the account the person is
            // working on. A panel showing a stale capability must not be able to reach that.
            val proven = accounts.capability(project.basePath).also { capability = it }
            if (proven != ClaudeAccounts.Capability.SUPPORTED) {
                release()
                sendOutcome("not-supported")
                return@submit
            }

            val started = AccountSignIn(project, parentDisposable)
            signIn = started
            sendList(withHealth = false)

            started.start { outcome ->
                release()

                when (outcome) {
                    is AccountSignIn.Outcome.Added -> {
                        // Adding an account makes the CLI rewrite the shared parts of its own
                        // configuration - the cached model access, the org default, the usage
                        // utilisation - for EVERY account, not only the new one. So everybody's figures
                        // are re-asked, not just the newcomer's.
                        accounts.list().forEach { hub.usage.forget(it.id) }
                        invalidate()
                        ClaudePanels.everyPanel { it.accountsChanged() }
                    }

                    is AccountSignIn.Outcome.Failed -> {
                        sendList(withHealth = false)
                        sendOutcome(outcome.code)
                    }

                    // Nothing to say: the person pressed the button, and the answer is the list with
                    // the sign-in gone from it.
                    AccountSignIn.Outcome.Cancelled -> sendList(withHealth = false)
                }
            }
        }
    }

    /**
     * Stop waiting for a sign-in that is under way.
     *
     * The terminal is left where it is: it belongs to the person, and closing somebody's terminal window
     * is not what a Cancel on this screen offers to do. What goes is the drawer and the provisional
     * record, which is what was holding the "Add" button shut (see AccountSignIn.cancel).
     */
    fun cancelAdd() {
        signIn?.cancel()
    }

    /** The sign-in slot is free again, and the screen is told so rather than left saying "adding". */
    private fun release() {
        signIn = null
        adding.set(false)
    }

    /**
     * Sign out of Claude Code, and carry on somewhere else if there is somewhere to carry on.
     *
     * This is what "Forget" cannot be for the sign-in the CLI already had: it has no drawer to delete, so
     * the only way to remove it is to end the session itself. Unlike forgetting an added account, this
     * DOES revoke the credential on Anthropic's side - which is what a person pressing "Log out" means,
     * and exactly why the panel asks first.
     *
     * Run headless rather than in a terminal: `claude auth logout` takes no options and asks nothing, so
     * a terminal would only be a window to close afterwards.
     */
    fun logout(id: String) {
        // Where to go afterwards, decided before the logout lands: an account still signed in here means
        // the person keeps working instead of meeting the sign-in screen.
        // A draft is not somewhere to carry on: its drawer is empty, so every conversation moved onto it
        // would come up signed out (see AccountsState.Account.isPending).
        val next = accounts.list().firstOrNull { it.id != id && !it.isPending }?.id.orEmpty()

        ClaudeCli.run(
            workingDirectory = project.basePath,
            args = listOf("auth", "logout"),
            accountId = id,
            onError = { sendOutcome("logout-failed") },
            onResult = {
                val moved = id == accounts.currentId
                if (moved) accounts.currentId = next
                // Its figures belonged to a subscription this machine no longer reaches.
                hub.usage.forget(id)
                defaultWho = null
                invalidate()
                // Conversations still open on the account just signed out of are moved along with the
                // choice: their credential has been revoked, so the next turn in them would not start at
                // all. Signing out of an account nobody was working on changes nothing but the list.
                if (moved) moveEverything() else ClaudePanels.everyPanel { it.accountsChanged() }
            },
        )
    }

    /**
     * Drop an account from this machine.
     *
     * Whatever was running on it moves too, and that is not politeness: the drawer has just been deleted,
     * so the next turn in such a conversation would find no credential at all. Forgetting the account
     * that was current also chooses a successor (see AccountsState.forget), and the conversations follow
     * it exactly as they follow the Select button.
     */
    fun forget(id: String) {
        accounts.forget(id)
        knownHealth.remove(id)
        invalidate()
        moveEverything()
    }

    /**
     * Authorize Claude Design for the account in force - in a terminal, because the CLI offers no other
     * way in from a streaming session (see [DesignLogin]).
     *
     * Silent when it works. The terminal comes to the front with the sign-in already running, so a line
     * on the screen behind it would only describe what the person is looking at; a refusal is the one
     * thing worth saying, and it goes out as a code like every other answer here.
     */
    fun designLogin() {
        ApplicationManager.getApplication().invokeLater {
            DesignLogin.open(project, parentDisposable)?.let { sendOutcome(it) }
        }
    }

    /** The person's own name for an account - "Work", "Home". */
    fun rename(id: String, alias: String) {
        accounts.rename(id, alias)
        sendList(withHealth = false)
    }

    private companion object {
        /** Asking again inside this window would only start processes to learn what is already on screen. */
        const val FRESH_MS = 60_000L

        /** Past this a draft is not a sign-in in progress, it is what a closed IDE left behind. */
        const val STALE_DRAFT_MS = 15 * 60 * 1000L
    }

    /** A code rather than a sentence: the panel speaks ten languages and this side speaks one. */
    private fun sendOutcome(code: String) {
        hub.broadcastProject(
            buildJsonObject {
                put("type", "accountOutcome")
                put("code", code)
            }.toString(),
        )
    }
}

package io.github.crmapache.amazingclaudecode.claude.accounts

import com.intellij.testFramework.fixtures.BasePlatformTestCase
import io.github.crmapache.amazingclaudecode.claude.ClaudePreferences
import io.github.crmapache.amazingclaudecode.claude.ClaudeSessionHub
import io.github.crmapache.amazingclaudecode.claude.ClaudeSessions

/**
 * Which account a conversation ends up on, and which model it may run there.
 *
 * There used to be a chain of answers here - the transcript's own account, then the request's, then the
 * parent's, then the machine's. There is one now: the account chosen on this machine, for everything.
 * The rule is worth a test file of its own because every mistake in it is invisible - the conversation
 * opens, works and answers exactly as it should, and the wrong subscription pays.
 *
 * The model rides along for a reason that is not obvious: the CLI does NOT refuse a model an account has
 * no access to when the process starts. It comes up, names the model in its own init event, replays the
 * transcript and looks perfectly well - and dies on the person's first message with an HTTP 404 that
 * mentions no account at all. So the model is put right before the process is raised, or not at all.
 */
class AccountChoiceTest : BasePlatformTestCase() {

    private val accounts: ClaudeAccounts get() = ClaudeAccounts.getInstance()

    private fun sessions(onBorn: (String, String, String, String) -> Unit = { _, _, _, _ -> }) = ClaudeSessions(
        workingDirectory = null,
        parentDisposable = testRootDisposable,
        onEvent = { _, _ -> },
        onError = { _, _ -> },
        onFinished = {},
        onBorn = onBorn,
    )

    private fun account(id: String, model: String = "") = AccountsState.Account().apply {
        this.id = id
        storeDir = "/tmp/acc/$id"
        email = "$id@example.com"
        this.model = model
    }

    /** Registered and made current in one breath - the only thing that decides anything now. */
    private fun working(id: String, model: String = "") {
        AccountsState.getInstance().remember(account(id, model))
        accounts.currentId = id
    }

    override fun setUp() {
        super.setUp()
        // The register is machine-wide and outlives a test, so each one starts from a known list.
        // AccountsState.forget rather than ClaudeAccounts.forget on purpose: the second deletes credential
        // drawers off the disk and reaches into the keychain, which is nothing a test may do.
        AccountsState.getInstance().accounts().forEach { AccountsState.getInstance().forget(it.id) }
        accounts.currentId = ""
        ClaudePreferences.model = ""
    }

    override fun tearDown() {
        runCatching {
            AccountsState.getInstance().accounts().forEach { AccountsState.getInstance().forget(it.id) }
            accounts.currentId = ""
            ClaudePreferences.model = ""
        }
        super.tearDown()
    }

    // --- Who pays --------------------------------------------------------------------

    fun testANewConversationStartsOnTheCurrentAccount() {
        working("work")

        val sessions = sessions()
        sessions.prompt("main", "hello")

        assertEquals("work", sessions.accountOf("main"))
    }

    /**
     * The promise this file now carries, and the reverse of what it used to.
     *
     * A conversation opened from the history runs on the account chosen TODAY, whatever it was billed to
     * when it was written. Choosing an account means "everything I do is on this one", and a conversation
     * that quietly opted out of that was the largest of the exceptions.
     */
    fun testAResumedConversationRunsOnTheCurrentAccount() {
        AccountsState.getInstance().remember(account("work"))
        working("home")

        val sessions = sessions()
        sessions.resume("main", "transcript-1")

        assertEquals("home", sessions.accountOf("main"))
    }

    /** And a fork, which used to inherit its parent's account through the launch it was built from. */
    fun testAForkRunsOnTheCurrentAccountRatherThanItsParents() {
        AccountsState.getInstance().remember(account("work"))
        working("home")

        val sessions = sessions()
        sessions.prompt("parent", "hello")
        sessions.branchFrom("parent", "branch")

        assertEquals("home", sessions.accountOf("branch"))
    }

    /**
     * The conversations already open follow the choice WITHOUT anybody remembering to move them.
     *
     * Every test above moves them by hand, the way the Select button does, and that is exactly how the
     * hole appeared: the first account ever added makes itself current inside a sign-in (see
     * ClaudeAccounts.completeSignIn), where there is nobody to think of the open tabs. What the person
     * saw was two tabs of one project reporting two different subscriptions on the usage rings - the tab
     * they were working in still on the sign-in they had just left, and every new tab and every fork on
     * the newcomer. So the move belongs to the choice itself, and this test is what says so: no
     * switchAllTo here, and the conversation is one the project's own hub holds, because that is what a
     * choice made anywhere on the machine has to reach.
     */
    fun testOpenConversationsFollowAChoiceNobodyMovedThemFor() {
        val conversations = ClaudeSessionHub.getInstance(project).conversations
        try {
            conversations.resume("moved-by-the-choice", "transcript-1")
            assertEquals("", conversations.accountOf("moved-by-the-choice"))

            // Remembered and made current in one breath - which is what a first sign-in does by itself.
            working("work")

            assertEquals("work", conversations.accountOf("moved-by-the-choice"))
        } finally {
            // The hub belongs to a project shared by every test in this module.
            conversations.close("moved-by-the-choice")
        }
    }

    /**
     * A tab nobody has started answers with the account it WOULD start on.
     *
     * Empty is not "nothing yet" here - it names the CLI's ordinary sign-in - so an untouched tab used to
     * claim the default account to every client, and to the prompt-improve button and the model
     * catalogue with it.
     */
    fun testATabWithNoProcessAnswersWithTheAccountItWouldStartOn() {
        working("work")

        assertEquals("work", sessions().accountOf("never-opened"))
    }

    /**
     * Signing in again as an account already on the list gives it a NEW credential drawer and deletes the
     * old one, so the processes running as it are left pointing at what was deleted (see
     * ClaudeAccounts.completeSignIn). They are raised again over their own transcripts - but only the
     * ones that are actually running.
     *
     * A tab with no process is pointing at nothing: it reads the register when it starts, and by then the
     * register names the new drawer. Raised here it would cost a birth announcement to every client -
     * account, model, effort - for a conversation nothing whatever has happened to.
     */
    fun testARenewalLeavesATabWithNoProcessAlone() {
        working("work")

        var births = 0
        val sessions = sessions(onBorn = { _, _, _, _ -> births++ })
        sessions.resume("main", "transcript-1")
        assertEquals(1, births)

        sessions.relaunchOn("work")

        assertEquals(1, births)
        assertEquals("work", sessions.accountOf("main"))
    }

    // --- Which model may be run there -------------------------------------------------

    /**
     * A model the destination account cannot run is replaced before the process is raised, by that
     * account's own last model.
     */
    fun testAModelTheAccountCannotRunIsReplacedOnTheWayAcross() {
        AccountsState.getInstance().remember(account("home", model = "sonnet"))
        accounts.noteModels("home", setOf("sonnet"))
        working("work")
        accounts.noteModels("work", setOf("opus", "sonnet"))

        val sessions = sessions()
        sessions.setModel("main", "opus") {}
        assertEquals("opus", sessions.model("main"))

        accounts.currentId = "home"
        sessions.switchAllTo()

        assertEquals("home", sessions.accountOf("main"))
        assertEquals("sonnet", sessions.model("main"))
    }

    /** And one it can run is left exactly where it was: the move is about the subscription, not the model. */
    fun testAModelTheAccountCanRunSurvivesTheMove() {
        AccountsState.getInstance().remember(account("home"))
        accounts.noteModels("home", setOf("opus", "sonnet"))
        working("work")

        val sessions = sessions()
        sessions.setModel("main", "opus") {}

        accounts.currentId = "home"
        sessions.switchAllTo()

        assertEquals("opus", sessions.model("main"))
    }

    /**
     * An account nobody has asked keeps its hands off the model, and that way round is not a coin toss.
     *
     * An unasked catalogue is the ordinary state of the first seconds of a project. Read as a refusal it
     * would throw away the model of every conversation opened from the history - including the one the
     * rule exists to protect, an old chat on a million-token model whose messages were sized to it.
     */
    fun testAnUnaskedAccountLeavesTheModelAlone() {
        AccountsState.getInstance().remember(account("unasked"))
        working("work")

        val sessions = sessions()
        sessions.setModel("main", "opus") {}

        accounts.currentId = "unasked"
        sessions.switchAllTo()

        assertEquals("opus", sessions.model("main"))
    }

    /**
     * The case the clamp is really for, and the one it used to miss.
     *
     * Nobody has ever picked a model while on the destination account, so its own record is empty - but
     * every applied pick writes the MACHINE's default, so that default is the model just refused. Left
     * unchecked, the last resort handed it straight back and the move produced exactly the 404 it exists
     * to prevent. What is left is the account's own default, named rather than left out: a move resumes
     * the transcript, and the CLI resumed without a model flag carries on at the one written in it.
     */
    fun testAnAccountWithNoModelOfItsOwnFallsToOneItCanRun() {
        AccountsState.getInstance().remember(account("home"))
        accounts.noteModels("home", setOf("default", "sonnet"))
        working("work")
        accounts.noteModels("work", setOf("opus", "sonnet"))

        val sessions = sessions()
        sessions.setModel("main", "opus") {}
        // The pick wrote the machine's default as well as this tab's model - which is the whole trap.
        assertEquals("opus", ClaudePreferences.model)

        accounts.currentId = "home"
        sessions.switchAllTo()

        assertEquals("default", sessions.model("main"))
    }

    /** And with no catalogue to name anything from, no model flag at all - never the refused one. */
    fun testAnAccountThatRefusesEverythingKnownGetsNoModelFlag() {
        AccountsState.getInstance().remember(account("home"))
        accounts.noteModels("home", setOf("sonnet"))
        working("work")

        val sessions = sessions()
        sessions.setModel("main", "opus") {}

        accounts.currentId = "home"
        sessions.switchAllTo()

        assertEquals("", sessions.model("main"))
    }

    // --- Forgetting -------------------------------------------------------------------

    fun testForgettingTheCurrentAccountMovesToAnotherOne() {
        val state = AccountsState.getInstance()
        state.remember(account("work"))
        state.remember(account("home"))
        state.current = "work"

        state.forget("work")

        assertEquals("home", state.current)
    }

    /**
     * Never onto a draft, though: a sign-in still in progress has an empty drawer, so every conversation
     * that started on it would come up signed out.
     */
    fun testForgettingNeverMovesOntoASignInStillInProgress() {
        val state = AccountsState.getInstance()
        state.remember(account("work"))
        state.remember(account(ClaudeAccounts.PENDING_PREFIX + "half-done"))
        state.current = "work"

        state.forget("work")

        assertEquals("", state.current)
    }
}

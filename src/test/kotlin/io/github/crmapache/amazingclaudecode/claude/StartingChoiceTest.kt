package io.github.crmapache.amazingclaudecode.claude

import com.intellij.testFramework.fixtures.BasePlatformTestCase
import io.github.crmapache.amazingclaudecode.claude.accounts.AccountsState
import io.github.crmapache.amazingclaudecode.claude.accounts.ClaudeAccounts

/**
 * What a new tab starts on, and the one promise that matters about it: the answer SHOWN is the answer the
 * launch uses.
 *
 * The two used to be worked out apart - the launch read the paying account's memory, the chip over an
 * empty tab, the phone and the scenarios did not - and nothing caught it, because every half was right on
 * its own. Caught live instead: a sandbox chip saying Sonnet over a tab that came up on Opus. So every case
 * here asks both, and a conversation born in a fresh tab is the launch's side of the comparison.
 */
class StartingChoiceTest : BasePlatformTestCase() {

    private val accounts: ClaudeAccounts get() = ClaudeAccounts.getInstance()

    private fun account(id: String, model: String = "", effort: String = "") = AccountsState.Account().apply {
        this.id = id
        storeDir = "/tmp/acc/$id"
        email = "$id@example.com"
        this.model = model
        this.effort = effort
    }

    private fun working(id: String, model: String = "", effort: String = "") {
        AccountsState.getInstance().remember(account(id, model, effort))
        accounts.currentId = id
    }

    /** The model and the effort a conversation is born with in a tab nobody chose anything for. */
    private fun born(): Pair<String, String> {
        var model = "unborn"
        var effort = "unborn"
        val sessions = ClaudeSessions(
            workingDirectory = null,
            parentDisposable = testRootDisposable,
            onEvent = { _, _ -> },
            onError = { _, _ -> },
            onFinished = {},
            onBorn = { _, bornEffort, bornModel, _ ->
                effort = bornEffort
                model = bornModel
            },
        )
        // Brings the conversation into being without raising a process: a tab with no process only
        // records an effort (see ClaudeSession.setEffort). Not remembered, so nothing it does is an input.
        sessions.setEffort("main", "max", remember = false)
        return model to effort
    }

    private fun reset() {
        AccountsState.getInstance().accounts().forEach { AccountsState.getInstance().forget(it.id) }
        accounts.currentId = ""
        ClaudePreferences.model = ""
        ClaudePreferences.effort = ""
        ClaudePreferences.newTabModel = ""
        ClaudePreferences.newTabEffort = ""
        ClaudePreferences.customModels = emptyList()
    }

    override fun setUp() {
        super.setUp()
        reset()
    }

    override fun tearDown() {
        runCatching { reset() }
        super.tearDown()
    }

    /**
     * The case the sandbox caught. The machine was last left on Sonnet at low, the account in use on Opus
     * at xhigh - a pick made in another IDE on the shared register, or on this account before a switch
     * away and back. The launch takes the account's; so must everything that shows it.
     */
    fun testAnAccountsOwnMemoryIsWhatIsShownAndWhatIsLaunched() {
        ClaudePreferences.model = "sonnet"
        ClaudePreferences.effort = "low"
        working("work", model = "opus[1m]", effort = "xhigh")

        assertEquals("opus[1m]", StartingChoice.model())
        assertEquals("xhigh", StartingChoice.effort())
        assertEquals("opus[1m]" to "xhigh", born())
    }

    /** "As last chosen" on the "New chats" screen names the same thing an unpinned tab gets. */
    fun testAsLastChosenMeansTheAccountsLastPick() {
        ClaudePreferences.model = "sonnet"
        ClaudePreferences.effort = "low"
        working("work", model = "opus", effort = "high")

        assertEquals("opus", StartingChoice.unpinnedModel())
        assertEquals("high", StartingChoice.unpinnedEffort())
    }

    /** The pin was said in words, and it is stronger than any memory - shown and launched alike. */
    fun testAPinBeatsTheAccountsMemory() {
        working("work", model = "opus", effort = "xhigh")
        ClaudePreferences.newTabModel = "haiku"
        ClaudePreferences.newTabEffort = "medium"

        assertEquals("haiku", StartingChoice.model())
        assertEquals("medium", StartingChoice.effort())
        assertEquals("haiku" to "medium", born())
        // And the entry beside the pin still names what an unpinned tab would get.
        assertEquals("opus", StartingChoice.unpinnedModel())
    }

    /** An account nobody has picked anything on - the ordinary sign-in among them - falls to the machine. */
    fun testAnAccountWithNoMemoryFallsToTheMachinesLastPick() {
        ClaudePreferences.model = "sonnet"
        ClaudePreferences.effort = "low"
        working("fresh")

        assertEquals("sonnet", StartingChoice.model())
        assertEquals("low", StartingChoice.effort())
        assertEquals("sonnet" to "low", born())
    }

    /** Switching accounts changes the answer, since the memory belongs to the account. */
    fun testSwitchingAccountsBringsTheOthersMemory() {
        AccountsState.getInstance().remember(account("home", model = "sonnet", effort = "low"))
        working("work", model = "opus", effort = "xhigh")
        assertEquals("opus", StartingChoice.model())

        accounts.currentId = "home"

        assertEquals("sonnet", StartingChoice.model())
        assertEquals("low", StartingChoice.effort())
        assertEquals("sonnet" to "low", born())
    }

    /**
     * A pin the account cannot run is held to what it can, and the chip says the model the launch will
     * actually use rather than the one it will be refused - the window mark comes off first.
     */
    fun testAPinTheAccountCannotRunIsShownAsTheLaunchWillRunIt() {
        working("pro")
        accounts.noteModels("pro", setOf("default", "opus", "sonnet"))
        ClaudePreferences.newTabModel = "opus[1m]"

        assertEquals("opus", StartingChoice.model())
        assertEquals("opus", born().first)
    }

    /** A request that names a model outranks everything, and is clamped just the same. */
    fun testARequestOutranksThePinAndIsClampedToo() {
        working("pro", model = "sonnet")
        accounts.noteModels("pro", setOf("default", "sonnet"))
        ClaudePreferences.newTabModel = "haiku"

        assertEquals("sonnet", StartingChoice.model(requested = "sonnet"))
        assertEquals("sonnet", StartingChoice.model(requested = "opus"))
        assertEquals("low", StartingChoice.effort(requested = "low"))
    }

    /**
     * A tab opened with a choice of its own - a phone's new chat - is drawn by that choice before its first
     * message, and what it is drawn by is what it is born with (see ClaudeSessions.planned). Reported from
     * Windows: a model added by hand, chosen for a new chat on a phone, appeared nowhere until the first
     * answer - "default" on the phone, the setting at the desk - and read as a model that cannot be started.
     */
    fun testALaunchedTabIsShownWhatItIsBornWith() {
        working("pro")
        accounts.noteModels("pro", setOf("default", "sonnet"))
        ClaudePreferences.customModels = listOf("glm-4.6")
        ClaudePreferences.newTabModel = "sonnet"

        var model = "unborn"
        var effort = "unborn"
        val sessions = ClaudeSessions(
            workingDirectory = null,
            parentDisposable = testRootDisposable,
            onEvent = { _, _ -> },
            onError = { _, _ -> },
            onFinished = {},
            onBorn = { _, bornEffort, bornModel, _ ->
                effort = bornEffort
                model = bornModel
            },
        )
        sessions.rememberLaunch("phone", SessionLaunch(model = "glm-4.6", effort = "low", mode = "acceptEdits"))

        val planned = sessions.planned("phone")
        assertEquals("glm-4.6", planned?.model)
        assertEquals("low", planned?.effort)
        assertEquals("acceptEdits", planned?.mode)

        // Brought into being the way born() does it - no process, the effort it already had.
        sessions.setEffort("phone", "low", remember = false)

        assertEquals(planned?.model, model)
        assertEquals(planned?.effort, effort)
        // Born, the choice is spent: from here the conversation itself answers.
        assertNull(sessions.planned("phone"))
    }

    /** A tab with no choice of its own has nothing to announce: the setting already draws it, and rightly. */
    fun testATabWithoutAChoiceHasNothingPlanned() {
        val sessions = ClaudeSessions(
            workingDirectory = null,
            parentDisposable = testRootDisposable,
            onEvent = { _, _ -> },
            onError = { _, _ -> },
            onFinished = {},
            onBorn = { _, _, _, _ -> },
        )

        assertNull(sessions.planned("plain"))
    }
}

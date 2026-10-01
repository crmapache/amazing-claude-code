package io.github.crmapache.amazingclaudecode.claude.accounts

import com.intellij.testFramework.fixtures.BasePlatformTestCase
import java.nio.file.Files
import java.nio.file.Path

/**
 * The account register as a file two IDEs share.
 *
 * Everything here breaks silently. A change that never reaches the disk is on screen all evening and gone
 * in the morning; a write that overwrites what the window next door just did takes an account off this
 * machine along with the only pointer to its credential drawer, whose name is random. So the rules are
 * held here rather than by care while reading a diff.
 */
class AccountsBookTest : BasePlatformTestCase() {

    private lateinit var folder: Path

    private fun book() = AccountsState(folder.resolve(AccountsState.FILE_NAME))

    private fun account(id: String) = AccountsState.Account().apply {
        this.id = id
        storeDir = "/tmp/acc/$id"
        email = "$id@example.com"
        addedAt = 1_700_000_000_000
    }

    override fun setUp() {
        super.setUp()
        folder = Files.createTempDirectory("acc-book-test")
    }

    /**
     * The trap this shape was written around: the book hands out COPIES, so a change written into one is
     * on screen and nowhere else. Every mutation has to go through a method of its own.
     */
    fun testARenameSurvivesAReopen() {
        val first = book()
        first.remember(account("work"))
        first.rename("work", "Work")

        assertEquals("Work", book().account("work")?.alias)
    }

    fun testTheModelAnAccountWasLeftOnSurvivesAReopen() {
        val first = book()
        first.remember(account("work"))
        first.rememberChoice("work", model = "opus", effort = "low")

        val reopened = book().account("work")
        assertEquals("opus", reopened?.model)
        assertEquals("low", reopened?.effort)
    }

    /**
     * A model taken off the hand-added list has to go from the accounts too, and this is the half that
     * used to be missed. The account's memory is what a new tab launches on FIRST, so clearing only the
     * machine's default left the stronger record naming a model nobody offers - and nothing further down
     * catches it, because a hand-added name is in no catalogue and the clamp reads "unknown" as a yes.
     */
    fun testAModelTakenOffTheListIsForgottenByEveryAccountThatNamedIt() {
        val first = book()
        first.remember(account("work"))
        first.remember(account("home"))
        first.rememberChoice("work", model = "my-provider/lyra", effort = "low")
        first.rememberChoice("home", model = "opus", effort = "high")

        first.forgetModels(setOf("my-provider/lyra"))

        val reopened = book()
        assertEquals("", reopened.account("work")?.model)
        // Only the name that went away: the effort beside it, and any other account, are untouched.
        assertEquals("low", reopened.account("work")?.effort)
        assertEquals("opus", reopened.account("home")?.model)
    }

    fun testTheChosenAccountSurvivesAReopen() {
        val first = book()
        first.remember(account("work"))
        first.current = "work"

        assertEquals("work", book().current)
    }

    /**
     * Two IDEs, one file. What the second writes must be built on what the first wrote a moment ago -
     * otherwise adding an account in one window quietly removes the one added in the other, and the
     * drawer it pointed at is left on disk with nothing naming it.
     */
    fun testAWriteIsBuiltOnWhatTheOtherIdeJustWrote() {
        val ide = book()
        val other = book()

        ide.remember(account("work"))
        other.remember(account("home"))

        assertEquals(setOf("work", "home"), book().accounts().map { it.id }.toSet())
    }

    /** And a re-read tells the window next door that the account in force has moved. */
    fun testAReReadReportsThatTheCurrentAccountMoved() {
        val ide = book()
        val other = book()
        ide.remember(account("work"))
        other.reload()

        ide.current = "work"

        val reloaded = other.reload()
        assertTrue(reloaded.changed)
        assertTrue(reloaded.currentChanged)
        assertEquals("work", other.current)
    }

    /** Re-reading our own writing announces nothing: the news is what somebody else did. */
    fun testOurOwnWriteIsNotNews() {
        val ide = book()
        ide.remember(account("work"))
        ide.current = "work"

        assertFalse(ide.reload().changed)
    }

    /**
     * A file that is not a book is kept aside, and what starts instead is empty.
     *
     * Empty is the safe end of a bad choice: everything runs on the CLI's ordinary sign-in, which is
     * visible on screen and bills nobody by surprise. Overwriting it would have destroyed the only
     * mapping from an account to its drawer.
     */
    fun testAFileThatIsNotABookIsKeptRatherThanOverwritten() {
        val path = folder.resolve(AccountsState.FILE_NAME)
        Files.writeString(path, "this is not a register")

        val opened = book()

        assertTrue(opened.accounts().isEmpty())
        assertEquals("", opened.current)
        assertFalse(Files.exists(path))
        assertTrue(Files.list(folder).use { entries -> entries.anyMatch { it.fileName.toString().contains("broken") } })
    }

    /** Forgetting the account in force moves to another one - and never onto a sign-in still in progress. */
    fun testForgettingNeverMovesOntoADraft() {
        val ide = book()
        ide.remember(account("work"))
        ide.remember(account(ClaudeAccounts.PENDING_PREFIX + "half-done"))
        ide.current = "work"

        ide.forget("work")

        assertEquals("", ide.current)
        assertEquals("", book().current)
    }

    /**
     * A drawer that turns out to hold somebody else is filed again under who it holds - IN PLACE. The id is
     * what the current choice, the conversations and the figures hold, and none of them may move: the
     * drawer under it is the same one, only its label was wrong.
     */
    fun testFilingARecordAgainKeepsItsIdItsNameAndTheChoice() {
        val ide = book()
        ide.remember(account("row").apply { plan = "team"; alias = "Work"; orgUuid = "org-work" })
        ide.rememberChoice("row", model = "opus", effort = "high")
        ide.current = "row"

        ide.refile("row", "proton@example.com", "org-proton", plan = "max")

        val reopened = book()
        val row = reopened.account("row")
        assertEquals("proton@example.com", row?.email)
        assertEquals("org-proton", row?.orgUuid)
        assertEquals(AccountStore.keyOf("proton@example.com", "org-proton"), row?.key)
        assertEquals("max", row?.plan)
        assertEquals("Work", row?.alias)
        assertEquals("opus", row?.model)
        assertEquals("/tmp/acc/row", row?.storeDir)
        assertEquals("row", reopened.current)
    }

    /** A plan nobody could learn is not "no plan". */
    fun testFilingAgainWithoutAPlanKeepsTheOneOnRecord() {
        val ide = book()
        ide.remember(account("row").apply { plan = "team" })

        ide.refile("row", "proton@example.com", "org-proton", plan = null)

        assertEquals("team", book().account("row")?.plan)
    }

    /**
     * A repeated sign-in: the record gets the new drawer and keeps everything else, and the draft goes in
     * the same write - a window next door never reads the account without its drawer, or both.
     */
    fun testARenewalMovesTheDrawerAndDropsTheDraftInOneWrite() {
        val ide = book()
        ide.remember(account("work").apply { alias = "Work"; plan = "pro" })
        ide.remember(account(ClaudeAccounts.PENDING_PREFIX + "next").apply { storeDir = "/tmp/acc/new-drawer" })

        ide.renew("work", "/tmp/acc/new-drawer", plan = "max", draftId = ClaudeAccounts.PENDING_PREFIX + "next")

        val reopened = book()
        assertEquals(listOf("work"), reopened.accounts().map { it.id })
        assertEquals("/tmp/acc/new-drawer", reopened.account("work")?.storeDir)
        assertEquals("Work", reopened.account("work")?.alias)
        assertEquals("max", reopened.account("work")?.plan)
    }

    /** A draft landing as a new account, in one write. */
    fun testADraftIsReplacedByTheAccountItSignedInAs() {
        val ide = book()
        ide.remember(account("work"))
        ide.remember(account(ClaudeAccounts.PENDING_PREFIX + "next"))

        ide.replace(ClaudeAccounts.PENDING_PREFIX + "next", account("home"))

        assertEquals(setOf("work", "home"), book().accounts().map { it.id }.toSet())
    }

    /** Two records may carry one label - the round sorts that out - and one never overwrites the other. */
    fun testTwoRecordsMayCarryOneLabel() {
        val ide = book()
        ide.remember(account("old").apply { email = "work@example.com" })
        ide.remember(account("new").apply { email = "work@example.com" })

        assertEquals(setOf("old", "new"), book().accounts().map { it.id }.toSet())
    }
}

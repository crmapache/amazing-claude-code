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
}

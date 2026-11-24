package io.github.crmapache.amazingclaudecode.claude.terminal

import io.github.crmapache.amazingclaudecode.claude.accounts.AccountStore
import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertFalse
import kotlin.test.assertNull
import kotlin.test.assertTrue

class ResumeLineTest {

    private val conversation = "b6f4c0de-71a2-4c3e-9d1f-5a7e2c8b9f10"

    @Test
    fun `the ordinary sign-in gets the plain line`() {
        val line = ResumeLine.of(conversation, account = null, drawer = null, posix = true)

        assertEquals("claude --resume $conversation", line.command)
        assertNull(line.account)
        assertFalse(line.onDefault)
    }

    // The whole point: pasted without the drawer, the conversation carries on - and is billed - as whoever the
    // ordinary sign-in is.
    @Test
    fun `an added account's line names its drawer and clears every key that would outrank it`() {
        val line = ResumeLine.of(conversation, account = "Work", drawer = "/Users/me/.amazing-claude-code/accounts/k3v9", posix = true)

        assertTrue(line.command.startsWith("${AccountStore.STORE_VARIABLE}=/Users/me/.amazing-claude-code/accounts/k3v9 "))
        AccountStore.OUTRANKING_VARIABLES.forEach { assertTrue(" $it= " in line.command, "$it is not cleared: ${line.command}") }
        assertTrue(line.command.endsWith("claude --resume $conversation"))
        assertEquals("Work", line.account)
        assertFalse(line.onDefault)
    }

    // No form fits both of Windows' shells, and a guess that leaves a variable set bills the next plain `claude`.
    @Test
    fun `on Windows the line stays plain and says it carries on on the ordinary sign-in`() {
        val line = ResumeLine.of(conversation, account = "Work", drawer = "C:\\Users\\me\\drawer", posix = false)

        assertEquals("claude --resume $conversation", line.command)
        assertTrue(line.onDefault)
    }

    @Test
    fun `an account whose drawer would not resolve says so rather than naming nothing`() {
        assertTrue(ResumeLine.of(conversation, account = "Work", drawer = null, posix = true).onDefault)
        assertTrue(ResumeLine.of(conversation, account = "Work", drawer = " ", posix = true).onDefault)
    }

    @Test
    fun `an account with no name of its own is still an added account`() {
        val line = ResumeLine.of(conversation, account = "", drawer = "/d", posix = true)

        assertNull(line.account)
        assertFalse(line.onDefault)
        assertTrue(line.command.startsWith(AccountStore.STORE_VARIABLE))
    }

    // A path with a space, and a model's name zsh reads as a pattern - both quoted; an id needs nothing.
    @Test
    fun `a word is quoted only when a shell would read something into it`() {
        assertEquals(conversation, ResumeLine.word(conversation))
        assertEquals("'/Users/me/My Drawer'", ResumeLine.word("/Users/me/My Drawer"))
        assertEquals("'opus[1m]'", ResumeLine.word("opus[1m]"))
        assertEquals("'it'\\''s'", ResumeLine.word("it's"))
        assertEquals("''", ResumeLine.word(""))
    }
}

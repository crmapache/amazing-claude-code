package io.github.crmapache.amazingclaudecode.claude

import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertFalse
import kotlin.test.assertNull
import kotlin.test.assertTrue

class SessionRegistryTest {

    @Test
    fun `the tab the panel opens with is there from the start`() {
        val tabs = SessionRegistry().tabs()

        assertEquals(listOf(ClaudeSessions.MAIN_SESSION), tabs.map { it.id })
        assertEquals(0, tabs.single().depth)
    }

    @Test
    fun `a new tab is its own group`() {
        val registry = SessionRegistry()

        assertTrue(registry.open("session-2"))

        val tab = registry.tabs().last()
        assertEquals("session-2", tab.groupId)
        assertEquals(0, tab.depth)
    }

    // One subject's tabs hold together: a fork keeps its parent's group, and a fork of a fork keeps it
    // too - that is what tells one conversation's tabs from another's at a glance.
    @Test
    fun `a fork inherits the group and goes one level deeper`() {
        val registry = SessionRegistry()
        registry.open("branch-1", parentId = ClaudeSessions.MAIN_SESSION)
        registry.open("branch-2", parentId = "branch-1")

        val forks = registry.tabs().filter { it.id.startsWith("branch") }
        assertEquals(listOf(ClaudeSessions.MAIN_SESSION, ClaudeSessions.MAIN_SESSION), forks.map { it.groupId })
        assertEquals(listOf(1, 2), forks.map { it.depth })
    }

    @Test
    fun `a fork stands beside its group rather than at the end of the list`() {
        val registry = SessionRegistry()
        registry.open("session-2")
        registry.open("branch-1", parentId = ClaudeSessions.MAIN_SESSION)

        assertEquals(listOf(ClaudeSessions.MAIN_SESSION, "branch-1", "session-2"), registry.tabs().map { it.id })
    }

    // A live process exists behind it either way: refusing would leave a conversation nothing in the
    // list points at.
    @Test
    fun `a fork of a tab nobody knows becomes an ordinary tab`() {
        val registry = SessionRegistry()

        assertTrue(registry.open("branch-1", parentId = "closed-long-ago"))

        val tab = registry.tabs().last()
        assertEquals("branch-1", tab.groupId)
        assertEquals(0, tab.depth)
    }

    @Test
    fun `a taken identifier is refused`() {
        val registry = SessionRegistry()
        registry.open("session-2")

        assertFalse(registry.open("session-2"))
        assertEquals(2, registry.tabs().size)
    }

    @Test
    fun `closing removes the tab and nothing else`() {
        val registry = SessionRegistry()
        registry.open("session-2")

        assertTrue(registry.close("session-2"))
        assertFalse(registry.close("session-2"))
        assertEquals(listOf(ClaudeSessions.MAIN_SESSION), registry.tabs().map { it.id })
    }

    // The heuristic guess and the model's answer do not arrive in the order they are worth: a stale
    // guess must not overwrite a name the model has already picked.
    @Test
    fun `a guessed name does not overwrite one the model picked`() {
        val registry = SessionRegistry()
        registry.rename(ClaudeSessions.MAIN_SESSION, "fix the parser", SessionSnapshot.TITLE_LLM)

        assertFalse(registry.rename(ClaudeSessions.MAIN_SESSION, "fix the", SessionSnapshot.TITLE_HEURISTIC))
        assertEquals("fix the parser", registry.tabs().single().title)
    }

    @Test
    fun `the model may correct itself`() {
        val registry = SessionRegistry()
        registry.rename(ClaudeSessions.MAIN_SESSION, "first", SessionSnapshot.TITLE_LLM)

        assertTrue(registry.rename(ClaudeSessions.MAIN_SESSION, "second", SessionSnapshot.TITLE_LLM))
        assertEquals("second", registry.tabs().single().title)
    }

    @Test
    fun `a wiped conversation gets its stand-in name back`() {
        val registry = SessionRegistry()
        registry.rename(ClaudeSessions.MAIN_SESSION, "fix the parser", SessionSnapshot.TITLE_LLM)

        registry.resetTitle(ClaudeSessions.MAIN_SESSION)

        assertEquals("main session", registry.tabs().single().title)
        assertEquals(SessionSnapshot.TITLE_DEFAULT, registry.tabs().single().titleSource)
    }

    // The tab a past conversation opens in. This is the case that shipped broken: everything closed, a
    // conversation picked in the history, and the tab it was opened into existed on that one screen
    // only - so the list coming back from here wiped it, the panel flickered and stayed empty.
    @Test
    fun `a past conversation opens a tab of its own when there is none`() {
        val registry = SessionRegistry()
        registry.close(ClaudeSessions.MAIN_SESSION)

        assertTrue(registry.takeOver("session-2", "Refund webhooks", SessionSnapshot.TITLE_LLM))

        val tab = registry.tabs().single()
        assertEquals("session-2", tab.id)
        assertEquals("Refund webhooks", tab.title)
        assertEquals(SessionSnapshot.TITLE_LLM, tab.titleSource)
    }

    // The name a model picked belongs to the conversation that has just left this tab, so here - unlike
    // an ordinary rename - it has to give way.
    @Test
    fun `a past conversation renames the tab it lands in over any name it wore`() {
        val registry = SessionRegistry()
        registry.rename(ClaudeSessions.MAIN_SESSION, "fix the parser", SessionSnapshot.TITLE_LLM)

        assertFalse(registry.takeOver(ClaudeSessions.MAIN_SESSION, "Refund webhooks", SessionSnapshot.TITLE_HEURISTIC))

        val tab = registry.tabs().single()
        assertEquals("Refund webhooks", tab.title)
        assertEquals(SessionSnapshot.TITLE_HEURISTIC, tab.titleSource)
    }

    // A client that says nothing about the name leaves the tab with the stand-in rather than with the
    // previous conversation's name.
    @Test
    fun `a past conversation with no name given wipes the tab's own`() {
        val registry = SessionRegistry()
        registry.rename(ClaudeSessions.MAIN_SESSION, "fix the parser", SessionSnapshot.TITLE_LLM)

        registry.takeOver(ClaudeSessions.MAIN_SESSION, "", SessionSnapshot.TITLE_HEURISTIC)

        assertEquals("main session", registry.tabs().single().title)
        assertEquals(SessionSnapshot.TITLE_DEFAULT, registry.tabs().single().titleSource)
    }

    @Test
    fun `a group moves with its forks`() {
        val registry = SessionRegistry()
        registry.open("session-2")
        registry.open("branch-1", parentId = "session-2")

        registry.moveGroup("session-2", beforeGroupId = ClaudeSessions.MAIN_SESSION)

        assertEquals(listOf("session-2", "branch-1", ClaudeSessions.MAIN_SESSION), registry.tabs().map { it.id })
    }

    @Test
    fun `a fork moves among its own group's forks`() {
        val registry = SessionRegistry()
        registry.open("branch-1", parentId = ClaudeSessions.MAIN_SESSION)
        registry.open("branch-2", parentId = ClaudeSessions.MAIN_SESSION)
        registry.open("session-2")

        assertTrue(registry.moveTab("branch-2", beforeId = "branch-1"))

        assertEquals(
            listOf(ClaudeSessions.MAIN_SESSION, "branch-2", "branch-1", "session-2"),
            registry.tabs().map { it.id },
        )
    }

    /**
     * The head of a group is the conversation everything in it grew out of: the strip marks a group by it,
     * and a fork standing first would say the group began with a branch of something that is not there.
     *
     * A fork dropped on top of the head does not go back where it came from - it stops right after it.
     * Refusing the drop outright would read as the strip having ignored the hand.
     */
    @Test
    fun `a fork never steps in front of the conversation it grew out of`() {
        val registry = SessionRegistry()
        registry.open("branch-1", parentId = ClaudeSessions.MAIN_SESSION)
        registry.open("branch-2", parentId = ClaudeSessions.MAIN_SESSION)

        assertTrue(registry.moveTab("branch-2", beforeId = ClaudeSessions.MAIN_SESSION))

        assertEquals(
            listOf(ClaudeSessions.MAIN_SESSION, "branch-2", "branch-1"),
            registry.tabs().map { it.id },
        )
    }

    // And the head itself does not move at all: it is dragged by the whole group instead (see moveGroup).
    @Test
    fun `the head of a group is not rearranged inside it`() {
        val registry = SessionRegistry()
        registry.open("branch-1", parentId = ClaudeSessions.MAIN_SESSION)
        registry.open("branch-2", parentId = ClaudeSessions.MAIN_SESSION)

        assertFalse(registry.moveTab(ClaudeSessions.MAIN_SESSION, beforeId = "branch-2"))

        assertEquals(
            listOf(ClaudeSessions.MAIN_SESSION, "branch-1", "branch-2"),
            registry.tabs().map { it.id },
        )
    }

    // Dropped at the end it goes last in ITS group rather than last in the strip: a group is one unbroken
    // run of the list, and everything that reads this list leans on that.
    @Test
    fun `a fork dropped at the end stays inside its group`() {
        val registry = SessionRegistry()
        registry.open("branch-1", parentId = ClaudeSessions.MAIN_SESSION)
        registry.open("branch-2", parentId = ClaudeSessions.MAIN_SESSION)
        registry.open("session-2")

        assertTrue(registry.moveTab("branch-1", beforeId = null))

        assertEquals(
            listOf(ClaudeSessions.MAIN_SESSION, "branch-2", "branch-1", "session-2"),
            registry.tabs().map { it.id },
        )
    }

    @Test
    fun `a group moved to the end goes last`() {
        val registry = SessionRegistry()
        registry.open("session-2")

        registry.moveGroup(ClaudeSessions.MAIN_SESSION, beforeGroupId = null)

        assertEquals(listOf("session-2", ClaudeSessions.MAIN_SESSION), registry.tabs().map { it.id })
    }

    // A conversation spends a model call on a name of its own only while it has none (see
    // ClaudeSession.requestTitle), and this is what that question is answered by.
    @Test
    fun `a tab tells where its name came from`() {
        val registry = SessionRegistry()
        registry.open("session-2")

        assertEquals(SessionSnapshot.TITLE_DEFAULT, registry.titleSource("session-2"))

        registry.rename("session-2", "Session naming in the panel", SessionSnapshot.TITLE_LLM)
        assertEquals(SessionSnapshot.TITLE_LLM, registry.titleSource("session-2"))

        assertNull(registry.titleSource("never-opened"))
    }
}

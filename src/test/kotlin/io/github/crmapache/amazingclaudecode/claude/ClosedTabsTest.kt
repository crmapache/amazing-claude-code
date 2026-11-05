package io.github.crmapache.amazingclaudecode.claude

import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertFalse
import kotlin.test.assertNull
import kotlin.test.assertTrue

/**
 * The tabs a person closed, to be opened again - the order the key walks them in, and what it skips. Wrong here
 * means a press that brings back the wrong tab, or nothing, with no word about why.
 */
class ClosedTabsTest {

    private fun chat(id: String, conversation: String? = "c-$id", at: Long = 0) = ClosedTabs.Chat(
        TabMemory.Closed(
            tab = TabMemory.Tab(
                id = id,
                parentId = null,
                title = "Tab $id",
                titleSource = SessionSnapshot.TITLE_LLM,
                conversationId = conversation,
                model = "",
                effort = "",
                mode = "",
                draft = null,
            ),
            groupId = id,
            depth = 0,
            groupsLeft = emptyList(),
            tabsLeft = emptyList(),
            closedAt = at,
        ),
    )

    private fun panel(id: String) = ClosedTabs.Panel(id, id, null, 0)

    private val nothingOpen: (ClosedTabs.Entry) -> Boolean = { false }

    @Test
    fun `the latest close comes back first, of either kind`() {
        val closed = ClosedTabs()
        closed.push(chat("a"))
        closed.push(panel("__statistics__"))
        closed.push(chat("b"))

        assertEquals("chat:c-b", closed.take(null, nothingOpen)?.key)
        assertEquals("panel:__statistics__", closed.take(null, nothingOpen)?.key)
        assertEquals("chat:c-a", closed.take(null, nothingOpen)?.key)
        assertNull(closed.take(null, nothingOpen))
    }

    @Test
    fun `one thing stands once, at its latest close`() {
        val closed = ClosedTabs()
        closed.push(chat("a"))
        closed.push(chat("b"))
        // The same conversation, closed again from another tab after it was opened from the history.
        closed.push(chat("x", conversation = "c-a"))

        assertEquals(listOf("chat:c-a", "chat:c-b"), closed.list().map { it.key })
        assertEquals("x", (closed.list().first() as ClosedTabs.Chat).kept.tab.id)
    }

    @Test
    fun `a tab with no conversation yet is itself`() {
        val closed = ClosedTabs()
        closed.push(chat("a", conversation = null))
        closed.push(chat("b", conversation = null))

        assertEquals(listOf("chat:b", "chat:a"), closed.list().map { it.key })
    }

    @Test
    fun `it reaches back twenty tabs and no further`() {
        val closed = ClosedTabs()
        repeat(25) { closed.push(chat("t$it")) }

        assertEquals(ClosedTabs.LIMIT, closed.list().size)
        assertEquals("chat:c-t24", closed.list().first().key)
        assertEquals("chat:c-t5", closed.list().last().key)
    }

    @Test
    fun `what is open again is passed over and dropped`() {
        val closed = ClosedTabs()
        closed.push(chat("a"))
        closed.push(panel("__statistics__"))

        val open: (ClosedTabs.Entry) -> Boolean = { it is ClosedTabs.Panel }
        assertEquals("chat:c-a", closed.take(null, open)?.key)
        assertEquals(emptyList(), closed.list())
    }

    @Test
    fun `a row asks for its own tab and nothing else`() {
        val closed = ClosedTabs()
        closed.push(chat("a"))
        closed.push(chat("b"))

        assertEquals("chat:c-a", closed.take("chat:c-a", nothingOpen)?.key)
        assertEquals(listOf("chat:c-b"), closed.list().map { it.key })
        assertNull(closed.take("chat:gone", nothingOpen))
        // Open again by another road since the row was drawn: nothing comes back, and the row goes.
        assertNull(closed.take("chat:c-b") { true })
        assertEquals(emptyList(), closed.list())
    }

    // A conversation deleted from the history goes from here too, and nothing else does - a tab with no
    // conversation of its own and the panel's tabs stay where they were.
    @Test
    fun `a deleted conversation's closed tab goes, and only that`() {
        val closed = ClosedTabs()
        closed.push(chat("a"))
        closed.push(chat("b", conversation = null))
        closed.push(panel("__statistics__"))

        assertTrue(closed.forget("c-a"))
        assertEquals(listOf("panel:__statistics__", "chat:b"), closed.list().map { it.key })
        assertFalse(closed.forget("c-a"))
    }

    @Test
    fun `the list off the disk stands in order, the panel's own tabs of this session kept`() {
        val closed = ClosedTabs()
        closed.push(panel("__scenarios__"))
        closed.load(listOf(chat("old", at = 1).kept, chat("newer", at = 5).kept))

        assertEquals(listOf("chat:c-newer", "chat:c-old"), closed.chats().map { ClosedTabs.keyOf(it.tab) })
        assertEquals(3, closed.list().size)
    }
}

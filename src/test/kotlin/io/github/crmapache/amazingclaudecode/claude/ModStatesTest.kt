package io.github.crmapache.amazingclaudecode.claude

import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertTrue

/** What a conversation's mods have standing, kept as the latest line per slot. */
class ModStatesTest {

    private fun status(plugin: String, text: String?) =
        """{"type":"system","subtype":"ui_status","plugin":"$plugin","text":${text?.let { "\"$it\"" } ?: "null"}}"""

    private val panes = """{"type":"system","subtype":"ui_panes","panes":[{"id":"p","title":"P","plugin":"m"}]}"""
    private val noPanes = """{"type":"system","subtype":"ui_panes","panes":[]}"""

    @Test
    fun `the latest line of a slot is the one kept`() {
        val states = ModStates()
        states.keep("main", "status:clock", status("clock", "12:00"))
        states.keep("main", "status:clock", status("clock", "12:01"))

        assertEquals(listOf(status("clock", "12:01")), states.of("main"))
    }

    @Test
    fun `slots keep the order they were first filled in, and conversations stay apart`() {
        val states = ModStates()
        states.keep("main", "status:a", status("a", "1"))
        states.keep("main", "ui_panes", panes)
        states.keep("other", "status:b", status("b", "2"))
        states.keep("main", "status:a", status("a", "3"))

        assertEquals(listOf(status("a", "3"), panes), states.of("main"))
        assertEquals(listOf(status("b", "2")), states.of("other"))
    }

    /** A client joining later needs no line saying "nothing": nothing is what it already has. */
    @Test
    fun `a state gone back to nothing is forgotten`() {
        val states = ModStates()
        states.keep("main", "status:a", status("a", "1"))
        states.keep("main", "ui_panes", panes)
        states.keep("main", "status:a", status("a", null))
        states.keep("main", "ui_panes", noPanes)

        assertTrue(states.of("main").isEmpty())
    }

    @Test
    fun `clearing lets everything go and says which slots there were`() {
        val states = ModStates()
        states.keep("main", "status:a", status("a", "1"))
        states.keep("main", "ui_panes", panes)

        assertEquals(listOf("status:a", "ui_panes"), states.clear("main"))
        assertTrue(states.of("main").isEmpty())
        assertTrue(states.clear("main").isEmpty())
    }

    /** Which is the case for every conversation without a mod: clearing it says nothing to anybody. */
    @Test
    fun `a conversation whose mods never spoke has nothing to clear`() {
        assertTrue(ModStates().clear("main").isEmpty())
        assertTrue(ModStates().of("main").isEmpty())
    }
}

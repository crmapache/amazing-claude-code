package io.github.crmapache.amazingclaudecode.claude

import java.io.File
import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertFalse
import kotlin.test.assertNotEquals
import kotlin.test.assertNull
import kotlin.test.assertTrue
import kotlinx.serialization.json.Json
import kotlinx.serialization.json.jsonObject

/**
 * The tabs a project had open, as they are kept on disk and read back - the part of it that decides what
 * a person finds after a restart, and fails silently when it is wrong: a tab that should have come back
 * and did not says nothing about why.
 */
class TabMemoryTest {

    private fun draft(json: String) = Json.parseToJsonElement(json).jsonObject

    private fun tab(
        id: String,
        conversation: String? = null,
        parent: String? = null,
        draft: String? = null,
    ) = TabMemory.Tab(
        id = id,
        parentId = parent,
        title = "Tab $id",
        titleSource = SessionSnapshot.TITLE_LLM,
        conversationId = conversation,
        model = "opus",
        effort = "high",
        mode = "acceptEdits",
        draft = draft?.let(::draft),
    )

    @Test
    fun `a list comes back exactly as it was kept`() {
        val state = TabMemory.State(
            active = "b",
            tabs = listOf(
                tab("main", conversation = "c-1"),
                tab("b", conversation = "c-2", parent = "main", draft = """{"tokens":[{"kind":"text","value":"half a"}],"quotes":[]}"""),
            ),
        )

        assertEquals(state, TabMemory.decode(TabMemory.encode(state)))
    }

    /* A broken list of tabs must never stand between a person and the panel. */
    @Test
    fun `a file that is not a list of tabs is no list rather than an error`() {
        assertNull(TabMemory.decode("not json"))
        assertEquals(emptyList(), TabMemory.decode("""{"tabs":[{"title":"no id"},42]}""")?.tabs)
    }

    @Test
    fun `a tab comes back for its conversation or for its draft, and not for nothing`() {
        val state = TabMemory.State(
            active = null,
            tabs = listOf(
                tab("with-conversation", conversation = "c-1"),
                tab("with-draft", draft = """{"tokens":[{"kind":"text","value":"typing"}],"quotes":[]}"""),
                tab("empty"),
                tab("whitespace", draft = """{"tokens":[{"kind":"text","value":"  "}],"quotes":[]}"""),
            ),
        )

        val kept = TabMemory.restorable(state).tabs.map { it.id }

        assertEquals(listOf("with-conversation", "with-draft"), kept)
    }

    @Test
    fun `a fork whose parent is not coming back stands on its own`() {
        val state = TabMemory.State(
            active = null,
            tabs = listOf(tab("parent"), tab("fork", conversation = "c-2", parent = "parent")),
        )

        assertNull(TabMemory.restorable(state).tabs.single().parentId)
    }

    @Test
    fun `the tab to show is named only when it is coming back`() {
        val tabs = listOf(tab("a", conversation = "c-1"), tab("b"))

        assertEquals("a", TabMemory.restorable(TabMemory.State("a", tabs)).active)
        assertNull(TabMemory.restorable(TabMemory.State("b", tabs)).active)
    }

    @Test
    fun `an attachment alone is a draft`() {
        assertTrue(TabMemory.hasDraft(draft("""{"tokens":[{"kind":"chip","chip":{"kind":"file","value":"a.ts"}}],"quotes":[]}""")))
        assertFalse(TabMemory.hasDraft(draft("""{"tokens":[],"quotes":[]}""")))
        assertFalse(TabMemory.hasDraft(null))
    }

    /* Two checkouts of one repository have one name and two lists of tabs. */
    @Test
    fun `two checkouts of one repository keep their tabs apart`() {
        val root = File("/tmp/tabs")
        val one = TabMemory.fileFor("/work/repo", root)
        val two = TabMemory.fileFor("/other/repo", root)

        assertNotEquals(one, two)
        assertTrue(one.name.startsWith("repo-"))
        assertEquals(one, TabMemory.fileFor("/work/repo", root))
    }
}

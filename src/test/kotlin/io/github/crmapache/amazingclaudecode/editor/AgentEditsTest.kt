package io.github.crmapache.amazingclaudecode.editor

import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertTrue

/**
 * What the agent's stream asks the IDE to re-read.
 *
 * The two things worth holding still: an edit counts when it has happened rather than when it was
 * proposed (between the two stands the person granting permission), and a shell command counts even
 * when it failed - half a script is exactly when the disk stops matching what the IDE believes.
 */
class AgentEditsTest {

    private fun use(id: String, name: String, input: String) =
        """{"type":"assistant","message":{"content":[{"type":"tool_use","id":"$id","name":"$name","input":$input}]}}"""

    private fun result(id: String, error: Boolean = false) =
        """{"type":"user","message":{"content":[{"type":"tool_result","tool_use_id":"$id","is_error":$error,"content":"ok"}]}}"""

    @Test
    fun `an edit is re-read once it has happened`() {
        val edits = AgentEdits()

        assertEquals(emptyList(), edits.note(use("t1", "Edit", """{"file_path":"/work/site/main.kt"}""")))
        assertEquals(
            listOf(AgentEdits.Refresh.One("/work/site/main.kt")),
            edits.note(result("t1")),
        )
    }

    @Test
    fun `a proposal on its own is not a change`() {
        val edits = AgentEdits()

        // The agent asked and the person has not answered yet: nothing on disk has moved.
        assertTrue(edits.note(use("t1", "Write", """{"file_path":"/work/site/new.kt"}""")).isEmpty())
    }

    @Test
    fun `an edit that failed changes nothing`() {
        val edits = AgentEdits()

        edits.note(use("t1", "Edit", """{"file_path":"/work/site/main.kt"}"""))
        assertTrue(edits.note(result("t1", error = true)).isEmpty())
    }

    @Test
    fun `a notebook is named by its own field`() {
        val edits = AgentEdits()

        edits.note(use("t1", "NotebookEdit", """{"notebook_path":"/work/site/notes.ipynb"}"""))
        assertEquals(listOf(AgentEdits.Refresh.One("/work/site/notes.ipynb")), edits.note(result("t1")))
    }

    @Test
    fun `a shell command names nothing, so everything is looked at`() {
        val edits = AgentEdits()

        edits.note(use("t1", "Bash", """{"command":"git checkout ."}"""))
        assertEquals(listOf(AgentEdits.Refresh.Everything), edits.note(result("t1")))
    }

    @Test
    fun `a shell command counts even when it failed`() {
        val edits = AgentEdits()

        edits.note(use("t1", "Bash", """{"command":"./deploy.sh"}"""))
        assertEquals(listOf(AgentEdits.Refresh.Everything), edits.note(result("t1", error = true)))
    }

    @Test
    fun `reading a file asks for nothing`() {
        val edits = AgentEdits()

        edits.note(use("t1", "Read", """{"file_path":"/work/site/main.kt"}"""))
        assertTrue(edits.note(result("t1")).isEmpty())
    }

    @Test
    fun `the end of a turn is the last chance to look around`() {
        val edits = AgentEdits()

        assertEquals(
            listOf(AgentEdits.Refresh.Everything),
            edits.note("""{"type":"result","subtype":"success","is_error":false}"""),
        )
    }

    @Test
    fun `several results in one line are all answered`() {
        val edits = AgentEdits()

        edits.note(use("t1", "Edit", """{"file_path":"/work/site/one.kt"}"""))
        edits.note(use("t2", "Write", """{"file_path":"/work/site/two.kt"}"""))

        val line = """{"type":"user","message":{"content":[""" +
            """{"type":"tool_result","tool_use_id":"t1","content":"ok"},""" +
            """{"type":"tool_result","tool_use_id":"t2","content":"ok"}]}}"""

        assertEquals(
            listOf(AgentEdits.Refresh.One("/work/site/one.kt"), AgentEdits.Refresh.One("/work/site/two.kt")),
            edits.note(line),
        )
    }

    @Test
    fun `a result nobody asked for is ignored`() {
        val edits = AgentEdits()

        assertTrue(edits.note(result("stranger")).isEmpty())
    }

    @Test
    fun `an answer being typed is not parsed at all`() {
        val edits = AgentEdits()

        val delta = """{"type":"stream_event","event":{"type":"content_block_delta","delta":{"text":"tool_use"}}}"""
        assertTrue(edits.note(delta).isEmpty())
    }
}

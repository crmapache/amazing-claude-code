package io.github.crmapache.amazingclaudecode.claude

import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertFalse
import kotlin.test.assertSame
import kotlin.test.assertTrue

class SessionSnapshotTest {

    private fun apply(vararg messages: String): SessionSnapshot =
        messages.fold(SessionSnapshot()) { snapshot, message -> SessionSnapshots.apply(snapshot, message) }

    @Test
    fun `the status follows the shell's own message`() {
        assertEquals(
            SessionSnapshot.STATUS_RUNNING,
            apply("""{"type":"status","sessionId":"main","state":"running"}""").status,
        )
    }

    @Test
    fun `a title from the model is remembered along with where it came from`() {
        val snapshot = apply("""{"type":"sessionTitle","sessionId":"main","title":"fix the parser"}""")

        assertEquals("fix the parser", snapshot.title)
        assertEquals(SessionSnapshot.TITLE_LLM, snapshot.titleSource)
    }

    // The interface is told about a refusal and stays in the mode it was in - the snapshot has to agree,
    // or a phone would show a mode the conversation is not in.
    @Test
    fun `a refused mode change does not move the snapshot`() {
        val snapshot = apply(
            """{"type":"mode","sessionId":"main","mode":"plan","applied":true}""",
            """{"type":"mode","sessionId":"main","mode":"auto","applied":false,"error":"not available"}""",
        )

        assertEquals("plan", snapshot.permissionMode)
    }

    @Test
    fun `a refused model change does not move the snapshot either`() {
        val snapshot = apply(
            """{"type":"model","sessionId":"main","model":"opus","applied":true}""",
            """{"type":"model","sessionId":"main","model":"forbidden","applied":false}""",
        )

        assertEquals("opus", snapshot.model)
    }

    @Test
    fun `the context window is kept as both figures or not at all`() {
        val snapshot = apply("""{"type":"context","sessionId":"main","used":1200,"max":200000}""")

        assertEquals(1200, snapshot.contextUsed)
        assertEquals(200000, snapshot.contextMax)
    }

    @Test
    fun `a permission puts the conversation into waiting and an answer takes it out`() {
        val asked = apply("""{"type":"permission","id":"req-1","sessionId":"main","toolName":"Write"}""")
        assertTrue(asked.awaitsYou)

        val answered = SessionSnapshots.apply(
            asked,
            """{"type":"permissionResolved","id":"req-1","sessionId":"main","decision":"once"}""",
        )
        assertFalse(answered.awaitsYou)
    }

    @Test
    fun `two permissions both have to be answered`() {
        val snapshot = apply(
            """{"type":"permission","id":"req-1","sessionId":"main"}""",
            """{"type":"permission","id":"req-2","sessionId":"main"}""",
            """{"type":"permissionResolved","id":"req-1","sessionId":"main"}""",
        )

        assertTrue(snapshot.awaitsYou)
        assertEquals(setOf("req-2"), snapshot.pendingPermissions)
    }

    @Test
    fun `a dead process leaves nothing running`() {
        val snapshot = apply(
            """{"type":"status","sessionId":"main","state":"running"}""",
            """{"type":"processExited","sessionId":"main","exitCode":1}""",
        )

        assertTrue(snapshot.crashed)
        assertEquals(SessionSnapshot.STATUS_IDLE, snapshot.status)
    }

    // The only moment the model and the mode can be learned without anyone choosing them: after a
    // restart, after /clear, on a tab opened from the history.
    @Test
    fun `a process reporting its own start fills in the model and the mode`() {
        val snapshot = apply(
            """{"type":"agent","sessionId":"main","event":{"type":"system","subtype":"init",""" +
                """"model":"claude-opus-5","permissionMode":"acceptEdits"}}""",
        )

        assertEquals("claude-opus-5", snapshot.model)
        assertEquals("acceptEdits", snapshot.permissionMode)
    }

    @Test
    fun `a live process again means the crash is over`() {
        val snapshot = apply(
            """{"type":"processExited","sessionId":"main","exitCode":1}""",
            """{"type":"agent","sessionId":"main","event":{"type":"system","subtype":"init"}}""",
        )

        assertFalse(snapshot.crashed)
    }

    // Almost all the traffic is feed content, and walking it through a JSON parse would put one on the
    // stream's hot path for nothing.
    @Test
    fun `feed content leaves the snapshot exactly as it was`() {
        val snapshot = SessionSnapshot(status = SessionSnapshot.STATUS_RUNNING)
        val message = """{"type":"agent","sessionId":"main","event":{"type":"assistant",""" +
            """"message":{"content":[{"type":"text","text":"hello"}]}}}"""

        assertSame(snapshot, SessionSnapshots.apply(snapshot, message))
    }

    @Test
    fun `a malformed message changes nothing`() {
        val snapshot = SessionSnapshot(status = SessionSnapshot.STATUS_RUNNING)

        assertSame(snapshot, SessionSnapshots.apply(snapshot, """{"type":"status" broken"""))
    }
}

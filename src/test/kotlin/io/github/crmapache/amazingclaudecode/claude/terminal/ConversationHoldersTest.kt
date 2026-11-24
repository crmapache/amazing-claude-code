package io.github.crmapache.amazingclaudecode.claude.terminal

import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertNull

class ConversationHoldersTest {

    private val conversation = "b6f4c0de-71a2-4c3e-9d1f-5a7e2c8b9f10"

    private fun entry(pid: Long, startedAt: Long = 1_000_000L, domain: String = "darwin", id: String = conversation) =
        ConversationHolders.Entry(pid, id, startedAt, domain)

    private fun holder(
        entries: List<ConversationHolders.Entry>,
        own: Set<Long> = emptySet(),
        alive: (Long) -> Long? = { 1_000_000L },
    ) = ConversationHolders.holderAmong(entries.asSequence(), conversation, own, "darwin", alive)

    // A file of the register as the CLI writes it (2.1.293) - the fields this reads, among the ones it does not.
    @Test
    fun `a file of the register is read for its pid, conversation, start and kernel`() {
        val read = ConversationHolders.entryOf(
            """{"pid":68698,"sessionId":"$conversation","cwd":"/Users/max/x","startedAt":1795548429899,""" +
                """"procStart":"Tue Nov 24 19:27:09 2026","version":"2.1.293","kind":"interactive",""" +
                """"entrypoint":"cli","status":"busy","pidDomain":"darwin"}""",
        )

        assertEquals(ConversationHolders.Entry(68698, conversation, 1795548429899, "darwin"), read)
    }

    @Test
    fun `a file that is not one is no holder`() {
        assertNull(ConversationHolders.entryOf("not json"))
        assertNull(ConversationHolders.entryOf("""{"sessionId":"$conversation"}"""))
        assertNull(ConversationHolders.entryOf("""{"pid":1}"""))
    }

    @Test
    fun `a live process over the same conversation holds it`() {
        assertEquals(ConversationHolders.Holder(42, 1_000_000L), holder(listOf(entry(42))))
    }

    @Test
    fun `a process over another conversation holds nothing of this one`() {
        assertNull(holder(listOf(entry(42, id = "another"))))
    }

    // A process this tab took down a moment ago is still alive while it goes - it is not somebody else.
    @Test
    fun `the tab's own processes are not holders`() {
        assertNull(holder(listOf(entry(42)), own = setOf(42)))
    }

    // A killed CLI leaves its file behind: the file alone is a claim, not a writer.
    @Test
    fun `a file whose process is gone holds nothing`() {
        assertNull(holder(listOf(entry(42)), alive = { null }))
    }

    // Pids are handed out again: a later process with the same number is not the one the file speaks of.
    @Test
    fun `a pid given to another process since holds nothing`() {
        assertNull(holder(listOf(entry(42, startedAt = 1_000_000L)), alive = { 1_000_000L + 3_600_000L }))
    }

    // The CLI writes its moment a second or two after the kernel's - still the same process.
    @Test
    fun `a start a few seconds apart is the same process`() {
        assertEquals(42L, holder(listOf(entry(42, startedAt = 1_002_000L)), alive = { 1_000_000L })?.pid)
    }

    // A platform that will not say when a process started still says it is alive, and that is the stronger fact.
    @Test
    fun `an unknown start on either side is taken as the same process`() {
        assertEquals(42L, holder(listOf(entry(42)), alive = { 0L })?.pid)
        assertEquals(42L, holder(listOf(entry(42, startedAt = 0L)))?.pid)
    }

    // A distribution's register, read through a shared folder, names pids of a kernel this JVM cannot ask about.
    @Test
    fun `a file from another kernel holds nothing`() {
        assertNull(holder(listOf(entry(42, domain = "linux"))))
    }
}

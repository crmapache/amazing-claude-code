package io.github.crmapache.amazingclaudecode.remote

import java.io.File
import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertFalse
import kotlin.test.assertTrue

/**
 * The most valuable test in the whole of the remote access work, and the least impressive to read.
 *
 * The list of what a phone may ask for is only worth anything while it keeps pace with the protocol.
 * The protocol grows - a message a month, sometimes more - and every one of them is added by someone
 * thinking about the panel, not about a device across the city. Without something that fails, a new
 * message type becomes remotely reachable (or remotely broken) in silence, and nobody finds out until
 * it matters.
 *
 * So the protocol itself is read here, and every type in it has to have been decided about: allowed or
 * refused, on purpose, by name. Adding a message to the protocol and forgetting this file breaks the
 * build - which is the only mechanism that survives people being busy.
 */
class RemoteCommandsTest {

    private fun protocolTypes(): Set<String> {
        val protocol = File("webview/src/protocol.ts")
        assertTrue(protocol.exists(), "protocol.ts not found at ${protocol.absolutePath}")

        val source = protocol.readText()
        // The union ends where the next top-level declaration begins. Reading to the end of the file
        // instead would sweep in the agent's own event types, which are not messages to the shell at
        // all - and the test would then demand decisions about "thinking" and "result".
        val outgoing = source.substringAfter("export type WebviewMessage =").substringBefore("\nexport ")
        assertTrue(outgoing.isNotEmpty(), "the outgoing half of the protocol was not found")

        return Regex("""type:\s*'([a-zA-Z]+)'""")
            .findAll(outgoing)
            .map { it.groupValues[1] }
            .toSet()
    }

    @Test
    fun `every message in the protocol has been decided about`() {
        val undecided = protocolTypes() - RemoteCommands.ALLOWED - RemoteCommands.DENIED

        assertTrue(
            undecided.isEmpty(),
            "These messages exist in the protocol and nobody has said whether a remote client may " +
                "send them: $undecided. Add each to RemoteCommands.ALLOWED or RemoteCommands.DENIED.",
        )
    }

    /** The other direction: a name kept here that the protocol no longer has is a stale decision. */
    @Test
    fun `nothing is decided about that the protocol no longer has`() {
        val types = protocolTypes()
        val stale = (RemoteCommands.ALLOWED + RemoteCommands.DENIED) - types

        assertTrue(stale.isEmpty(), "These are no longer in the protocol: $stale")
    }

    @Test
    fun `the two lists do not overlap`() {
        assertEquals(emptySet(), RemoteCommands.ALLOWED intersect RemoteCommands.DENIED)
    }

    /** An unknown type is refused rather than let through - that is what makes the list a list. */
    @Test
    fun `something nobody has heard of is refused`() {
        assertFalse(RemoteCommands.allows("summonADemon"))
        assertFalse(RemoteCommands.allows(""))
    }

    @Test
    fun `running a shell command is not something a phone does`() {
        assertFalse(RemoteCommands.allows("bash"))
        assertFalse(RemoteCommands.allows("setExecutablePath"))
        assertFalse(RemoteCommands.allows("pluginInstall"))
        assertFalse(RemoteCommands.allows("openExternal"))
    }

    /** The loosest permission mode may not be reached from a distance at all - see the plan's §3.4. */
    @Test
    fun `the permission mode cannot be changed from a distance`() {
        assertFalse(RemoteCommands.allows("setMode"))
        assertFalse(RemoteCommands.allows("setDefaultMode"))
    }

    @Test
    fun `answering and asking are what a phone is for`() {
        assertTrue(RemoteCommands.allows("prompt"))
        assertTrue(RemoteCommands.allows("permissionDecision"))
        assertTrue(RemoteCommands.allows("planDecision"))
        assertTrue(RemoteCommands.allows("askAnswer"))
        assertTrue(RemoteCommands.allows("stop"))
    }

    /**
     * "Always allow" writes a permanent rule into the machine's settings - the agent's reach grows by
     * it for good. From a sofa that is a different act from unblocking one step.
     */
    @Test
    fun `a remote always-allow is served as a once`() {
        assertEquals("once", RemoteCommands.soften("permissionDecision", "always"))
        assertEquals("deny", RemoteCommands.soften("permissionDecision", "deny"))
        assertEquals("once", RemoteCommands.soften("permissionDecision", "once"))
        // And it touches nothing else: a plan's approval is a different word in a different message.
        assertEquals("approve", RemoteCommands.soften("planDecision", "approve"))
    }
}

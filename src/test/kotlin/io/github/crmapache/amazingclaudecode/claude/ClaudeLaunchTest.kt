package io.github.crmapache.amazingclaudecode.claude

import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertFalse
import kotlin.test.assertTrue

class ClaudeLaunchTest {

    private fun arguments(
        model: String = "",
        effort: String = "",
        permissionMode: String? = null,
        conversationId: String? = null,
        forkFrom: String? = null,
        allowBypassSwitch: Boolean = true,
    ) = ClaudeLaunch.arguments(
        model = model,
        effort = effort,
        permissionMode = permissionMode,
        conversationId = conversationId,
        forkFrom = forkFrom,
        allowBypassSwitch = allowBypassSwitch,
    )

    // Without this flag the CLI refuses to switch into "no questions" mid-conversation - and that switch
    // is exactly what approving a plan ends with.
    @Test
    fun `permission to move into bypass travels at launch`() {
        assertTrue(ClaudeLaunch.ALLOW_BYPASS_FLAG in arguments(permissionMode = "plan"))
    }

    // An unknown flag the CLI does not ignore - it simply does not start.
    @Test
    fun `an old CLI that does not know the flag gets a command line without it`() {
        assertFalse(ClaudeLaunch.ALLOW_BYPASS_FLAG in arguments(allowBypassSwitch = false))
    }

    // The flag by itself allows nothing: the conversation comes up in the mode chosen in the panel.
    @Test
    fun `the mode is always passed, under the name the CLI understands`() {
        val plan = arguments(permissionMode = "plan")
        assertEquals("plan", plan[plan.indexOf("--permission-mode") + 1])

        // "default" is what the panel used to call the mode; the CLI knows it as "manual".
        val ask = arguments(permissionMode = "default")
        assertEquals(PermissionModes.ASK, ask[ask.indexOf("--permission-mode") + 1])
    }

    // Without this channel the CLI counts the streaming mode as unattended and switches ExitPlanMode
    // off: the agent calls it blind, gets "no such tool" and retells the plan as text - while the
    // buttons under the plan card turn out to be a sham, because there is nothing left to answer.
    @Test
    fun `the permission channel is on - otherwise leaving plan mode is unavailable`() {
        val args = arguments(permissionMode = "plan")
        assertEquals("stdio", args[args.indexOf(ClaudeLaunch.PERMISSION_CHANNEL_FLAG) + 1])
    }

    // The same channel also enables the question with answer options. The tool used to be switched off
    // because there was nothing to return an answer with; now the chosen options go back in
    // updatedInput - there is no longer any reason to forbid it.
    @Test
    fun `the question with options is not switched off`() {
        assertFalse("--disallowed-tools" in arguments())
    }

    @Test
    fun `the event stream is requested the way the CLI demands`() {
        val args = arguments()

        assertTrue(args.containsAll(listOf("--print", "--verbose", "--include-partial-messages")))
        assertEquals("stream-json", args[args.indexOf("--output-format") + 1])
        assertEquals("stream-json", args[args.indexOf("--input-format") + 1])
    }

    // The CLI takes a streaming launch for an unattended script and tells the agent as much: an MCP
    // sign-in is impossible here, send the person to a terminal. The panel signs one in with a button
    // of its own, so the agent has to be told where it actually is - otherwise it turns a person away
    // from a screen they already have open.
    @Test
    fun `the agent is told it runs in the panel, not in a script`() {
        val args = arguments()
        val briefing = args[args.indexOf(ClaudeLaunch.BRIEFING_FLAG) + 1]

        assertTrue("MCP" in briefing)
        assertFalse(briefing.isBlank())
    }

    // The CLI's own system prompt has to stay: replacing it would take away everything the agent knows
    // about tools and about the project.
    @Test
    fun `our line joins the CLI's system prompt rather than replacing it`() {
        assertFalse("--system-prompt" in arguments())
    }

    @Test
    fun `continuing a conversation and branching do not get mixed up`() {
        val resumed = arguments(conversationId = "conversation-1", forkFrom = "parent-1")
        assertEquals("conversation-1", resumed[resumed.indexOf("--resume") + 1])
        assertFalse("--fork-session" in resumed)

        val forked = arguments(forkFrom = "parent-1")
        assertEquals("parent-1", forked[forked.indexOf("--resume") + 1])
        assertTrue("--fork-session" in forked)
    }

    @Test
    fun `the model and the effort travel only when they exist`() {
        val bare = arguments()
        assertFalse("--model" in bare)
        assertFalse("--effort" in bare)

        val full = arguments(model = "opus", effort = "xhigh")
        assertEquals("opus", full[full.indexOf("--model") + 1])
        assertEquals("xhigh", full[full.indexOf("--effort") + 1])
    }

    // The panel no longer substitutes permissions with a PreToolUse hook of its own: it stood earlier
    // than any of the CLI's checks and therefore asked even where there was nothing to ask about - in
    // "Don't ask", in "Auto", about something a rule already allowed. Settings of our own are no longer
    // slipped to the conversation at all, and questions go over the channel only.
    @Test
    fun `settings of our own are not slipped to the conversation`() {
        assertFalse("--settings" in arguments(model = "opus", effort = "xhigh"))
    }
}

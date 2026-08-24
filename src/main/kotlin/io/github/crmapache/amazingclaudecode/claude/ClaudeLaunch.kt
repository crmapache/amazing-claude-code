package io.github.crmapache.amazingclaudecode.claude

/**
 * What a conversation's process comes up with.
 *
 * Kept apart from the session because this is the one place where a conversation's fate is decided for
 * its whole life: some of these decisions cannot be changed after the launch, and checking them is
 * better done by a test than by eye over the logs.
 */
internal object ClaudeLaunch {

    /**
     * Allows switching into the "no questions" mode mid-conversation.
     *
     * The flag by itself allows nothing - it merely makes the mode reachable. Without it the CLI
     * answers a mode change with a refusal ("session was started without
     * --dangerously-skip-permissions"), and the "Approve & run" button under a plan turned out to be a
     * sham: the person approved the plan, the panel fell back into plan, and the agent went on asking
     * permission for every step.
     *
     * Starting straight in "no questions" the CLI allows without the flag as well - what broke was
     * switching on the fly, that is, exactly the path an approved plan takes.
     */
    const val ALLOW_BYPASS_FLAG = "--allow-dangerously-skip-permissions"

    /**
     * The channel the CLI asks the panel itself for permission over.
     *
     * The only one: a PreToolUse hook used to live beside it, knocking on the panel before every Bash,
     * Write, Edit, WebFetch and MCP call. A hook stands earlier in the flow than any of the CLI's
     * permissions, so it asked about everything - about `ls` and `git status`, which the CLI lets
     * through silently, about what a rule in the settings already allowed, and in the modes where by
     * definition there should be no questions: "Don't ask", "Auto", "Bypass". Hence "it asks about
     * every little thing, and the Always allow button changes nothing": the rule was written honestly,
     * and the very next call ran into the hook again.
     *
     * Over the channel the CLI decides: it applies the mode, its own allow/deny rules and its list of
     * safe commands, and the panel asks only where the terminal Claude Code would have asked a person.
     *
     * Without the channel the streaming mode counts as unattended and switches off every tool that
     * needs a live person - ExitPlanMode first of all. The agent knows about it and calls it anyway,
     * only to get "No such tool available: ExitPlanMode … is not enabled in this context", after which
     * it retells the plan as text and ends the turn. In the panel that looked like this: the plan card
     * with its buttons appeared (the tool call itself draws it), and "Approve & run" turned out to be a
     * sham - there was no longer anyone or anything to answer.
     *
     * With the channel on, the CLI sends a `can_use_tool` control_request and waits for an answer (see
     * [ClaudeSession]): "allowed" returns "User has approved your plan" to the agent, it goes straight
     * back to work within the same turn, and the CLI switches the mode itself, reporting it as an
     * ordinary system event.
     *
     * The value "stdio" is what the Agent SDK substitutes for itself: ask over the same stream the
     * conversation runs on.
     */
    const val PERMISSION_CHANNEL_FLAG = "--permission-prompt-tool"

    /** How a line of ours joins the CLI's own system prompt instead of replacing it. */
    const val BRIEFING_FLAG = "--append-system-prompt"

    /**
     * The tool for a question with answer options.
     *
     * Enabled by the same permission channel and answered over it too: the question arrives as an
     * ordinary `can_use_tool` with `requires_user_interaction`, and the chosen options go back in
     * `updatedInput` - the CLI puts them into the `answers` field (key: the question's text, value: the
     * chosen option's label) and assembles the tool result out of them itself (verified against a live
     * CLI 2.1.226).
     *
     * The tool used to be switched off with `--disallowed-tools`: the panel could show the question but
     * could not return the answer, and an allowed call silently told the agent "the person did not
     * answer". Now the answer gets through - see ClaudePanel.answerAsk.
     */
    const val ASK_TOOL = "AskUserQuestion"

    /**
     * What the agent is told about the place it has been launched into.
     *
     * The CLI judges a streaming launch to be an unattended script and puts a line of its own into the
     * agent's context: the session is non-interactive, an MCP sign-in cannot be run here, send the
     * person to `claude mcp` or to `/mcp` in an interactive session. In the panel that is simply untrue
     * - the MCP screen behind the header's menu shows every server with its status, offers the sign-in
     * button to the ones that ask for it, opens the browser from the IDE and refreshes the list by
     * itself afterwards (see ProjectCatalog.authenticateMcp). The agent has no way of knowing any of
     * that: it retells what it was told and sends off to a terminal a person who has the button two
     * clicks away.
     *
     * So we say out loud where the conversation actually runs. The same place is where anything else
     * the agent has to know about the panel belongs.
     */
    val PANEL_BRIEFING = """
        This conversation runs inside the Amazing Claude Code panel of a JetBrains IDE. A person is
        sitting in front of it, watching the answer as it is written, and can press a button on the
        spot - this is not a headless script, whatever the launch mode may look like from inside.

        The panel manages MCP servers itself. Its header menu has an MCP screen that lists every server
        with its status and its error, offers a sign-in button for the servers that need
        authentication, and can reconnect, add and remove them. The button opens the browser from the
        IDE, the sign-in finishes there, and the list updates itself afterwards.

        Because of the launch mode you may also be told that this session is non-interactive and that
        servers needing authorization can only be signed in to from an interactive session, via
        `claude mcp` or the `/mcp` command. That is written for unattended scripts and is wrong here.
        Signing in works in this session; it is the person who presses the button, not you.

        So the answer to "can this MCP server be signed in to now" is yes, and the way to say it is:
        open the panel's menu, go to the MCP screen, find the server and press its sign-in button.
        Never call a sign-in impossible here, and never send the person to a terminal, to an
        interactive session, to `claude mcp` or to `/mcp`.
    """.trimIndent()

    fun arguments(
        model: String,
        effort: String,
        permissionMode: String?,
        conversationId: String?,
        forkFrom: String?,
        allowBypassSwitch: Boolean,
    ): List<String> = buildList {
        add("--print")
        // Without --verbose the event stream is not handed over at all; that is the CLI's own demand.
        add("--verbose")
        addAll(listOf("--output-format", "stream-json"))
        addAll(listOf("--input-format", "stream-json"))
        add("--include-partial-messages")

        addAll(listOf(PERMISSION_CHANNEL_FLAG, "stdio"))

        // The CLI takes a streaming launch for an unattended script and tells the agent so; the panel
        // is neither, and the agent has to hear it from us (see PANEL_BRIEFING).
        addAll(listOf(BRIEFING_FLAG, PANEL_BRIEFING))

        if (model.isNotEmpty()) addAll(listOf("--model", model))
        if (effort.isNotEmpty()) addAll(listOf("--effort", effort))

        // The mode is always passed - even "ask every time". The CLI's default is its own
        // (permissions.defaultMode from the personal config), and staying silent here would hand the
        // choice over to it: see PermissionModes.
        permissionMode
            ?.let(PermissionModes::normalize)
            ?.let { addAll(listOf("--permission-mode", it)) }

        // Only if this CLI knows the flag at all: an unknown one it does not wave through, it refuses
        // to start.
        if (allowBypassSwitch) add(ALLOW_BYPASS_FLAG)

        when {
            // Continuing our own conversation after the process was restarted.
            conversationId != null -> addAll(listOf("--resume", conversationId))
            // A branch's first launch: copy the parent's transcript, but under a new number.
            forkFrom != null -> addAll(listOf("--resume", forkFrom, "--fork-session"))
        }
    }
}

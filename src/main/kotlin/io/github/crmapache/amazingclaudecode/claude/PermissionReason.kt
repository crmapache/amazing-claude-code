package io.github.crmapache.amazingclaudecode.claude

/**
 * Why the person is being asked about this call at all - and whether "always allow" is worth offering.
 *
 * Permissions come from more than the mode. Safety checks raise them, so do `ask` rules from the
 * settings, hooks, and the `auto` mode's classifier - and in the modes where no questions are expected
 * at all ("Bypass", "Auto") those are precisely what is left. Without an explanation such a question
 * reads as unaccountable nagging: the person chose "do not ask", and the panel asks anyway.
 *
 * Apart from [PermissionPrompt] because that one captions the call itself ("wants to run a command"),
 * while this is the line about who raised the question.
 */
internal object PermissionReason {

    /** The line for the card. Empty means there is nothing to explain, and no line should appear. */
    fun text(request: PermissionChannel.ToolPermission): String = when (request.reasonType) {
        // The ordinary "the mode requires asking" - the card already names the mode.
        MODE, "" -> ""
        // About the sandbox the CLI stays silent in the terminal too: it substitutes the decision
        // rather than explains it.
        SANDBOX -> ""
        RULE -> request.matchedAskRule?.let(::ruleText) ?: request.reason
        HOOK -> explained("A hook asked to confirm this", request.reason)
        CLASSIFIER -> explained("The auto-mode classifier asked to confirm this", request.reason)
        // safetyCheck, subcommandResults, workingDir, asyncAgent, other: the CLI has already put this
        // into words for the person - retelling it in our own is pointless.
        else -> request.reason
    }

    /**
     * Whether to offer "always allow".
     *
     * A rule does not always help, and in those cases the terminal simply does not show the third
     * option. The panel offered it everywhere: the person pressed, the rule was honestly written into
     * the settings - and the next call just like it ran into the same question again. Two cases where
     * there will be no rule:
     *
     * - The CLI asks outright not to offer one: the rule would come out wider than the question.
     * - A safety check demands a person ([PermissionChannel.ToolPermission.classifierApprovable]) and
     *   the CLI offered no ready rule. Dangerous deletions are like that: neither a rule nor the "no
     *   questions" mode waives them.
     */
    fun rememberable(request: PermissionChannel.ToolPermission): Boolean = when {
        request.suppressAlwaysAllow -> false
        request.suggestions.isEmpty() && request.classifierApprovable == false -> false
        else -> true
    }

    private fun ruleText(rule: PermissionChannel.AskRule): String {
        val target = rule.content?.let { "${rule.toolName}($it)" } ?: rule.toolName
        val source = SOURCES[rule.source]

        return if (source == null) "An ask rule matched: $target" else "An ask rule in $source matched: $target"
    }

    private fun explained(lead: String, reason: String): String =
        if (reason.isEmpty()) "$lead." else "$lead: $reason"

    /**
     * What to call the settings layers - by the same words the CLI calls them: the person will go
     * looking for that rule, and the name should match what they read in its messages.
     */
    private val SOURCES = mapOf(
        "userSettings" to "user settings",
        "projectSettings" to "shared project settings",
        "localSettings" to "project local settings",
        "flagSettings" to "command line arguments",
        "policySettings" to "enterprise managed settings",
        "cliArg" to "a CLI argument",
        "command" to "command configuration",
        "session" to "this session",
        "mcpServerPolicy" to "MCP server policy",
    )

    private const val MODE = "mode"
    private const val SANDBOX = "sandboxOverride"
    private const val RULE = "rule"
    private const val HOOK = "hook"
    private const val CLASSIFIER = "classifier"
}

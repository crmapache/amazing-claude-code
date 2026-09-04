package io.github.crmapache.amazingclaudecode.claude

/**
 * What one conversation is to start on, when that is not what the settings say.
 *
 * The model, the effort and the permission mode normally come from [ClaudePreferences]: they are
 * chosen once and every new tab inherits them, because re-picking a model in every tab is work over
 * nothing. This is the exception - a conversation started from somewhere that had to be asked, and a
 * phone is exactly that: the person holding it cannot see the selectors at the desk, so the choice
 * travels with the request that opens the tab.
 *
 * It applies to that conversation and to no other. Deliberately: writing it into the settings instead
 * would mean a tab started from a sofa on Opus quietly decided what every tab opened at the desk
 * tomorrow starts on.
 *
 * An empty field means "as the settings have it" rather than "as the CLI has it" - so a phone may
 * choose the model alone and leave the rest to whatever is configured on this machine.
 */
internal data class SessionLaunch(
    val model: String = "",
    val effort: String = "",
    val mode: String = "",
) {

    /**
     * Whether there is anything here worth remembering.
     *
     * The account is deliberately NOT among these three. Which subscription pays is not a property of a
     * launch at all any more: it is read from the register at the moment the process comes up, and it is
     * the same answer for every conversation on the machine (see ClaudeAccounts.currentId). A field here
     * would be a second opinion, and the one thing a second opinion about the account can do is bill the
     * wrong subscription without a word.
     */
    val isEmpty: Boolean
        get() = model.isEmpty() && effort.isEmpty() && mode.isEmpty()
}

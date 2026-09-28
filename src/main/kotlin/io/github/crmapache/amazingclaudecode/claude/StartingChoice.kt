package io.github.crmapache.amazingclaudecode.claude

import io.github.crmapache.amazingclaudecode.claude.accounts.ClaudeAccounts

/**
 * What a conversation starts on when nothing was chosen for it in particular: the model and the effort.
 *
 * One answer for everybody who has to give it, and that is the reason this is a file of its own. The launch
 * (ClaudeSessions.newSession) used to know a longer road than everything that SHOWED its answer: it read
 * the paying account's memory between the pin and the machine's last pick, while the chip over an empty
 * tab, a phone's new chat and the scenarios read the pin and the last pick alone. Wherever the two differed
 * - an account switched to, a pick made in another IDE on the machine's shared register of accounts - the
 * chip said Sonnet over a tab that came up on Opus, and changed its mind at the first answer.
 *
 * The chain, strongest first:
 * - what the request itself named - a phone's new chat, a fork's parent, a tab restored with its own;
 * - the pin behind "New chats": somebody said "start on this" in words ([ClaudePreferences.newTabModel]);
 * - what the paying account was last left on - picks are remembered per account, because plans differ in
 *   which models they can run (ClaudeAccounts.rememberChoice);
 * - the machine's last pick, for an account nobody has picked anything on yet - the ordinary sign-in,
 *   which has no record at all, among them.
 *
 * The model is then held to what that account can run ([clamp]); the effort has nothing to be held to.
 */
internal object StartingChoice {

    /** The model, on [accountId] - the account chosen on this machine unless somebody knows better. */
    fun model(accountId: String = current(), requested: String = ""): String =
        clamp(accountId, requested.ifEmpty { ClaudePreferences.newTabModel }.ifEmpty { lastModel(accountId) })

    fun effort(accountId: String = current(), requested: String = ""): String =
        requested.ifEmpty { ClaudePreferences.newTabEffort }.ifEmpty { lastEffort(accountId) }

    /**
     * What "as last chosen" comes to right now - the model a new tab starts on with nothing pinned.
     *
     * The "New chats" screen names it beside that entry, and it is no more the machine's last pick than
     * the launch is: on an account with a memory of its own, that memory is what an unpinned tab gets.
     */
    fun unpinnedModel(accountId: String = current()): String = clamp(accountId, lastModel(accountId))

    fun unpinnedEffort(accountId: String = current()): String = lastEffort(accountId)

    private fun lastModel(accountId: String): String =
        ClaudeAccounts.getInstance().account(accountId)?.model.orEmpty().ifEmpty { ClaudePreferences.model }

    private fun lastEffort(accountId: String): String =
        ClaudeAccounts.getInstance().account(accountId)?.effort.orEmpty().ifEmpty { ClaudePreferences.effort }

    private fun current(): String = ClaudeAccounts.getInstance().currentId

    /**
     * The model to start on, given the account that will pay - the one asked for when it may be run there,
     * and that account's own otherwise.
     *
     * The CLI does not refuse a model an account has no access to at launch: the process comes up, says
     * the model in its init event, replays the transcript and looks perfectly well, and then dies on the
     * person's first message with an HTTP 404 (see ClaudeAccounts.canRun). Nothing on the screen names
     * the account, and nothing puts it right by itself - so it is put right before the process is raised,
     * and whoever draws the model is told the one it actually got.
     *
     * Only a definite NO replaces anything. Unknown leaves the model alone, and that way round is not a
     * coin toss: an unasked catalogue is the ordinary state of the first seconds of a project, and
     * treating it as a refusal would throw away the model of every conversation opened from the history -
     * including the one this rule exists to protect, an old chat on a million-token model. The catalogue
     * is asked for when a conversation is born on an account and again when the accounts screen opens
     * (see AccountDesk.round), which is the screen a person has to visit to switch at all.
     */
    fun clamp(accountId: String, model: String): String {
        val accounts = ClaudeAccounts.getInstance()
        if (accounts.canRun(accountId, model) != false) return model

        // The same model at its ordinary window comes before any other model. The window mark is the one
        // thing the catalogue is strict about (see ModelNames.holds): an account served plain Opus and not
        // the large window used to be handed `opus[1m]` all the same, and the process died on the first
        // message - and since a resumed conversation now carries the mark its transcript was held on (see
        // ClaudeHistory.modelIdentity), every resume of such a conversation under such an account would go
        // the same way. Without the mark it is what it was before the mark was read at all: the
        // conversation, on its own model, in the window this account has.
        val unmarked = ModelNames.unmarked(model)
        if (unmarked != model && accounts.canRun(accountId, unmarked) != false) return unmarked

        val own = accounts.account(accountId)?.model.orEmpty()
        if (own.isNotEmpty() && accounts.canRun(accountId, own) != false) return own

        // The machine's default gets the same test as the other two, and it is the case that matters
        // most: every applied pick writes that default, so choosing Opus on a Max account is exactly what
        // leaves it standing when the move lands on a Pro one. Unchecked, this branch handed back the
        // very model the first branch had just refused - and an account nobody has chosen a model for
        // (the ordinary sign-in among them, which has no record at all) reaches it every time.
        val preferred = ClaudePreferences.model
        if (accounts.canRun(accountId, preferred) != false) return preferred

        // Everything this tab could have asked for is refused, so what is left is the account's own
        // default - NAMED rather than left out. Leaving the flag out is not the same thing here: a move
        // resumes the transcript, and the CLI resumed without `--model` carries on at the model written
        // in it, which is very likely the one just refused. Naming it is only possible when the account
        // has answered with a catalogue at all; without one there is nothing honest left to say.
        return DEFAULT_MODEL.takeIf { accounts.canRun(accountId, it) == true }.orEmpty()
    }

    /**
     * The CLI's own name for "whatever this account's default is" - the one model every plan can run.
     *
     * Its own word rather than ours: it is what the CLI lists in the model catalogue and what the
     * panel's own menu sends when a person picks the first entry (see DEFAULT_MODEL in catalog.ts).
     */
    private const val DEFAULT_MODEL = "default"
}

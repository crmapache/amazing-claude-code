package io.github.crmapache.amazingclaudecode.claude.accounts

import io.github.crmapache.amazingclaudecode.claude.ClaudeSettings
import io.github.crmapache.amazingclaudecode.claude.SettingSources

/**
 * What in the repository's own settings outranks the account the panel chose - by name, never by value.
 *
 * The register moves one environment variable and blanks the three that would outrank it (see
 * [AccountStore.OUTRANKING_VARIABLES]), which is enough against an environment the IDE inherited. It is
 * not enough against `.claude/settings.json`: the CLI applies that file's `env` block on top of the
 * environment it was given. Measured in a bare directory - a project settings file with a base URL in
 * `env` beat the same variable left empty in the process's environment, every time.
 *
 * So a checked-in key silently wins over the account chosen in the panel, and the panel goes on drawing
 * that account's name, its usage rings and its limits while the turn is paid for by somebody else. That
 * is the one failure the account feature must not have, and nothing else can catch it: the CLI does not
 * announce whose credential it ended up using.
 *
 * Hence a warning rather than a refusal. Refusing to start would be the safe half of the answer and the
 * useless one - a conversation that will not open in a repository configured by its owner is not a
 * conversation anybody wants, and the setup may well be deliberate. What a person cannot do is fix what
 * they cannot see, and the way out is one screen away (see [SettingSources]).
 */
internal object AccountOverride {

    /**
     * The address the credential is sent to. Not a credential itself, and listed all the same: with it
     * pointed elsewhere, the account chosen here is no more in use than it would be under a foreign key
     * - its token goes to a gateway that answers for somebody else, or hangs.
     */
    const val BASE_URL = "ANTHROPIC_BASE_URL"

    /** A command that prints a key. A key by another road, and it outranks the drawer the same way. */
    const val API_KEY_HELPER = "apiKeyHelper"

    /**
     * Which names the repository sets that would beat the chosen account, in a stable order.
     *
     * Empty whenever the repository's layers are not being loaded at all: told to skip them, the CLI
     * does skip them - proven on this machine, and the whole reason the setting exists - so a file that
     * is not read is not a clash to warn about.
     */
    fun namesIn(projectDirectory: String?, settingSources: String): List<String> {
        if (!SettingSources.readsRepository(settingSources)) return emptyList()

        val loaded = SettingSources.layers(settingSources)

        return ClaudeSettings.repositorySources(projectDirectory)
            .filter { it.layer in loaded }
            .flatMap { source ->
                val names = ClaudeSettings.envNames(source.file).filter { it in WATCHED }
                if (ClaudeSettings.setsField(source.file, API_KEY_HELPER)) names + API_KEY_HELPER else names
            }
            .distinct()
            .sorted()
    }

    /** Everything in an `env` block that decides whose subscription pays, and where the request goes. */
    private val WATCHED = (AccountStore.OUTRANKING_VARIABLES + BASE_URL).toSet()
}

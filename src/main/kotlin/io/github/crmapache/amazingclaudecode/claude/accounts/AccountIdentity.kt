package io.github.crmapache.amazingclaudecode.claude.accounts

import java.io.File
import kotlinx.serialization.json.Json
import kotlinx.serialization.json.contentOrNull
import kotlinx.serialization.json.jsonObject
import kotlinx.serialization.json.jsonPrimitive

/**
 * Who just signed in - read from the CLI's own configuration file, once, at the only moment it is true.
 *
 * It cannot be asked of `claude auth status`. That command reports the address and the organisation out
 * of this same shared file no matter which credential drawer it was pointed at, so under two accounts
 * it answers with whoever signed in last - beside a `subscriptionType` that genuinely came from the
 * drawer. A row labelled from that pairing is a row that names one person and bills another.
 *
 * So the label is harvested at the single instant it is unambiguous: right after a sign-in, which
 * rewrites `oauthAccount` with the account that just completed. Afterwards the plugin owns the label
 * and never asks again - it changes only when the person renames it.
 *
 * The window is real but not tight: the CLI refreshes this record at most once a day, so nothing
 * overwrites it in the seconds between a sign-in landing and this being read.
 *
 * Reading is kept apart from [ClaudeAccounts] because it is arithmetic over a file and a test can hold
 * it, while everything around it is processes and services.
 */
internal object AccountIdentity {

    data class Who(val email: String, val orgUuid: String, val orgName: String) {

        /** An account we could not name is an account we must not file. */
        val isNamed: Boolean get() = email.isNotEmpty()
    }

    /**
     * The CLI's own configuration file.
     *
     * Note where it is: `~/.claude.json` is a SIBLING of `~/.claude`, not a file inside it - the plugin
     * reads nothing else from there, so this is easy to get wrong and answers with an empty object when
     * it is. When `CLAUDE_CONFIG_DIR` moved the directory, the file moves inside it; that is the CLI's
     * own rule, not a guess.
     *
     * Local only. A project inside WSL has its CLI on the other side of a share and this feature refuses
     * such a project outright (see ClaudeAccounts.capability), so there is nothing here to translate.
     */
    fun configFile(): File =
        System.getenv("CLAUDE_CONFIG_DIR")?.takeIf { it.isNotBlank() }?.let { File(it, ".claude.json") }
            ?: File(System.getProperty("user.home"), ".claude.json")

    fun current(): Who = read(configFile())

    /**
     * Parsed defensively and by name. The file is ~125 KB of the CLI's own business, most of it none of
     * ours; we take three fields and ignore everything else, including a shape we do not recognise.
     */
    fun read(file: File): Who {
        val blank = Who("", "", "")

        val text = runCatching { file.readText() }.getOrNull() ?: return blank

        val account = runCatching {
            Json.parseToJsonElement(text).jsonObject["oauthAccount"]?.jsonObject
        }.getOrNull() ?: return blank

        val field = { name: String -> account[name]?.jsonPrimitive?.contentOrNull.orEmpty() }

        return Who(
            email = field("emailAddress"),
            orgUuid = field("organizationUuid"),
            orgName = field("organizationName"),
        )
    }
}

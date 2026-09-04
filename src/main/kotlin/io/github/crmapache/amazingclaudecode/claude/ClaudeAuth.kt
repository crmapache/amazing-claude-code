package io.github.crmapache.amazingclaudecode.claude

import com.intellij.execution.configurations.GeneralCommandLine
import com.intellij.execution.process.CapturingProcessHandler
import com.intellij.openapi.diagnostic.thisLogger
import java.nio.file.Path
import kotlinx.serialization.json.Json
import kotlinx.serialization.json.booleanOrNull
import kotlinx.serialization.json.contentOrNull
import kotlinx.serialization.json.jsonObject
import kotlinx.serialization.json.jsonPrimitive

/**
 * Whether the user is signed in to Claude Code.
 *
 * We ask the CLI itself rather than read its files: there are several ways to sign in - a subscription,
 * a console key, corporate SSO - and each is stored in its own way. Without a sign-in the agent answers
 * every question with a single line about /login, so this has to be known before the panel shows an
 * input field.
 */
internal object ClaudeAuth {

    data class Status(
        /** False when there is no executable at all: then there is nowhere to sign in. */
        val installed: Boolean,
        val loggedIn: Boolean,
        val email: String = "",
        val plan: String = "",
        /**
         * The organization the sign-in belongs to, and the way it was made. They tell one account from
         * another: an email alone is not enough, because one person's address stands behind both a
         * personal account and a workspace that invited it.
         */
        val orgId: String = "",
        /**
         * The organisation's readable name.
         *
         * Parsed and kept for completeness rather than shown: the accounts screen dropped it - the plan
         * already says whether it is a team, and the name beside it was either the company the address
         * names anyway or Anthropic's own "somebody's Organization". The id above still tells accounts
         * apart.
         */
        val orgName: String = "",
        val method: String = "",
        /**
         * Where the CLI says it keeps its conversations, or empty when this build does not say.
         *
         * Read for one purpose: proving that a credential drawer moved the credential and NOT the
         * folder (see ClaudeAccounts.capability). Older builds - 2.1.247 and below - do not report the
         * field at all, and an absent value must never be read as "unchanged": two nulls compare equal,
         * which would turn the proof into a formality that passes for everyone.
         */
        val projectsDirectory: String = "",
    ) {
        /**
         * Who is signed in, as one string. Empty means the CLI named nobody: either there is no sign-in,
         * or the answer did not survive the parsing - and about a change of account such an answer says
         * nothing (see [switchedAccount]).
         *
         * **This is the CLI's notion of who, not the plugin's, and with several accounts the two part
         * company.** `email`, `orgId` and `orgName` are read out of the SHARED `~/.claude.json`, which no
         * credential drawer partitions, so under two accounts they name whichever signed in last - and a
         * background token refresh by one account rewrites them behind the other's back. Only `loggedIn`
         * and `plan` are truthful per drawer. So once accounts exist, the truth about which account is
         * current is [io.github.crmapache.amazingclaudecode.claude.accounts.ClaudeAccounts], and
         * ProjectAuth asks it rather than this field - otherwise a refresh over there wipes the usage
         * figures over here.
         */
        val identity: String
            get() = if (!loggedIn) "" else listOf(email, orgId, method).filter { it.isNotEmpty() }.joinToString("|")
    }

    /**
     * Whether the sign-in has moved to another account than the one already known.
     *
     * Everything the panel shows about the subscription - the usage rings above all - belongs to the
     * account it was asked about, and after a switch it is somebody else's (see ProjectUsage.forget).
     *
     * Compared against the last account actually named rather than against the previous answer: asking
     * the CLI is starting a process, and a process that failed to answer in time comes back as "not
     * signed in". Read as a switch, such a miss would wipe the figures and send the panel for fresh ones
     * on every hiccup; read as nothing at all, it costs nothing - the account behind the miss has not
     * gone anywhere, and if it has, the very next answer says so.
     */
    fun switchedAccount(known: String, next: Status): Boolean =
        known.isNotEmpty() && next.identity.isNotEmpty() && known != next.identity

    /**
     * Call from a background thread only: this starts a process.
     *
     * [environment] decides WHICH account is being asked about: a credential drawer travels in it and
     * nowhere else (see AccountStore). The default is the ordinary sign-in, so every existing caller
     * keeps asking exactly what it asked before.
     *
     * [workingDirectory] is not decoration either. A drawer path is resolved by the CLI against the
     * process's own directory when it is not absolute, so asking from one directory and running turns
     * from another can answer about a different drawer than the one a conversation will open. The
     * refusal in [AccountStore.refusalFor] makes that unreachable; passing the directory keeps the
     * question and the answer about the same thing regardless.
     */
    fun status(
        environment: Map<String, String> = ClaudeExecutable.environment(),
        workingDirectory: String? = null,
    ): Status {
        val executable = ClaudeExecutable.find()
            ?: return Status(installed = false, loggedIn = false)

        val commandLine = GeneralCommandLine(executable.absolutePath)
            .withParameters("auth", "status", "--json")
            .withEnvironment(environment)
            .withCharset(Charsets.UTF_8)
            .apply { workingDirectory?.let { withWorkingDirectory(Path.of(it)) } }

        val output = runCatching {
            CapturingProcessHandler(commandLine).runProcess(TIMEOUT_MS)
        }.onFailure {
            thisLogger().warn("Failed to ask claude about auth status", it)
        }.getOrNull() ?: return Status(installed = true, loggedIn = false)

        return parse(output.stdout)
    }

    /**
     * We parse defensively: when the sign-in is refused the CLI is free to add a human-readable line to
     * the JSON or answer with a non-zero code. The only thing we genuinely need is the loggedIn field.
     */
    private fun parse(stdout: String): Status {
        val json = stdout.substringAfter('{', "").substringBeforeLast('}', "")
        if (json.isEmpty()) return Status(installed = true, loggedIn = false)

        val payload = runCatching {
            Json.parseToJsonElement("{$json}").jsonObject
        }.getOrNull() ?: return Status(installed = true, loggedIn = false)

        val field = { name: String -> payload[name]?.jsonPrimitive?.contentOrNull.orEmpty() }

        return Status(
            installed = true,
            loggedIn = payload["loggedIn"]?.jsonPrimitive?.booleanOrNull == true,
            email = field("email"),
            plan = field("subscriptionType").ifEmpty { field("authMethod") },
            orgId = field("orgId"),
            orgName = field("orgName"),
            method = field("authMethod"),
            projectsDirectory = field("projectsDirectory"),
        )
    }

    private const val TIMEOUT_MS = 20_000
}

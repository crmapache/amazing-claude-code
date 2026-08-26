package io.github.crmapache.amazingclaudecode.claude

import com.intellij.execution.configurations.GeneralCommandLine
import com.intellij.execution.process.CapturingProcessHandler
import com.intellij.openapi.diagnostic.thisLogger
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
         * The organization the sign-in belongs to, and the way it was made. Neither is shown anywhere -
         * they are here to tell one account from another: an email alone is not enough (one person's
         * address stands behind both a personal account and a workspace that invited it).
         */
        val orgId: String = "",
        val method: String = "",
    ) {
        /**
         * Who is signed in, as one string. Empty means the CLI named nobody: either there is no sign-in,
         * or the answer did not survive the parsing - and about a change of account such an answer says
         * nothing (see [switchedAccount]).
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

    /** Call from a background thread only: this starts a process. */
    fun status(): Status {
        val executable = ClaudeExecutable.find()
            ?: return Status(installed = false, loggedIn = false)

        val commandLine = GeneralCommandLine(executable.absolutePath)
            .withParameters("auth", "status", "--json")
            .withEnvironment(ClaudeExecutable.environment())
            .withCharset(Charsets.UTF_8)

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
            method = field("authMethod"),
        )
    }

    private const val TIMEOUT_MS = 20_000
}

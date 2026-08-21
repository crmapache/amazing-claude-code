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
    )

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
        )
    }

    private const val TIMEOUT_MS = 20_000
}

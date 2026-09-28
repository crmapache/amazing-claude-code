package io.github.crmapache.amazingclaudecode.claude

import com.intellij.openapi.diagnostic.thisLogger
import com.intellij.openapi.project.Project
import java.util.concurrent.atomic.AtomicBoolean
import kotlinx.serialization.json.buildJsonObject
import kotlinx.serialization.json.put
import kotlinx.serialization.json.putJsonArray
import kotlinx.serialization.json.putJsonObject
import kotlinx.serialization.json.add
import kotlinx.serialization.json.addJsonObject

/**
 * The screen of Claude Code's own settings - what `/config` changes in a terminal (see ClaudeConfig).
 *
 * Two runs of the CLI stand behind it, both one-off and neither of them a conversation: `/config` alone,
 * which lists the settings, and `/config key=value`, which changes one. Both go through standard input
 * with `--no-session-persistence`, so neither leaves a conversation behind in the history, and neither
 * calls a model - they are commands the CLI answers itself, in about three seconds with this project's
 * MCP servers configured.
 *
 * Not billed and not an account's business: the settings live in the CLI's shared directory, which every
 * account has in common (see ClaudeCli.run on why `claude mcp` and `claude plugin` pass no account either).
 */
internal class ClaudeConfigDesk(
    private val project: Project,
    private val hub: ClaudeSessionHub,
) {

    /**
     * The list `/config` printed, and for which CLI. The list changes with the CLI's version - a setting
     * added, a value taken away - and with the project only in the output styles it offers, so it is kept
     * per executable and asked again when that file changes.
     */
    @Volatile
    private var catalog: Pair<String, List<ClaudeConfig.Entry>>? = null

    /**
     * A change is under way. One at a time on purpose: every change is a whole CLI rewriting its settings
     * file, and two of them at once would each write the file as it found it - the second undoing the
     * first. The panel holds the rows still while one runs; this is the half that does not depend on it.
     */
    private val changing = AtomicBoolean(false)

    /** Answer the screen: the list with the values in force, asking the CLI for the list if needed. */
    fun send() {
        val executable = ClaudeExecutable.find()
        if (executable == null) {
            say(error = NO_CLI)
            return
        }

        val identity = "${executable.absolutePath}:${executable.lastModified()}"
        catalog?.takeIf { it.first == identity }?.let {
            say(entries = it.second)
            return
        }

        say(loading = true)

        ClaudeCli.run(
            workingDirectory = project.basePath,
            args = ARGUMENTS,
            input = "/config",
            onError = { message ->
                thisLogger().info("Claude Code's settings could not be listed: $message")
                say(error = UNREADABLE)
            },
            onResult = { output ->
                val entries = ClaudeConfig.parse(output)
                if (entries.isEmpty()) {
                    // An old CLI, or one that changed the form of its answer: said on the screen rather than
                    // shown as an empty list, which would read as "there is nothing to set".
                    thisLogger().info("Claude Code's /config said nothing this screen can read")
                    say(error = UNREADABLE)
                    return@run
                }

                catalog = identity to entries
                say(entries = entries)
            },
        )
    }

    /**
     * Change one setting through `/config key=value` and answer with the list read afresh, and with how it
     * went - judged by the file rather than by the CLI's sentence: a setting this screen can read is
     * changed when it reads as asked, and otherwise the CLI's own words say why.
     */
    fun change(key: String, value: String) {
        val entries = catalog?.second
        val command = entries?.let { ClaudeConfig.command(it, key, value) }
        if (entries == null || command == null) {
            say(entries = entries, outcome = Outcome(key, ok = false, message = ""))
            return
        }

        if (!changing.compareAndSet(false, true)) {
            say(entries = entries, outcome = Outcome(key, ok = false, message = ""))
            return
        }

        val before = valueOf(entries, key)

        ClaudeCli.run(
            workingDirectory = project.basePath,
            args = ARGUMENTS,
            input = command,
            onError = { message ->
                changing.set(false)
                thisLogger().info("A Claude Code setting could not be changed: $message")
                say(entries = entries, outcome = Outcome(key, ok = false, message = message.trim()))
            },
            onResult = { output ->
                changing.set(false)
                val after = valueOf(entries, key)
                val free = entries.firstOrNull { it.key == key }?.free == true
                val ok = when {
                    after == null -> true
                    after.equals(value.trim(), ignoreCase = true) -> true
                    // A free value comes back as the CLI spelled it ("ja" is stored as "Japanese").
                    free -> after != before
                    else -> false
                }
                say(entries = entries, outcome = Outcome(key, ok = ok, message = output.trim()))
            },
        )
    }

    private fun valueOf(entries: List<ClaudeConfig.Entry>, key: String): String? =
        ClaudeConfig.settings(entries.filter { it.key == key }, files()).firstOrNull()?.value

    private fun files(): ClaudeConfig.Files = ClaudeConfig.files(project.basePath, SettingSources.of(project))

    private class Outcome(val key: String, val ok: Boolean, val message: String)

    private fun say(
        entries: List<ClaudeConfig.Entry>? = null,
        loading: Boolean = false,
        error: String = "",
        outcome: Outcome? = null,
    ) {
        val settings = entries?.let { ClaudeConfig.settings(it, files()) }

        hub.broadcastProject(
            buildJsonObject {
                put("type", "claudeConfig")
                if (loading) put("loading", true)
                if (error.isNotEmpty()) put("error", error)
                putJsonArray("settings") {
                    settings?.forEach { setting ->
                        addJsonObject {
                            put("key", setting.key)
                            putJsonArray("options") { setting.options.forEach { add(it) } }
                            if (setting.free) put("free", true)
                            setting.value?.let { put("value", it) }
                            put("group", setting.group.wire)
                            setting.lockedBy?.let { put("lockedBy", it.name.lowercase()) }
                            if (setting.projectOnly) put("projectOnly", true)
                        }
                    }
                }
                // How the last change went. Kept in the one message rather than one of its own: the hub
                // hands the last message of every type to a client that joins later, and a panel shows an
                // outcome only for a change it is itself waiting on - so a stale one reaching a fresh page
                // says nothing.
                outcome?.let {
                    putJsonObject("outcome") {
                        put("key", it.key)
                        put("ok", it.ok)
                        if (it.message.isNotEmpty()) put("message", it.message.take(MESSAGE_LIMIT))
                    }
                }
            }.toString(),
        )
    }

    private companion object {
        /** A one-off run that leaves no conversation behind - the list and a change are commands, not work. */
        val ARGUMENTS = listOf("-p", "--no-session-persistence")

        /** The screen's words for the two ways it can fail - the panel says them in its own language. */
        const val NO_CLI = "noCli"
        const val UNREADABLE = "unreadable"

        /** The CLI's answer to a change is a sentence; anything longer is not one worth a row's width. */
        const val MESSAGE_LIMIT = 400
    }
}

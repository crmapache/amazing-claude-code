package io.github.crmapache.amazingclaudecode.claude

import com.intellij.execution.configurations.GeneralCommandLine
import com.intellij.execution.process.CapturingProcessHandler
import com.intellij.openapi.diagnostic.thisLogger
import java.io.File
import java.nio.file.Path

/**
 * A command typed into the input field through "!" - the same bash mode the Claude Code terminal and
 * neighbouring agent shells have.
 *
 * The panel runs it, not the agent: the whole point of this mode is to look at something with your own
 * eyes - a branch, a status, a file's contents - without spending the agent's turn on it and without
 * asking permission for a tool call. The agent will see the output anyway: it travels along with the
 * next message (see ClaudePanel and shellLog on the panel's side).
 *
 * Through the user's shell with its profile rather than directly: an IDE launched from the Dock lives
 * with a trimmed PATH (the same trouble the CLI lookup has, see [ClaudeExecutable]), and "!npm test"
 * would not be found there at all.
 */
internal object ShellCommand {

    data class Result(val exitCode: Int, val stdout: String, val stderr: String)

    /**
     * How long a command is given before it is killed. With room for a build and tests, but not
     * endless: this card has no Stop of its own, and a stuck `!tail -f` would otherwise hold a process
     * until the IDE closes.
     */
    private const val TIMEOUT_MS = 120_000

    /**
     * Where the output gets cut. The panel shows it whole in a card and then sends it to the agent - a
     * megabyte-long sheet from `!find /` fits into neither that nor the context window.
     */
    private const val MAX_OUTPUT_CHARS = 40_000

    /**
     * The exit code of something that never reached the command at all: the shell itself could not be
     * started. Negative on purpose - a real command never answers with such a code, and it cannot be
     * mistaken for one of its own.
     */
    private const val NOT_STARTED = -1

    /**
     * Killed on time. 124 is the same number the `timeout` utility answers with: a person and an agent
     * read it as "did not fit in time" rather than as an error of the command itself, and it also
     * differs from "did not start".
     */
    private const val TIMED_OUT = 124

    fun run(command: String, workingDirectory: String?): Result {
        val commandLine = runCatching {
            GeneralCommandLine(shell(command))
                .withWorkingDirectory(workingDirectory?.let { Path.of(it) })
                .withEnvironment(ClaudeExecutable.environment())
                .withCharset(Charsets.UTF_8)
        }.getOrElse {
            return Result(NOT_STARTED, stdout = "", stderr = "Failed to build the command: ${it.message}")
        }

        val output = runCatching {
            val handler = CapturingProcessHandler(commandLine)

            /*
             * The command has no input and never will: the panel is not a terminal, there is nowhere to
             * type an answer to "Are you sure? [y/N]". We close the stream right away so that anything
             * reading input (`git commit` without -m, `npm login`, a plain `cat`) gets end-of-file and
             * finishes by itself. Otherwise such a command would simply stand there for the full two
             * minutes until the deadline, with the card in the feed promising work that is not
             * happening.
             */
            runCatching { handler.processInput.close() }

            handler.runProcess(TIMEOUT_MS)
        }.getOrElse {
            thisLogger().info("Shell command failed: ${it.message}")
            return Result(NOT_STARTED, stdout = "", stderr = "Failed to run the command: ${it.message}")
        }

        if (output.isTimeout) {
            // Whatever the command managed to write to stderr is kept: for a long build that is where
            // all the diagnostics it was run for live - the note about the deadline is simply appended
            // as the last line.
            val said = truncate(output.stderr)
            val note = "Timed out after ${TIMEOUT_MS / 1000}s and was killed."

            return Result(
                exitCode = TIMED_OUT,
                stdout = truncate(output.stdout),
                stderr = if (said.isBlank()) note else "$said\n$note",
            )
        }

        return Result(output.exitCode, truncate(output.stdout), truncate(output.stderr))
    }

    /**
     * The person's shell rather than one of our own: the command was typed the way it would be typed in
     * a terminal, and it should run with the same PATH, the same profile and the same aliases. A single
     * `-l` (as in ClaudeExecutable.lookupCommand, which needs no aliases - it looks up an executable
     * through `command -v`) is not enough for that: `.zshrc`/`.bashrc`, where aliases usually live, a
     * shell reads only when it considers itself interactive - without `-i`, `!pull` would not find the
     * `pull` alias, even though a real terminal has it.
     */
    private fun shell(command: String): List<String> = if (HostOs.isWindows) {
        listOf("cmd.exe", "/c", command)
    } else {
        val userShell = System.getenv("SHELL")?.takeIf { it.isNotBlank() } ?: "/bin/sh"
        listOf(userShell, "-ilc", withBashrc(userShell, command))
    }

    /**
     * With zsh, `-l` and `-i` together read every profile file, `.zshrc` included - everything is
     * already there. With bash it is not so: the combination of `-l` and `-i` is still a login shell,
     * and `.bashrc` (where aliases usually live) a login shell does not touch at all, whatever else it
     * considers itself. So we source it ourselves.
     *
     * On the line below rather than through ";" on the same one: aliases in bash are expanded only for
     * a command from the next line read - an alias declared and immediately used through ";" bash
     * silently fails to find.
     */
    internal fun withBashrc(userShell: String, command: String): String =
        if (File(userShell).name == "bash") "[ -f ~/.bashrc ] && source ~/.bashrc\n$command" else command

    private fun truncate(text: String): String =
        if (text.length <= MAX_OUTPUT_CHARS) text else "${text.take(MAX_OUTPUT_CHARS)}\n… output truncated"
}

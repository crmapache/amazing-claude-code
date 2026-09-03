package io.github.crmapache.amazingclaudecode.claude

import com.intellij.execution.configurations.GeneralCommandLine
import com.intellij.execution.process.CapturingProcessHandler
import com.intellij.execution.process.ProcessHandler
import com.intellij.openapi.diagnostic.thisLogger
import com.intellij.util.concurrency.AppExecutorUtil
import java.nio.file.Path

/**
 * A one-off `claude <args>` run in the background - the shared runtime for the commands that have a
 * CLI subcommand of their own (mcp, plugin) and need no long-lived conversation process. Every call is
 * independent: its own process, its own timeout, its own result.
 */
internal object ClaudeCli {

    private const val DEFAULT_TIMEOUT_MS = 30_000

    /**
     * [onStarted] is handed the process as soon as it exists, for whoever needs to end it early - a
     * search the person cancelled (see AiSearch). A run ended that way reports a failure like any
     * other; it is the caller's business to know it asked for that.
     */
    fun run(
        workingDirectory: String?,
        args: List<String>,
        input: String? = null,
        timeoutMs: Int = DEFAULT_TIMEOUT_MS,
        onStarted: ((ProcessHandler) -> Unit)? = null,
        onError: (String) -> Unit,
        onResult: (String) -> Unit,
    ) {
        val executable = ClaudeExecutable.find()
        if (executable == null) {
            onError("Claude Code executable not found.")
            return
        }

        AppExecutorUtil.getAppExecutorService().submit {
            runCatching {
                val commandLine = GeneralCommandLine(executable.absolutePath)
                    .withParameters(args)
                    .withEnvironment(ClaudeExecutable.environment())
                    .withCharset(Charsets.UTF_8)
                    .apply { workingDirectory?.let { withWorkingDirectory(Path.of(it)) } }

                val handler = CapturingProcessHandler(commandLine)
                onStarted?.invoke(handler)
                if (input != null) feed(handler, input)
                handler.runProcess(timeoutMs)
            }.fold(
                onSuccess = { output ->
                    when {
                        output.isTimeout -> onError("claude ${args.joinToString(" ")} timed out.")
                        output.exitCode != 0 ->
                            onError(output.stderr.ifBlank { output.stdout }.ifBlank { "Exited with code ${output.exitCode}." })
                        else -> onResult(output.stdout)
                    }
                },
                onFailure = {
                    thisLogger().warn("claude ${args.joinToString(" ")} failed", it)
                    onError(it.message ?: "Failed to run claude.")
                },
            )
        }
    }

    /**
     * Text handed to the CLI through its standard input rather than as an argument.
     *
     * An argument is the wrong road for anything a person wrote: on Windows npm installs the CLI as a
     * batch file, the platform runs it through cmd.exe, and both are line-based - a newline inside an
     * argument ends the command there and the rest of the line never reaches the CLI, silently (the whole
     * story is in ClaudeLaunch). Standard input has no such rule: it is bytes until it is closed.
     *
     * On a thread of its own because a pipe holds only so much - about sixty kilobytes on the usual
     * systems. A draft longer than that would fill it and block the writer, while the reader on the other
     * end is a process we have not started waiting for yet: both sides would stand still until the
     * timeout. Closing the stream is what says "that is all" - without it the CLI waits for more.
     */
    private fun feed(handler: CapturingProcessHandler, input: String) {
        val stream = handler.processInput ?: return

        AppExecutorUtil.getAppExecutorService().submit {
            runCatching { stream.use { it.write(input.toByteArray(Charsets.UTF_8)) } }
                .onFailure { thisLogger().info("Could not hand the text over through stdin: ${it.message}") }
        }
    }
}

package io.github.crmapache.amazingclaudecode.claude

import com.intellij.execution.configurations.GeneralCommandLine
import com.intellij.execution.process.CapturingProcessHandler
import com.intellij.openapi.diagnostic.thisLogger
import com.intellij.util.concurrency.AppExecutorUtil
import java.nio.file.Path

/**
 * Разовый запуск `claude <args>` в фоне — общий рантайм для команд, у которых
 * есть собственная подкоманда CLI (mcp, plugin) и не нужен долгоживущий процесс
 * разговора. Каждый вызов независим: свой процесс, свой таймаут, свой результат.
 */
internal object ClaudeCli {

    private const val DEFAULT_TIMEOUT_MS = 30_000

    fun run(
        workingDirectory: String?,
        args: List<String>,
        timeoutMs: Int = DEFAULT_TIMEOUT_MS,
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

                CapturingProcessHandler(commandLine).runProcess(timeoutMs)
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
}

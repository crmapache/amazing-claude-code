package io.github.crmapache.amazingclaudecode.claude

import com.intellij.execution.configurations.GeneralCommandLine
import com.intellij.execution.process.CapturingProcessHandler
import com.intellij.openapi.diagnostic.thisLogger
import java.nio.file.Path

/**
 * Команда, набранная в поле ввода через «!» — тот же bash-режим, что в терминале
 * Claude Code и у соседних агентских оболочек.
 *
 * Выполняет её сама панель, а не агент: смысл этого режима ровно в том, чтобы
 * посмотреть что-нибудь своими глазами — ветку, статус, содержимое файла — не
 * тратя на это ход агента и не спрашивая разрешения на вызов инструмента.
 * Агент вывод всё равно увидит: он уезжает ему вместе со следующим сообщением
 * (см. ClaudePanel и shellLog на стороне панели).
 *
 * Через пользовательскую оболочку с профилем, а не напрямую: IDE, запущенная из
 * Dock, живёт с урезанным PATH (та же беда, что и у поиска самого CLI, см.
 * [ClaudeExecutable]), и «!npm test» в ней не нашёлся бы вовсе.
 */
internal object ShellCommand {

    data class Result(val exitCode: Int, val stdout: String, val stderr: String)

    /**
     * Сколько ждём команду, прежде чем убить. С запасом на сборку и тесты, но не
     * бесконечно: своего Stop у этой карточки нет, и зависший `!tail -f` иначе
     * держал бы процесс до закрытия IDE.
     */
    private const val TIMEOUT_MS = 120_000

    /**
     * Докуда обрезаем вывод. Панель показывает его целиком в карточке и потом
     * отправляет агенту — мегабайтная простыня из `!find /` не помещается ни
     * туда, ни в окно контекста.
     */
    private const val MAX_OUTPUT_CHARS = 40_000

    /**
     * Код возврата у того, что до самой команды так и не дошло: оболочку не
     * удалось запустить вовсе. Отрицательный намеренно — настоящая команда таким
     * не отвечает никогда, и спутать его с её собственным ответом нельзя.
     */
    private const val NOT_STARTED = -1

    /**
     * Убита по сроку. 124 — то же число, которым отвечает утилита `timeout`:
     * человек и агент читают его как «не уложилась», а не как ошибку самой
     * команды, и от «не запустилась» оно тоже отличается.
     */
    private const val TIMED_OUT = 124

    private val windows: Boolean get() = System.getProperty("os.name").startsWith("Windows", ignoreCase = true)

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
             * Ввода у команды нет и не будет: панель — не терминал, набрать в неё
             * ответ на «Are you sure? [y/N]» некуда. Закрываем поток сразу, чтобы
             * всё, что читает ввод (`git commit` без -m, `npm login`, обычный
             * `cat`), получило конец файла и завершилось само. Иначе такая
             * команда просто стояла бы все две минуты до срока, а карточка в
             * ленте всё это время обещала бы работу, которой нет.
             */
            runCatching { handler.processInput.close() }

            handler.runProcess(TIMEOUT_MS)
        }.getOrElse {
            thisLogger().info("Shell command failed: ${it.message}")
            return Result(NOT_STARTED, stdout = "", stderr = "Failed to run the command: ${it.message}")
        }

        if (output.isTimeout) {
            // То, что команда успела написать в stderr, сохраняем: у долгой
            // сборки там и лежит вся диагностика, ради которой её и запускали, —
            // а сообщение о сроке просто дописываем последней строкой.
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
     * Оболочка человека, а не своя: команду набирали так, как набрали бы в
     * терминале, и работать она должна с тем же PATH и теми же настройками
     * профиля. `-lc` — то же самое, чем эта же оболочка спрашивается о пути к
     * CLI (см. ClaudeExecutable.lookupCommand).
     */
    private fun shell(command: String): List<String> = if (windows) {
        listOf("cmd.exe", "/c", command)
    } else {
        listOf(System.getenv("SHELL")?.takeIf { it.isNotBlank() } ?: "/bin/sh", "-lc", command)
    }

    private fun truncate(text: String): String =
        if (text.length <= MAX_OUTPUT_CHARS) text else "${text.take(MAX_OUTPUT_CHARS)}\n… output truncated"
}

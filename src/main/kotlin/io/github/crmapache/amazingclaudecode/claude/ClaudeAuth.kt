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
 * Вошёл ли пользователь в Claude Code.
 *
 * Спрашиваем сам CLI, а не читаем его файлы: способов входа несколько — подписка,
 * ключ консоли, корпоративный SSO, — и каждый хранится по-своему. Без входа агент
 * отвечает на любой вопрос одной строкой про /login, поэтому знать это нужно до
 * того, как панель покажет поле ввода.
 */
internal object ClaudeAuth {

    data class Status(
        /** Ложь, если исполняемого файла нет вовсе: тогда логиниться некуда. */
        val installed: Boolean,
        val loggedIn: Boolean,
        val email: String = "",
        val plan: String = "",
    )

    /** Вызывать только из фонового потока: это запуск процесса. */
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
     * Разбираем оборонительно: при отказе во входе CLI волен добавить к JSON
     * человеческую строку или ответить ненулевым кодом. Единственное, что нам
     * действительно нужно, — поле loggedIn.
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

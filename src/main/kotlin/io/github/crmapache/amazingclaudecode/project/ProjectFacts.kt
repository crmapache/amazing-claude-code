package io.github.crmapache.amazingclaudecode.project

import com.intellij.execution.configurations.GeneralCommandLine
import com.intellij.execution.process.CapturingProcessHandler
import com.intellij.openapi.project.Project
import com.intellij.util.EnvironmentUtil
import java.io.File
import kotlinx.serialization.json.Json
import kotlinx.serialization.json.contentOrNull
import kotlinx.serialization.json.jsonObject
import kotlinx.serialization.json.jsonPrimitive

/**
 * Мелкие сведения о проекте для нижней строки панели.
 *
 * Текущую ветку читаем прямо из служебного файла репозитория, а не через плагин
 * системы контроля версий: одна строка вместо зависимости, которой у панели
 * больше нигде нет.
 */
internal object ProjectFacts {

    data class PullRequestInfo(val number: String, val url: String)

    /**
     * Pull request текущей ветки, если он есть. Спрашиваем `gh`, потому что
     * знание о том, что ветка уже уехала в PR, живёт на стороне GitHub, а не в
     * репозитории. Вызывать только из фонового потока: это запуск процесса.
     */
    fun pullRequest(project: Project): PullRequestInfo? {
        val base = project.basePath ?: return null
        val executable = ghExecutable() ?: return null

        val commandLine = GeneralCommandLine(executable)
            .withParameters("pr", "view", "--json", "number,url")
            .withWorkingDirectory(File(base).toPath())
            .withEnvironment(EnvironmentUtil.getEnvironmentMap())
            .withCharset(Charsets.UTF_8)

        val output = runCatching {
            CapturingProcessHandler(commandLine).runProcess(GH_TIMEOUT_MS)
        }.getOrNull() ?: return null

        // Ошибка здесь — обычное дело: нет удалённого репозитория, нет PR, gh не
        // залогинен. Молчим и показываем «no PR».
        if (output.exitCode != 0) return null

        val json = runCatching { Json.parseToJsonElement(output.stdout.trim()).jsonObject }.getOrNull() ?: return null
        val number = json["number"]?.jsonPrimitive?.contentOrNull ?: return null
        val url = json["url"]?.jsonPrimitive?.contentOrNull ?: return null
        return PullRequestInfo(number, url)
    }

    private fun ghExecutable(): String? {
        val fromPath = EnvironmentUtil.getValue("PATH")
            ?.split(File.pathSeparatorChar)
            ?.asSequence()
            ?.filter { it.isNotBlank() }
            ?.map { File(it, "gh") }
            ?.firstOrNull { it.isFile && it.canExecute() }

        return (fromPath ?: GH_FALLBACKS.map(::File).firstOrNull { it.isFile && it.canExecute() })
            ?.absolutePath
    }

    private val GH_FALLBACKS = listOf("/opt/homebrew/bin/gh", "/usr/local/bin/gh")
    private const val GH_TIMEOUT_MS = 5_000

    fun gitBranch(project: Project): String? {
        val base = project.basePath ?: return null
        val head = File(base, ".git/HEAD")

        if (!head.isFile) return null

        val content = runCatching { head.readText().trim() }.getOrNull() ?: return null

        return parseHeadBranch(content)
    }

    /**
     * Разбор содержимого `.git/HEAD`. Вынесено из [gitBranch] отдельной чистой
     * функцией, чтобы разбор формата тестировался без файлов и IntelliJ-проекта.
     */
    internal fun parseHeadBranch(content: String): String? = when {
        // substringAfterLast('/') резал бы префикс веток вида "feature/foo" до
        // одного "foo" — снимаем только служебный "refs/heads/", а не всё до
        // последнего слэша.
        content.startsWith("ref:") -> content.removePrefix("ref:").trim().removePrefix("refs/heads/")
        // Отсоединённая голова: показываем короткий хеш, как это делает IDE.
        content.length >= 7 -> content.take(7)
        else -> null
    }
}

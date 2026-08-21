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
 * Small facts about the project for the panel's bottom line.
 *
 * The current branch is read straight out of the repository's own file rather than through the version
 * control plugin: one line instead of a dependency the panel has nowhere else.
 */
internal object ProjectFacts {

    data class PullRequestInfo(val number: String, val url: String)

    /**
     * The current branch's pull request, if it has one. We ask `gh`, because the knowledge that a branch
     * has already gone into a PR lives on GitHub's side rather than in the repository. Call from a
     * background thread only: this starts a process.
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

        // An error here is an everyday thing: no remote repository, no PR, gh not signed in. We stay
        // silent and show "no PR".
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
     * Parsing the contents of `.git/HEAD`. Split out of [gitBranch] as a pure function so that the
     * format's parsing can be tested without files and without an IntelliJ project.
     */
    internal fun parseHeadBranch(content: String): String? = when {
        // substringAfterLast('/') would cut a branch prefixed like "feature/foo" down to a bare "foo" -
        // we strip only the internal "refs/heads/" rather than everything up to the last slash.
        content.startsWith("ref:") -> content.removePrefix("ref:").trim().removePrefix("refs/heads/")
        // A detached head: we show the short hash, as the IDE does.
        content.length >= 7 -> content.take(7)
        else -> null
    }
}

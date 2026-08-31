package io.github.crmapache.amazingclaudecode.claude

import java.io.File
import java.nio.file.Files
import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertNotNull
import kotlin.test.assertTrue

class ClaudeCommandHintsTest {

    private fun scanWith(name: String, frontmatter: String): CommandHint? {
        val base = Files.createTempDirectory("acc-hints").toFile()
        val file = File(base, ".claude/commands/$name.md")
        file.parentFile.mkdirs()
        file.writeText(frontmatter)

        return ClaudeCommandHints.scan(base.absolutePath, installed = emptyList())[name]
    }

    @Test
    fun `a one-line description is read as it is`() {
        val hint = scanWith(
            "one-line",
            """
            ---
            name: one-line
            description: Open a pull request
            argument-hint: "[number]"
            ---

            # body
            """.trimIndent(),
        )

        assertEquals("Open a pull request", hint?.description)
        assertEquals("[number]", hint?.argumentHint)
    }

    @Test
    fun `a folded block is joined into one line rather than turning into an arrow`() {
        // Exactly the case where the command hint ended up holding a single ">": everything after the
        // colon was taken, and there is nothing there but the block indicator.
        val hint = scanWith(
            "folded",
            """
            ---
            name: folded
            description: >
              Check the CI status for a pull request
              and explain the failures in plain words.
            argument-hint: "opt. [PR number]"
            ---

            # body
            """.trimIndent(),
        )

        assertEquals(
            "Check the CI status for a pull request and explain the failures in plain words.",
            hint?.description,
        )
        assertEquals("opt. [PR number]", hint?.argumentHint)
    }

    @Test
    fun `a literal block keeps its newlines`() {
        val hint = scanWith(
            "literal",
            """
            ---
            name: literal
            description: |
              first line
              second line
            ---

            # body
            """.trimIndent(),
        )

        assertEquals("first line\nsecond line", hint?.description)
    }

    @Test
    fun `a field after a block is read rather than swallowed by it`() {
        val hint = scanWith(
            "after-block",
            """
            ---
            description: >
              a long description
            argument-hint: "[target]"
            allowed-tools: Read, Bash(git:*)
            ---

            # body
            """.trimIndent(),
        )

        assertEquals("a long description", hint?.description)
        assertEquals("[target]", hint?.argumentHint)
    }

    /** A project with the given command files, each one written whole. */
    private fun projectWith(vararg files: Pair<String, String>): Map<String, CommandHint> {
        val base = Files.createTempDirectory("acc-hints").toFile()
        for ((path, text) in files) {
            val file = File(base, path)
            file.parentFile.mkdirs()
            file.writeText(text)
        }

        return ClaudeCommandHints.scan(base.absolutePath, installed = emptyList())
    }

    @Test
    fun `a command in a subdirectory is named through a colon`() {
        // The CLI's own naming, taken off a live agent's slash_commands rather than the docs:
        // .claude/commands/demo/deep/twice.md is /demo:deep:twice.
        val hints = projectWith(
            ".claude/commands/demo/nested.md" to "---\ndescription: nested one\n---\nbody\n",
            ".claude/commands/demo/deep/twice.md" to "---\ndescription: deep one\n---\nbody\n",
        )

        assertEquals("nested one", hints["demo:nested"]?.description)
        assertEquals("deep one", hints["demo:deep:twice"]?.description)
    }

    @Test
    fun `a command without frontmatter keeps its name`() {
        // Frontmatter is optional for the CLI, and such a command used to fall out of the scan whole -
        // name and all, which is the greater half of what the hint is for.
        val hints = projectWith(".claude/commands/plain.md" to "just say hi\n")

        val plain = hints["plain"]
        assertNotNull(plain)
        assertEquals("", plain.description)
        assertEquals("", plain.argumentHint)
    }

    @Test
    fun `a file that is not markdown is not a command`() {
        val hints = projectWith(".claude/commands/README.txt" to "not a command\n")

        assertTrue("README" !in hints)
    }

    @Test
    fun `the project's own command outranks a plugin's of the same name`() {
        val base = Files.createTempDirectory("acc-hints-project").toFile()
        File(base, ".claude/commands/deploy.md").apply {
            parentFile.mkdirs()
            writeText("---\ndescription: ours\n---\nbody\n")
        }

        val pluginHome = Files.createTempDirectory("acc-hints-plugin").toFile()
        File(pluginHome, "commands/deploy.md").apply {
            parentFile.mkdirs()
            writeText("---\ndescription: theirs\n---\nbody\n")
        }

        val hints = ClaudeCommandHints.scan(
            base.absolutePath,
            installed = listOf(
                InstalledPlugin(
                    id = "someone@market",
                    version = "1",
                    scope = "user",
                    enabled = true,
                    installPath = pluginHome.absolutePath,
                ),
            ),
        )

        assertEquals("ours", hints["deploy"]?.description)
        // The plugin's own copy is still there under its namespaced name.
        assertEquals("theirs", hints["someone:deploy"]?.description)
    }
}

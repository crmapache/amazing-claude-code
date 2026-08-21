package io.github.crmapache.amazingclaudecode.claude

import java.io.File
import java.nio.file.Files
import kotlin.test.Test
import kotlin.test.assertEquals

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
}

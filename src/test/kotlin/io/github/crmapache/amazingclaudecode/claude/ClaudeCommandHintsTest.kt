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
    fun `описание в одну строку читается как есть`() {
        val hint = scanWith(
            "one-line",
            """
            ---
            name: one-line
            description: Создать pull request
            argument-hint: "[номер]"
            ---

            # тело
            """.trimIndent(),
        )

        assertEquals("Создать pull request", hint?.description)
        assertEquals("[номер]", hint?.argumentHint)
    }

    @Test
    fun `свёрнутый блок склеивается в одну строку, а не превращается в стрелку`() {
        // Ровно тот случай, на котором в подсказке команд оказывался один символ ">":
        // бралось всё, что стоит после двоеточия, а там только указатель блока.
        val hint = scanWith(
            "folded",
            """
            ---
            name: folded
            description: >
              Проверить статус CI для pull request
              и объяснить падения по-человечески.
            argument-hint: "опц. [PR номер]"
            ---

            # тело
            """.trimIndent(),
        )

        assertEquals(
            "Проверить статус CI для pull request и объяснить падения по-человечески.",
            hint?.description,
        )
        assertEquals("опц. [PR номер]", hint?.argumentHint)
    }

    @Test
    fun `буквальный блок сохраняет переводы строк`() {
        val hint = scanWith(
            "literal",
            """
            ---
            name: literal
            description: |
              первая строка
              вторая строка
            ---

            # тело
            """.trimIndent(),
        )

        assertEquals("первая строка\nвторая строка", hint?.description)
    }

    @Test
    fun `поле после блока читается, а не съедается им`() {
        val hint = scanWith(
            "after-block",
            """
            ---
            description: >
              длинное описание
            argument-hint: "[цель]"
            allowed-tools: Read, Bash(git:*)
            ---

            # тело
            """.trimIndent(),
        )

        assertEquals("длинное описание", hint?.description)
        assertEquals("[цель]", hint?.argumentHint)
    }
}

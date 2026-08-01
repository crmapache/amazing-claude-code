package io.github.crmapache.amazingclaudecode.claude

import java.io.File

internal data class CommandHint(val description: String, val argumentHint: String)

/**
 * Описание и синтаксис аргумента слэш-команд — то же самое, что показывает
 * подсказка в терминале ("[low|medium|...] [--fix] [<target>]" сразу после
 * названия команды). Стрим-протокол `claude` отдаёт только голые имена команд
 * (проверено напрямую: `system:init`.`slash_commands` — плоский список строк,
 * без description/argument-hint), поэтому читаем те же файлы, что и сам CLI:
 * фронтматтер команд и скиллов проекта, личных и каждого установленного плагина.
 *
 * Для настоящих встроенных команд CLI (например, code-review — она зашита в
 * сам бинарник, а не файл) файла на диске нет и не будет: их синтаксис
 * захардкожен в catalog.ts (BUILTIN_COMMANDS), сверен напрямую по бинарнику.
 */
internal object ClaudeCommandHints {

    fun scan(workingDirectory: String?, installed: List<InstalledPlugin>): Map<String, CommandHint> {
        val hints = LinkedHashMap<String, CommandHint>()
        val home = System.getProperty("user.home")

        workingDirectory?.let { base ->
            scanCommandsDir(File(base, ".claude/commands"), prefix = "", into = hints)
            scanSkillsDir(File(base, ".claude/skills"), prefix = "", into = hints)
        }

        if (home != null) {
            scanCommandsDir(File(home, ".claude/commands"), prefix = "", into = hints)
            scanSkillsDir(File(home, ".claude/skills"), prefix = "", into = hints)
        }

        for (plugin in installed) {
            val installPath = plugin.installPath ?: continue
            // "context7@claude-plugins-official" → "context7": так же собраны
            // namespaced-имена в самом списке slash_commands ("vercel:deploy").
            val name = plugin.id.substringBefore('@')
            scanCommandsDir(File(installPath, "commands"), prefix = "$name:", into = hints)
            scanSkillsDir(File(installPath, "skills"), prefix = "$name:", into = hints)
        }

        return hints
    }

    private fun scanCommandsDir(dir: File, prefix: String, into: MutableMap<String, CommandHint>) {
        val files = runCatching { dir.listFiles { file -> file.isFile && file.extension == "md" } }.getOrNull()
        files?.forEach { file ->
            parseFrontmatter(file)?.let { into["$prefix${file.nameWithoutExtension}"] = it }
        }
    }

    private fun scanSkillsDir(dir: File, prefix: String, into: MutableMap<String, CommandHint>) {
        val dirs = runCatching { dir.listFiles { file -> file.isDirectory } }.getOrNull()
        dirs?.forEach { skillDir ->
            parseFrontmatter(File(skillDir, "SKILL.md"))?.let { into["$prefix${skillDir.name}"] = it }
        }
    }

    private val FRONTMATTER = Regex("""(?s)\A---\s*\n(.*?)\n---""")
    private val FIELD = Regex("""^([A-Za-z0-9_-]+):(.*)$""")

    /** Простое построчное чтение полей — без полноценного YAML, как и остальной парсинг в этом плагине. */
    private fun parseFrontmatter(file: File): CommandHint? {
        if (!file.isFile) return null
        val text = runCatching { file.readText() }.getOrNull() ?: return null
        val frontmatter = FRONTMATTER.find(text)?.groupValues?.get(1) ?: return null
        val fields = readFields(frontmatter)

        val description = fields["description"].orEmpty()
        val argumentHint = fields["argument-hint"].orEmpty()

        return if (description.isEmpty() && argumentHint.isEmpty()) null else CommandHint(description, argumentHint)
    }

    /**
     * Значения полей фронтматтера, включая многострочные.
     *
     * Длинные описания принято выносить блоком — `description: >` или `|`, а сам
     * текст с отступом на следующих строках. Раньше бралось всё, что стоит после
     * двоеточия, и в подсказке команд оказывался один символ `>` вместо описания.
     * Свёрнутый блок (`>`) склеиваем пробелами, буквальный (`|`) — переводами
     * строк, как и полагается YAML.
     */
    private fun readFields(frontmatter: String): Map<String, String> {
        val fields = mutableMapOf<String, String>()
        val lines = frontmatter.lines()
        var index = 0

        while (index < lines.size) {
            val match = FIELD.find(lines[index])
            index += 1
            if (match == null) continue

            val name = match.groupValues[1]
            val inline = match.groupValues[2].trim()
            if (inline.isNotEmpty() && !inline.startsWith(">") && !inline.startsWith("|")) {
                fields[name] = unquote(inline)
                continue
            }

            // Пустое значение тоже может быть началом блока — просто без указателя.
            val separator = if (inline.startsWith("|")) "\n" else " "
            val block = mutableListOf<String>()
            while (index < lines.size && (lines[index].isBlank() || lines[index].startsWith(" ") || lines[index].startsWith("\t"))) {
                block += lines[index].trim()
                index += 1
            }

            fields[name] = block.filter { it.isNotEmpty() }.joinToString(separator)
        }

        return fields
    }

    private fun unquote(value: String): String =
        value.trim().removeSurrounding("\"").removeSurrounding("'")
}

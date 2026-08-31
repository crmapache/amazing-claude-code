package io.github.crmapache.amazingclaudecode.claude

import java.io.File

internal data class CommandHint(val description: String, val argumentHint: String)

/**
 * The description and argument syntax of slash commands - the same thing the terminal's hint shows
 * ("[low|medium|...] [--fix] [<target>]" right after the command's name). The `claude` stream protocol
 * hands over bare command names only (verified directly: `system:init`.`slash_commands` is a flat list
 * of strings, without description or argument-hint), so we read the same files the CLI itself does: the
 * frontmatter of the project's, the user's and every installed plugin's commands and skills.
 *
 * For the CLI's genuinely built-in commands (code-review, for instance - it is baked into the binary
 * rather than a file) there is no file on disk and never will be: their syntax is hardcoded in
 * catalog.ts (BUILTIN_COMMANDS), checked against the binary directly.
 *
 * What is found here is not only the descriptions but the names themselves - until the first message of
 * a conversation has been sent the agent has named nothing, and this scan is the only thing the hint has
 * (see buildCommands in feed/slash.ts). That is why a file without a description is kept rather than
 * dropped: its name is the greater half of what the hint is for.
 */
internal object ClaudeCommandHints {

    fun scan(workingDirectory: String?, installed: List<InstalledPlugin>): Map<String, CommandHint> {
        val hints = LinkedHashMap<String, CommandHint>()

        workingDirectory?.let { base ->
            scanCommandsDir(File(base, ".claude/commands"), prefix = "", into = hints)
            scanSkillsDir(File(base, ".claude/skills"), prefix = "", into = hints)
        }

        // The user's own commands and skills - out of the same directory the CLI reads its personal
        // settings from, so that a moved config directory does not leave the hint half-empty.
        val personal = HostOs.configDirectory()
        scanCommandsDir(File(personal, "commands"), prefix = "", into = hints)
        scanSkillsDir(File(personal, "skills"), prefix = "", into = hints)

        for (plugin in installed) {
            val installPath = plugin.installPath ?: continue
            // "context7@claude-plugins-official" → "context7": the namespaced names in the
            // slash_commands list itself are put together the same way ("vercel:deploy").
            val name = plugin.id.substringBefore('@')
            scanCommandsDir(File(installPath, "commands"), prefix = "$name:", into = hints)
            scanSkillsDir(File(installPath, "skills"), prefix = "$name:", into = hints)
        }

        return hints
    }

    /**
     * How deep the walk into subdirectories goes. Nesting names a command rather than hides it
     * (see below), so three levels is already more than anybody writes; the limit is here so that a
     * symlinked loop under .claude/ cannot turn a hint refresh into an endless walk.
     */
    private const val MAX_DEPTH = 3

    /**
     * A subdirectory is part of the command's name rather than a place to hide it: the CLI calls
     * `.claude/commands/demo/deep/twice.md` `/demo:deep:twice` - one colon per level (checked against a
     * live agent's `slash_commands`, not guessed from the docs). Reading the top level only, the hint
     * knew nothing of a command sorted into a folder - the very way a project with more than a handful
     * of them is kept.
     */
    private fun scanCommandsDir(dir: File, prefix: String, into: MutableMap<String, CommandHint>, depth: Int = 0) {
        val entries = runCatching { dir.listFiles() }.getOrNull() ?: return

        for (entry in entries) {
            if (entry.isFile && entry.extension == "md") {
                remember(into, "$prefix${entry.nameWithoutExtension}", parseFrontmatter(entry))
                continue
            }

            if (entry.isDirectory && depth < MAX_DEPTH) {
                scanCommandsDir(entry, prefix = "$prefix${entry.name}:", into = into, depth = depth + 1)
            }
        }
    }

    private fun scanSkillsDir(dir: File, prefix: String, into: MutableMap<String, CommandHint>) {
        val dirs = runCatching { dir.listFiles { file -> file.isDirectory } }.getOrNull()
        dirs?.forEach { skillDir ->
            val skill = File(skillDir, "SKILL.md")
            if (skill.isFile) remember(into, "$prefix${skillDir.name}", parseFrontmatter(skill))
        }
    }

    /**
     * The first definition of a name wins, and the order of the scan above is the order of the CLI's own
     * precedence: the project's own command outranks a personal one of the same name, and both outrank a
     * plugin's.
     */
    private fun remember(into: MutableMap<String, CommandHint>, id: String, hint: CommandHint?) {
        if (into.containsKey(id)) return
        into[id] = hint ?: EMPTY
    }

    private val EMPTY = CommandHint(description = "", argumentHint = "")

    private val FRONTMATTER = Regex("""(?s)\A---\s*\n(.*?)\n---""")
    private val FIELD = Regex("""^([A-Za-z0-9_-]+):(.*)$""")

    /**
     * Plain line-by-line field reading - without full YAML, like the rest of the parsing in this plugin.
     *
     * Nothing found is not the same as nothing there: a command file needs no frontmatter at all (the CLI
     * runs it just the same, verified live), and such a file used to fall out of the scan entirely - name
     * and all. So the absence of a description is answered with an empty hint by the caller rather than
     * with a refusal here.
     */
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
     * The frontmatter's field values, multi-line ones included.
     *
     * Long descriptions are customarily put in a block - `description: >` or `|`, with the text itself
     * indented on the following lines. This used to take everything after the colon, and the command
     * hint ended up holding a single `>` instead of a description. A folded block (`>`) is joined with
     * spaces, a literal one (`|`) with newlines, as YAML has it.
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

            // An empty value can be the start of a block too - simply without an indicator.
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

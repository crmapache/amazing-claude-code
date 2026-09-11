package io.github.crmapache.amazingclaudecode.claude

import io.github.crmapache.amazingclaudecode.feedback.DiagnosticsLog
import java.io.File
import java.nio.file.Files
import java.nio.file.attribute.BasicFileAttributes
import java.util.concurrent.atomic.AtomicBoolean

internal data class CommandHint(
    val description: String,
    val argumentHint: String,
    /**
     * Whether the model may start this one itself, through the Skill tool - false when the frontmatter
     * says `disable-model-invocation: true`. The CLI is strict about it: asked for such a skill the model
     * is refused and told not to imitate the workflow either, so the only way in is a person typing the
     * slash command. A scenario card is "a person typing" exactly when its prompt begins with the command
     * (see ScenarioAuthor, which is what this is read for).
     */
    val modelInvocable: Boolean = true,
    /** Whether a person may type it as a slash command at all - false under `user-invocable: false`. */
    val userInvocable: Boolean = true,
    /** The file that defines it, for whoever wants more than the frontmatter. Empty when nothing is on disk. */
    val file: String = "",
)

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
 *
 * The walk is split in two on purpose - candidates first, their frontmatter only if asked. A skill
 * written while a conversation is running has to reach the hint in seconds rather than in a minute (the
 * CLI itself picks it up in 1.6-4.2 s, measured), and a round that often must cost a stat rather than a
 * read of every file: see [scanIfChanged] and ProjectCatalog's fast round.
 *
 * Where the CLI keeps its personal files is asked of the CALLER rather than resolved here. Two reasons,
 * and both bite: a home computed once and kept is a WSL project reading this machine's `.claude` for
 * ever (see ClaudeHome - off a pooled thread the platform answers with the local home), and a scan that
 * resolves it itself cannot be tested at all, because every test would mix in the real `~/.claude` of
 * whoever runs it.
 */
internal object ClaudeCommandHints {

    /** One command's name and the file that defines it - what a walk finds without reading anything. */
    private data class Candidate(val id: String, val file: File)

    /**
     * What one walk of the disk found.
     *
     * [whole] is false when a directory that IS a directory refused to list itself: no permission, a
     * share that hiccupped, a volume that went to sleep. `listFiles` answers null for that and for
     * "there is nothing here" alike, and the two must not be confused - a scan read as empty is a hint
     * that loses every command the project and the person have.
     */
    private data class Found(val candidates: List<Candidate>, val whole: Boolean)

    /**
     * A walk, its fingerprint and the hints read out of it.
     *
     * Deliberately not nullable on an incomplete walk: what to do about [whole] is a question for
     * whoever broadcasts (see ProjectCatalog), and the scenario writer wants whatever was found even
     * when one plugin's folder could not be listed - a catalogue silently emptied by that costs it the
     * one rule it exists for, which door each skill is called through.
     */
    internal data class Scan(val stamp: String, val hints: Map<String, CommandHint>, val whole: Boolean)

    /**
     * Everything on disk, read in full.
     *
     * [ceilingSaid] is the caller's own memory of whether the last walk was already over the ceiling -
     * see the note in [walk]. A caller that walks over and over hands its own, one per walk it repeats;
     * a one-shot caller may leave it, and then the note is written by that walk alone.
     */
    fun scan(
        home: ClaudeHome,
        workingDirectory: String?,
        installed: List<InstalledPlugin>,
        ceilingSaid: AtomicBoolean = AtomicBoolean(false),
    ): Scan {
        val found = walk(home, workingDirectory, installed, ceilingSaid)

        return Scan(stampOf(found.candidates), read(found.candidates), found.whole)
    }

    /**
     * One look at the disk: what it found, and what looking cost.
     *
     * [scan] is absent when the fingerprint says nothing has moved - the usual answer, since a disk is
     * quiet almost all of the time. [walkNanos] is there either way, and that is the whole point of the
     * pair: the two halves are wanted by two different callers. Whoever broadcasts wants the scan;
     * whoever paces the round wants the cost, and wants it precisely on the rounds that found nothing.
     * Folded into one nullable, the cost arrived only when something had changed, so on a quiet disk
     * the brake was never fed at all and a slow share was walked every two seconds for ever.
     *
     * [walkNanos] times the light pass alone - the walk and its fingerprint, what every single tick
     * pays. The frontmatter read that follows a change is deliberately outside it: charging the round
     * for the rare heavy case is timing one piece of work to throttle another.
     */
    internal data class Look(val scan: Scan?, val walkNanos: Long)

    /**
     * The same as [scan], but a walk whose fingerprint matches [since] is not read at all.
     *
     * The fingerprint is a throttle rather than the truth, exactly as in AccountsState.reload: a file
     * system whose timestamps are whole seconds (exFAT, an SMB share, the 9P share a WSL project is
     * read through) does not move it when a word inside a description is replaced by one of the same
     * length. That is what the unconditional round is for - see ProjectCatalog.
     */
    fun scanIfChanged(
        home: ClaudeHome,
        workingDirectory: String?,
        installed: List<InstalledPlugin>,
        since: String?,
        ceilingSaid: AtomicBoolean = AtomicBoolean(false),
    ): Look {
        val started = System.nanoTime()
        val found = walk(home, workingDirectory, installed, ceilingSaid)
        val stamp = stampOf(found.candidates)
        val walkNanos = System.nanoTime() - started
        if (stamp == since) return Look(null, walkNanos)

        return Look(Scan(stamp, read(found.candidates), found.whole), walkNanos)
    }

    /**
     * How deep the walk into subdirectories goes. Nesting names a command rather than hides it
     * (see below), so three levels is already more than anybody writes; the limit is here so that a
     * symlinked loop under .claude/ cannot turn a hint refresh into an endless walk.
     */
    private const val MAX_DEPTH = 3

    /**
     * How many commands one walk may find. A symlink into a tree full of `.md` is enough to make the
     * map megabytes, and the map is held in memory, serialised into a message and compared against the
     * last one on every round. The same order of magnitude as the file list for the "@" hint.
     */
    private const val MAX_CANDIDATES = 4000

    private fun walk(
        home: ClaudeHome,
        workingDirectory: String?,
        installed: List<InstalledPlugin>,
        ceilingSaid: AtomicBoolean,
    ): Found {
        val candidates = LinkedHashMap<String, Candidate>()
        var whole = true

        // The order below is the order of the CLI's own precedence: the project's own command outranks a
        // personal one of the same name, and both outrank a plugin's. The first name found wins, so the
        // walk order IS the rule - nothing here may be sorted (the fingerprint sorts a copy).
        workingDirectory?.let { base ->
            val anchor = File(base)
            whole = commandsIn(File(base, ".claude/commands"), "", candidates, anchor) && whole
            whole = skillsIn(File(base, ".claude/skills"), "", candidates, anchor) && whole
        }

        // The user's own commands and skills - out of the same directory the CLI reads its personal
        // settings from, so that a moved config directory does not leave the hint half-empty. The CLI's
        // directory for THIS project rather than this machine's: a project opened out of WSL has its CLI,
        // and its personal commands, inside the distribution (see ClaudeHome).
        val personal = home.configDirectory
        val personalAnchor = personal.parentFile ?: personal
        whole = commandsIn(File(personal, "commands"), "", candidates, personalAnchor) && whole
        whole = skillsIn(File(personal, "skills"), "", candidates, personalAnchor) && whole

        for (plugin in installed) {
            // Printed by the CLI in its own terms - inside WSL that is a Linux path, and it is turned into
            // one this JVM can open the same way as everything else of the CLI's.
            val installPath = plugin.installPath?.let(home::hostPath) ?: continue
            // "context7@claude-plugins-official" → "context7": the namespaced names in the
            // slash_commands list itself are put together the same way ("vercel:deploy").
            val name = plugin.id.substringBefore('@')
            val anchor = installPath
            whole = commandsIn(File(installPath, "commands"), "$name:", candidates, anchor) && whole
            whole = skillsIn(File(installPath, "skills"), "$name:", candidates, anchor) && whole
        }

        val trimmed = candidates.size >= MAX_CANDIDATES
        // Said on the way in and on the way out, not on every round. The note used to be written by
        // every walk, the thirty a minute that found nothing included, and the buffer holds three
        // hundred lines: after ten minutes the report a person sends to the author was this one line
        // and nothing else. No path and no name either way - the buffer leaves this machine with that
        // report.
        //
        // Whose memory this is matters as much as the rule: a walk belongs to a project, and two open
        // projects walk their own disks. Kept as one flag for the whole IDE, one project over the
        // ceiling and one under it flipped it back and forth between them, every round became an edge
        // again, and the buffer filled with this line twice a second - the very defect, by another
        // road. So it is the caller's, alongside the fingerprint it already keeps.
        if (trimmed != ceilingSaid.getAndSet(trimmed)) {
            val what = if (trimmed) "hit" else "is back under"
            DiagnosticsLog.note(DiagnosticsLog.AGENT, "command hints: the walk $what its ceiling of $MAX_CANDIDATES")
        }

        // A walk cut off by the ceiling is not a whole walk. The shelves are walked in the CLI's order
        // of precedence - the project's first, the person's and the plugins' last - so a walk that
        // stopped early did not fail to read them, it never reached them, and calling that complete is
        // how a map missing every personal and plugin command gets broadcast as the truth.
        return Found(candidates.values.toList(), whole && !trimmed)
    }

    /**
     * A subdirectory is part of the command's name rather than a place to hide it: the CLI calls
     * `.claude/commands/demo/deep/twice.md` `/demo:deep:twice` - one colon per level (checked against a
     * live agent's `slash_commands`, not guessed from the docs). Reading the top level only, the hint
     * knew nothing of a command sorted into a folder - the very way a project with more than a handful
     * of them is kept.
     *
     * Answers whether it managed to read what was there - see [Found.whole].
     */
    private fun commandsIn(
        dir: File,
        prefix: String,
        into: MutableMap<String, Candidate>,
        anchor: File,
        depth: Int = 0,
    ): Boolean {
        val entries = runCatching { dir.listFiles() }.getOrNull() ?: return gone(dir, anchor)
        var whole = true

        for (entry in entries) {
            if (into.size >= MAX_CANDIDATES) return whole

            if (entry.isFile && entry.extension == "md") {
                remember(into, "$prefix${entry.nameWithoutExtension}", entry)
                continue
            }

            if (entry.isDirectory && depth < MAX_DEPTH) {
                // The shelf listed itself, so it is the anchor for everything under it: a subdirectory
                // that fails while its own shelf answers is that subdirectory's problem, not the disk's.
                whole = commandsIn(entry, "$prefix${entry.name}:", into, dir, depth + 1) && whole
            }
        }

        return whole
    }

    private fun skillsIn(dir: File, prefix: String, into: MutableMap<String, Candidate>, anchor: File): Boolean {
        val dirs = runCatching { dir.listFiles { file -> file.isDirectory } }.getOrNull() ?: return gone(dir, anchor)

        for (skillDir in dirs) {
            if (into.size >= MAX_CANDIDATES) break

            val skill = File(skillDir, "SKILL.md")
            if (skill.isFile) remember(into, "$prefix${skillDir.name}", skill)
        }

        return true
    }

    /**
     * Whether a shelf that gave no listing is genuinely absent - the difference between "nothing to
     * read" and "could not read", and the whole of what [Found.whole] means.
     *
     * The shelf itself is asked with `isDirectory` rather than `exists`: a file sitting where a
     * directory is expected gives no listing either, and it is not a failure - the hint has nothing to
     * lose there.
     *
     * But that question alone cannot tell an absent shelf from a dead disk. A WSL distribution that
     * went to sleep, an SMB share that dropped, an unmounted volume - `isDirectory` answers false for
     * all of them exactly as it does for a project that simply has no `.claude/commands`, and read as
     * absence that is an empty map broadcast as the truth. It used to be able to happen once a minute;
     * on the fast round it would happen every two seconds, so half a minute of a share hiccupping was
     * enough to wipe the hint.
     *
     * So the [anchor] is asked too - the thing the shelf hangs off, which is still there when the shelf
     * is not: the project root, the home directory above `.claude`, the plugin's own install folder. If
     * the anchor answers, the shelf really is absent and the walk is whole. If the anchor does not
     * answer either, it is not the shelf that is silent, it is the disk, and the walk is incomplete -
     * which is what hands the decision to the guard one level up in ProjectCatalog.
     *
     * A deleted shelf still passes: after a skill directory is removed its anchor goes on answering, so
     * the walk stays whole and the removed name leaves the hint at once, as the criterion requires.
     */
    private fun gone(dir: File, anchor: File): Boolean =
        !isThere(dir) && isThere(anchor)

    private fun isThere(dir: File): Boolean = runCatching { dir.isDirectory }.getOrDefault(false)

    /**
     * The first definition of a name wins, and the order of the walk above is the order of the CLI's own
     * precedence: the project's own command outranks a personal one of the same name, and both outrank a
     * plugin's.
     */
    private fun remember(into: MutableMap<String, Candidate>, id: String, file: File) {
        if (into.containsKey(id)) return
        into[id] = Candidate(id, file)
    }

    /**
     * What the disk looked like, in one string - names, places, sizes and timestamps, and not a byte of
     * content.
     *
     * Sorted by name first: `listFiles` promises no order, and without this the fingerprint would move
     * on its own and the fast round would read every file on every tick. A COPY is sorted - the walk's
     * own order is the precedence rule and the order the map keeps.
     *
     * The metadata of one file is asked for once rather than twice (`lastModified()` plus `length()` is
     * two trips to the disk, and there are a hundred candidates on this machine), and a file that
     * refuses to answer contributes a sentinel instead of ending the walk: between the walk and this
     * fold a file legitimately disappears (a `git checkout`, a skill folder renamed, the agent writing)
     * and on Windows a name that is legal in Linux - anything with a colon, the CLI's own namespace
     * separator - makes `toPath` throw an unchecked exception, which would freeze this project's hint
     * for good.
     */
    private fun stampOf(candidates: List<Candidate>): String =
        candidates.sortedBy { it.id }.joinToString("\n") { candidate ->
            val attributes = runCatching {
                Files.readAttributes(candidate.file.toPath(), BasicFileAttributes::class.java)
            }.getOrNull()

            val stamp = attributes?.let { "${it.lastModifiedTime().toMillis()}:${it.size()}" } ?: "gone"
            "${candidate.id}\t${candidate.file.absolutePath}\t$stamp"
        }

    private fun read(candidates: List<Candidate>): Map<String, CommandHint> {
        val hints = LinkedHashMap<String, CommandHint>(candidates.size)
        for (candidate in candidates) hints[candidate.id] = hintOf(candidate.file)

        return hints
    }

    private val FRONTMATTER = Regex("""(?s)\A---\s*\n(.*?)\n---""")
    private val FIELD = Regex("""^([A-Za-z0-9_-]+):(.*)$""")

    /**
     * Plain line-by-line field reading - without full YAML, like the rest of the parsing in this plugin.
     *
     * Nothing found is not the same as nothing there: a command file needs no frontmatter at all (the CLI
     * runs it just the same, verified live), and such a file used to fall out of the scan entirely - name
     * and all. So a file without one is a hint with the name and the file and nothing else, and the two
     * flags fall to the CLI's own defaults: callable by the model, typeable by a person.
     */
    private fun hintOf(file: File): CommandHint {
        val bare = CommandHint(description = "", argumentHint = "", file = file.absolutePath)
        val text = runCatching { file.readText() }.getOrNull() ?: return bare
        val frontmatter = FRONTMATTER.find(text)?.groupValues?.get(1) ?: return bare
        val fields = readFields(frontmatter)

        return CommandHint(
            description = fields["description"].orEmpty(),
            argumentHint = fields["argument-hint"].orEmpty(),
            modelInvocable = !isTrue(fields["disable-model-invocation"]),
            userInvocable = !isFalse(fields["user-invocable"]),
            file = file.absolutePath,
        )
    }

    /** The two spellings of yes a hand-written frontmatter uses. Anything else is the default. */
    private fun isTrue(value: String?): Boolean = value?.trim()?.lowercase() in setOf("true", "yes")

    private fun isFalse(value: String?): Boolean = value?.trim()?.lowercase() in setOf("false", "no")

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

package io.github.crmapache.amazingclaudecode.claude

/**
 * The commands a conversation's CLI came to know after it had reported its catalogue - a mod's, in practice.
 *
 * The slash hint is built from the catalogue a process reports in `system:init` and from the files on disk
 * (see ClaudeCommandHints). A mod registers its commands while it loads, which is after that report: the
 * first catalogue never has them, they are on no disk, and they appeared in the hint only with the next
 * turn's catalogue - after the person had sent a message without knowing the command existed.
 *
 * So the later catalogue (`system:commands_changed`, see ClaudeCommandNames.changed) is read for a mod's
 * commands the first one did not have - and for nothing else. A command the first catalogue named stays
 * exactly as the hint drew it before (a name, a description off the disk or none). The CLI's own commands are
 * never taken from here - the panel leaves some of those out on purpose (see UNAVAILABLE_IN_STREAM_MODE) -
 * and neither are the skills that arrive late on their own, the ones synced from claude.ai: they are not a
 * mod's, and the hint of a panel without mods must not change by a single row (checked live: a sandbox
 * without mods got eleven of them here before this was narrowed). For a conversation without mods this adds
 * nothing at all.
 *
 * Per conversation, because each process reports its own; one map for the project, because the hint is one.
 */
internal class AddedCommands {

    private val firstCatalogue = HashMap<String, Set<String>>()
    private val added = HashMap<String, Map<String, CommandHint>>()

    /** The first catalogue a process reports - kept until the process is replaced (see [processStarted]). */
    @Synchronized
    fun noteCatalogue(sessionId: String, names: List<String>) {
        firstCatalogue.putIfAbsent(sessionId, names.toSet())
    }

    /**
     * A later catalogue. Answers true when what the project's hint should add has changed.
     *
     * Nothing is taken before the first catalogue is known: without it there is no telling a command the
     * process always had from one that came later.
     */
    @Synchronized
    fun noteChanged(sessionId: String, commands: List<ClaudeCommandNames.Described>): Boolean {
        val first = firstCatalogue[sessionId] ?: return false
        val now = commands
            .filter { it.fromMod && it.name !in first }
            .associate { it.name to CommandHint(it.description, it.argumentHint) }

        val before = all()
        if (now.isEmpty()) added.remove(sessionId) else added[sessionId] = now
        return all() != before
    }

    /** A new process: what the old one reported is not what this one will, and its mods load anew. */
    @Synchronized
    fun processStarted(sessionId: String): Boolean = forget(sessionId)

    /** The conversation is gone. Answers true when the project's map lost something with it. */
    @Synchronized
    fun forget(sessionId: String): Boolean {
        firstCatalogue.remove(sessionId)
        return added.remove(sessionId) != null
    }

    /** What the hint adds, over every conversation of the project; the first conversation to name one wins. */
    @Synchronized
    fun all(): Map<String, CommandHint> {
        val merged = LinkedHashMap<String, CommandHint>()
        added.values.forEach { commands -> commands.forEach { (name, hint) -> merged.putIfAbsent(name, hint) } }
        return merged
    }
}

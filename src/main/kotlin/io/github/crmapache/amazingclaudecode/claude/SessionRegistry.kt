package io.github.crmapache.amazingclaudecode.claude

/**
 * Which tabs a project has, in what order, and which of them came out of which.
 *
 * Until now this list lived only in the browser (see App.tsx): the interface made the identifiers up,
 * kept the order and worked out the grouping, while this side merely received a session id inside every
 * message and never asked where it came from. That works exactly as long as there is one client. A
 * second one - a phone - has no such list and no way to build one: it did not open these tabs and did
 * not see them being opened.
 *
 * So the list moves here, and the identifiers stay with whoever presses the button. That is deliberate:
 * "+" has to answer instantly, and a round trip to this side before a tab appears would be felt. A
 * taken identifier is refused (see [open]) and the client is told the real list - which is cheaper than
 * making everyone wait for the rare case of two clients pressing "+" in the same millisecond.
 */
internal class SessionRegistry {

    /**
     * A tab as everyone outside sees it. Deliberately the same shape the interface already keeps (see
     * Session in components/Header.tsx): the two have to agree, and the cheapest way to make them agree
     * is to describe the same thing.
     */
    data class Tab(
        val id: String,
        /** The root conversation of the chain: forks and forks of forks carry one and the same one. */
        val groupId: String,
        /** The branching depth: 0 is a root, 1 a fork, 2 a fork of a fork. */
        val depth: Int,
        val title: String,
        val titleSource: String,
        val parentId: String?,
        val createdAt: Long,
    )

    private val tabs = ArrayList<Tab>()

    init {
        // The tab the panel opens with exists before anyone asks for it: a message that names no
        // conversation belongs to it (see ClaudeSessions.MAIN_SESSION), and the interface starts with it
        // already drawn.
        tabs.add(
            Tab(
                id = ClaudeSessions.MAIN_SESSION,
                groupId = ClaudeSessions.MAIN_SESSION,
                depth = 0,
                title = MAIN_TITLE,
                titleSource = SessionSnapshot.TITLE_DEFAULT,
                parentId = null,
                createdAt = 0,
            ),
        )
    }

    /**
     * Open a tab. [parentId] set means a fork: it inherits its parent's group and stands right after
     * that group's last tab rather than at the end of the list - one subject's tabs hold together.
     *
     * False means the identifier is taken. The caller does not retry: it re-sends the list instead, and
     * whoever guessed the same identifier sees the truth.
     */
    @Synchronized
    fun open(
        id: String,
        parentId: String? = null,
        title: String = "",
        titleSource: String = SessionSnapshot.TITLE_DEFAULT,
        at: Long = System.currentTimeMillis(),
    ): Boolean {
        if (id.isEmpty() || tabs.any { it.id == id }) return false

        val parent = parentId?.let { parentTab -> tabs.firstOrNull { it.id == parentTab } }
        val tab = Tab(
            id = id,
            // A fork with a parent nobody knows is not a fork: it becomes an ordinary tab rather than
            // being refused. The conversation behind it exists either way, and refusing would leave a
            // live process nothing in the list points at.
            groupId = parent?.groupId ?: id,
            depth = parent?.let { it.depth + 1 } ?: 0,
            title = title.ifBlank { if (parent == null) NEW_TITLE else FORK_TITLE },
            titleSource = if (title.isBlank()) SessionSnapshot.TITLE_DEFAULT else titleSource,
            parentId = parent?.id,
            createdAt = at,
        )

        if (parent == null) {
            tabs.add(tab)
        } else {
            val lastOfGroup = tabs.indexOfLast { it.groupId == tab.groupId }
            tabs.add(lastOfGroup + 1, tab)
        }

        return true
    }

    /** Close a tab. False means there was nothing to close. */
    @Synchronized
    fun close(id: String): Boolean = tabs.removeIf { it.id == id }

    /**
     * Rename a tab - unless what it already carries is worth more.
     *
     * The order of the two names is not the order they arrive in: the interface guesses a name from the
     * first message immediately, while the CLI's own model answers a second or two later. But a stale
     * heuristic guess must not overwrite a name the model has already picked, or a tab renamed once
     * would flicker back on the next message.
     */
    @Synchronized
    fun rename(id: String, title: String, source: String): Boolean {
        if (title.isBlank()) return false

        val index = tabs.indexOfFirst { it.id == id }
        if (index < 0) return false

        val current = tabs[index]
        if (current.titleSource == SessionSnapshot.TITLE_LLM && source != SessionSnapshot.TITLE_LLM) return false

        tabs[index] = current.copy(title = title, titleSource = source)
        return true
    }

    /**
     * Back to the stand-in name: the conversation behind the tab is gone (/clear, or a past conversation
     * opened in its place), and the old name describes something that no longer exists.
     */
    @Synchronized
    fun resetTitle(id: String): Boolean {
        val index = tabs.indexOfFirst { it.id == id }
        if (index < 0) return false

        val current = tabs[index]
        val stand = if (current.id == ClaudeSessions.MAIN_SESSION) MAIN_TITLE else NEW_TITLE
        tabs[index] = current.copy(title = stand, titleSource = SessionSnapshot.TITLE_DEFAULT)
        return true
    }

    /**
     * The tabs' new order after a drag. The unit is a group - a conversation together with its forks:
     * they cannot be pulled apart, and someone else's tab cannot be dropped inside (see moveTab in
     * tabs.ts, which this mirrors - minus the statistics tab, which the panel drags on its own and never
     * reports here).
     */
    @Synchronized
    fun moveGroup(groupId: String, beforeGroupId: String?): Boolean {
        if (groupId == beforeGroupId) return false

        val moving = tabs.filter { it.groupId == groupId }
        if (moving.isEmpty()) return false

        val rest = tabs.filter { it.groupId != groupId }
        val at = beforeGroupId?.let { before -> rest.indexOfFirst { it.groupId == before } } ?: -1
        val index = if (at < 0) rest.size else at

        tabs.clear()
        tabs.addAll(rest.subList(0, index))
        tabs.addAll(moving)
        tabs.addAll(rest.subList(index, rest.size))
        return true
    }

    @Synchronized
    fun contains(id: String): Boolean = tabs.any { it.id == id }

    /**
     * Where a tab's name came from, or null when there is no such tab. Asked before a conversation
     * spends a model call on a name of its own (see ClaudeSession.requestTitle): a tab that already
     * carries one has nothing to ask about.
     */
    @Synchronized
    fun titleSource(id: String): String? = tabs.firstOrNull { it.id == id }?.titleSource

    @Synchronized
    fun tabs(): List<Tab> = tabs.toList()

    private companion object {
        /** The same stand-ins the interface uses, so a tab does not get renamed just by being listed. */
        const val MAIN_TITLE = "main session"
        const val NEW_TITLE = "new session"
        const val FORK_TITLE = "fork"
    }
}

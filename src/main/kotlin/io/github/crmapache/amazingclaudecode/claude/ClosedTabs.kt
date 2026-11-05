package io.github.crmapache.amazingclaudecode.claude

import kotlinx.serialization.json.JsonObject

/**
 * The tabs a person closed, the latest first, so that a tab closed by mistake comes back with one key (see
 * ClaudeSessionHub.reopenTab) - the browser's Cmd+Shift+T, asked for in a report from a person who kept closing
 * a session they meant to keep.
 *
 * Both kinds of tab are here in one list, because "the tab closed last" means nothing otherwise: a
 * conversation, whose record is everything needed to put it back where it stood (the same snapshot the strip
 * is remembered by across a restart, see TabMemory), and one of the panel's own tabs - the statistics, the
 * scenarios, a run being watched - which the page alone knows how to open and where it stood, and which is
 * kept here only so that it takes its turn with the rest.
 *
 * One entry per thing: a conversation closed twice, or the statistics closed twice, stands here once, at the
 * place of its latest close. A list holding the same tab several times would spend presses of the key on
 * tabs already brought back.
 */
internal class ClosedTabs(private val limit: Int = LIMIT) {

    sealed interface Entry {
        /** What makes two closes the same thing - see the class doc. */
        val key: String
        val title: String
        val closedAt: Long
    }

    /** A conversation's tab - see TabMemory.Closed for what is kept and why. */
    data class Chat(
        val kept: TabMemory.Closed,
        /**
         * What the tab was waiting to say when it was closed. Kept in memory and never on disk, like the queue
         * of an open tab: a queued photo is hundreds of kilobytes, and the file is rewritten on every change.
         */
        val queue: List<SessionQueue.Entry> = emptyList(),
        /** The day the statistics counted this tab's conversation on, if they had (see StatsCollector.countedOn). */
        val countedOn: String? = null,
    ) : Entry {
        override val key: String get() = keyOf(kept.tab)
        override val title: String get() = kept.tab.title
        override val closedAt: Long get() = kept.closedAt
    }

    /**
     * One of the panel's own tabs. [place] is the page's own description of where it stood (see TabPlace in
     * tabs.ts), carried back to it untouched: the strip it describes is the page's, not this side's.
     */
    data class Panel(
        val id: String,
        override val title: String,
        val place: JsonObject?,
        override val closedAt: Long,
    ) : Entry {
        override val key: String get() = PANEL + id
    }

    private val entries = ArrayList<Entry>()

    /** A tab just closed - on top, in place of an earlier close of the same thing, and the oldest let go past [limit]. */
    @Synchronized
    fun push(entry: Entry) {
        entries.removeAll { it.key == entry.key }
        entries.add(0, entry)
        while (entries.size > limit) entries.removeAt(entries.size - 1)
    }

    /**
     * The tab to bring back, taken off the list: the one named by [key], or with none named the latest one.
     *
     * [open] says which of them are on the strip again - opened from the history, the statistics opened from
     * the menu. Such a one is not brought back a second time and not offered again either: it goes, and the
     * key moves on to the next. A named one that is open gives nothing - the row it was asked from was drawn
     * before the tab came back some other way.
     */
    @Synchronized
    fun take(key: String?, open: (Entry) -> Boolean): Entry? {
        if (key != null) {
            val entry = entries.firstOrNull { it.key == key } ?: return null
            entries.remove(entry)
            return entry.takeUnless(open)
        }

        while (entries.isNotEmpty()) {
            val entry = entries.removeAt(0)
            if (!open(entry)) return entry
        }
        return null
    }

    /** A conversation deleted from the history: its closed tabs go too. Whether any stood here. */
    @Synchronized
    fun forget(conversation: String): Boolean = entries.removeAll { it is Chat && it.kept.tab.conversationId == conversation }

    @Synchronized
    fun list(): List<Entry> = entries.toList()

    /** The conversations alone - what is put on disk with the strip (see TabMemory.State.closed). */
    @Synchronized
    fun chats(): List<TabMemory.Closed> = entries.filterIsInstance<Chat>().map { it.kept }

    /** The list as the disk had it - after a restart, before anything has been closed in this one. */
    @Synchronized
    fun load(closed: List<TabMemory.Closed>) {
        entries.removeAll { it is Chat }
        entries.addAll(closed.map(::Chat))
        entries.sortByDescending { it.closedAt }
        while (entries.size > limit) entries.removeAt(entries.size - 1)
    }

    companion object {
        /** How far back the key reaches. */
        const val LIMIT = 20

        private const val PANEL = "panel:"

        /**
         * A conversation is the same thing by its conversation, wherever it was opened; a tab with none yet - a
         * draft and nothing else, a fork nobody has written into - by the tab itself.
         */
        fun keyOf(tab: TabMemory.Tab): String = "chat:" + (tab.conversationId ?: tab.id)
    }
}

package io.github.crmapache.amazingclaudecode.remote

/**
 * Which of a project's messages a phone is sent, decided by reading them.
 *
 * Textual rather than parsed, exactly as the journal's own stamping is (see SessionMessages): these
 * are messages this IDE has just built itself, they pass through here by the thousand, and parsing
 * every one of them to answer "is this the tab that phone is watching" would be work for nothing.
 *
 * Apart from RelayClient because the rules are three string comparisons that decide whether a screen
 * on the other side of the city shows anything at all - and because a running IDE, a relay and a phone
 * in hand is a poor way to find out that one of them was wrong by a quotation mark.
 */
internal object RemoteFeed {

    /**
     * Whether this message is about the conversation a device asked for.
     *
     * By an exact identifier, quotes included: every project's first tab is called "main" by the IDE
     * itself, and a "starts with" match would hand one project's feed to a device watching another's.
     */
    fun wantedBy(message: String, sessionId: String): Boolean =
        message.contains("\"sessionId\":\"$sessionId\"")

    /**
     * A line of a past conversation being replayed into a tab.
     *
     * They are the one thing not forwarded as it happens: opening a past conversation puts its whole
     * transcript through the feed line by line, and a phone wants the conversation rather than the
     * reading of it - it is handed the end of the result instead, once the replay is over.
     */
    fun isReplayLine(message: String): Boolean = message.contains(REPLAY_LINE)

    /** The conversations whose replay has just ended - the moment there is a result to hand over. */
    fun replayed(messages: List<String>, sessions: Collection<String>): List<String> {
        val finished = messages.filter { it.contains(REPLAY_FINISHED) }
        if (finished.isEmpty()) return emptyList()

        return sessions.distinct().filter { sessionId -> finished.any { wantedBy(it, sessionId) } }
    }

    private const val REPLAY_LINE = "\"replay\":true,\"event\":"

    private const val REPLAY_FINISHED = "\"type\":\"replayFinished\""
}

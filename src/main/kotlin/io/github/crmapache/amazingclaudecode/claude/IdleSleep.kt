package io.github.crmapache.amazingclaudecode.claude

/**
 * When a conversation that nobody is using gives its process back.
 *
 * A conversation is not one process. It is the agent plus a copy of every MCP server configured on the
 * machine, and the servers are the larger half - measured in the sandbox on a tab nobody had written a
 * word into: 8 processes and 554 MB, and for two such tabs 16 and 1.58 GB. On a working machine with
 * five conversations open it came to 54 processes and 2.7 GB. Nothing leaks there and nothing is
 * orphaned - closing a tab takes its whole tree down, and so does closing the IDE - but a panel is a
 * place where tabs are opened freely and left, and ten of them are gigabytes held for conversations
 * last touched hours ago.
 *
 * So a conversation left alone long enough is put to sleep: its process goes, its transcript stays, and
 * the next message brings it back through `--resume` with everything it knew (see ClaudeSession.start,
 * which passes the conversation's identifier as a launch flag). What the tab shows does not change - the
 * feed is the panel's, not the process's.
 *
 * **The tokens this costs are none.** The temptation is to think a live process keeps the prompt cache
 * warm and that waking one re-pays for it. It does not: the cache lives on the server, keyed by content
 * and expiring on its own clock, and a process holds nothing of it. A woken conversation sends the same
 * history the live one would have sent and gets the same cache hit - or the same miss, at the same
 * moment, had it never slept. What sleeping actually costs is the second or two of raising the process
 * again, and that is why the wait below is long rather than clever.
 */
internal object IdleSleep {

    /**
     * How long a conversation has to be left alone before its process is given back.
     *
     * Half an hour is chosen to be plainly past "stepped away from the desk". The saving is the same at
     * five minutes and the risk is not: a person who comes back to a thought mid-way should find the
     * conversation as they left it, not waiting on a process coming up. Nothing here is a resource
     * anybody is short of by the minute - the memory is wanted back by the end of a day of open tabs,
     * not by lunchtime.
     */
    const val AFTER_MS = 30 * 60 * 1000L

    /** How often the conversations are looked over. Cheap: it reads memory and asks no process anything. */
    const val EVERY_MS = 60 * 1000L

    /**
     * Whether this conversation may be put to sleep right now.
     *
     * Every clause is a way of saying the same thing - that the process is holding something only it
     * holds - and each of them was a real way to lose work:
     *
     * - a running turn is the obvious one, and the only one anybody thinks of;
     * - a card waiting for a person holds the turn open, and the CLI keeps the question inside the
     *   process: killing it answers nothing and the answer typed afterwards goes nowhere (see
     *   ClaudeSession.processTerminated, which clears the questions and says why);
     * - a background subagent reports back into the process that started it, and a turn that raised one
     *   has already ended (see SessionSnapshot.pendingAgents). This is the clause that is invisible: the
     *   tab looks idle, the status says idle, and forty agents of a review are working behind it;
     * - a background command is the same invisibility and a worse loss: a dev server or a long test run
     *   the agent started is a child of this process, so taking the process away kills it - silently,
     *   because nothing here is announced, and with its card in the feed still turning against something
     *   that is gone. A person finds out when they come for the result. Counted apart from the agents on
     *   purpose (see SessionSnapshot.pendingCommands): a command reports no work back, so it is nothing
     *   to a notification and everything to this;
     * - a queued message is about to be sent into this very process the moment the turn ends.
     *
     * [awake] is the moment this conversation last did anything: the status changing, or, for a process
     * raised without a turn ever running in it, the moment it came up. Zero means neither is known, and
     * an unknown moment is not evidence of an old one - it never sleeps.
     */
    fun sleeps(
        snapshot: SessionSnapshot,
        running: Boolean,
        queued: Boolean,
        awake: Long,
        now: Long,
    ): Boolean {
        if (!running) return false
        if (snapshot.status != SessionSnapshot.STATUS_IDLE) return false
        if (snapshot.awaitsYou) return false
        if (snapshot.pendingAgents.isNotEmpty()) return false
        if (snapshot.pendingCommands.isNotEmpty()) return false
        if (queued) return false
        if (awake <= 0) return false

        return now - awake >= AFTER_MS
    }
}

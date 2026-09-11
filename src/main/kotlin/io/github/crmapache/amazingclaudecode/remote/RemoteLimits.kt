package io.github.crmapache.amazingclaudecode.remote

import java.util.ArrayDeque
import java.util.concurrent.ConcurrentHashMap

/**
 * How much a device may ask for, and how often.
 *
 * The channel is not "a view of the feed": it can send messages to an agent that has a shell on this
 * machine. So the question is not what a well-behaved phone needs - it needs very little - but what a
 * phone in somebody else's hands could do before anyone notices. Every number here is an answer to
 * that, and each says which of the two it is protecting: the machine's work, or its memory.
 *
 * Deliberately generous where a person might genuinely be quick, and tight where nobody is: answering
 * five permissions in ten seconds is an ordinary morning, while sending five messages in ten seconds
 * is not a person typing.
 */
internal class RemoteLimits {

    /** What one device has done lately, per kind of thing. */
    private val windows = ConcurrentHashMap<String, ArrayDeque<Long>>()

    /** How many bytes it has sent lately, as (when, how many). */
    private val volume = ConcurrentHashMap<String, ArrayDeque<Pair<Long, Int>>>()

    /**
     * Whether this device may do this now.
     *
     * A refusal is not silent where there is anyone to tell: a phone that has been told "too fast, try
     * again" looks like a phone that is working, while one that silently does nothing looks broken -
     * and whoever is holding it will simply press harder. Where the refusal happens below the
     * conversation - a frame too heavy, a handshake asked for too often - there is no one to answer,
     * and it is a log line instead.
     */
    @Synchronized
    fun allow(deviceId: String, kind: String, now: Long = System.currentTimeMillis()): Boolean {
        val limit = PER_MINUTE[kind] ?: DEFAULT_PER_MINUTE
        val window = windows.getOrPut("$deviceId:$kind") { ArrayDeque() }

        while (window.isNotEmpty() && now - window.first() > WINDOW_MS) window.removeFirst()
        if (window.size >= limit) return false

        window.addLast(now)
        return true
    }

    /**
     * The same for weight rather than count. A hundred small messages and one enormous one are
     * different problems, and a rate limit alone answers only the first.
     */
    @Synchronized
    fun allowBytes(deviceId: String, bytes: Int, now: Long = System.currentTimeMillis()): Boolean {
        if (bytes > MAX_MESSAGE_BYTES) return false

        val recent = volume.getOrPut(deviceId) { ArrayDeque() }
        while (recent.isNotEmpty() && now - recent.first().first > WINDOW_MS) recent.removeFirst()

        val total = recent.sumOf { it.second }
        if (total + bytes > MAX_BYTES_PER_MINUTE) return false

        recent.addLast(now to bytes)
        return true
    }

    /** A device is gone - it should not go on occupying a slot in either map. */
    @Synchronized
    fun forget(deviceId: String) {
        windows.keys.removeIf { it.startsWith("$deviceId:") }
        volume.remove(deviceId)
    }

    companion object {
        const val WINDOW_MS = 60_000L

        /**
         * By kind, because the kinds differ in what they cost.
         *
         * A message starts a turn, which costs money and a process; answering a permission costs the
         * agent one step it was already going to take. Someone answering five questions in ten seconds
         * is an ordinary morning; someone sending five messages in ten seconds is not a person typing.
         */
        val PER_MINUTE = mapOf(
            "prompt" to 10,
            // Queuing a message is sending one, only later - so it is counted the same. Taking one back
            // out and reordering the list cost nothing and are left to the default.
            "queuePrompt" to 10,
            // Opening a conversation is a process, so this is not free - but it is also how a phone
            // reads its past ones: each one opened from the history is a tab of its own, and at five a
            // minute someone going through yesterday's work ran out in half a minute. What that looked
            // like on the phone was a conversation opening empty, which is a poor way to say "not so
            // fast". The history goes through the second of these: it opens the tab as well as the
            // conversation (see ClaudeSessionHub.resumeConversation), and one request is all it sends.
            "newSession" to 15,
            "resumeSession" to 15,
            "permissionDecision" to 40,
            "planDecision" to 40,
            "askAnswer" to 40,
            "askDismiss" to 40,
            "stop" to 20,
            "kill" to 10,
            "stopTask" to 20,
            // Being caught up is cheap for the agent and expensive to be denied: a phone in a lift does
            // it on every reconnect.
            "ready" to 60,
            // Telling a device this agent has let go of that it has been let go of. Not a thing anybody
            // asks for - it is an answer to a handshake nobody can complete - and a device that has not
            // understood it re-offers every fifteen seconds, so four a minute is the honest traffic.
            "revoked" to 6,
            // A search answers as one types - a word is half a dozen requests - and costs a lookup in an
            // index already in memory. The model's search starts a process and a paid run, so it is
            // counted like a message.
            "search" to 120,
            "searchAi" to 10,
            /*
             * The three screens about the machine, and every one of them is dearer than it looks.
             *
             * Asking about the MCP servers wakes the conversation's process if it is asleep, and adding
             * or removing one restarts it outright. Listing the plugins is a CLI run that goes out to
             * the marketplaces over the network. Listing the accounts is a process PER ACCOUNT - the
             * health of each drawer and a usage question in each one (see AccountDesk.sendList).
             *
             * Each of these is one press on a screen somebody opened deliberately, so a handful a minute
             * is more than a person can want and far less than a loop would take.
             */
            "mcpList" to 20,
            "mcpReconnect" to 10,
            // A sign-in is a control request to the conversation's process and, for a connector, a page
            // opened on the phone: one press per server, a handful a minute.
            "mcpAuthenticate" to 5,
            "mcpAdd" to 5,
            "mcpRemove" to 5,
            "pluginList" to 10,
            "marketplaceList" to 10,
            "accountList" to 20,
            /*
             * And the three that change something. Switching accounts moves every open conversation on
             * that machine and stops any turn mid-run: at more than a few a minute the machine would
             * spend its time replacing processes rather than working in them.
             */
            // A closed project's history: a folder walked and a head and a tail read out of every file
            // in it (see RemoteAgent.recentHistory). Asked once per screen opened, so the default is
            // already generous - it is here to be a number rather than an oversight.
            "recentHistory" to 20,
            "accountUse" to 5,
            "accountForget" to 5,
            "accountLogout" to 5,
            /*
             * The scenarios, and every one of them is a press on a screen somebody opened on purpose.
             *
             * Asking for the shelves walks two directories and reads a summary out of every past run, so
             * it is a screen's worth a minute rather than a poll; one run and one scenario are one file
             * each. The ones that move a run are a press apiece - and stopping one is asked about first,
             * so a loop of them is not a person.
             *
             * The two that cost real work are lower and each for its own reason. `scenarioRun` raises a
             * head and a card that work over the working copy for hours, so it is counted like a message.
             * `scenarioDraft` is a paid `claude -p` that reads the project, exactly as the model's search
             * is.
             *
             * `scenarioLog` is NOT among them, though it once was: reading a page off a transcript is a
             * pass over one file, and opening a step is now several of them in a row - the first page and
             * then whatever the mark over the feed is pressed for, plus what one press fetches by itself
             * (see useEarlierPages). At fifteen a minute, reading up a long card ran into the ceiling; it
             * sits at the default, where `historyPage` - the very same read for an ordinary tab - has
             * always been.
             */
            "scenarios" to 20,
            "scenarioFetch" to 30,
            "scenarioOpen" to 20,
            "scenarioAnswer" to 20,
            "scenarioPause" to 10,
            "scenarioResume" to 10,
            "scenarioStop" to 10,
            "scenarioSave" to 15,
            "scenarioDelete" to 10,
            "scenarioDuplicate" to 10,
            "scenarioDraft" to 10,
            "scenarioRun" to 10,
            "scenarioSchedule" to 15,
            "scenarioUnschedule" to 15,
            "scenarioRunDelete" to 15,
        )

        const val DEFAULT_PER_MINUTE = 30

        /**
         * Nothing a phone legitimately sends is this big.
         *
         * The same number the transport already refuses above (RelayLink.MAX_FRAME_BYTES), so on the
         * relay's own path this is a second lock on a door that is already locked - which is the point
         * of it: the frame ceiling belongs to the transport, and a message that ever arrives another
         * way should not be the first to find out that nothing else was checking. A picture from a
         * phone is scaled down long before this (see mobile/images.ts); it does not travel in
         * megabytes.
         */
        const val MAX_MESSAGE_BYTES = 256 * 1024

        /**
         * And how much of it a minute. A hundred small messages and one enormous one are different
         * problems, and the count above answers only the first: at the rates it allows, searching as
         * one types could carry thirty megabytes a minute and stay inside every one of them.
         */
        const val MAX_BYTES_PER_MINUTE = 8 * 1024 * 1024
    }
}

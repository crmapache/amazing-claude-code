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
     * The refusal is answered rather than swallowed: a phone that has been told "too fast, try again"
     * looks like a phone that is working, while one that silently does nothing looks broken - and
     * whoever is holding it will simply press harder.
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
            // Opening a conversation is a process, so this is not free - but it is also how a phone
            // reads its past ones: each one opened from the history is a tab of its own, and at five a
            // minute someone going through yesterday's work ran out in half a minute. What that looked
            // like on the phone was a conversation opening empty, which is a poor way to say "not so
            // fast".
            "newSession" to 15,
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
        )

        const val DEFAULT_PER_MINUTE = 30

        /** Nothing a phone legitimately sends is this big. Images travel in a message, hence the room. */
        const val MAX_MESSAGE_BYTES = 3 * 1024 * 1024

        const val MAX_BYTES_PER_MINUTE = 8 * 1024 * 1024
    }
}

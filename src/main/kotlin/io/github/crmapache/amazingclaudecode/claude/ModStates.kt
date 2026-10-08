package io.github.crmapache.amazingclaudecode.claude

import java.util.concurrent.ConcurrentHashMap

/**
 * What a conversation's mods have on the screens right now: a status line per mod and the list of panes they
 * have open (see ModLines.Kind.STATE).
 *
 * Kept here, as the latest line per slot, instead of in the journal: a mod may set its status every second,
 * and only the last one is true. A client that joins is handed what stands now (see ClaudeSessionHub.attach),
 * and a state that went back to nothing is forgotten rather than kept as an empty line.
 *
 * It all belongs to a process - the mods run inside it - so the hub lets go of it when the process finishes
 * or is replaced, and tells the screens so (see ModLines.cleared).
 */
internal class ModStates {

    private val bySession = ConcurrentHashMap<String, LinkedHashMap<String, String>>()

    /** Keep [line] as what [slot] holds now, or forget the slot when the line says there is nothing. */
    fun keep(sessionId: String, slot: String, line: String) {
        val slots = bySession.getOrPut(sessionId) { LinkedHashMap() }
        synchronized(slots) {
            if (ModLines.isNothing(line)) slots.remove(slot) else slots[slot] = line
        }
    }

    /** The lines standing now, in the order the slots were first filled. */
    fun of(sessionId: String): List<String> {
        val slots = bySession[sessionId] ?: return emptyList()
        return synchronized(slots) { slots.values.toList() }
    }

    /** Let go of everything this conversation's mods had standing; the slots that were filled come back. */
    fun clear(sessionId: String): List<String> {
        val slots = bySession.remove(sessionId) ?: return emptyList()
        return synchronized(slots) { slots.keys.toList() }
    }
}

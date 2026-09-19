package io.github.crmapache.amazingclaudecode.remote

/**
 * What a device has already been sent, and when to stop remembering it.
 *
 * The memory itself is one fingerprint per device per slot (see RemoteAgent.newFacts) and it used to be
 * about twenty entries: one per kind of message. A scenario run puts an identifier into the slot, which is
 * what lets two runs going side by side be told apart on the wire - and that turned a small fixed table
 * into one that grows by a row per run for as long as the IDE is open. A scenario on a morning schedule
 * plus the runs somebody starts by hand is hundreds of rows a year, per paired device, none of them ever
 * looked at again.
 *
 * Here rather than inside the client because it fails quietly in both directions. Forgetting too eagerly
 * costs one frame that had already been sent; forgetting nothing costs memory for as long as the window is
 * open, and nothing ever says so.
 */
internal object FactMemory {

    /**
     * How many slots one project's memory may hold before it is dropped altogether.
     *
     * Generous next to what a working day needs - a handful of message kinds plus a row per run - and
     * small enough that it cannot matter. Dropped whole rather than by age: there is no age here to sort
     * by, and the cost of being wrong is that the next fact of each kind goes out once more.
     */
    const val SLOTS = 512

    /** The name a device remembers one fact under: its address, then the slot. */
    fun key(address: String, slot: String): String = "$address$SEPARATOR$slot"

    /** The address a slot belongs to - see [prune]. */
    fun address(key: String): String = key.substringBefore(SEPARATOR)

    /**
     * Forget what belongs to devices this project is no longer saying anything to, and everything if it
     * grew past [SLOTS].
     *
     * The first half is exact: a phone that was revoked, one that was switched off, and one that moved to
     * another project all leave behind every slot they ever had here, and nothing else would ever remove
     * them. By who is being told anything at all rather than by "still paired", because a device that
     * moved keeps its place in the agent's subscriptions under the same address - asked that way, half of
     * this would never fire.
     *
     * Forgetting one that comes back costs a frame it had already been sent, which is the right way round:
     * the overview facts are what its first screen is drawn from, and it is better to say them twice than
     * to leave a card blank because of what its predecessor under the same address once received.
     *
     * The second is the backstop for the device that stays on one project all year while a scenario runs
     * every morning.
     */
    fun prune(sent: MutableMap<String, Long>, told: Set<String>) {
        sent.keys.removeAll { key -> address(key) !in told }
        if (sent.size > SLOTS) sent.clear()
    }

    private const val SEPARATOR = '\u0000'
}

package io.github.crmapache.amazingclaudecode.claude

import java.time.Instant
import java.time.OffsetDateTime
import kotlin.math.abs
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.contentOrNull
import kotlinx.serialization.json.jsonPrimitive

/**
 * Parsing the CLI's answer to `get_usage`: the subscription usage windows and the context window's
 * size. It does not matter whether a live conversation or a one-off ping answered - the shape is the
 * same.
 *
 * Apart from the panel, because all the difficulty here is in that shape: a freshly raised process has
 * no limits at all yet, the context window's size lies in a per-model breakdown, and an empty spot
 * arrives as an honest null. The panel is left with folding ready figures into a message upwards.
 */
internal object ClaudeUsage {

    /** One usage window: the share and when it resets (an empty string means the CLI did not say). */
    data class Window(val percent: Int, val resets: String) {

        /** The reset time parsed, or null: the CLI sends `Z`, and `+00:00`, and nothing at all. */
        val resetsAt: Instant? by lazy {
            if (resets.isBlank()) null else runCatching { OffsetDateTime.parse(resets).toInstant() }.getOrNull()
        }

        /** Whether this share is about the present window: the reset is still ahead, so it is. */
        fun isCurrent(now: Instant): Boolean = resetsAt?.isAfter(now) == true
    }

    data class Snapshot(val session: Window?, val week: Window?, val contextWindow: Int?) {
        /**
         * Whether the limits themselves have arrived. Without them the panel asks again: usually it
         * means the process came up but has not yet learned the subscription windows from the server -
         * in a couple of seconds the answer will be complete.
         */
        val hasLimits: Boolean get() = session != null || week != null

        /**
         * Whether the answer is frozen. A window whose reset time has already passed means exactly one
         * thing: the process that answered has not gone to the server since the previous window and is
         * repeating a share out of it. Asking it again is useless - for fresh figures the panel goes to
         * the server (see refreshLimits).
         */
        fun isStale(now: Instant = Instant.now()): Boolean =
            listOfNotNull(session, week).any { it.resetsAt != null && !it.isCurrent(now) }
    }

    fun parse(usage: JsonObject): Snapshot {
        val limits = usage.child("rate_limits")

        return Snapshot(
            session = limits?.let { window(it, "five_hour") },
            week = limits?.let { window(it, "seven_day") },
            contextWindow = contextWindow(usage),
        )
    }

    /**
     * The windows' memory: it brings a stream of dissimilar snapshots down to what is actually
     * happening to the limit.
     *
     * The panel learns one and the same share by two routes, and they disagree. A live conversation
     * hands over the figure from the server's last answer to a model request: that is the freshest one,
     * but it freezes while there are no turns - a process that worked yesterday answers with
     * yesterday's share all day. A one-off ping asks the server for a summary: that one is about now,
     * but it lags by minutes (over five minutes of watching it went 3, 12, 17, 20 per cent in a row).
     * Showing this as it comes means flickering the percentage back and forth, and after a window reset
     * holding the previous window's share on the ring: that is exactly how 99% ended up there on an
     * almost empty window.
     *
     * So a window is recognised by its reset time, and a share is not taken at its word:
     * - the reset has already passed - the snapshot is from a window that no longer exists, and its
     *   share says nothing about the present one; the present one is empty until real data arrives;
     * - the same window (the reset times match) - we take the largest share seen: within a window usage
     *   only grows, and the disagreement between the routes is one of them lagging, not usage rolling
     *   back;
     * - a window newer than the known one - we start counting afresh, from it.
     *
     * The instance lives with the panel: this is its memory of what has already been seen.
     */
    class Tracker {

        private var session: Window? = null
        private var week: Window? = null

        /**
         * The same snapshot, but with its windows checked against everything seen before.
         *
         * Under a lock: answers arrive now from a conversation, now from a ping - each on its own
         * thread - and without it two simultaneous snapshots would overwrite each other's memory.
         */
        @Synchronized
        fun merge(snapshot: Snapshot, now: Instant = Instant.now()): Snapshot {
            session = fold(session, snapshot.session, now)
            week = fold(week, snapshot.week, now)

            return snapshot.copy(session = session, week = week)
        }

        private fun fold(known: Window?, incoming: Window?, now: Instant): Window? {
            // The known window, but only while it is the present one: at the moment of the reset its
            // share stops meaning anything, even if there is no new data.
            val current = known?.takeIf { it.isCurrent(now) }

            val incomingAt = incoming?.resetsAt
            if (incomingAt == null) {
                // A zero without a reset time is an honest "the window has not opened yet": that is how
                // a process that has made no requests answers. A share without a window, on the other
                // hand, has nothing to attach to, and must not override what is known.
                return current
                    ?: incoming?.takeIf { it.percent == 0 }
                    // We knew a window and it has ended: in the new one usage starts from zero.
                    ?: RESET.takeIf { known != null }
            }

            // A snapshot from a window that has already reset: its share is about the past, and about
            // the present window it says exactly one thing - it has started afresh. That is precisely
            // how a frozen answer from a process that worked before the reset arrives.
            if (!incomingAt.isAfter(now)) return current ?: RESET

            val currentAt = current?.resetsAt ?: return incoming

            return when {
                // One and the same window to within minutes, rather than by string: the reset time is
                // fixed, but the routes give it differently - a live conversation rounds to seconds
                // ("20:30:00.000Z"), the server's summary carries microseconds
                // ("20:30:00.464237+00:00"). Comparing strings would count these as different windows
                // and reset the memory at every step, while real windows differ by five hours or a week.
                abs(currentAt.toEpochMilli() - incomingAt.toEpochMilli()) <= SAME_WINDOW_TOLERANCE_MS ->
                    incoming.copy(percent = maxOf(current.percent, incoming.percent))
                // A window newer than the known one - the reset happened, we count afresh from it.
                incomingAt.isAfter(currentAt) -> incoming
                // Otherwise the snapshot is a whole window behind: we keep what we already know.
                else -> current
            }
        }
    }

    /**
     * The window has reset and there is no fresh data yet: usage in the new window is zero, and when it
     * ends will be known with the first request to the model.
     */
    private val RESET = Window(percent = 0, resets = "")

    private const val SAME_WINDOW_TOLERANCE_MS = 2 * 60 * 1000L

    private fun window(limits: JsonObject, name: String): Window? {
        val window = limits.child(name) ?: return null
        val percent = window["utilization"]?.jsonPrimitive?.contentOrNull?.toDoubleOrNull() ?: return null

        return Window(
            percent = percent.toInt(),
            resets = window["resets_at"]?.jsonPrimitive?.contentOrNull.orEmpty(),
        )
    }

    /**
     * The context window's size depends on the model: with the large ones it is a million rather than
     * two hundred thousand. We take it from the answer, or the share on the meter would be three times
     * too low.
     */
    private fun contextWindow(usage: JsonObject): Int? {
        val models = usage.child("session")?.child("model_usage") ?: return null

        return models.keys
            .mapNotNull { models.child(it)?.get("contextWindow")?.jsonPrimitive?.contentOrNull?.toIntOrNull() }
            // 0 is cut off along with null: on the webview side there is nowhere to put it - `?? current`
            // does not fire on 0 (it is not nullish), it sticks in the panel's state forever, and the
            // context meter divides by zero.
            .filter { it > 0 }
            .maxOrNull()
    }
}

package io.github.crmapache.amazingclaudecode.claude

import kotlinx.serialization.json.Json
import kotlinx.serialization.json.booleanOrNull
import kotlinx.serialization.json.contentOrNull
import kotlinx.serialization.json.jsonObject
import kotlinx.serialization.json.jsonPrimitive
import kotlinx.serialization.json.longOrNull

/**
 * The subscription limit's signal out of the agent's stream - the `rate_limit_event` the CLI sends
 * whenever the limit picture changes.
 *
 * Its own "rejected" says far less than it looks, and taking it for "the work has stopped" is exactly
 * the mistake this object exists to prevent. A used-up limit is not the same as a halt:
 *
 * - with extra usage the server lets the requests through and bills them on top of the plan, and the
 *   work goes on without a pause (the CLI reads the very flags read below to decide the same);
 * - during the grace period the limit is over but the current step is allowed to finish;
 * - a signal whose reset time has already passed is about a window that no longer exists - the CLI
 *   throws such a one away, and so do we.
 *
 * Only what is left after all three is a genuine stop.
 *
 * Two places ask about this, for two different reasons: the usage rings need to know that the work is
 * being paid for past the plan (see ProjectUsage), and a phone needs to know that everything has
 * stopped (see NotificationReasons). Both read one verdict here rather than each its own set of rules.
 * The feed decides the same over the same event on its own side - it has words to say about it, not
 * just a flag (see rate_limit_event in feed/build.ts).
 */
internal object ClaudeRateLimit {

    private const val FIELD = "rate_limit_info"

    /** What a limit event amounts to - see [of]. */
    data class Verdict(
        /** The work goes on past the plan's limit, paid for separately. */
        val extraUsage: Boolean,
        /** Nothing will move until the window resets. */
        val stopped: Boolean,
        /**
         * Which window it is about, in the CLI's own words: `five_hour`, `seven_day`, `seven_day_opus`
         * and so on. Empty when it did not say.
         *
         * Passed on rather than translated here: the panel is the one that has to know which of its
         * rings burns and what to call the window in words (see limitWindowName in feed/usage.ts). A
         * five-hour limit spent on extra usage and a weekly one look identical in the event and are two
         * different rings on the screen.
         */
        val window: String,
        /**
         * When the window resets, in milliseconds, or null when the event did not say.
         *
         * Passed on because it is what tells one window from the next one after it: "the five-hour
         * window" is the name of a kind, not of an occasion (see ExtraUsageAnnouncements).
         */
        val resetsAt: Long?,
    )

    /**
     * The verdict on one line of the stream, or null when the line is not a limit event at all - about
     * limits it then says nothing, and nothing is what should be concluded from it.
     */
    fun of(line: String, now: Long = System.currentTimeMillis()): Verdict? {
        if (!line.contains(FIELD)) return null

        val parsed = runCatching { Json.parseToJsonElement(line).jsonObject }.getOrNull() ?: return null

        // Both shapes of the same thing: the agent's raw line, and the envelope it travels to the clients
        // in. The stream is read here as it comes (see ProjectUsage.noteRateLimit), the notifications read
        // what has already been wrapped (see NotificationReasons) - and neither should have to unwrap it.
        val event = if (parsed["type"]?.jsonPrimitive?.contentOrNull == "agent") parsed.child("event") else parsed
        if (event?.get("type")?.jsonPrimitive?.contentOrNull != "rate_limit_event") return null

        val info = event.child(FIELD) ?: return null
        val flag = { name: String -> info[name]?.jsonPrimitive?.booleanOrNull == true }

        // Both flags mean one and the same thing in the CLI's own checks; which of the two arrives
        // depends on its version.
        val extraUsage = flag("isUsingOverage") || flag("overageInUse")
        val refused = info["status"]?.jsonPrimitive?.contentOrNull?.lowercase() == "rejected"
        // The reset arrives in seconds, as is customary in the CLI itself.
        val resetsAt = info["resetsAt"]?.jsonPrimitive?.longOrNull?.times(1000)
        val stale = resetsAt != null && resetsAt <= now

        return Verdict(
            extraUsage = extraUsage,
            stopped = refused && !extraUsage && !flag("rateLimitGraceActive") && !stale,
            window = info["rateLimitType"]?.jsonPrimitive?.contentOrNull.orEmpty(),
            resetsAt = resetsAt,
        )
    }
}

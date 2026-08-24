package io.github.crmapache.amazingclaudecode.remote

import io.github.crmapache.amazingclaudecode.claude.SessionSnapshot

/**
 * Whether something that just happened is worth waking a phone for.
 *
 * The panel answers this same question already (see sounds.ts) and answers it from the feed, which is
 * the natural place: the feed is where a permission is a card and a turn's end is a line. This side has
 * no feed - it has a journal and a snapshot - and gaining one would mean carrying sixteen hundred lines
 * of TypeScript into Kotlin.
 *
 * So the question is answered from what this side does have. All six occasions turn out to be visible
 * without a feed: three are simply "is the conversation stopped waiting for a person", and the other
 * three are recognisable in the raw stream. The one thing that must not drift is the order of
 * importance, which is why it is stated here as a list and checked against the panel's copy by a test.
 *
 * The decision belongs on this side rather than the phone's because the phone is asleep - that is the
 * entire point of a notification - and because the text is sealed here (see phase 5 in the plan): a
 * relay that could decide what is worth notifying about would be a relay that knows what happened.
 */
internal object NotificationReasons {

    /**
     * The occasions, most important first.
     *
     * When several land in one moment - a turn that ends with an error, say - the more important one
     * speaks and the other stays quiet. Two overlaid signals say less than one.
     */
    val PRIORITY = listOf("trouble", "rateLimit", "permission", "question", "plan", "turnFinished")

    /**
     * By default everything calls except the end of a turn.
     *
     * That one is deliberately off: a working day is dozens of turns, and a phone that buzzes at every
     * one of them is a phone with notifications switched off by the end of the week - including the
     * ones that mattered.
     */
    val DEFAULT_ON = setOf("trouble", "rateLimit", "permission", "question", "plan")

    /**
     * A limit refusal recognised by its wording.
     *
     * The main route does not depend on wording - a limit arrives as an event of its own - but it also
     * arrives as a plain refusal in the CLI's words, and then there is nothing else to know it by.
     * Being wrong here is cheap: a miss means the ordinary breakage signal instead of the limit one,
     * rather than silence.
     */
    private val LIMIT = Regex(
        "(rate|usage|quota)[ -]?limit|limit (reached|exceeded|is used up)|out of (usage|credits)",
        RegexOption.IGNORE_CASE,
    )

    /** What a turn interrupted by the person is marked with - see STOPPED_BY_YOU in feed/build.ts. */
    private const val STOPPED_BY_YOU = "Stopped by you"

    /**
     * The reason this message is worth a notification, or null.
     *
     * [before] and [after] are the conversation's snapshot either side of the message: three of the six
     * occasions are exactly a transition in it, and reading them from the snapshot rather than from the
     * message keeps this in step with what the phone's own list shows.
     */
    fun of(message: String, before: SessionSnapshot, after: SessionSnapshot): String? {
        // A process that died on its own. Not an agent's event at all - a message from the shell - which
        // is why it can happen with no turn running and no feed to put it in.
        if (message.contains("\"type\":\"processExited\"")) return "trouble"

        if (message.contains("\"type\":\"error\"")) {
            return if (LIMIT.containsMatchIn(message)) "rateLimit" else "trouble"
        }

        // The three that are a stop rather than an event: the conversation is now waiting for a person
        // and was not a moment ago.
        if (after.pendingPermissions.size > before.pendingPermissions.size) return "permission"
        if (after.pendingAsks.size > before.pendingAsks.size) return "question"
        if (after.pendingPlans.size > before.pendingPlans.size) return "plan"

        if (message.contains("\"type\":\"agent\"") && message.contains("\"type\":\"rate_limit\"")) {
            return "rateLimit"
        }

        // The end of a turn - unless the person ended it themselves a moment ago. Calling someone back
        // to a turn they just stopped serves nothing.
        if (isTurnEnd(message)) {
            return if (message.contains(STOPPED_BY_YOU)) null else "turnFinished"
        }

        return null
    }

    /** Which of several occasions speaks, when more than one lands at once. */
    fun louder(first: String?, second: String?): String? {
        if (first == null) return second
        if (second == null) return first

        return if (PRIORITY.indexOf(first) <= PRIORITY.indexOf(second)) first else second
    }

    /**
     * What the notification says, in a person's words rather than the protocol's.
     *
     * Short because a lock screen is short, and specific because "something happened" is worth less
     * than nothing: the whole value of the notification is knowing whether to reach for the phone.
     */
    fun title(reason: String, project: String, target: String): String = when (reason) {
        "permission" -> if (target.isEmpty()) "Waiting for a permission" else "Permission: $target"
        "question" -> "Claude is asking you something"
        "plan" -> "A plan is ready for you"
        "rateLimit" -> "You have hit a limit"
        "trouble" -> "Something broke in $project"
        else -> "The turn is finished"
    }

    private fun isTurnEnd(message: String): Boolean =
        message.contains("\"type\":\"agent\"") && message.contains("\"type\":\"result\"")
}

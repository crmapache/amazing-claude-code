package io.github.crmapache.amazingclaudecode.remote

import io.github.crmapache.amazingclaudecode.claude.ClaudeRateLimit
import io.github.crmapache.amazingclaudecode.claude.ClaudePreferences
import io.github.crmapache.amazingclaudecode.claude.IdeLanguage
import io.github.crmapache.amazingclaudecode.claude.SessionSnapshot

/**
 * Whether something that just happened is worth waking a phone for.
 *
 * The panel answers this same question already (see sounds.ts) and answers it from the feed, which is
 * the natural place: the feed is where a permission is a card and a turn's end is a line. This side has
 * no feed - it has a journal and a snapshot - and gaining one would mean carrying sixteen hundred lines
 * of TypeScript into Kotlin.
 *
 * So the question is answered from what this side does have. Six of the seven occasions turn out to be
 * visible without a feed: three are simply "is the conversation stopped waiting for a person", and the
 * other three are recognisable in the raw stream. The seventh - extra usage beginning - is not a
 * message at all but a change of state, and is announced by the side that keeps that state (see
 * [EXTRA_USAGE]). The one thing that must not drift is the order of importance, which is why it is
 * stated here as a list and checked against the panel's copy by a test.
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
    val PRIORITY = listOf("trouble", "rateLimit", "extraUsage", "permission", "question", "plan", "turnFinished")

    /**
     * The one occasion that is not read off a message here.
     *
     * Extra usage starting is a fact about the account rather than about a conversation, and the side
     * that already knows the moment it begins is the one that keeps the usage rings: the same event
     * repeats on every turn while the state holds, so "it has just begun" exists only against a
     * remembered previous state (see ProjectUsage.noteRateLimit). It is named here because the list
     * above is what the phone's importance order is, and the name has to be the panel's own.
     */
    const val EXTRA_USAGE = "extraUsage"

    /**
     * By default everything calls except the end of a turn.
     *
     * That one is deliberately off: a working day is dozens of turns, and a phone that buzzes at every
     * one of them is a phone with notifications switched off by the end of the week - including the
     * ones that mattered.
     */
    val DEFAULT_ON = setOf("trouble", "rateLimit", EXTRA_USAGE, "permission", "question", "plan")

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

        // A limit signal, and only when it means the work has genuinely stopped: the same event arrives
        // when a used-up window is being paid for past the plan and nothing has halted at all (see
        // ClaudeRateLimit). That case is worth a word of its own rather than this one, and it is said
        // elsewhere - here it would be said again on every turn while the state holds (see
        // [EXTRA_USAGE]).
        if (message.contains("\"type\":\"agent\"") && ClaudeRateLimit.of(message)?.stopped == true) {
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
    fun title(reason: String, project: String, target: String): String =
        // The language the panel speaks, resolved the same way the panel resolves it (see IdeLanguage).
        // Read at the moment of writing rather than kept: the setting is machine-wide and can change
        // between one notification and the next.
        title(reason, project, target, IdeLanguage.inForce(ClaudePreferences.language))

    /**
     * The same, in a language named rather than looked up.
     *
     * Apart from the call above so that the choice of words can be checked at all. Reading the setting
     * asks the platform for a service, and a plain unit test has no platform behind it - the whole of
     * this used to fail on that one line, which left the mapping from a reason to its sentence untested
     * while looking as though it were tested.
     */
    fun title(reason: String, project: String, target: String, language: String): String =
        when (reason) {
            "permission" -> PushWords.permission(language, target)
            "question" -> PushWords.question(language)
            "plan" -> PushWords.plan(language)
            "rateLimit" -> PushWords.rateLimit(language)
            EXTRA_USAGE -> PushWords.extraUsage(language)
            "trouble" -> PushWords.trouble(language, project)
            else -> PushWords.turnFinished(language)
        }

    private fun isTurnEnd(message: String): Boolean =
        message.contains("\"type\":\"agent\"") && message.contains("\"type\":\"result\"")
}

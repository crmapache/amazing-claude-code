package io.github.crmapache.amazingclaudecode.claude

import com.intellij.openapi.components.Service
import com.intellij.openapi.components.service
import java.time.Instant
import kotlinx.serialization.json.JsonObjectBuilder
import kotlinx.serialization.json.addJsonObject
import kotlinx.serialization.json.buildJsonObject
import kotlinx.serialization.json.put
import kotlinx.serialization.json.putJsonArray
import kotlinx.serialization.json.putJsonObject

/**
 * The subscription's usage as the whole IDE knows it: one picture per account, and every open project
 * shown the same one.
 *
 * The usage belongs to an account, while everything that asks about it belongs to a project - each open
 * project runs its own rounds (see ProjectUsage). It used to keep what it learned to itself as well, and
 * that is how a panel's rings froze for the better part of an hour while the account was being spent
 * before a person's eyes. The server may only be asked about an account so often, so the right to ask is
 * shared across the IDE (see UsageProbes.claim) and granted to whichever project asks first; the others
 * skip their round. Every project's round comes every thirty seconds at its own fixed phase, and a
 * project with a conversation at work asks at every one of them - so the same project won every time,
 * and the one whose round fell a few seconds after it never asked at all. Its rings stayed on the figure
 * it had learned when it opened, 5% on a window that was at 49%, and the only answers that moved went to
 * another project's panel. Simulated: three open projects, one of them working - in almost half of all
 * phase arrangements one project heard nothing for forty minutes.
 *
 * So the answer goes where the question was about, not where it was asked from: whoever asks, the
 * figures are folded into this account's one memory, and the result goes to every open project - its
 * panels and the phones watching it. A project that lost the right to ask loses nothing now.
 *
 * Extra usage is kept here for the same reason: whether money is being spent past the plan is a fact
 * about the account, and one project's stream saying so while another's answer to `get_usage` carried
 * "not spending" would have two panels disagreeing about one subscription.
 */
@Service(Service.Level.APP)
internal class AccountUsage(
    /** Where a picture goes: every open project. A test hears it instead. */
    private val publish: (String) -> Unit,
    private val announcements: () -> ExtraUsageAnnouncements,
) {

    /** The platform's own way in: every open project's panels and phones. */
    @Suppress("unused")
    constructor() : this(
        publish = { json -> ClaudeSessionHub.everyHub { it.broadcastProject(json) } },
        announcements = { ExtraUsageAnnouncements.getInstance() },
    )

    private class Book {
        /**
         * The memory of the usage windows: snapshots arrive by several routes with different lags, and
         * folding them into one truthful picture is that memory's work (see [ClaudeUsage.Tracker]). One
         * per account for the whole IDE - two memories of one account would each fold a different half
         * of the answers and send two different pictures of it.
         */
        val windows = ClaudeUsage.Tracker()

        /** The last picture sent, so a panel that has just opened is not left waiting for the next one. */
        var picture: ClaudeUsage.Snapshot? = null

        /**
         * Extra usage - the work that goes on past an exhausted limit, paid for on top of the plan.
         *
         * It is put together out of two different routes, because neither one alone knows the whole of
         * it: the stream's limit events say whether it is being spent right now (see [noteRateLimit]),
         * the answer to `get_usage` how much of the month's budget for it has already gone. Kept here
         * rather than sent onwards as it comes, so that a message about one of the two does not wipe the
         * other.
         *
         * Null until the first limit event arrives - "we do not know yet" rather than "no". The
         * difference matters exactly once per launch, and it is the whole of a bug: the CLI repeats the
         * event on every turn while the state holds, so the first one after a restart says "money is
         * being spent" about a state that began hours ago. Read as a change from "no", that fires a
         * notification to every paired phone.
         */
        var extraActive: Boolean? = null

        /**
         * Which window the extra usage is spent past, in the CLI's words. The panel decides by it which
         * of its rings burns: a used-up five-hour window and a used-up weekly one arrive as the same
         * event and are two different rings on the screen.
         */
        var extraWindow = ""

        var extraKnown: ClaudeUsage.Extra? = null

        /**
         * Who the sign-in was when these figures were last thrown away (see [forget]) - so that the same
         * switch, noticed by every open project in turn, throws them away once rather than once per
         * project, each time over the answer the first one has already brought.
         */
        var forgottenFor: String? = null

        /**
         * Until when this account's own limit is known to refuse requests, in milliseconds, and 0 when
         * nothing says it does.
         *
         * Learned from the refusals themselves rather than only from the shares, because the shares lag:
         * the rings of an account that is not the current one are filled by an occasional ping, and a tab or
         * a scenario run that has just been refused knows it before any answer to `get_usage` does. Read by
         * a run looking for an account with room left (see [standing]).
         */
        var refusedUntil = 0L
    }

    /**
     * What is known about whether [account] can take work right now - see [standing].
     *
     * [refusedUntil] is the later of the two ways of knowing it cannot: a refusal heard in a stream, and a
     * window at a hundred percent whose reset is still ahead. [fullest] is the larger share of the two
     * windows the plan is measured by, for telling a nearly spent account from a fresh one; null when no
     * share of the present windows is known at all.
     */
    data class Standing(val refusedUntil: Long? = null, val fullest: Int? = null)

    private val books = HashMap<String, Book>()

    private fun book(account: String): Book = books.getOrPut(account) { Book() }

    /**
     * An answer to `get_usage` about [account], whichever project asked and by whichever route: folded
     * into what is known and sent to everyone as the account's picture.
     */
    fun fold(account: String, snapshot: ClaudeUsage.Snapshot) {
        val message = synchronized(this) {
            val held = book(account)
            // What goes out is not the raw answer but one checked against what was seen before: on its own
            // a snapshot does not say whether it is about the present window (see ClaudeUsage.Tracker).
            val merged = held.windows.merge(snapshot)

            // A one-off ping answers about extra usage as fully as a live conversation does, while an
            // answer from a process that has not yet learned the account's settings carries no such block
            // at all - and silence is not "extra usage went away".
            snapshot.extra?.let { held.extraKnown = it }
            held.picture = merged

            pictureOf(account, merged, held)
        }

        publish(message)
    }

    /**
     * Every account's picture as it stands now, for a panel that has just opened: the figures another
     * project learned a moment ago are true for it too, and waiting out the pace for its own question
     * would show empty rings over an answer that is already here.
     *
     * Passed through the memory once more on the way, with nothing new: a window whose reset has gone by
     * since it was learned has to show its new, empty window rather than the share of the old one.
     */
    @Synchronized
    fun pictures(): List<String> = books.mapNotNull { (account, held) ->
        val known = held.picture ?: return@mapNotNull null
        val now = held.windows.merge(known.copy(session = null, week = null, models = null))
        held.picture = now

        pictureOf(account, now, held)
    }

    /**
     * A limit event from a conversation on [account], told to every panel if it changes the extra usage
     * picture. Extra usage starts and ends without any question from us, and the rings must not wait for
     * the next round of polling to learn of it.
     *
     * Only the change is said out loud: the CLI repeats the event on every turn while the state holds,
     * and repeating a message that says the same thing would be noise on the wire - a phone across the
     * city is on the other end of it.
     *
     * Returns whether the spending has just started - the switch from the plan's own window to money on
     * top of it, the one occasion a person away from the desk is called about that is not in any message
     * (see NotificationReasons.EXTRA_USAGE). Only the switch on, not a change of window while it lasts: a
     * second window running out changes nothing about the fact that the money is already going. Never on
     * the first event after a launch, whatever it says (see [Book.extraActive]), nor twice for one window
     * (see [ExtraUsageAnnouncements]).
     */
    fun noteRateLimit(account: String, verdict: ClaudeRateLimit.Verdict): Boolean {
        val active = verdict.extraUsage
        val window = if (active) verdict.window else ""

        val (wasActive, message) = synchronized(this) {
            val held = book(account)
            // A genuine stop of a window the whole plan is measured by is a refusal until its reset, whoever
            // heard it: the next run to look for room must not land where a tab has just run out. A model's
            // own week is not: it refuses that model, and the account goes on serving the others.
            if (verdict.stopped && verdict.resetsAt != null && verdict.window in SHARED_WINDOWS) {
                held.refusedUntil = maxOf(held.refusedUntil, verdict.resetsAt)
            }

            val was = held.extraActive
            val changed = was != active || held.extraWindow != window

            held.extraActive = active
            held.extraWindow = window

            was to if (changed) {
                buildJsonObject {
                    put("type", "usage")
                    put("account", account)
                    putExtra(held)
                }.toString()
            } else {
                null
            }
        }

        message?.let(publish)

        /*
         * A crossing seen from a state we knew about: it was off, it is on now.
         *
         * "Was false" rather than "was not true": the first event after a launch has nothing before it
         * (see [Book.extraActive]), and it is a reading rather than a crossing - told to the panels, which
         * have to paint the rings, and not to a phone, which would be woken about nothing.
         */
        return active && wasActive == false && announcements().claim(account, verdict.window, verdict.resetsAt)
    }

    /**
     * Everything known about [account] is thrown away: it was about somebody else's sign-in. Returns
     * whether it was - false when this is a switch already dealt with.
     *
     * [identity] is who the sign-in is now, when the call comes from a switch being noticed. Every open
     * project notices one switch for itself, one after another, and each of them throwing the figures
     * away again would blank every panel's rings over the answer the first one has already brought. So
     * a switch to the same identity as last time is the same switch. Without an identity - an account
     * removed, signed out of, merged into another - the figures always go.
     *
     * Thrown away rather than left to be overwritten by the next answer, because they would not be. A
     * weekly window the new sign-in has not opened yet arrives with no reset time at all, and the memory
     * of the windows - rightly, for its usual job - keeps the known share in that case (see
     * [ClaudeUsage.Tracker]). That is exactly how a panel came to show a five-hour window of one
     * account beside a weekly window of another.
     */
    fun forget(account: String, identity: String? = null): Boolean {
        val message = synchronized(this) {
            val held = book(account)
            if (identity != null && held.forgottenFor == identity) return false

            held.forgottenFor = identity
            held.windows.forget()
            held.picture = null
            held.extraKnown = null
            held.extraActive = null
            held.extraWindow = ""
            held.refusedUntil = 0

            // The panels are told to forget too, and told separately: their own state is merged field by
            // field (see mergeUsage in feed/usage.ts), so silence about a window means "nothing new", not
            // "that window is nobody's now". Named, so it clears that account's rings and not whichever
            // account's a panel happens to be drawing.
            buildJsonObject {
                put("type", "usage")
                put("account", account)
                put("reset", true)
            }.toString()
        }

        publish(message)
        return true
    }

    /**
     * A refusal whose end nobody said - the stream refused a request without a limit event before it.
     * [until] is the caller's own guess at when to look again; a known reset later than it stays.
     */
    @Synchronized
    fun noteRefused(account: String, until: Long) {
        val held = book(account)
        held.refusedUntil = maxOf(held.refusedUntil, until)
    }

    /**
     * Whether [account] can take work at [now], as far as the IDE knows (see [Standing]).
     *
     * Only the five-hour and the weekly windows count as full. A model's own week (Fable) refuses only the
     * models it is about, and which models those are the answer does not say - a run that needs one of them
     * learns it from the refusal itself, which [Book.refusedUntil] keeps. Nor does a full window refuse while
     * extra usage is being spent past it: the work goes on, billed on top of the plan (see ClaudeRateLimit).
     */
    @Synchronized
    fun standing(account: String, now: Long = System.currentTimeMillis()): Standing {
        val held = books[account] ?: return Standing()
        val instant = Instant.ofEpochMilli(now)
        val present = listOfNotNull(held.picture?.session, held.picture?.week).filter { it.isCurrent(instant) }
        val fullUntil = present.filter { it.percent >= 100 && held.extraActive != true }
            .mapNotNull { it.resetsAt?.toEpochMilli() }
            .maxOrNull()
        val refused = held.refusedUntil.takeIf { it > now }

        return Standing(
            refusedUntil = listOfNotNull(fullUntil, refused).maxOrNull(),
            fullest = present.maxOfOrNull { it.percent },
        )
    }

    private fun pictureOf(account: String, merged: ClaudeUsage.Snapshot, held: Book): String =
        buildJsonObject {
            put("type", "usage")
            // Whose figures these are. The panel keeps a set of rings per account and draws the ones
            // belonging to the tab on screen: without this field it merges every answer into one picture,
            // and two accounts running at once produce one account's five-hour window beside the other's
            // weekly one.
            put("account", account)
            merged.session?.let { putWindow("session", it) }
            merged.week?.let { putWindow("week", it) }
            // The per-model weeks (Fable) as a whole list, always: after the memory they are what is known
            // right now, and an empty list is the honest "this plan has none" that takes a ring away, while
            // a missing field would leave yesterday's on the screen.
            merged.models?.let { models ->
                putJsonArray("models") {
                    models.forEach { model ->
                        addJsonObject {
                            put("label", model.label)
                            put("percent", model.window.percent)
                            put("resets", model.window.resets)
                        }
                    }
                }
            }
            merged.contextWindow?.let { put("contextWindow", it) }
            putExtra(held)
        }.toString()

    /**
     * Extra usage: whether it is being spent right now and how much of its monthly budget has gone.
     * Always as a whole rather than field by field - the two halves come from different routes, and half
     * a picture on the wire would mean the ring goes back to a percentage the moment the other half
     * arrives.
     */
    private fun JsonObjectBuilder.putExtra(held: Book) {
        val known = held.extraKnown
        val active = held.extraActive == true
        if (known == null && !active) return

        putJsonObject("extra") {
            put("active", active)
            if (active && held.extraWindow.isNotEmpty()) put("window", held.extraWindow)
            known?.let { put("enabled", it.enabled) }
            known?.percent?.let { put("percent", it) }
        }
    }

    private fun JsonObjectBuilder.putWindow(name: String, window: ClaudeUsage.Window) {
        putJsonObject(name) {
            put("percent", window.percent)
            put("resets", window.resets)
        }
    }

    companion object {

        /**
         * The windows that refuse every model of the account when they run out, in the CLI's words - the rest
         * (`seven_day_opus`, `seven_day_sonnet`, the Fable week) refuse only their own (see [standing]).
         */
        val SHARED_WINDOWS = setOf("five_hour", "seven_day")

        fun getInstance(): AccountUsage = service()
    }
}

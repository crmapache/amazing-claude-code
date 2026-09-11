package io.github.crmapache.amazingclaudecode.claude

import kotlinx.serialization.json.Json
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.booleanOrNull
import kotlinx.serialization.json.contentOrNull
import kotlinx.serialization.json.intOrNull
import kotlinx.serialization.json.jsonObject
import kotlinx.serialization.json.jsonPrimitive

/**
 * What a conversation looks like from outside right now.
 *
 * Everything here has one thing in common: it cannot be worked out by replaying the journal, or a new
 * client would have to walk the whole feed before it could draw a single line in a list of sessions.
 * A phone showing "WebStorm - my-project - 3 tabs, one waiting for you" asks this and nothing else.
 *
 * Whatever the journal does answer stays out. The feed items, the counters, the subagents' cards -
 * all of that comes back by itself from the messages that built it the first time, and a second copy
 * kept here would be one more thing to keep in step.
 */
internal data class SessionSnapshot(
    val status: String = STATUS_IDLE,
    val title: String = "",
    /**
     * Where the title came from. The interface picks a heuristic name from the first message straight
     * away and the CLI sends a better one a little later; a client joining in between has to know
     * which of the two it is looking at, or a fresh LLM title would lose to a stale heuristic one.
     */
    val titleSource: String = TITLE_DEFAULT,
    val model: String = "",
    val permissionMode: String = "",
    val contextUsed: Int = 0,
    val contextMax: Int = 0,
    /** The process died on its own since the last turn - see ClaudePanel.sendProcessExited. */
    val crashed: Boolean = false,
    /**
     * Whether a turn in this conversation has ever been carried through to its end.
     *
     * It is the difference between "nothing is happening here" and "the work is done" - the same one the
     * panel draws as a green dot against an unlit one (see sessionState in App.tsx), and the only one of
     * the five states a client cannot work out for itself from status and awaitsYou alone.
     *
     * Kept here rather than counted off the journal for the reason everything else here is: a phone
     * drawing a list of conversations would otherwise have to replay every one of them to colour a dot.
     *
     * A conversation raised from the history starts without it, exactly as the panel's own tab does: a
     * transcript holds no record of a turn ending (see ClaudeHistory.replayable), so what this says is
     * "work finished while this tab was alive" rather than "this conversation has ever done anything".
     */
    val worked: Boolean = false,
    /**
     * When this conversation last changed what it is doing, by this machine's clock.
     *
     * What the list on a phone writes beside a row: "working · 2m 40s" while a turn runs, "done · 14:02"
     * once it has stopped. Neither can be worked out on the other side - a phone is told the state of a
     * conversation it is not watching, never its feed, so it has no moment to count from and no moment
     * to name (see RemoteAgent.inventoryBody, which sends this alongside the machine's own clock).
     *
     * Stamped on a change of status alone rather than on every message: a running turn that printed a
     * hundred lines began when it began, and a counter restarted by each of them would read as a turn
     * that never gets anywhere.
     */
    val changedAt: Long = 0,
    /** Permission cards this conversation is stopped on, by request id. */
    val pendingPermissions: Set<String> = emptySet(),
    /** Plans awaiting a decision, by the id of the card in the feed. */
    val pendingPlans: Set<String> = emptySet(),
    /** Questions awaiting an answer, by the id of the card in the feed. */
    val pendingAsks: Set<String> = emptySet(),
    /**
     * Background agents this conversation started and has not heard back from, by task id.
     *
     * The one thing that tells "this turn ended" from "the work ended". An agent that raised background
     * subagents falls silent the moment it has raised them - its turn ends with the work only beginning -
     * and every report from one of them starts a turn of the CLI's own accord (see isTurnAnnouncement in
     * AgentStream.kt). Recorded off a live run: one message from the person, fourteen self-started turns,
     * and a phone that said "the work is done" fifteen times, fourteen of them untrue.
     *
     * Kept here because the notification is decided here, with no feed to read: the panel works the same
     * thing out of its own task cards (see workGoesOn in feed/build.ts, which the finished sound and the
     * time under the answer go by), and the panel can be closed while the phone is not.
     */
    val pendingAgents: Set<String> = emptySet(),
    /**
     * Background commands this conversation started and has not heard the end of, by task id.
     *
     * The same shape as [pendingAgents] and a different question. A command is not work being reported
     * on - a dev server never reports anything - so it says nothing about a notification and is counted
     * nowhere near one (see NotificationReasons). What it does say is that this process is holding
     * something only it holds: the command is its child, and taking the process away takes the command
     * with it (see IdleSleep, which is the one thing that asks this).
     *
     * Both kinds of command travel here - a background one and an ordinary one that ran long enough for
     * the CLI to report it - and both close themselves off. Measured on 2.1.263: a background `sleep`,
     * a foreground one and a killed one each ended with a `task_notification` of their own ("completed",
     * "completed", "stopped"). A dev server is the case that does not close, and holding the process for
     * one is the whole point.
     */
    val pendingCommands: Set<String> = emptySet(),
) {

    /**
     * Whether the conversation is stopped waiting for a person.
     *
     * This is the one thing a list of sessions on a phone genuinely has to show: a running turn is
     * merely work in progress, while a stopped one is work that will not move until you touch it.
     */
    val awaitsYou: Boolean
        get() = pendingPermissions.isNotEmpty() || pendingPlans.isNotEmpty() || pendingAsks.isNotEmpty()

    /**
     * What kind of answer it is stopped for, when it is stopped for one.
     *
     * A list on a phone is read to decide whether to get up, and the three cost very different things:
     * a permission is one tap, a question is a choice between two lines, a plan is a page to read. The
     * order is that of what is cheapest to settle, which is also the order they tend to arrive in.
     *
     * A word rather than the request itself - what exactly is being asked lives in the conversation, and
     * the list is not the place to read it.
     */
    val awaits: String
        get() = when {
            pendingPermissions.isNotEmpty() -> AWAITS_PERMISSION
            pendingAsks.isNotEmpty() -> AWAITS_QUESTION
            pendingPlans.isNotEmpty() -> AWAITS_PLAN
            else -> ""
        }

    companion object {

        const val AWAITS_PERMISSION = "perm"
        const val AWAITS_QUESTION = "ask"
        const val AWAITS_PLAN = "plan"

        const val STATUS_IDLE = "idle"
        const val STATUS_RUNNING = "running"

        const val TITLE_DEFAULT = "default"

        /** A name the interface worked out itself from the first message (see feed/title.ts). */
        const val TITLE_HEURISTIC = "heuristic"

        /** And one the CLI's own model picked - see ClaudeSession.onTitle. */
        const val TITLE_LLM = "llm"
    }
}

/**
 * Keeping the snapshot up to date out of the very messages that go to the interface.
 *
 * Deliberately derived rather than set by hand in each of the dozen places that send something. Those
 * places already exist and already say everything needed; a second set of calls beside them would be a
 * second thing to remember, and the one that gets forgotten shows a phone a conversation that has been
 * idle for an hour as still running.
 */
internal object SessionSnapshots {

    /**
     * The snapshot after this message. Returns the same instance when nothing in it is affected -
     * which is the usual case, because most of what travels is feed content.
     */
    fun apply(snapshot: SessionSnapshot, json: String, at: Long = 0): SessionSnapshot {
        if (!touches(json)) return snapshot

        val payload = runCatching { Json.parseToJsonElement(json).jsonObject }.getOrNull() ?: return snapshot
        val text = { name: String -> payload[name]?.jsonPrimitive?.contentOrNull.orEmpty() }

        return when (text("type")) {
            "status" -> {
                val state = text("state").ifEmpty { snapshot.status }
                snapshot.copy(
                    status = state,
                    // Only when it genuinely moved: the same status said twice is not a new beginning,
                    // and a running turn re-stamped by every repeat would count from the wrong second
                    // (see SessionSnapshot.changedAt).
                    changedAt = if (state == snapshot.status) snapshot.changedAt else at,
                    // A turn that was running and is not any more is a turn that ended - whether the agent
                    // finished it or the person stopped it, both leave work behind them. A process that
                    // died mid-turn does not come through here (see "processExited" below), so a crash
                    // cannot be mistaken for work done.
                    worked = snapshot.worked ||
                        (snapshot.status == SessionSnapshot.STATUS_RUNNING &&
                            state == SessionSnapshot.STATUS_IDLE),
                )
            }

            "sessionTitle" -> text("title").takeIf { it.isNotBlank() }
                ?.let { snapshot.copy(title = it, titleSource = SessionSnapshot.TITLE_LLM) }
                ?: snapshot

            // Only an applied change: a refused one leaves the conversation in the mode it was in, and
            // the interface is told exactly that (see ClaudePanel.changeMode).
            "mode" -> if (payload["applied"]?.jsonPrimitive?.booleanOrNull == true) {
                snapshot.copy(permissionMode = text("mode"))
            } else {
                snapshot
            }

            "model" -> if (payload["applied"]?.jsonPrimitive?.booleanOrNull == true) {
                snapshot.copy(model = text("model"))
            } else {
                snapshot
            }

            "context" -> {
                val used = payload["used"]?.jsonPrimitive?.intOrNull
                val max = payload["max"]?.jsonPrimitive?.intOrNull
                if (used != null && max != null) snapshot.copy(contextUsed = used, contextMax = max) else snapshot
            }

            "permission" -> text("id").takeIf { it.isNotEmpty() }
                ?.let { snapshot.copy(pendingPermissions = snapshot.pendingPermissions + it) }
                ?: snapshot

            "permissionResolved" -> text("id").takeIf { it.isNotEmpty() }
                ?.let { snapshot.copy(pendingPermissions = snapshot.pendingPermissions - it) }
                ?: snapshot

            // A dead process leaves nothing running: saying so now is cheaper than letting a client
            // work it out from a feed that simply stops. Its background agents die with it - and unlike a
            // turn, they have no closing event of their own, so the count has to be cleared here or the
            // "work is done" notification is silenced for the rest of this conversation's life.
            "processExited" -> snapshot.copy(
                crashed = true,
                status = SessionSnapshot.STATUS_IDLE,
                changedAt = at,
                pendingAgents = emptySet(),
                pendingCommands = emptySet(),
            )

            // The process was swapped under the conversation (an account chosen) - the same thing happens
            // to everything it was running, and nobody else will say so (see ClaudeSessionHub).
            "processReplaced" -> snapshot.copy(pendingAgents = emptySet(), pendingCommands = emptySet())

            "agent" -> applyAgentEvent(snapshot, payload)

            else -> snapshot
        }
    }

    /**
     * A conversation's process has just come up and reported what it came up with. This is the only
     * moment the model and the mode can be learned without anyone having chosen them - after a restart,
     * after /clear, on a tab opened from the history.
     */
    private fun applyAgentEvent(snapshot: SessionSnapshot, payload: JsonObject): SessionSnapshot {
        val event = payload["event"] as? JsonObject ?: return snapshot
        val field = { name: String -> event[name]?.jsonPrimitive?.contentOrNull.orEmpty() }

        if (field("type") != "system") return snapshot

        // A past conversation read off disk rather than a live turn (see onAgentLine). Whatever it says
        // about agents, they finished long ago - counted as running, they would silence the notification
        // for a tab that is merely showing history.
        val replayed = payload["replay"]?.jsonPrimitive?.booleanOrNull == true

        return when (field("subtype")) {
            "init" -> snapshot.copy(
                model = field("model").ifEmpty { snapshot.model },
                permissionMode = field("permissionMode").ifEmpty { snapshot.permissionMode },
                // A live process again: whatever crashed before it is over.
                crashed = false,
            )

            "task_started" -> {
                val id = field("task_id")
                // A terminal command is not an agent, although the CLI leads it down the same channel. A
                // dev server never reports work back: counted among the agents, it would silence the
                // notification for the rest of the day. Same rule as isBashTask in the panel's
                // feed/tasks.ts, unknown type included - an old CLI sent only subagents this way. It is
                // still noted, apart: the process is holding it (see [pendingCommands]).
                when {
                    replayed || id.isEmpty() -> snapshot
                    field("task_type") == LOCAL_BASH ->
                        snapshot.copy(pendingCommands = snapshot.pendingCommands + id)

                    else -> snapshot.copy(pendingAgents = snapshot.pendingAgents + id)
                }
            }

            // An agent reporting back. Taken from a replay as well: removing is safe in a way that adding
            // is not, and a stale id left standing costs the notification it was meant to hold.
            // The end of a command comes by the same event and carries no task_type of its own (measured
            // on 2.1.263), so both sets are asked: an id lives in one of them at most.
            "task_notification" -> {
                val id = field("task_id")
                if (id.isEmpty()) snapshot
                else snapshot.copy(
                    pendingAgents = snapshot.pendingAgents - id,
                    pendingCommands = snapshot.pendingCommands - id,
                )
            }

            else -> snapshot
        }
    }

    /**
     * A cheap look before parsing. This runs on every message of every conversation, and the great
     * majority of them are feed content that says nothing about the state - parsing all of them in full
     * would put a JSON parse on the stream's hot path for nothing.
     */
    private fun touches(json: String): Boolean {
        for (marker in STATE_MARKERS) {
            if (json.contains(marker)) return true
        }

        // Agent events are almost all of the traffic, and out of them only three say anything here: the
        // process's own "I have started" and the two ends of a background agent's life.
        if (!json.contains(AGENT_MARKER)) return false
        return json.contains(INIT_MARKER) || json.contains(TASK_STARTED_MARKER) || json.contains(TASK_DONE_MARKER)
    }

    private val STATE_MARKERS = listOf(
        "\"type\":\"status\"",
        "\"type\":\"sessionTitle\"",
        "\"type\":\"mode\"",
        "\"type\":\"model\"",
        "\"type\":\"context\"",
        "\"type\":\"permission\"",
        "\"type\":\"permissionResolved\"",
        "\"type\":\"processExited\"",
        "\"type\":\"processReplaced\"",
    )

    private const val AGENT_MARKER = "\"type\":\"agent\""
    private const val INIT_MARKER = "\"subtype\":\"init\""
    private const val TASK_STARTED_MARKER = "\"subtype\":\"task_started\""
    private const val TASK_DONE_MARKER = "\"subtype\":\"task_notification\""

    /** What the CLI calls a terminal command on the task channel - see applyAgentEvent. */
    private const val LOCAL_BASH = "local_bash"
}

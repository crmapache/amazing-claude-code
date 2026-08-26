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
    /** Permission cards this conversation is stopped on, by request id. */
    val pendingPermissions: Set<String> = emptySet(),
    /** Plans awaiting a decision, by the id of the card in the feed. */
    val pendingPlans: Set<String> = emptySet(),
    /** Questions awaiting an answer, by the id of the card in the feed. */
    val pendingAsks: Set<String> = emptySet(),
) {

    /**
     * Whether the conversation is stopped waiting for a person.
     *
     * This is the one thing a list of sessions on a phone genuinely has to show: a running turn is
     * merely work in progress, while a stopped one is work that will not move until you touch it.
     */
    val awaitsYou: Boolean
        get() = pendingPermissions.isNotEmpty() || pendingPlans.isNotEmpty() || pendingAsks.isNotEmpty()

    companion object {
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
    fun apply(snapshot: SessionSnapshot, json: String): SessionSnapshot {
        if (!touches(json)) return snapshot

        val payload = runCatching { Json.parseToJsonElement(json).jsonObject }.getOrNull() ?: return snapshot
        val text = { name: String -> payload[name]?.jsonPrimitive?.contentOrNull.orEmpty() }

        return when (text("type")) {
            "status" -> {
                val state = text("state").ifEmpty { snapshot.status }
                snapshot.copy(
                    status = state,
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
            // work it out from a feed that simply stops.
            "processExited" -> snapshot.copy(crashed = true, status = SessionSnapshot.STATUS_IDLE)

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

        if (field("type") != "system" || field("subtype") != "init") return snapshot

        return snapshot.copy(
            model = field("model").ifEmpty { snapshot.model },
            permissionMode = field("permissionMode").ifEmpty { snapshot.permissionMode },
            // A live process again: whatever crashed before it is over.
            crashed = false,
        )
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

        // Agent events are almost all of the traffic, and out of them only the process's own "I have
        // started" says anything here.
        return json.contains(AGENT_MARKER) && json.contains(INIT_MARKER)
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
    )

    private const val AGENT_MARKER = "\"type\":\"agent\""
    private const val INIT_MARKER = "\"subtype\":\"init\""
}

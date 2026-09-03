package io.github.crmapache.amazingclaudecode.claude

import com.intellij.openapi.diagnostic.thisLogger
import io.github.crmapache.amazingclaudecode.claude.ClaudeSessions.Companion.MAIN_SESSION
import java.util.concurrent.ConcurrentHashMap
import kotlinx.serialization.json.JsonArray
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.buildJsonObject
import kotlinx.serialization.json.put

/**
 * Everything the agent stops a turn for and waits on a person: a tool call's permission, a plan, a
 * question with options.
 *
 * All three are one and the same request over the control channel (see [PermissionChannel]), and all
 * three share one rule: an unanswered request is a conversation stopped until it closes. The
 * difference is only in who draws the card - the panel, or the tool call itself - and that difference
 * is exactly what lives here.
 *
 * It sits beside the conversations rather than inside the panel because a question outlives the window
 * that drew it: the panel may be closed over a waiting card, and from phase 1 on the answer may come
 * from a different device altogether. Whoever answers, the request is one, and so is the place that
 * decides whether it is still worth answering.
 */
internal class SessionPermissions(private val hub: ClaudeSessionHub) {

    /**
     * The requests we are waiting for a person's answer on: the answer has to go to the conversation
     * that asked - there are many tabs, and someone else's answer unblocks nobody.
     */
    private val channelPermissions = ConcurrentHashMap<String, Pending>()

    /**
     * The plans awaiting a person's decision, by the ExitPlanMode call's identifier - that is, by the
     * identifier of the plan's card in the feed. Apart from the other permissions: the one asking about
     * a plan is not a permission card but the plan card itself with its buttons, which the panel has
     * already drawn from the tool call.
     */
    private val plans = ConcurrentHashMap<String, Pending>()

    /**
     * The questions with options awaiting a person, by the AskUserQuestion call's identifier - that is,
     * by the identifier of the question's card in the feed.
     *
     * Arranged like the plans, and for the same reason: the card is drawn by the tool call itself, and
     * asking for a "may I ask a question" permission over it would be a second question about one and
     * the same thing. The answer goes back by the same request - the chosen options travel in
     * updatedInput (see [answerAsk]).
     */
    private val asks = ConcurrentHashMap<String, Pending>()

    /**
     * What has just been decided, and by whom.
     *
     * With one client this was not needed: taking an entry out of the map above was itself the whole
     * defence, and an answer that found nothing could only be a stale card. With two it can also be a
     * duplicate - both devices showed the same question and both were pressed - and the difference
     * matters: a stale card's text is worth rescuing as an ordinary message, while a duplicate's would
     * be a stray remark thrown into the conversation.
     */
    private val recentlyResolved = ConcurrentHashMap<String, Long>()

    private data class Pending(
        val sessionId: String,
        val requestId: String,
        val toolName: String,
        val command: String,
    )

    /**
     * The agent asks permission with an incoming control request over the conversation's stream (see
     * ClaudeLaunch.PERMISSION_CHANNEL_FLAG) - the only path by which permissions reach the panel at
     * all.
     *
     * Some questions need no card drawn: a plan and a question with options already have one in the
     * feed, drawn by the tool call itself. Asking a second time over it is pointless - all that is
     * needed is to remember where its buttons' answer should go.
     */
    fun ask(sessionId: String, request: PermissionChannel.ToolPermission) {
        forgetUnanswerable()

        val pending = Pending(
            sessionId = sessionId,
            requestId = request.requestId,
            toolName = request.toolName,
            command = PermissionPrompt.command(request.toolName, request.input),
        )

        if (request.toolName == PLAN_TOOL || request.toolName == ClaudeLaunch.ASK_TOOL) {
            val itemId = request.toolUseId
            if (itemId == null) {
                // Without the call's identifier the card cannot be found in the feed, and so its buttons
                // cannot answer it either - refusing at once is more honest than silently stopping the
                // turn forever.
                thisLogger().warn("${request.toolName} permission without a tool_use_id: nothing to attach it to")
                hub.conversations.answerPermission(sessionId, request.requestId, allow = false, message = CARD_LOST)
                return
            }

            // A question without a single question the feed does not draw (a broken call happens), and
            // then there is nothing to wait for: the permission would hang under a card that does not
            // exist, and the turn would stand until the tab is closed. The agent will survive a refusal:
            // it will ask the same thing as ordinary text.
            if (request.toolName == ClaudeLaunch.ASK_TOOL && !hasQuestions(request.input)) {
                thisLogger().warn("${request.toolName} permission without questions: the feed has no card to answer it")
                hub.conversations.answerPermission(sessionId, request.requestId, allow = false, message = CARD_LOST)
                return
            }

            if (request.toolName == PLAN_TOOL) plans[itemId] = pending else asks[itemId] = pending
            notePending(sessionId)
            return
        }

        channelPermissions[request.requestId] = pending

        hub.broadcast(
            sessionId,
            buildJsonObject {
                put("type", "permission")
                put("id", request.requestId)
                put("sessionId", sessionId.ifEmpty { MAIN_SESSION })
                put("toolName", request.toolName)
                put("target", PermissionPrompt.target(request.toolName, request.input))
                put("command", pending.command)
                // The mode of the conversation that is asking, not the saved default: the two are
                // allowed to disagree - an approved plan frees its own tab from questions without
                // touching the setting (see ClaudeSessions.setPermissionMode). Taken from the setting,
                // the caption would name a mode this tab is not in.
                put(
                    "mode",
                    PermissionModes.resolve(hub.conversations.permissionMode(sessionId) ?: ClaudePreferences.mode),
                )
                // Who raised the question. In "Bypass" and "Auto" no questions are expected at all, and
                // without this line they look like nagging from the panel - see PermissionReason.
                PermissionReason.text(request).takeIf { it.isNotEmpty() }?.let { put("reason", it) }
                // A "do not ask again" rule will not work here - offering it means deceiving: the person
                // will press, the rule will be written, and the question will come back with the next
                // call just like it.
                if (!PermissionReason.rememberable(request)) put("rememberable", false)
                // The asker is a tool inside a subagent - the card belongs in its branch of the feed
                // rather than in the shared conversation.
                request.agentId?.let { put("agentId", it) }
            }.toString(),
        )
    }

    /**
     * The person's answer to a permission card.
     *
     * "Always" goes back in the same answer rather than as a write into the settings by our own hand:
     * the CLI attaches a ready rule to the question and decides where to put it itself - see
     * PermissionChannel.rememberRules. Appending to the settings file behind its back serves nothing:
     * a rule would have to be invented from the command by guesswork, while the CLI parses it exactly
     * and knows which part matters.
     */
    fun decide(id: String, decision: String) {
        val channel = channelPermissions.remove(id) ?: run {
            // Two devices showed one question and both were pressed. The first press already unblocked
            // the turn; the second must change nothing at all.
            if (recentlyResolved.containsKey(id)) return
            thisLogger().info("No permission waiting for a decision: $id")
            return
        }

        remember(id)

        hub.conversations.answerPermission(
            channel.sessionId,
            id,
            allow = decision != "deny",
            remember = decision == "always",
        )

        hub.stats.notePermission(channel.toolName, decision)
        resolved(channel.sessionId, id, decision)
    }

    /**
     * The buttons under a plan. "Approve & run" is permission to leave plan mode: the agent gets "the
     * plan is approved" and goes straight back to work in the same turn. "Keep planning" is a refusal
     * with an explanation: to the agent that is a signal to rework the plan and show it again.
     *
     * Leaving plan mode by itself returns the CLI not to a free hand but to the ordinary "always ask" -
     * and then every next step of an approved plan would run into a permission again, question after
     * question, although the person has already agreed to the plan as a whole. So approval switches the
     * mode on next: the plan card was the one question worth asking.
     *
     * Which mode it switches to depends on where the decision came from. At the desk it is the full
     * "no questions", as it always was. From a phone approval goes to "edits without questions"
     * instead: file edits are exactly what the plan approved, while shell commands and the network
     * still ask - and those questions the phone can answer.
     *
     * The line here is not "a phone may not have that mode" - it may, and `newSession` carries it
     * deliberately (see RemoteCommands). The line is that this decision lands in a conversation
     * somebody may be sitting in front of at the desk, and a button that quietly widened what that
     * conversation is allowed to do would be answering a question nobody there was asked. Starting one
     * of your own in any mode you like is a different act, and it is allowed.
     */
    fun decidePlan(sessionId: String, itemId: String, decision: String, message: String = "", local: Boolean = true) {
        val pending = plans.remove(itemId)?.takeIf { awaited(it) } ?: run {
            if (recentlyResolved.containsKey(itemId)) return

            // The card is older than the present process: the conversation has been restarted since (or
            // this is another tab), and there has long been nobody to answer. A remark about the plan
            // then goes as an ordinary message - losing what the person wrote is worse than answering by
            // the wrong route. It goes into the very tab it was written in: there are many
            // conversations, and someone else's answer in someone else's feed is not a rescue but a
            // second breakage.
            thisLogger().info("No plan waiting for a decision: $itemId")
            if (message.isNotBlank()) hub.prompt(sessionId, message)
            return
        }

        remember(itemId)

        hub.conversations.answerPermission(
            pending.sessionId,
            pending.requestId,
            allow = decision == "approve",
            // What the person wrote while the plan card was alive is their remark: the agent will read
            // exactly that rather than a generic "rework it".
            message = message.ifBlank { KEEP_PLANNING },
        )

        if (decision == "approve") {
            hub.changeMode(pending.sessionId, if (local) PermissionModes.BYPASS else PermissionModes.ACCEPT_EDITS)
        }

        hub.stats.notePlan(decision)
        notePending(pending.sessionId)
        planResolved(pending.sessionId, itemId, decision)
    }

    /**
     * The agent has taken its question back, and there is no longer anything to answer.
     *
     * It arrives over the same channel the question came in on (see PermissionChannel.Incoming.Withdrawn)
     * and happens for real: Stop pressed over a waiting card cancels the question along with the turn.
     * Until this was handled, such a card stayed on screen with live buttons - a press wrote "allowed"
     * into the feed while the agent discarded the answer, and the status line went on saying the
     * conversation was waiting for a person who had nothing left to decide.
     *
     * Which of the three maps holds it is not known from the outside: a withdrawal names the request, not
     * the card. Missing from all three is the ordinary race - the person answered a moment before the
     * agent gave up - and there is nothing to do about it.
     */
    fun withdraw(sessionId: String, requestId: String) {
        channelPermissions.remove(requestId)?.let { pending ->
            resolved(pending.sessionId, requestId, WITHDRAWN)
            return
        }

        cardOf(plans, requestId)?.let { (itemId, pending) ->
            plans.remove(itemId)
            notePending(pending.sessionId)
            planResolved(pending.sessionId, itemId, WITHDRAWN)
            return
        }

        cardOf(asks, requestId)?.let { (itemId, pending) ->
            asks.remove(itemId)
            notePending(pending.sessionId)
            askResolved(pending.sessionId, itemId, WITHDRAWN)
        }
    }

    /** The card a request was waiting under, by the request's own number. */
    private fun cardOf(cards: ConcurrentHashMap<String, Pending>, requestId: String): Pair<String, Pending>? =
        cards.entries.firstOrNull { it.value.requestId == requestId }?.let { it.key to it.value }

    /**
     * An answer to a question with options.
     *
     * It goes back by the same request the question came in: what was chosen is put into `answers`
     * beside the call's original arguments - the key being the question's text, the value the chosen
     * option's label (or a typed-in answer of one's own). The CLI then assembles the tool result out of
     * that itself, and the turn carries on from the same place.
     *
     * The question may be left over from a previous process - then there is nobody to answer, and the
     * answer goes as an ordinary next message: that is how the panel's answer behaved before questions
     * reached the agent at all.
     */
    fun answerAsk(sessionId: String, itemId: String, answers: JsonObject, fallbackText: String) {
        val pending = asks.remove(itemId)?.takeIf { awaited(it) }

        if (pending == null) {
            if (recentlyResolved.containsKey(itemId)) return

            thisLogger().info("No question waiting for an answer: $itemId")
            if (fallbackText.isNotBlank()) hub.prompt(sessionId, fallbackText)
            return
        }

        remember(itemId)

        hub.conversations.answerPermission(
            pending.sessionId,
            pending.requestId,
            allow = true,
            extraInput = buildJsonObject { put("answers", answers) },
        )

        notePending(pending.sessionId)
        askResolved(pending.sessionId, itemId, "answered")
    }

    /**
     * The question was closed with the cross: the person chose no option and will say it in their own
     * words. To the agent that goes as a refusal of its call - that is how it learns there is no point
     * waiting for a choice, and carries on with the turn. Silence would leave it standing on a question
     * that is no longer on screen.
     */
    fun dismissAsk(itemId: String) {
        val pending = asks.remove(itemId)?.takeIf { awaited(it) } ?: return

        remember(itemId)

        hub.conversations.answerPermission(
            pending.sessionId,
            pending.requestId,
            allow = false,
            message = ASK_DISMISSED,
        )

        notePending(pending.sessionId)
        askResolved(pending.sessionId, itemId, "dismissed")
    }

    /**
     * How many questions are being kept.
     *
     * Nothing in the panel needs this: answering a question that has been thrown out looks from outside
     * exactly like answering one that has merely gone stale - which is precisely why the cleanup is safe,
     * and precisely why there is no other way to see that it happened at all (see [forgetUnanswerable]).
     */
    internal fun keptCount(): Int = channelPermissions.size + plans.size + asks.size

    /**
     * The card is gone from everyone's screen, not only from the screen it was pressed on.
     *
     * With one client this message would be pointless - that client had already put the decision into
     * its own feed on the click. With two it is the whole point: the other device is showing a question
     * that has been answered, and its buttons would do nothing at best.
     */
    private fun resolved(sessionId: String, id: String, decision: String) {
        hub.broadcast(
            sessionId,
            buildJsonObject {
                put("type", "permissionResolved")
                put("sessionId", sessionId)
                put("id", id)
                put("decision", decision)
            }.toString(),
        )
    }

    private fun planResolved(sessionId: String, itemId: String, decision: String) {
        hub.broadcast(
            sessionId,
            buildJsonObject {
                put("type", "planResolved")
                put("sessionId", sessionId)
                put("id", itemId)
                put("decision", decision)
            }.toString(),
        )
    }

    private fun askResolved(sessionId: String, itemId: String, outcome: String) {
        hub.broadcast(
            sessionId,
            buildJsonObject {
                put("type", "askResolved")
                put("sessionId", sessionId)
                put("id", itemId)
                put("outcome", outcome)
            }.toString(),
        )
    }

    /**
     * Plans and questions never travel as messages of their own - their cards are drawn by the tool
     * call itself. So the one place that knows a conversation is stopped on one is here, and the
     * snapshot has to be told: a list of sessions on a phone shows "waiting for you" out of it.
     */
    private fun notePending(sessionId: String) {
        hub.notePending(
            sessionId,
            plans = plans.filterValues { it.sessionId == sessionId }.keys.toSet(),
            asks = asks.filterValues { it.sessionId == sessionId }.keys.toSet(),
        )
    }

    private fun remember(id: String) {
        val now = System.currentTimeMillis()
        recentlyResolved[id] = now
        recentlyResolved.values.removeIf { now - it > RESOLVED_MEMORY_MS }
    }

    /**
     * Throw out what nobody can answer any more.
     *
     * These three maps only ever grow: an entry leaves when the person answers, and a great many
     * questions are never answered at all - the tab is closed over them, the conversation is wiped, the
     * process dies. Over a long day in the IDE that piles up for the panel's whole life.
     *
     * Swept by the one question that already decides whether an entry is worth anything - is the
     * conversation still waiting for it (see [awaited]) - rather than by hooks in each of the places
     * that tear a conversation down. One rule instead of several to keep in sync: a hook forgotten in
     * one of those places leaks anyway, and a hook fired in one place too many throws out a live
     * request, which costs the person their answer.
     *
     * Nothing observable changes when an entry goes: [awaited] already sends what the person writes onto
     * a dead card down the ordinary route (see [decidePlan]). Done as each new question arrives, which is
     * also the only moment the maps grow - so what is kept stays bounded by what is genuinely alive.
     */
    private fun forgetUnanswerable() {
        for (map in listOf(channelPermissions, plans, asks)) {
            map.values.removeIf { !awaited(it) }
        }
    }

    /**
     * Whether the question an answer is being placed under is still alive.
     *
     * Records in `plans`/`asks` outlive a process: the card stays in the feed, while the conversation
     * may have been restarted in the meantime (an MCP reconnect, a Stop followed by a turn). The new
     * process knows nothing of the old request and will silently throw the answer away - and the card by
     * then has already switched to "decided", so what the person wrote is lost entirely. So we ask the
     * conversation whether it is still waiting for this answer, and if not, take the same fallback path
     * as for a card without a record: an ordinary message.
     */
    private fun awaited(pending: Pending): Boolean =
        hub.conversations.isAwaitingPermission(pending.sessionId, pending.requestId)

    /**
     * Whether the call holds a single question - exactly the condition by which the feed decides
     * whether to draw a card (see build.ts, AskUserQuestion). The conditions have to match: a card
     * without a wait is just rubbish in the feed, and a wait without a card is a turn stopped dead.
     */
    private fun hasQuestions(input: JsonObject): Boolean =
        (input["questions"] as? JsonArray)?.isNotEmpty() == true

    private companion object {
        /** Leaving plan mode: the very call the buttons in the feed sit under. */
        const val PLAN_TOOL = "ExitPlanMode"

        /** What the agent hears when a question was closed without an option being picked. */
        const val ASK_DISMISSED =
            "The user closed the question without picking an option and will answer in their own words. " +
                "Don't ask it again - wait for their message."

        /** What the agent hears in answer to "Keep planning". */
        const val KEEP_PLANNING = "The user wants to keep planning: refine the plan and show it again."

        const val CARD_LOST = "The panel could not attach this request to its card."

        /**
         * What a card is closed with when nobody decided anything: the agent took the question back
         * itself. The screens know it apart from a decision - a withdrawn plan stays in the feed, while
         * a decided one has done its job and leaves it.
         */
        const val WITHDRAWN = "withdrawn"

        /**
         * How long a decision is remembered as "already taken". Long enough to cover two devices
         * pressing at once and a slow network between them, short enough that the map stays small.
         */
        const val RESOLVED_MEMORY_MS = 60_000L
    }
}

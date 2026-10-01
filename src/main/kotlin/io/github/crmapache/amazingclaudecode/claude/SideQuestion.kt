package io.github.crmapache.amazingclaudecode.claude

import kotlinx.serialization.json.Json
import kotlinx.serialization.json.JsonArray
import kotlinx.serialization.json.JsonElement
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.JsonObjectBuilder
import kotlinx.serialization.json.JsonPrimitive
import kotlinx.serialization.json.addJsonObject
import kotlinx.serialization.json.booleanOrNull
import kotlinx.serialization.json.buildJsonObject
import kotlinx.serialization.json.contentOrNull
import kotlinx.serialization.json.intOrNull
import kotlinx.serialization.json.jsonObject
import kotlinx.serialization.json.longOrNull
import kotlinx.serialization.json.put
import kotlinx.serialization.json.putJsonArray

/**
 * A question asked beside the conversation - the panel's `/btw`.
 *
 * The CLI has a control request for exactly this, `side_question`: it takes the live conversation as
 * context, asks the model once with no tools, and answers without writing a word into the transcript or
 * stopping the turn in progress. It is what a thin client's `/btw` is dispatched as (the command carries
 * `thinClientDispatch: "control-request"` in 2.1.280), while typed into a stream as text the same command
 * only answers "/btw isn't available in this environment".
 *
 * Recorded off live runs on 2.1.280 with the flags the panel launches with:
 * - asked while the conversation is free, nothing comes down the stream but the request's own progress
 *   line and its answer - no `assistant`, no `stream_event`, nothing a turn could be read from;
 * - asked mid-turn, the turn carries on and the answer arrives beside it;
 * - `history`, the earlier exchanges as `{question, response}`, is what makes a follow-up work - the CLI
 *   keeps no thread of its own for a stream (`threadHistory: false`);
 * - a `control_cancel_request` with the same id ends it with the error [CANCELLED];
 * - in a process just resumed from the history, before any turn of its own, it answers from the
 *   transcript it loaded;
 * - the answer is never written into the conversation's file.
 *
 * This object only reads and writes the shapes - the conversation does the asking (see
 * ClaudeSession.askAside).
 */
internal object SideQuestion {

    const val SUBTYPE = "side_question"

    /** The CLI's line about a request it is still working on - "started", or a retry of the API call. */
    const val PROGRESS = "control_request_progress"

    /** The CLI's own words for a cancelled one: the error is the only way its answer says so. */
    const val CANCELLED = "Side question cancelled"

    /**
     * How long one is waited for: the CLI's own bridge waits 660 s (2.1.280), and the panel waits as long.
     *
     * Not the twenty seconds every other control request gets. That figure is for questions the CLI
     * answers out of what it holds; this one is a call to the model over the whole conversation, and on a
     * long one with a large model twenty seconds is an ordinary answer rather than a hung one.
     */
    const val TIMEOUT_SECONDS = 660L

    /** How many earlier exchanges travel with a follow-up, newest kept - each one is context paid for. */
    const val HISTORY_KEPT = 10

    /** The longest question or answer taken from a client: a phone's message is not trusted to be small. */
    const val TEXT_LIMIT = 20_000

    /** One earlier exchange of the same thread, as the CLI wants it back. */
    data class Exchange(val question: String, val response: String, val notice: String? = null)

    sealed interface Answer {
        /** [notice] is the CLI's word about a model that declined and the one that answered instead. */
        data class Answered(val text: String, val notice: String?) : Answer

        /**
         * Came back without an answer of the model's: the CLI's own placeholder - a tool call it refused, an
         * answer cut off, an API error - or nothing at all. [explanation] is that placeholder, when there is
         * one: it says what happened, which "no answer" alone does not.
         */
        data class Empty(val explanation: String?) : Answer

        data object Cancelled : Answer

        data class Failed(val reason: Reason, val message: String) : Answer
    }

    enum class Reason(val wire: String) {
        /** The process went away before answering - stopped, restarted, or crashed. */
        ENDED("ended"),

        /** Nothing came back within [TIMEOUT_SECONDS]. */
        TIMEOUT("timeout"),

        /** The CLI answered with an error of its own - shutting down, a request it would not take. */
        REFUSED("refused"),
    }

    data class Progress(
        val requestId: String,
        val status: String,
        val attempt: Int?,
        val maxRetries: Int?,
        val delayMs: Long?,
        val errorStatus: Int?,
    )

    /** What the request carries besides its subtype. */
    fun request(builder: JsonObjectBuilder, question: String, history: List<Exchange>) {
        builder.put("question", question)
        builder.putJsonArray("history") {
            history.forEach { exchange ->
                addJsonObject {
                    put("question", exchange.question)
                    put("response", exchange.response)
                    exchange.notice?.let { put("fallback_notice", it) }
                }
            }
        }
    }

    /** A success answer's body - `{response, synthetic, refusal_fallback?}`. */
    fun answerOf(response: JsonObject): Answer {
        val text = (response["response"] as? JsonPrimitive)?.contentOrNull?.trim().orEmpty()
        val synthetic = (response["synthetic"] as? JsonPrimitive)?.booleanOrNull == true

        if (text.isEmpty()) return Answer.Empty(null)
        if (synthetic) return Answer.Empty(text)

        val notice = (response["refusal_fallback"] as? JsonObject)
            ?.let { (it["content"] as? JsonPrimitive)?.contentOrNull }
            ?.takeIf { it.isNotBlank() }

        return Answer.Answered(text, notice)
    }

    /**
     * An error answer, or our own giving up, read for what it means to the person.
     *
     * By the words, because words are all either of the two carries: the CLI says "cancelled" only in its
     * error text, and the conversation's control channel reports a timeout and a missing process the same
     * way (see ClaudeSession.control).
     */
    fun failureOf(message: String): Answer = when {
        message == CANCELLED -> Answer.Cancelled
        message == "$SUBTYPE timed out" -> Answer.Failed(Reason.TIMEOUT, message)
        message == NO_SESSION -> Answer.Failed(Reason.ENDED, message)
        else -> Answer.Failed(Reason.REFUSED, message)
    }

    /** What the control channel says when there is no process to ask (see ClaudeSession.control). */
    const val NO_SESSION = "no live session"

    /** Whether a line from the stream is a request's progress rather than an event of the conversation. */
    fun isProgress(line: String): Boolean = line.contains("\"$PROGRESS\"")

    fun progressOf(line: String): Progress? {
        val payload = runCatching { Json.parseToJsonElement(line).jsonObject }.getOrNull() ?: return null
        if ((payload["subtype"] as? JsonPrimitive)?.contentOrNull != PROGRESS) return null

        val requestId = (payload["request_id"] as? JsonPrimitive)?.contentOrNull ?: return null
        val status = (payload["status"] as? JsonPrimitive)?.contentOrNull ?: return null

        return Progress(
            requestId = requestId,
            status = status,
            attempt = (payload["attempt"] as? JsonPrimitive)?.intOrNull,
            maxRetries = (payload["max_retries"] as? JsonPrimitive)?.intOrNull,
            delayMs = (payload["retry_delay_ms"] as? JsonPrimitive)?.longOrNull,
            errorStatus = (payload["error_status"] as? JsonPrimitive)?.intOrNull,
        )
    }

    /**
     * The earlier exchanges a client sent along, cut to what is safe to forward: the newest
     * [HISTORY_KEPT], each field at most [TEXT_LIMIT] long, the malformed ones dropped.
     */
    fun historyOf(element: JsonElement?): List<Exchange> {
        val items = (element as? JsonArray).orEmpty()

        return items.mapNotNull { item ->
            val exchange = item as? JsonObject ?: return@mapNotNull null
            val question = (exchange["question"] as? JsonPrimitive)?.contentOrNull?.take(TEXT_LIMIT)
            val response = (exchange["response"] as? JsonPrimitive)?.contentOrNull?.take(TEXT_LIMIT)
            if (question.isNullOrBlank() || response.isNullOrBlank()) return@mapNotNull null

            val notice = (exchange["notice"] as? JsonPrimitive)?.contentOrNull?.takeIf { it.isNotBlank() }
            Exchange(question, response, notice?.take(TEXT_LIMIT))
        }.takeLast(HISTORY_KEPT)
    }

    /** The answer, as the client that asked is told it. */
    fun answerJson(sessionId: String, id: String, answer: Answer): String = buildJsonObject {
        put("type", "sideAnswer")
        put("sessionId", sessionId)
        put("id", id)
        when (answer) {
            is Answer.Answered -> {
                put("outcome", "answered")
                put("text", answer.text)
                answer.notice?.let { put("notice", it) }
            }
            is Answer.Empty -> {
                put("outcome", "empty")
                answer.explanation?.let { put("text", it) }
            }
            Answer.Cancelled -> put("outcome", "cancelled")
            is Answer.Failed -> {
                put("outcome", "failed")
                put("reason", answer.reason.wire)
                put("message", answer.message)
            }
        }
    }.toString()

    /** A progress line, as the client that asked is told it. */
    fun progressJson(sessionId: String, id: String, progress: Progress): String = buildJsonObject {
        put("type", "sideProgress")
        put("sessionId", sessionId)
        put("id", id)
        put("status", progress.status)
        progress.attempt?.let { put("attempt", it) }
        progress.maxRetries?.let { put("maxRetries", it) }
        progress.delayMs?.let { put("delayMs", it) }
        progress.errorStatus?.let { put("errorStatus", it) }
    }.toString()
}

package io.github.crmapache.amazingclaudecode.voice

import io.github.crmapache.amazingclaudecode.net.IdeHttp
import java.net.URI
import java.net.http.HttpRequest
import java.net.http.HttpResponse
import java.time.Duration
import kotlinx.serialization.json.Json
import kotlinx.serialization.json.contentOrNull
import kotlinx.serialization.json.doubleOrNull
import kotlinx.serialization.json.intOrNull
import kotlinx.serialization.json.jsonArray
import kotlinx.serialization.json.jsonObject
import kotlinx.serialization.json.jsonPrimitive

/**
 * What the key is worth: whether Deepgram accepts it at all, and how much credit is left behind it.
 *
 * The balance is the reason this exists. The whole feature runs on the $200 Deepgram hands out at
 * sign-up, which is hundreds of hours of dictation, so the honest thing is to show how much of it is
 * still there rather than let somebody find out by being cut off mid-sentence.
 *
 * The awkward part is a fact about Deepgram rather than about us: reading a balance needs `billing:read`,
 * which only the owner and admin roles have. A key made with the member role transcribes perfectly and
 * cannot see the balance at all - so that case is a state of its own ([Answer.NoBillingAccess]) and the
 * screen says what it means, instead of showing a failure over a key that works.
 */
internal object DeepgramAccount {

    sealed interface Answer {
        /** The key works, and this is what is left. `units` is Deepgram's own - "usd" for everybody on the free credit. */
        data class Balance(val amount: Double, val units: String) : Answer

        /** The key works and transcribes; it simply may not read the account's money. */
        data object NoBillingAccess : Answer

        /** Deepgram looked at the key and said no. */
        data object Rejected : Answer

        /** Everything else - no network, a proxy, Deepgram itself being down. */
        data class Failed(val reason: String) : Answer
    }

    /** What came back from a request for a short-lived token - see [grant]. */
    sealed interface Grant {
        data class Token(val token: String, val expiresIn: Int) : Grant
        /** Deepgram looked at the key and said no. */
        data object Rejected : Grant
        data object Failed : Grant
    }

    /**
     * Mints a token that expires, for a client that must never hold the key itself (see VoiceGrant).
     *
     * `usage:write` and nothing else: a token from here transcribes and cannot touch the account's own
     * settings, its keys or its members. Blocking, like [check] - both belong on a background thread.
     */
    fun grant(key: String, ttlSeconds: Int): Grant {
        if (key.isBlank()) return Grant.Rejected

        val reply = post("$API/auth/grant", key, """{"ttl_seconds":$ttlSeconds}""")

        return when (reply) {
            is Reply.Refused -> Grant.Rejected
            is Reply.Broken -> Grant.Failed
            is Reply.Ok -> runCatching {
                val body = Json.parseToJsonElement(reply.body).jsonObject
                val token = body["access_token"]?.jsonPrimitive?.contentOrNull ?: return@runCatching null
                val expires = body["expires_in"]?.jsonPrimitive?.intOrNull ?: ttlSeconds
                Grant.Token(token, expires)
            }.getOrNull() ?: Grant.Failed
        }
    }

    /**
     * Asks Deepgram about the key. Blocking: it belongs on a background thread, and every caller here
     * is already on one.
     */
    fun check(key: String): Answer {
        if (key.isBlank()) return Answer.Rejected

        val projects = get("$API/projects", key)
        if (projects is Reply.Refused) return Answer.Rejected
        if (projects is Reply.Broken) return Answer.Failed(projects.reason)

        val body = (projects as Reply.Ok).body

        // A key that lists no project is a key that answers questions about nothing - it still
        // transcribes, and there is no balance to be had.
        val projectId = runCatching {
            Json.parseToJsonElement(body).jsonObject["projects"]?.jsonArray
                ?.firstOrNull()?.jsonObject
                ?.get("project_id")?.jsonPrimitive?.contentOrNull
        }.getOrNull() ?: return Answer.NoBillingAccess

        val balances = get("$API/projects/$projectId/balances", key)

        return when (balances) {
            // The member role: the key is fine, the money is not its business.
            is Reply.Refused -> Answer.NoBillingAccess
            is Reply.Broken -> Answer.Failed(balances.reason)
            is Reply.Ok -> readBalance(balances.body) ?: Answer.NoBillingAccess
        }
    }

    /**
     * The sum of what is left.
     *
     * Summed rather than taken from the first entry: an account can hold several balances at once (the
     * sign-up credit and a top-up, say), and showing one of them would understate what is there. Only
     * balances counted in the same units are added - dollars and enterprise hours are not one number.
     */
    private fun readBalance(body: String): Answer.Balance? = runCatching {
        val entries = Json.parseToJsonElement(body).jsonObject["balances"]?.jsonArray.orEmpty()
        if (entries.isEmpty()) return@runCatching null

        val units = entries.firstNotNullOfOrNull { it.jsonObject["units"]?.jsonPrimitive?.contentOrNull } ?: "usd"

        val amount = entries
            .filter { (it.jsonObject["units"]?.jsonPrimitive?.contentOrNull ?: units) == units }
            .sumOf { it.jsonObject["amount"]?.jsonPrimitive?.doubleOrNull ?: 0.0 }

        Answer.Balance(amount, units)
    }.getOrNull()

    private sealed interface Reply {
        data class Ok(val body: String) : Reply
        /** 401 or 403 - Deepgram understood the question and refused to answer it. */
        data object Refused : Reply
        data class Broken(val reason: String) : Reply
    }

    private fun get(url: String, key: String): Reply = send(HttpRequest.newBuilder(URI(url)).GET(), key)

    private fun post(url: String, key: String, body: String): Reply =
        send(
            HttpRequest.newBuilder(URI(url))
                .header("Content-Type", "application/json")
                .POST(HttpRequest.BodyPublishers.ofString(body)),
            key,
        )

    private fun send(builder: HttpRequest.Builder, key: String): Reply = runCatching {
        val request = builder
            .header("Authorization", "Token $key")
            .header("Accept", "application/json")
            .timeout(Duration.ofSeconds(TIMEOUT_SECONDS))
            .build()

        val response = IdeHttp.shared.send(request, HttpResponse.BodyHandlers.ofString())

        when (response.statusCode()) {
            200 -> Reply.Ok(response.body())
            401, 403 -> Reply.Refused
            else -> Reply.Broken("Deepgram answered ${response.statusCode()}.")
        }
    }.getOrElse { Reply.Broken("Could not reach Deepgram: ${it.message ?: "no answer"}") }

    private const val API = "https://api.deepgram.com/v1"
    private const val TIMEOUT_SECONDS = 15L
}

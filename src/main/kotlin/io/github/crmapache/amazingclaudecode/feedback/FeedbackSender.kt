package io.github.crmapache.amazingclaudecode.feedback

import com.intellij.openapi.diagnostic.thisLogger
import com.intellij.util.concurrency.AppExecutorUtil
import io.github.crmapache.amazingclaudecode.net.IdeHttp
import java.net.URI
import java.net.http.HttpClient
import java.net.http.HttpRequest
import java.net.http.HttpResponse
import java.nio.charset.StandardCharsets
import java.nio.file.Files
import java.time.Duration

/**
 * Posting a piece of feedback to the service that hands it on.
 *
 * This is the plugin's first genuine HTTP request. Everything it did over the network before now went
 * through the relay, and that is a websocket the person had to switch on themselves - so the whole shape
 * of "make a request and read a response" is new here, and it is built out of the same parts that one is:
 * the IDE's proxy settings and the IDE's certificate store (see RemoteAgent.httpClient), because inside a
 * company neither is optional and a plugin that ignores them fails in a way that looks like the server
 * being down.
 *
 * Why the bytes travel from here rather than from the panel: the bridge between the page and the IDE has
 * no size checks and no chunking in this direction, and a message too large to cross it is lost silently -
 * no exception, nothing in the log (see WebviewHost). Twenty megabytes of attachment would be exactly
 * that. So the panel names files by id and the IDE reads them off the disk itself.
 *
 * multipart/form-data assembled by hand, because the JDK has no builder for it, and the bodies are handed
 * over as a list of arrays rather than one joined buffer - the parts are already in memory once and there
 * is no reason for them to be there twice.
 */
internal object FeedbackSender {

    /** What came of it - a sentence for a person, or nothing at all when it worked. */
    data class Outcome(val ok: Boolean, val error: String? = null)

    fun send(
        kind: String,
        text: String,
        email: String,
        /** The versions on one line, gathered by the caller - see FeedbackDesk. */
        environment: String,
        report: String?,
        files: List<FeedbackAttachments.Picked>,
        onDone: (Outcome) -> Unit,
    ) {
        AppExecutorUtil.getAppExecutorService().submit {
            val outcome = runCatching { post(kind, text, email, environment, report, files) }.getOrElse { failure ->
                thisLogger().info("The feedback could not be sent: ${describe(failure)}")
                Outcome(false, "No answer from the feedback service. Check the network and try again.")
            }

            onDone(outcome)
        }
    }

    /**
     * The request itself, apart from the thread it is made on: a test raises a server of its own on this
     * machine, points [URL_PROPERTY] at it and calls this - which is the only way the body assembled by
     * hand below gets checked against something that actually parses multipart.
     */
    internal fun post(
        kind: String,
        text: String,
        email: String,
        environment: String,
        report: String?,
        files: List<FeedbackAttachments.Picked>,
    ): Outcome {
        val boundary = "acc" + java.util.UUID.randomUUID().toString().replace("-", "")
        val body = buildBody(boundary, kind, text, email, environment, report, files)

        val request = HttpRequest.newBuilder(URI(endpoint()))
            .header("content-type", "multipart/form-data; boundary=$boundary")
            /*
             * A shared secret, and it is worth being honest about what it is for. It sits in a plugin
             * published on a marketplace, so anybody who wants it has it - it is not authentication. What
             * it does do is keep the endpoint from answering every scanner that walks the internet trying
             * POSTs at every host, which is the traffic this service would otherwise spend its Telegram
             * quota on.
             */
            .header("x-acc-key", key())
            .timeout(Duration.ofSeconds(REQUEST_TIMEOUT_SECONDS))
            .POST(HttpRequest.BodyPublishers.ofByteArrays(body))
            .build()

        val response = client().send(request, HttpResponse.BodyHandlers.ofString())

        return when (response.statusCode()) {
            in 200..299 -> Outcome(true)
            // The service says which limit was hit; the words it uses are meant for this screen.
            413 -> Outcome(false, "That is too much to send at once. Remove a file and try again.")
            429 -> Outcome(false, "Too many messages in a row. Give it a minute.")
            400 -> Outcome(false, response.body().take(MAX_REASON).ifBlank { "The service refused it." })
            else -> Outcome(false, "The feedback service answered ${response.statusCode()}. Try again later.")
        }
    }

    /**
     * The body, part by part. Text parts first so that whoever reads the request - or a log of it on the
     * way - sees what this is about before megabytes of attachment scroll past.
     */
    private fun buildBody(
        boundary: String,
        kind: String,
        text: String,
        email: String,
        environment: String,
        report: String?,
        files: List<FeedbackAttachments.Picked>,
    ): List<ByteArray> {
        val parts = mutableListOf<ByteArray>()

        fun field(name: String, value: String) {
            parts += header("--$boundary\r\nContent-Disposition: form-data; name=\"$name\"\r\n\r\n")
            parts += value.toByteArray(StandardCharsets.UTF_8)
            parts += header("\r\n")
        }

        fun file(name: String, filename: String, type: String, bytes: ByteArray) {
            parts += header(
                "--$boundary\r\nContent-Disposition: form-data; name=\"$name\"; " +
                    "filename=\"${safeFilename(filename)}\"\r\nContent-Type: $type\r\n\r\n",
            )
            parts += bytes
            parts += header("\r\n")
        }

        field("kind", kind)
        field("text", text)
        field("email", email)
        // The environment again, on its own, so the service can put it in the message's first line without
        // having to parse the report to find it.
        field("environment", environment)

        report?.let { file("report", "report.txt", "text/plain; charset=utf-8", it.toByteArray(StandardCharsets.UTF_8)) }

        files.forEach { picked ->
            val bytes = runCatching { Files.readAllBytes(picked.path) }.getOrNull() ?: return@forEach
            file("file", picked.name, "application/octet-stream", bytes)
        }

        parts += header("--$boundary--\r\n")
        return parts
    }

    /**
     * A name that cannot climb out of a form field: quotes and line breaks in a filename are how a
     * multipart body is talked into carrying headers of somebody else's choosing, and a person can name a
     * file anything at all.
     */
    private fun safeFilename(name: String): String =
        name.replace(Regex("[\\r\\n\"\\\\]"), "_").takeLast(120).ifEmpty { "file" }

    /**
     * A part's own header line.
     *
     * UTF-8, not ASCII. A file name is whatever a person called their file, and half the world's names do
     * not fit in ASCII: written that way, "снимок.png" arrives as a row of question marks, and two files
     * with different non-Latin names arrive indistinguishable from each other. The receiver reads these
     * headers as UTF-8 (see the parser in feedback-service), and the only part that has to stay strictly
     * ASCII is the boundary, which is made of hex digits.
     */
    private fun header(text: String): ByteArray = text.toByteArray(StandardCharsets.UTF_8)

    /** The way out this machine has - the proxy and the certificates the IDE itself uses (see IdeHttp). */
    private val cached: HttpClient by lazy { IdeHttp.client(CONNECT_TIMEOUT_SECONDS) }

    private fun client(): HttpClient = cached

    /**
     * A line for the log out of a failure that frequently has nothing to say for itself.
     *
     * The most ordinary failure here is a name that will not resolve - no network, a proxy that eats DNS,
     * an address whose record has not spread yet - and it is precisely the one that arrives mute: the
     * JDK's client wraps it in a ConnectException with no message, whose cause is another one with no
     * message, and only at the bottom of that chain is there an UnresolvedAddressException, which carries
     * nothing but its own name either. Logging the message alone wrote "could not be sent: null" and left
     * no way to tell a machine with no network from a service answering nonsense - the two failures worth
     * telling apart when somebody says the button does nothing.
     *
     * So the chain is walked: the names of everything in it, and the first thing any of them thought to
     * say. Names only, never a stack - this goes to the IDE's log, which the person may well be reading.
     */
    internal fun describe(failure: Throwable): String {
        val chain = generateSequence(failure) { it.cause.takeIf { cause -> cause !== it } }.take(CAUSE_DEPTH).toList()
        val names = chain.joinToString(" <- ") { it.javaClass.simpleName }
        val said = chain.firstNotNullOfOrNull { it.message?.trim()?.ifEmpty { null } }

        return if (said == null) names else "$names: $said"
    }

    /**
     * Where it goes. Overridable by a system property for the same reason the relay's address is: the
     * whole chain has to be checkable against a service running on this machine, and the published
     * address is not a thing to test against.
     */
    private fun endpoint(): String {
        val custom = System.getProperty(URL_PROPERTY).orEmpty().trim()
        return (custom.ifEmpty { DEFAULT_URL }).trimEnd('/') + "/v1/feedback"
    }

    private fun key(): String = System.getProperty(KEY_PROPERTY).orEmpty().trim().ifEmpty { DEFAULT_KEY }

    const val DEFAULT_URL = "https://feedback.mzpizote.com"

    const val URL_PROPERTY = "acc.feedback.url"

    const val KEY_PROPERTY = "acc.feedback.key"

    private const val DEFAULT_KEY = "HnQPZ_etnqd_waXOq7dR3a6wgeoN1EVn"

    private const val CONNECT_TIMEOUT_SECONDS = 15L

    /** Long enough for twenty megabytes on a hotel connection, short enough to give up rather than hang. */
    private const val REQUEST_TIMEOUT_SECONDS = 120L

    private const val MAX_REASON = 160

    /** Far enough down a chain of causes for the one that means something; a guard against a cycle too. */
    private const val CAUSE_DEPTH = 6
}

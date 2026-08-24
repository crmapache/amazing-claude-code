package io.github.crmapache.amazingclaudecode.remote

import com.intellij.openapi.Disposable
import com.intellij.openapi.diagnostic.thisLogger
import com.intellij.openapi.util.Disposer
import com.sun.net.httpserver.HttpExchange
import com.sun.net.httpserver.HttpServer
import io.github.crmapache.amazingclaudecode.claude.ClaudeSessionHub
import io.github.crmapache.amazingclaudecode.claude.SessionClient
import io.github.crmapache.amazingclaudecode.webview.WebviewResources
import java.io.OutputStream
import java.net.InetAddress
import java.net.InetSocketAddress
import java.net.URI
import java.nio.charset.StandardCharsets
import java.util.UUID
import java.util.concurrent.ConcurrentHashMap
import java.util.concurrent.Executors
import java.util.concurrent.LinkedBlockingQueue
import java.util.concurrent.TimeUnit
import java.util.concurrent.atomic.AtomicInteger
import kotlinx.serialization.json.Json
import kotlinx.serialization.json.jsonObject

/**
 * A second client, on this machine, without a line of network code between them.
 *
 * The point of it is not the channel - that one is thrown away in phase 2, when a relay takes over -
 * but everything that shows up the moment there is more than one client: two answers to one
 * permission, two messages at once, a card that has to go out on every screen rather than the one it
 * was pressed on. Those are far easier to find here, where both sides are a millisecond apart, than
 * across a mobile network.
 *
 * Server-sent events rather than a socket. The JDK ships a WebSocket *client* and no server, and
 * writing one by hand for scaffolding is work spent on the wrong thing; an event stream is three lines
 * and the browser reconnects on its own - which is the very behaviour the relay will need.
 *
 * Off by default and bound to the loopback address, with a token that changes on every start. Even
 * there it is not optional: any page in any browser on this machine can post to a local port.
 */
internal class LocalBridgeServer(
    private val hub: ClaudeSessionHub,
    parentDisposable: Disposable,
) : Disposable {

    private var server: HttpServer? = null

    /** Changes on every start: a token from a previous run should not open the present one. */
    private val token = UUID.randomUUID().toString()

    private val clients = ConcurrentHashMap<String, StreamClient>()

    private val counter = AtomicInteger()

    init {
        Disposer.register(parentDisposable, this)
    }

    /** The address to open in a browser, or null when the port could not be taken. */
    fun start(): String? {
        val started = runCatching {
            // Port zero: the system picks a free one. A fixed port would clash between two open
            // projects, which is exactly the case this exists to test.
            HttpServer.create(InetSocketAddress(InetAddress.getLoopbackAddress(), 0), 0)
        }.getOrElse {
            thisLogger().warn("The local bridge could not take a port", it)
            return null
        }

        started.executor = Executors.newCachedThreadPool()
        started.createContext("/events") { exchange -> serveEvents(exchange) }
        started.createContext("/send") { exchange -> serveSend(exchange) }
        started.createContext("/") { exchange -> serveStatic(exchange) }
        started.start()
        server = started

        val port = started.address.port
        return "http://127.0.0.1:$port/remote.html?token=$token"
    }

    override fun dispose() {
        clients.values.forEach { it.close() }
        clients.clear()
        server?.stop(0)
        server = null
    }

    // --- The stream out ------------------------------------------------------------

    /**
     * One browser page watching the project. It keeps a queue of its own rather than writing straight
     * from whichever thread produced the message: a conversation's stream must never wait on a socket
     * that a page has stopped reading.
     */
    private inner class StreamClient(override val id: String) : SessionClient {
        private val queue = LinkedBlockingQueue<String>(QUEUE_LIMIT)

        @Volatile
        private var open = true

        override fun deliver(messages: List<String>) {
            for (message in messages) {
                // A page that has stopped reading is dropped rather than allowed to hold memory: it will
                // reconnect and be caught up from the journal anyway, which is the whole point of having
                // one.
                if (!queue.offer(message)) {
                    thisLogger().warn("A local client fell behind and was dropped: $id")
                    close()
                    return
                }
            }
        }

        fun close() {
            open = false
            queue.offer(CLOSE)
        }

        fun pump(out: OutputStream) {
            while (open) {
                val message = queue.poll(HEARTBEAT_SECONDS, TimeUnit.SECONDS)

                if (message == null) {
                    // A comment line: it keeps proxies and the browser from calling the stream dead.
                    write(out, ":\n\n")
                    continue
                }

                if (message === CLOSE) return

                write(out, "data: ${message.replace("\n", "")}\n\n")
            }
        }

        private fun write(out: OutputStream, text: String) {
            out.write(text.toByteArray(StandardCharsets.UTF_8))
            out.flush()
        }
    }

    private fun serveEvents(exchange: HttpExchange) {
        if (!authorized(exchange)) return

        // The page names itself, so an answer meant for one page reaches that page (the clipboard, a
        // command's output) rather than whichever stream happens to be first in the map.
        val named = queryValue(exchange.requestURI.query, "client")
        val client = StreamClient(named?.take(64)?.ifBlank { null } ?: "local-${counter.incrementAndGet()}")
        clients[client.id] = client
        hub.register(client)

        exchange.responseHeaders.add("Content-Type", "text/event-stream")
        exchange.responseHeaders.add("Cache-Control", "no-store")
        exchange.sendResponseHeaders(200, 0)

        try {
            // Nothing is handed over here: the page says what it already has once it has mounted, and
            // is caught up then (see the ready message). Sending the feed before that would mean sending
            // the whole of it to a page that only needed the tail.
            exchange.responseBody.use { out -> client.pump(out) }
        } catch (_: Exception) {
            // The page was closed - an ordinary end for a stream, not something to report.
        } finally {
            clients.remove(client.id)
            hub.detach(client.id)
            exchange.close()
        }
    }

    // --- The requests in -------------------------------------------------------------

    private fun serveSend(exchange: HttpExchange) {
        if (!authorized(exchange)) return

        val body = exchange.requestBody.readBytes().toString(StandardCharsets.UTF_8)
        val payload = runCatching { Json.parseToJsonElement(body).jsonObject }.getOrNull()

        if (payload == null) {
            respond(exchange, 400, "text/plain", "Malformed message".toByteArray())
            return
        }

        // Whoever asked, so an answer meant for one page goes to that page (the clipboard, a command's
        // output). The stream carries no identity of its own, so the page names itself.
        val clientId = exchange.requestHeaders.getFirst("x-acc-client") ?: clients.keys.firstOrNull().orEmpty()


        if (!hub.commands.handle(clientId, payload)) {
            thisLogger().info("The local bridge ignored a message it does not handle: $body")
        }

        respond(exchange, 204, "text/plain", ByteArray(0))
    }

    // --- The page itself --------------------------------------------------------------

    private fun serveStatic(exchange: HttpExchange) {
        val path = runCatching { URI(exchange.requestURI.toString()).path }.getOrNull().orEmpty()
            .trimStart('/')
            .ifEmpty { "remote.html" }

        val resource = WebviewResources.open(path)

        if (resource == null) {
            respond(exchange, 404, "text/plain", "Not found".toByteArray())
            return
        }

        val bytes = resource.use { it.readBytes() }
        respond(exchange, 200, WebviewResources.mimeTypeOf(path), bytes)
    }

    /**
     * The token, and where the request came from.
     *
     * The origin check matters as much as the token: a page on the open internet can post to a
     * loopback port from the browser you have open beside the IDE, and the token is in the address bar
     * of a page it does not control - but a form post needs no token to be read, only to be sent.
     */
    private fun authorized(exchange: HttpExchange): Boolean {
        val provided = exchange.requestHeaders.getFirst("x-acc-token")
            ?: queryToken(exchange.requestURI.query)

        if (provided != token) {
            respond(exchange, 403, "text/plain", "Forbidden".toByteArray())
            return false
        }

        val origin = exchange.requestHeaders.getFirst("Origin")
        if (origin != null && !origin.startsWith("http://127.0.0.1:") && !origin.startsWith("http://localhost:")) {
            respond(exchange, 403, "text/plain", "Forbidden origin".toByteArray())
            return false
        }

        return true
    }

    private fun queryToken(query: String?): String? = queryValue(query, "token")

    private fun queryValue(query: String?, name: String): String? = query
        ?.split('&')
        ?.firstOrNull { it.startsWith("$name=") }
        ?.removePrefix("$name=")
        ?.let { java.net.URLDecoder.decode(it, StandardCharsets.UTF_8) }

    private fun respond(exchange: HttpExchange, code: Int, contentType: String, body: ByteArray) {
        exchange.responseHeaders.add("Content-Type", contentType)
        exchange.sendResponseHeaders(code, body.size.toLong())
        exchange.responseBody.use { it.write(body) }
    }

    companion object {
        /** Turned on for a run of the sandbox, never for a person's IDE - see ClaudeSessionHub. */
        const val ENABLED_PROPERTY = "acc.localBridge"

        private const val QUEUE_LIMIT = 4096

        /** How long a silent stream waits before sending a comment to prove it is alive. */
        private const val HEARTBEAT_SECONDS = 20L

        /** A sentinel rather than a flag: it wakes the queue's blocking take as well as marking the end. */
        private val CLOSE = String("close".toCharArray())
    }
}

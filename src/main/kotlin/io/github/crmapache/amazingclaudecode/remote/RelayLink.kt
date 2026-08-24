package io.github.crmapache.amazingclaudecode.remote

import com.intellij.openapi.diagnostic.thisLogger
import com.intellij.util.concurrency.AppExecutorUtil
import java.net.URI
import java.net.http.HttpClient
import java.net.http.WebSocket
import java.nio.ByteBuffer
import java.time.Duration
import java.util.concurrent.CompletionStage
import java.util.concurrent.TimeUnit
import java.util.concurrent.atomic.AtomicBoolean
import java.util.concurrent.atomic.AtomicReference

/**
 * The one connection out to the relay, and everything that keeps it standing.
 *
 * Outgoing on purpose: an IDE sits behind a home router, and nothing from the outside can reach it.
 * Every remote arrangement that works works this way round - the machine dials out and holds the line.
 *
 * One socket per IDE process, with every project multiplexed inside it. The alternative - a connection
 * per project - would multiply the reconnect storms by the number of windows someone happens to have
 * open, for no gain at all: the relay routes by address, and the address is the process's.
 *
 * The client is the JDK's own. Adding a websocket library to a plugin's archive risks a class clash
 * with the IDE itself and buys nothing here.
 */
internal class RelayLink(
    private val address: ByteArray,
    private val relayUrl: String,
    private val outbox: RemoteOutbox,
    /** Frames arriving from the other side, already parsed down to the envelope. */
    private val onFrame: (Frame.Envelope) -> Unit,
    private val onState: (State) -> Unit,
    private val clientOf: () -> HttpClient,
) {

    enum class State {
        /** Nothing has been tried yet, or the feature is off. */
        IDLE,

        CONNECTING,

        CONNECTED,

        /** The line dropped and will be tried again - the ordinary weather of a laptop and a train. */
        RECONNECTING,

        /** The relay is up but unwell, or unreachable. Different words for a person than the above. */
        RELAY_DOWN,

        /** A refusal on the merits: the version is not spoken, or another instance took this address. */
        REFUSED,
    }

    private val backoff = Backoff()

    private val socket = AtomicReference<WebSocket?>(null)

    private val running = AtomicBoolean(false)

    /** The last frame received: the heartbeat is measured from it rather than from a timer of its own. */
    @Volatile
    private var lastHeard = 0L

    /**
     * Frames arrive in pieces. A websocket message can be split across several callbacks, and putting
     * an envelope together out of them is the receiver's job, not the sender's.
     */
    private var partial = ByteArray(0)

    @Volatile
    var state: State = State.IDLE
        private set

    fun start() {
        if (!running.compareAndSet(false, true)) return
        connect()
    }

    fun stop() {
        running.set(false)
        socket.getAndSet(null)?.sendClose(WebSocket.NORMAL_CLOSURE, "stopping")
        move(State.IDLE)
    }

    /**
     * Send what is waiting.
     *
     * The JDK's client refuses a second send before the first has completed - "Send pending" - so
     * everything goes through this one place rather than from whichever thread produced the frame.
     */
    @Synchronized
    fun flush(resyncFrames: () -> List<ByteArray>) {
        val live = socket.get() ?: return

        for (frame in outbox.drain(resyncFrames)) {
            runCatching { live.sendBinary(ByteBuffer.wrap(frame), true).join() }
                .onFailure {
                    thisLogger().info("The relay would not take a frame: ${it.message}")
                    return
                }
        }
    }

    /**
     * The line has been quiet for too long. The JDK's client answers a ping but never sends one, so
     * this is what tells a sleeping socket from a quiet one - after a laptop wakes, the socket is
     * usually dead and nothing has said so.
     */
    fun checkAlive(now: Long) {
        val live = socket.get() ?: return

        // The JDK's client answers a ping but never sends one, and a relay with nothing to say says
        // nothing - so without this the line would look silent while being perfectly healthy, and get
        // torn down and rebuilt every minute.
        runCatching { live.sendPing(ByteBuffer.allocate(0)) }

        if (lastHeard == 0L || now - lastHeard < SILENCE_MS) return

        thisLogger().info("The relay has been silent for too long - reconnecting")
        runCatching { live.abort() }
        socket.set(null)
        retry(Backoff.Failure.NETWORK)
    }

    private fun connect() {
        if (!running.get()) return

        move(if (backoff.attempts() == 0) State.CONNECTING else state)

        val url = "${relayUrl.trimEnd('/')}/v1/agent?id=${Frame.encodeAddress(address)}"

        runCatching {
            clientOf().newWebSocketBuilder()
                .connectTimeout(Duration.ofSeconds(CONNECT_TIMEOUT_SECONDS))
                .buildAsync(URI(url), Listener())
                .whenComplete { connected, error ->
                    if (error != null) {
                        thisLogger().info("The relay would not connect: ${error.message}")
                        retry(classify(error))
                        return@whenComplete
                    }

                    socket.set(connected)
                    lastHeard = System.currentTimeMillis()
                    backoff.succeeded()
                    move(State.CONNECTED)
                }
        }.onFailure { retry(Backoff.Failure.NETWORK) }
    }

    private fun retry(failure: Backoff.Failure) {
        if (!running.get()) return

        val pause = backoff.next(failure)

        if (pause == null) {
            // Trying again would change nothing: the relay looked at the request and said no.
            move(State.REFUSED)
            running.set(false)
            return
        }

        move(if (failure == Backoff.Failure.RELAY) State.RELAY_DOWN else State.RECONNECTING)

        AppExecutorUtil.getAppScheduledExecutorService()
            .schedule({ connect() }, pause, TimeUnit.MILLISECONDS)
    }

    /**
     * What kind of failure this was, as far as an exception says. A refusal on the merits arrives as a
     * close code rather than as an exception, so this side of it is mostly "the network".
     */
    private fun classify(error: Throwable): Backoff.Failure {
        val message = error.message.orEmpty()

        return when {
            message.contains("503") || message.contains("502") || message.contains("500") ->
                Backoff.Failure.RELAY
            else -> Backoff.Failure.NETWORK
        }
    }

    private fun move(next: State) {
        if (state == next) return
        state = next
        onState(next)
    }

    private inner class Listener : WebSocket.Listener {

        override fun onOpen(webSocket: WebSocket) {
            webSocket.request(1)
        }

        override fun onBinary(webSocket: WebSocket, data: ByteBuffer, last: Boolean): CompletionStage<*>? {
            lastHeard = System.currentTimeMillis()

            val chunk = ByteArray(data.remaining()).also { data.get(it) }
            partial = if (partial.isEmpty()) chunk else partial + chunk

            if (last) {
                val whole = partial
                partial = ByteArray(0)

                runCatching { Frame.parse(whole, MAX_FRAME_BYTES) }
                    .onSuccess(onFrame)
                    // The reason, never the frame: a malformed envelope is exactly where the bytes get
                    // attached "just to see", and they are not ours to write down.
                    .onFailure { thisLogger().info("A frame from the relay could not be read: ${it.message}") }
            }

            webSocket.request(1)
            return null
        }

        override fun onPong(webSocket: WebSocket, message: ByteBuffer): CompletionStage<*>? {
            lastHeard = System.currentTimeMillis()
            webSocket.request(1)
            return null
        }

        override fun onClose(webSocket: WebSocket, statusCode: Int, reason: String): CompletionStage<*>? {
            socket.set(null)
            thisLogger().info("The relay closed the line: $statusCode $reason")
            retry(backoff.classify(statusCode, hadHttpResponse = false))
            return null
        }

        override fun onError(webSocket: WebSocket, error: Throwable) {
            socket.set(null)
            thisLogger().info("The line to the relay failed: ${error.message}")
            retry(classify(error))
        }
    }

    companion object {
        private const val CONNECT_TIMEOUT_SECONDS = 15L

        /** Past this much silence the line is treated as dead - see [checkAlive]. */
        const val SILENCE_MS = 45_000L

        /** The relay's own ceiling is higher; ours is what we are willing to take in. */
        const val MAX_FRAME_BYTES = 256 * 1024
    }
}

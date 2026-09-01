package io.github.crmapache.amazingclaudecode.voice

import com.intellij.openapi.diagnostic.thisLogger
import com.intellij.util.concurrency.AppExecutorUtil
import io.github.crmapache.amazingclaudecode.net.IdeHttp
import java.net.URI
import java.net.http.WebSocket
import java.nio.ByteBuffer
import java.time.Duration
import java.util.concurrent.CompletionStage
import java.util.concurrent.ExecutorService
import java.util.concurrent.TimeUnit
import java.util.concurrent.atomic.AtomicBoolean
import kotlinx.serialization.json.Json
import kotlinx.serialization.json.booleanOrNull
import kotlinx.serialization.json.contentOrNull
import kotlinx.serialization.json.jsonArray
import kotlinx.serialization.json.jsonObject
import kotlinx.serialization.json.jsonPrimitive

/**
 * Live transcription over Deepgram's websocket. Wiring only: open, feed audio, ask for the tail, hand
 * the words on. It knows nothing about dictations, the input field or the settings - that is
 * [VoiceDictation].
 *
 * A socket rather than one request with a file at the end, and the difference is where the waiting
 * happens. A file is posted once the person has stopped talking, so the connection, the upload and the
 * whole transcription are paid for while they sit looking at a spinner. A socket opens as the recording
 * starts, the speech flows into it as it is spoken, and letting go of the key leaves only the tail to
 * count - measured next door in notastream at 135 ms against 0.8-1.4 s for the batch route.
 *
 * The key travels as an `Authorization` header, which is the documented form and is available here
 * precisely because this is not a browser: a page's WebSocket cannot set headers at all, which is why
 * the same feature in an Electron app had to go looking for an undocumented subprotocol.
 *
 * The phone holds the same conversation and holds it separately (webview/src/mobile/dictation.ts): one
 * side is Kotlin in the IDE, the other a page in somebody's hand, and there is no code between them. So
 * this is the case of Frame.kt and frame.ts - the query parameters, the shape of an answer and the three
 * timings below are kept the same by discipline, and a change here is a change there. Nothing breaks
 * when they drift: the phone simply transcribes a little differently from the desk, which is the kind of
 * difference nobody reports and nobody finds.
 */
internal class DeepgramStream(
    private val key: String,
    private val language: String,
    private val sampleRate: Int,
    /** The phrase as it is being said - replaced by the next one, never kept. */
    private val onInterim: (String) -> Unit,
    /** A phrase Deepgram has settled on. This is what reaches the input field. */
    private val onFinal: (String) -> Unit,
    private val onError: (String) -> Unit,
    /** The tail has been counted and the socket is shut - nothing more is coming. */
    private val onDone: () -> Unit,
) {

    private val dead = AtomicBoolean(false)
    private val finishing = AtomicBoolean(false)
    private val done = AtomicBoolean(false)

    /**
     * The socket and the chunks still waiting for it, and nothing else.
     *
     * Two rules hold under this monitor and both of them are load-bearing: nothing waits on the network
     * while it is held, and nothing calls back out from under it. It is taken on the microphone's reading
     * thread and on the interface's, and without those rules the two meet head on - one holding this and
     * blocked in a send, the other holding [VoiceDictation]'s and waiting for this one. That is an IDE
     * frozen until the process is killed, and all it takes is a network dropping at the moment a key is
     * let go.
     */
    private val gate = Any()

    private var socket: WebSocket? = null

    /** Speech starts before the handshake finishes, and those first words are not thrown away. */
    private val queued = mutableListOf<ByteArray>()
    private var queuedBytes = 0

    /**
     * The speech ended before the handshake did - the tail is asked for the moment the socket lands.
     *
     * A key tapped rather than held is a real press and an ordinary one: a couple of hundred milliseconds
     * is less than the handshake takes on any network, so [finish] arrived with no socket to finish. It
     * used to call that a failure, and the panel said the network was down over a connection that was
     * about to open perfectly well.
     */
    private var finalizeOnOpen = false

    /**
     * Whether any audio has been handed over at all.
     *
     * A dictation that recorded nothing has no tail to count, so it is shut rather than finalized: asking
     * Deepgram for the end of a phrase that was never spoken means waiting out the whole tail timeout with
     * a lit microphone button for an answer that cannot come.
     */
    private var heard = false

    /**
     * The one thread allowed to wait for a send.
     *
     * One of them because the JDK's client refuses a second send while the first is in flight, so every
     * chunk still goes through a single place; a thread of its own because whoever hands a chunk over must
     * not wait for the network - the reader has a line to empty before it overruns and the interface has
     * an IDE to draw. Sends leave in the order they were handed over, which is what keeps the queued
     * opening of a phrase in front of whatever was said after it.
     */
    private val sends: ExecutorService =
        AppExecutorUtil.createBoundedApplicationPoolExecutor("acc-deepgram", 1)

    fun open() {
        val url = buildString {
            append("wss://api.deepgram.com/v1/listen")
            append("?model=").append(MODEL)
            append("&language=").append(language)
            append("&encoding=linear16")
            append("&sample_rate=").append(sampleRate)
            append("&channels=1")
            // Punctuation, numerals and the rest of what turns a stream of words into a sentence.
            append("&smart_format=true")
            // Asked for, unlike in a tool that only shows the finished text: here the words appear in
            // the field as they are spoken, and the interim ones are what makes that visible.
            append("&interim_results=true")
        }

        runCatching {
            IdeHttp.shared.newWebSocketBuilder()
                .header("Authorization", "Token $key")
                .connectTimeout(Duration.ofMillis(OPEN_TIMEOUT_MS))
                .buildAsync(URI(url), Listener())
                .whenComplete { connected, error ->
                    if (error != null) {
                        die(reasonFor(error))
                        return@whenComplete
                    }

                    adopt(connected)
                }
        }.onFailure { die(reasonFor(it)) }
    }

    /**
     * The handshake landed: publish the socket and empty the queue into it, both at once.
     *
     * Both halves of that were wrong separately. Published first and flushed after, the next chunk of
     * speech could overtake the two seconds the queue was holding, and Deepgram transcribed the middle of
     * a phrase before its beginning - the one thing the queue exists to prevent. And a dictation thrown
     * away while the handshake was still in flight found no socket to abort, so the speech that had just
     * been discarded was sent anyway and its transcript arrived in the next dictation's draft.
     */
    private fun adopt(connected: WebSocket) {
        // Three answers rather than two: taken and idle, taken and already over, or not wanted at all.
        val tail = synchronized(gate) {
            if (dead.get()) {
                null
            } else {
                socket = connected
                for (chunk in queued) binary(connected, chunk)
                queued.clear()
                queuedBytes = 0
                finalizeOnOpen
            }
        }

        when (tail) {
            null -> runCatching { connected.abort() }
            true -> askForTail(connected)
            false -> Unit
        }
    }

    /**
     * Hands a chunk of audio over, or keeps it until the socket is up.
     *
     * Never blocks: what the microphone reads goes onto the sending thread and the reader goes straight
     * back to the line. A send that waited here would hold the line's half-second of buffer hostage to
     * the network, and hold this monitor while it did.
     */
    fun push(audio: ByteArray) {
        if (dead.get() || finishing.get()) return

        synchronized(gate) {
            heard = true

            val live = socket
            if (live == null) {
                // A few seconds at most, and only until the handshake lands - past that the socket is
                // considered failed anyway.
                if (queuedBytes + audio.size <= QUEUE_LIMIT_BYTES) {
                    queued.add(audio)
                    queuedBytes += audio.size
                }
                return
            }

            binary(live, audio)
        }
    }

    /**
     * The speech is over: ask Deepgram to count what it still holds, then close.
     *
     * `Finalize` does not promise a single message back - with speech left over it may answer with
     * several final pieces, and only the true last one carries `from_finalize`, which the documentation
     * says may be missing entirely when the tail is short. So the tail is taken as "nothing more for a
     * moment" rather than as a flag, with a ceiling over the whole wait.
     */
    fun finish() {
        if (dead.get() || !finishing.compareAndSet(false, true)) return

        // Nothing was ever recorded - a key touched and let go. There is no tail to count, so the socket
        // is shut rather than asked, whether it has finished opening or not.
        if (!synchronized(gate) { heard }) {
            close()
            return
        }

        val live = synchronized(gate) {
            // Still connecting: it is adopt() that asks, the moment the socket lands.
            if (socket == null) finalizeOnOpen = true
            socket
        }

        live?.let { askForTail(it) }
    }

    /** Ask Deepgram for what it still holds, and shut once it has had its moment to answer. */
    private fun askForTail(live: WebSocket) {
        offer { runCatching { live.sendText(FINALIZE, true).join() }.onFailure { die(reasonFor(it)) } }
        schedule(FINAL_TIMEOUT_MS) { close() }
    }

    /** The dictation was thrown away - nobody is waiting for the words. */
    fun abort() {
        dead.set(true)
        release()?.let { runCatching { it.abort() } }
        finished()
    }

    private fun close() {
        if (dead.getAndSet(true)) return

        release()?.let { live ->
            offer {
                runCatching {
                    live.sendText(CLOSE_STREAM, true).join()
                    live.sendClose(WebSocket.NORMAL_CLOSURE, "done")
                }
            }
        }

        finished()
    }

    private fun die(reason: String) {
        if (dead.getAndSet(true)) return

        release()?.let { runCatching { it.abort() } }
        onError(reason)
        finished()
    }

    /** Lets go of the socket and of anything still waiting for it, and hands the socket back. */
    private fun release(): WebSocket? = synchronized(gate) {
        val live = socket
        socket = null
        finalizeOnOpen = false
        queued.clear()
        queuedBytes = 0
        live
    }

    private fun binary(live: WebSocket, audio: ByteArray) = offer {
        if (dead.get()) return@offer

        runCatching { live.sendBinary(ByteBuffer.wrap(audio), true).join() }
            .onFailure { die(reasonFor(it)) }
    }

    /** A send, handed to the thread that is allowed to wait for it. */
    private fun offer(action: () -> Unit) {
        // Rejected once the stream is over and the executor has been shut down, which is not an error:
        // there is nothing left that anybody is waiting to hear.
        runCatching { sends.execute { runCatching(action) } }
    }

    /** Whoever is waiting hears exactly once, whichever way this ended. */
    private fun finished() {
        if (!done.compareAndSet(false, true)) return

        onDone()
        // Whatever has already been handed over still goes out - a shutdown refuses new work, it does
        // not throw away the close frame that was queued a line ago.
        runCatching { sends.shutdown() }
    }

    private fun schedule(delayMs: Long, action: () -> Unit) {
        AppExecutorUtil.getAppScheduledExecutorService()
            .schedule({ runCatching(action) }, delayMs, TimeUnit.MILLISECONDS)
    }

    /**
     * What went wrong, as a word the panel can translate.
     *
     * A code rather than a sentence, because the sentence belongs on the other side: the panel speaks
     * every language the panel has and this one does not (see webview/src/i18n). The detail goes to the log, where it
     * is read by whoever is debugging rather than by whoever is dictating.
     *
     * The key being wrong is the one failure worth telling apart: it is the common one, it happens on the
     * very first attempt, and "the connection failed" would send somebody looking at their network
     * instead of at the field they have just pasted a key into.
     */
    private fun reasonFor(error: Throwable): String {
        val message = error.message.orEmpty()
        thisLogger().info("Deepgram would not talk: $message")

        return if (message.contains("401") || message.contains("403")) KEY_REFUSED else UNREACHABLE
    }

    private inner class Listener : WebSocket.Listener {

        /** A message can arrive split across callbacks - the pieces are ours to put together. */
        private val partial = StringBuilder()

        override fun onOpen(webSocket: WebSocket) {
            webSocket.request(1)
        }

        override fun onText(webSocket: WebSocket, data: CharSequence, last: Boolean): CompletionStage<*>? {
            partial.append(data)

            if (last) {
                val whole = partial.toString()
                partial.setLength(0)
                runCatching { handle(whole) }
                    .onFailure { thisLogger().info("Deepgram sent something unreadable: ${it.message}") }
            }

            webSocket.request(1)
            return null
        }

        override fun onError(webSocket: WebSocket, error: Throwable) {
            die(reasonFor(error))
        }

        override fun onClose(webSocket: WebSocket, statusCode: Int, reason: String): CompletionStage<*>? {
            // A close after we asked for one is the end of the job; any other is the end of the dictation.
            if (finishing.get()) close() else die(REFUSED)
            return null
        }

        private fun handle(text: String) {
            val payload = Json.parseToJsonElement(text).jsonObject

            when (payload["type"]?.jsonPrimitive?.contentOrNull) {
                "Results" -> results(payload)
                // Deepgram's own complaint. The description goes to the log; the panel is told which
                // kind of failure this was and says so in its own language.
                "Error" -> {
                    thisLogger().info("Deepgram reported: ${payload["description"]?.jsonPrimitive?.contentOrNull}")
                    die(REFUSED)
                }
                else -> Unit
            }
        }

        private fun results(payload: kotlinx.serialization.json.JsonObject) {
            // A stream nobody is waiting for any more: the words belong to a dictation that was thrown
            // away, and putting them anywhere would put them in the next one's draft.
            if (dead.get()) return

            val transcript = payload["channel"]?.jsonObject
                ?.get("alternatives")?.jsonArray
                ?.firstOrNull()?.jsonObject
                ?.get("transcript")?.jsonPrimitive?.contentOrNull
                .orEmpty()

            val isFinal = payload["is_final"]?.jsonPrimitive?.booleanOrNull == true

            if (!isFinal) {
                onInterim(transcript)
                return
            }

            // A final piece can be empty - a pause Deepgram decided was the end of a phrase. There is
            // nothing to put in the field, but the interim tail it replaces has to go.
            onInterim("")
            if (transcript.isNotBlank()) onFinal(transcript)

            // Past `Finalize` this is the tail: give it a moment for a second piece and then shut.
            if (finishing.get()) schedule(FINALIZE_QUIET_MS) { close() }
        }
    }

    companion object {

        /**
         * Nova-3 covers the whole language catalogue, is faster and cheaper than Nova-2, and there is
         * nobody left to choose between them for: the screen offers a language, not a model.
         */
        const val MODEL = "nova-3"

        /** What `language=multi` is written as - see VoiceLanguages. */
        const val MULTILINGUAL = "multi"

        /**
         * The three ways this fails, as codes the panel turns into sentences of its own.
         *
         * They are the plugin's vocabulary rather than Deepgram's: what a person can do about it is the
         * only thing that separates them - fix the key, look at the network, or try again later.
         */
        const val KEY_REFUSED = "key"
        const val UNREACHABLE = "network"
        const val REFUSED = "deepgram"

        private const val FINALIZE = """{"type":"Finalize"}"""
        private const val CLOSE_STREAM = """{"type":"CloseStream"}"""

        /** Measured next door at 135 ms; this is that with room for a bad day. */
        private const val FINAL_TIMEOUT_MS = 1_500L

        /** Nothing more for this long after a piece means that piece was the last. */
        private const val FINALIZE_QUIET_MS = 150L

        private const val OPEN_TIMEOUT_MS = 4_000L

        /** About two seconds of speech at the highest rate we open at - the handshake is never longer. */
        private const val QUEUE_LIMIT_BYTES = 200_000
    }
}

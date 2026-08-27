package io.github.crmapache.amazingclaudecode.feedback

import com.sun.net.httpserver.HttpServer
import java.net.InetSocketAddress
import java.nio.charset.StandardCharsets
import java.nio.file.Files
import kotlin.test.AfterTest
import kotlin.test.Test
import kotlin.test.assertContains
import kotlin.test.assertEquals
import kotlin.test.assertFalse
import kotlin.test.assertTrue

/**
 * The one request this plugin makes of the internet, against a real server on this machine.
 *
 * The body is multipart assembled by hand - there is no builder for it in the JDK - and a body assembled
 * by hand is wrong in ways that only show up at the other end: a missing CRLF, a boundary that appears
 * inside a file, a filename with a quote in it that turns the rest of the request into headers. None of
 * that can be caught by reading the code, so here the request is genuinely sent and genuinely read.
 */
class FeedbackSenderTest {

    private var server: HttpServer? = null

    @AfterTest
    fun stop() {
        server?.stop(0)
        server = null
        System.clearProperty(FeedbackSender.URL_PROPERTY)
        System.clearProperty(FeedbackSender.KEY_PROPERTY)
    }

    /** A server that keeps whatever arrives and answers with the code it was told to. */
    private fun listen(status: Int = 204, body: String = ""): Received {
        val received = Received()
        val http = HttpServer.create(InetSocketAddress("127.0.0.1", 0), 0)

        http.createContext("/v1/feedback") { exchange ->
            received.contentType = exchange.requestHeaders.getFirst("content-type").orEmpty()
            received.key = exchange.requestHeaders.getFirst("x-acc-key").orEmpty()
            received.bytes = exchange.requestBody.readAllBytes()

            val answer = body.toByteArray(StandardCharsets.UTF_8)
            exchange.sendResponseHeaders(status, if (answer.isEmpty()) -1 else answer.size.toLong())
            if (answer.isNotEmpty()) exchange.responseBody.use { it.write(answer) }
            exchange.close()
        }

        http.start()
        server = http
        System.setProperty(FeedbackSender.URL_PROPERTY, "http://127.0.0.1:${http.address.port}")

        return received
    }

    class Received {
        var contentType: String = ""
        var key: String = ""
        var bytes: ByteArray = ByteArray(0)

        val text: String get() = String(bytes, StandardCharsets.UTF_8)
    }

    @Test
    fun `a message with a file arrives as a multipart body that holds all of it`() {
        val received = listen()
        val directory = Files.createTempDirectory("acc-send")
        val file = directory.resolve("shot.png")
        Files.write(file, byteArrayOf(1, 2, 3, 4))

        val outcome = FeedbackSender.post(
            kind = "bug",
            text = "the panel hangs on reopening a tab",
            email = "you@example.com",
            environment = "Amazing Claude Code 9.9.9 · WebStorm 2026.2",
            report = "Amazing Claude Code 9.9.9\n+0.4s Read ok",
            files = listOf(FeedbackAttachments.Picked(id = "a1", name = "shot.png", bytes = 4, path = file)),
        )

        assertTrue(outcome.ok)
        assertContains(received.contentType, "multipart/form-data; boundary=")

        val body = received.text
        assertContains(body, """name="kind"""")
        assertContains(body, "bug")
        assertContains(body, "the panel hangs on reopening a tab")
        assertContains(body, "you@example.com")
        assertContains(body, """filename="report.txt"""")
        assertContains(body, "Amazing Claude Code 9.9.9")
        assertContains(body, """name="file"; filename="shot.png"""")

        // Five parts - kind, text, email, environment, report, file - and the delimiter that closes them.
        val boundary = received.contentType.substringAfter("boundary=")
        assertEquals(7, body.split("--$boundary").size - 1)
        assertTrue(body.endsWith("--$boundary--\r\n"))
    }

    @Test
    fun `the report is left out entirely when the switch was off`() {
        val received = listen()

        FeedbackSender.post(
            kind = "idea",
            text = "a thought",
            email = "",
            environment = "",
            report = null,
            files = emptyList(),
        )

        assertFalse(received.text.contains("report.txt"))
        assertContains(received.text, "a thought")
    }

    @Test
    fun `a filename cannot smuggle headers of its own into the body`() {
        val received = listen()
        val directory = Files.createTempDirectory("acc-send")
        // The oldest trick against a hand-written multipart body: close the filename, then write a header.
        val hostile = "a\";\r\nContent-Type: text/html\r\n\r\n<script>.png"
        val file = directory.resolve("hostile.png")
        Files.write(file, byteArrayOf(9))

        FeedbackSender.post(
            kind = "bug",
            text = "look at this",
            email = "",
            environment = "",
            report = null,
            files = listOf(FeedbackAttachments.Picked(id = "a1", name = hostile, bytes = 1, path = file)),
        )

        val body = received.text

        // The name survives as a name - flattened, on one line, inside its own quotes. What it must not
        // do is become structure: no extra header line, and no extra part.
        val headers = body.split("\r\n").filter { it.startsWith("Content-Disposition") }
        assertEquals(5, headers.size, "kind, text, email, environment and the one file")
        assertTrue(headers.last().endsWith(".png\""), "the filename should end where it is closed")
        assertFalse(body.contains("\r\nContent-Type: text/html"), "a filename must not become a header")
    }

    @Test
    fun `a file called something other than English keeps its name`() {
        val received = listen()
        val directory = Files.createTempDirectory("acc-send")
        val file = directory.resolve("shot.png")
        Files.write(file, byteArrayOf(1))

        FeedbackSender.post(
            kind = "bug",
            text = "look at this",
            email = "",
            environment = "",
            report = null,
            files = listOf(
                FeedbackAttachments.Picked("a1", "снимок экрана.png", 1, file),
                FeedbackAttachments.Picked("a2", "café-déjà.txt", 1, file),
            ),
        )

        val body = received.text
        assertContains(body, "снимок экрана.png")
        assertContains(body, "café-déjà.txt")
        // The failure this replaced turned every such letter into a question mark, so two differently
        // named files arrived indistinguishable.
        assertFalse(body.contains("?"), "a name was written in an encoding that cannot hold it")
    }

    @Test
    fun `the shared secret travels with it`() {
        val received = listen()
        System.setProperty(FeedbackSender.KEY_PROPERTY, "the-key")

        FeedbackSender.post(
            kind = "hello",
            text = "hi",
            email = "",
            environment = "",
            report = null,
            files = emptyList(),
        )

        assertEquals("the-key", received.key)
    }

    @Test
    fun `a refusal about size is turned into something a person can act on`() {
        listen(status = 413)

        assertContains(FeedbackSender.post("bug", "x", "", "", null, emptyList()).error.orEmpty(), "too much")
    }

    @Test
    fun `a refusal about frequency says to wait`() {
        listen(status = 429)

        assertContains(FeedbackSender.post("bug", "x", "", "", null, emptyList()).error.orEmpty(), "Give it a minute")
    }

    @Test
    fun `the service's own words are passed on when it explains itself`() {
        listen(status = 400, body = "there is nothing written in it")

        assertContains(
            FeedbackSender.post("bug", "x", "", "", null, emptyList()).error.orEmpty(),
            "nothing written in it",
        )
    }

    @Test
    fun `anything else names the code, so a report about it can be made at all`() {
        listen(status = 500)

        val outcome = FeedbackSender.post("bug", "x", "", "", null, emptyList())

        assertFalse(outcome.ok)
        assertContains(outcome.error.orEmpty(), "500")
    }

    @Test
    fun `a file that has gone away between the pick and the send does not stop the rest`() {
        val received = listen()
        val directory = Files.createTempDirectory("acc-send")
        val gone = directory.resolve("gone.bin")
        val kept = directory.resolve("kept.bin")
        Files.write(kept, byteArrayOf(7))

        val outcome = FeedbackSender.post(
            kind = "bug",
            text = "two files, one of them imaginary",
            email = "",
            environment = "",
            report = null,
            files = listOf(
                FeedbackAttachments.Picked("a1", "gone.bin", 1, gone),
                FeedbackAttachments.Picked("a2", "kept.bin", 1, kept),
            ),
        )

        assertTrue(outcome.ok)
        assertContains(received.text, "kept.bin")
        assertFalse(received.text.contains("gone.bin"))
    }
}

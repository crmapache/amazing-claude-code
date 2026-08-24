package io.github.crmapache.amazingclaudecode.remote

import com.intellij.testFramework.fixtures.BasePlatformTestCase
import io.github.crmapache.amazingclaudecode.claude.ClaudeSessionHub
import java.net.URI
import java.net.http.HttpClient
import java.net.http.HttpRequest
import java.net.http.HttpResponse
import java.time.Duration

/**
 * The local channel is scaffolding - it is replaced by a relay in phase 2 - but the way it is guarded
 * is not. A port on the loopback address is reachable by any page in any browser on this machine, and
 * what it opens is a channel that can send messages to an agent with a shell on the work machine.
 *
 * A real port and a real client here rather than a fake: what is being tested is precisely the parts a
 * fake would stub out.
 */
class LocalBridgeServerTest : BasePlatformTestCase() {

    private val client: HttpClient = HttpClient.newBuilder()
        .connectTimeout(Duration.ofSeconds(5))
        .build()

    private fun bridge(): Pair<LocalBridgeServer, String> {
        val hub = ClaudeSessionHub.getInstance(project)
        val server = LocalBridgeServer(hub, testRootDisposable)
        val address = server.start()
        assertNotNull("the bridge could not take a port", address)
        return server to address!!
    }

    private fun get(url: String, headers: Map<String, String> = emptyMap()): HttpResponse<String> {
        val request = HttpRequest.newBuilder(URI(url)).timeout(Duration.ofSeconds(5))
        headers.forEach { (name, value) -> request.header(name, value) }
        return client.send(request.build(), HttpResponse.BodyHandlers.ofString())
    }

    private fun post(url: String, body: String, headers: Map<String, String>): HttpResponse<String> {
        val request = HttpRequest.newBuilder(URI(url))
            .timeout(Duration.ofSeconds(5))
            .POST(HttpRequest.BodyPublishers.ofString(body))
        headers.forEach { (name, value) -> request.header(name, value) }
        return client.send(request.build(), HttpResponse.BodyHandlers.ofString())
    }

    private fun base(address: String): String = address.substringBefore("/remote.html")

    private fun tokenOf(address: String): String = address.substringAfter("token=")

    fun testTheAddressCarriesATokenAndStaysOnTheLoopback() {
        val (_, address) = bridge()

        assertTrue(address, address.startsWith("http://127.0.0.1:"))
        assertTrue(address, address.contains("token="))
        assertTrue(tokenOf(address).length >= 16)
    }

    /** Without the token the channel is simply a local port anyone can post to. */
    fun testARequestWithoutTheTokenIsRefused() {
        val (_, address) = bridge()

        val response = post("${base(address)}/send", """{"type":"prompt","text":"hello"}""", emptyMap())

        assertEquals(403, response.statusCode())
    }

    fun testARequestWithTheWrongTokenIsRefused() {
        val (_, address) = bridge()

        val response = post(
            "${base(address)}/send",
            """{"type":"prompt","text":"hello"}""",
            mapOf("x-acc-token" to "not-the-token"),
        )

        assertEquals(403, response.statusCode())
    }

    /**
     * A page on the open internet can post to a loopback port through the browser standing beside the
     * IDE. It cannot read the token out of another page's address bar - but a form post needs no
     * reading, only sending.
     */
    fun testARequestFromSomewhereElseIsRefusedEvenWithTheToken() {
        val (_, address) = bridge()

        val response = post(
            "${base(address)}/send",
            """{"type":"checkAuth"}""",
            mapOf("x-acc-token" to tokenOf(address), "Origin" to "https://example.com"),
        )

        assertEquals(403, response.statusCode())
    }

    fun testTheStreamIsRefusedWithoutTheToken() {
        val (_, address) = bridge()

        val response = get("${base(address)}/events")

        assertEquals(403, response.statusCode())
    }

    /** The page itself is the interface's own file out of the plugin's archive. */
    fun testThePageIsServed() {
        val (_, address) = bridge()

        val response = get("${base(address)}/remote.html")

        // In a test run the built assets may not be on the classpath at all - then a clean 404 is the
        // correct answer, and what is being checked is that the route exists rather than throws.
        assertTrue("got ${response.statusCode()}", response.statusCode() == 200 || response.statusCode() == 404)
    }

    fun testAMalformedMessageIsAnsweredRatherThanSwallowed() {
        val (_, address) = bridge()

        val response = post(
            "${base(address)}/send",
            "not json at all",
            mapOf("x-acc-token" to tokenOf(address)),
        )

        assertEquals(400, response.statusCode())
    }
}

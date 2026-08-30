package io.github.crmapache.amazingclaudecode.webview

import java.io.File
import java.lang.reflect.Proxy
import org.cef.handler.CefResourceHandler
import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertTrue

/**
 * The handler that hands the panel's own page to the embedded browser.
 *
 * It is not a class implementing the interface but a proxy built from whatever shape of that interface
 * the running IDE has, dispatching by method name (see [WebviewResources]). That is what lets one archive
 * fit both 2026.1, where the interface asks for four methods, and 2026.2, where it asks for seven - and it
 * is also what makes the failure silent. A method the browser calls and the dispatch does not name gets a
 * blank instead of an answer: no compiler complains, nothing appears in the log, the panel simply never
 * comes up. In one IDE and not the other, at that.
 *
 * So the two sides are read against each other here, the way the achievements are: the names in the
 * dispatch against the methods the interface actually declares.
 */
class WebviewResourcesTest {

    /** Object's own three. A proxy is handed those as well, and they are answered beside the rest. */
    private val fromObject = setOf("toString", "hashCode", "equals")

    /**
     * The names the dispatch answers, read out of the source rather than restated here.
     *
     * A copy of the list in the test would drift from the real one the first time a branch was dropped -
     * which is the very thing this file is for.
     */
    private fun dispatched(): Set<String> {
        val source = File("src/main/kotlin/io/github/crmapache/amazingclaudecode/webview/WebviewResources.kt")
        assertTrue(source.isFile, "the handler's source is not where this test looks: ${source.absolutePath}")

        val body = source.readText().substringAfter("when (method.name) {", "")
        assertTrue(body.isNotEmpty(), "the dispatch is no longer a `when` over the method name")

        // "open" -> ... and "read", "readResponse" -> ...
        return Regex("""^\s*("[^"]+"(?:\s*,\s*"[^"]+")*)\s*->""", RegexOption.MULTILINE)
            .findAll(body.substringBefore("\n        }"))
            .flatMap { match -> Regex(""""([^"]+)"""").findAll(match.groupValues[1]).map { it.groupValues[1] } }
            .toSet()
    }

    // The one that breaks the panel: a method the browser can call and the handler does not answer.
    @Test
    fun `every method the browser can call is answered`() {
        val declared = CefResourceHandler::class.java.methods.map { it.name }.toSet()
        val answered = dispatched()

        assertTrue(
            declared.all { it in answered },
            "JCEF asks for methods the handler does not name: ${declared - answered}",
        )
    }

    // The other direction. A name here that the interface never had is either a typo - and then the real
    // method is falling through to the blank - or a leftover from a version nobody runs any more.
    @Test
    fun `the handler names nothing the browser does not have`() {
        val declared = CefResourceHandler::class.java.methods.map { it.name }.toSet()
        val extra = dispatched() - declared - fromObject

        assertTrue(extra.isEmpty(), "the handler answers to names JCEF does not have: $extra")
    }

    // Both shapes of the interface are covered, not just the one this build compiles against. The older
    // four are all Android Studio has; without them the panel comes up in every IDE but that one.
    @Test
    fun `the older four methods are answered too`() {
        val answered = dispatched()

        listOf("processRequest", "getResponseHeaders", "readResponse", "cancel").forEach { name ->
            assertTrue(name in answered, "the pre-2026.2 browser calls $name and gets a blank")
        }
    }

    // The proxy has to be buildable at all: the interface belongs to the browser's own class loader, and
    // asking the wrong one for it fails here rather than at the first request.
    @Test
    fun `a handler can be made`() {
        val handler = WebviewResources.newHandler()

        assertTrue(Proxy.isProxyClass(handler.javaClass))
        assertEquals("acc-webview resource handler", handler.toString())
    }
}

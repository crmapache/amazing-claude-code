package io.github.crmapache.amazingclaudecode.webview

import com.intellij.openapi.diagnostic.thisLogger
import java.io.InputStream
import java.net.URI
import java.util.concurrent.atomic.AtomicBoolean
import org.cef.CefApp
import org.cef.browser.CefBrowser
import org.cef.browser.CefFrame
import org.cef.callback.CefCallback
import org.cef.callback.CefResourceReadCallback
import org.cef.callback.CefResourceSkipCallback
import org.cef.callback.CefSchemeHandlerFactory
import org.cef.handler.CefResourceHandler
import org.cef.misc.BoolRef
import org.cef.misc.IntRef
import org.cef.misc.LongRef
import org.cef.misc.StringRef
import org.cef.network.CefRequest
import org.cef.network.CefResponse

/**
 * Serving the built interface to the embedded browser.
 *
 * The files live inside the plugin's archive, while the browser needs a real address: without one,
 * module scripts and requests from the page do not work (an empty Origin on `file://` breaks both). So
 * we intercept `http` for a domain of our own and answer with bytes from the resources.
 */
internal object WebviewResources {

    /** The domain is made up: no such requests go outwards, our handler takes them. */
    const val ORIGIN: String = "http://acc-webview"

    private const val DOMAIN = "acc-webview"
    private const val RESOURCE_ROOT = "webview"

    /**
     * The interface's own files, straight out of the plugin's archive.
     *
     * Read here rather than by each server that needs them: the embedded browser's scheme handler is
     * one such reader, the local channel of phase 1 is another, and two copies of "where the assets
     * live" would drift the first time the build's layout changed.
     */
    fun open(path: String): java.io.InputStream? =
        javaClass.classLoader.getResourceAsStream("$RESOURCE_ROOT/${path.trimStart('/')}")

    fun mimeTypeOf(path: String): String = when (path.substringAfterLast('.', "")) {
        "html" -> "text/html"
        "js", "mjs" -> "text/javascript"
        "css" -> "text/css"
        "json", "map" -> "application/json"
        "svg" -> "image/svg+xml"
        "png" -> "image/png"
        "webp" -> "image/webp"
        "woff2" -> "font/woff2"
        else -> "application/octet-stream"
    }

    private val registered = AtomicBoolean(false)

    /** The registration applies to the whole IDE process, so it is done once. */
    fun register() {
        if (!registered.compareAndSet(false, true)) return

        CefApp.getInstance().registerSchemeHandlerFactory(
            "http",
            DOMAIN,
            object : CefSchemeHandlerFactory {
                override fun create(
                    browser: CefBrowser?,
                    frame: CefFrame?,
                    schemeName: String?,
                    request: CefRequest?,
                ): CefResourceHandler = ResourceHandler()
            },
        )
    }

    /**
     * The handler has two sets of methods: `open`/`read` from the current API and
     * `processRequest`/`readResponse` from the previous one. Both are implemented, because which of them
     * CEF will call depends on the version, and they must not differ in behaviour.
     *
     * The deprecated pair counts as two references to a deprecated API for the marketplace's verifier,
     * and removing them from there suggests itself - it would be enough to inherit from the ready
     * `CefResourceHandlerAdapter` and override one current method. That cannot be done, and it has been
     * verified live: in the current JCEF build it is the previous methods that get called, the base class
     * answers them with a refusal, and the panel does not load at all - emptiness instead of a page and
     * HTTP 0 in the log.
     */
    @Suppress("OVERRIDE_DEPRECATION")
    private class ResourceHandler : CefResourceHandler {

        private var stream: InputStream? = null
        private var mimeType: String = "application/octet-stream"
        private var found: Boolean = false

        override fun open(request: CefRequest, handleRequest: BoolRef, callback: CefCallback): Boolean {
            openResource(request)
            // We answer immediately and synchronously: the resource lies in the archive, there is nothing
            // to wait for.
            handleRequest.set(true)
            return true
        }

        override fun processRequest(request: CefRequest, callback: CefCallback): Boolean {
            openResource(request)
            callback.Continue()
            return true
        }

        override fun getResponseHeaders(
            response: CefResponse,
            responseLength: IntRef,
            redirectUrl: StringRef,
        ) {
            if (!found) {
                response.status = 404
                response.mimeType = "text/plain"
                responseLength.set(0)
                return
            }

            response.mimeType = mimeType
            response.status = 200
            // The length is not known in advance - we read the stream to the end.
            responseLength.set(-1)
        }

        override fun read(
            dataOut: ByteArray,
            bytesToRead: Int,
            bytesRead: IntRef,
            callback: CefResourceReadCallback,
        ): Boolean = readInto(dataOut, bytesToRead, bytesRead)

        override fun readResponse(
            dataOut: ByteArray,
            bytesToRead: Int,
            bytesRead: IntRef,
            callback: CefCallback,
        ): Boolean = readInto(dataOut, bytesToRead, bytesRead)

        override fun skip(
            bytesToSkip: Long,
            bytesSkipped: LongRef,
            callback: CefResourceSkipCallback,
        ): Boolean {
            val skipped = stream?.skip(bytesToSkip) ?: 0L
            bytesSkipped.set(skipped)
            return skipped > 0L
        }

        override fun cancel() = closeStream()

        private fun openResource(request: CefRequest) {
            val path = resourcePath(request.url)
            val resource = open(path)

            if (resource == null) {
                // The browser asks for a tab icon the panel does not have by itself: that is not an error.
                if (path != "favicon.ico") thisLogger().warn("Webview resource not found: $path")
                found = false
                return
            }

            stream = resource.buffered()
            mimeType = mimeTypeOf(path)
            found = true
        }

        private fun readInto(dataOut: ByteArray, bytesToRead: Int, bytesRead: IntRef): Boolean {
            val source = stream

            if (source == null) {
                bytesRead.set(0)
                return false
            }

            val read = source.read(dataOut, 0, bytesToRead)

            if (read <= 0) {
                bytesRead.set(0)
                closeStream()
                return false
            }

            bytesRead.set(read)
            return true
        }

        private fun closeStream() {
            runCatching { stream?.close() }
            stream = null
        }

        private fun resourcePath(url: String): String {
            val path = runCatching { URI(url).path }.getOrNull().orEmpty().trimStart('/')
            return path.ifEmpty { "index.html" }
        }

    }
}

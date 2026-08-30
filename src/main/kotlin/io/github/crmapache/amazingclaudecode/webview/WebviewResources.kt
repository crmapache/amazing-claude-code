package io.github.crmapache.amazingclaudecode.webview

import com.intellij.openapi.diagnostic.thisLogger
import java.io.InputStream
import java.lang.reflect.InvocationHandler
import java.lang.reflect.Method
import java.lang.reflect.Proxy
import java.net.URI
import java.util.concurrent.atomic.AtomicBoolean
import org.cef.CefApp
import org.cef.browser.CefBrowser
import org.cef.browser.CefFrame
import org.cef.callback.CefCallback
import org.cef.callback.CefSchemeHandlerFactory
import org.cef.handler.CefResourceHandler
import org.cef.misc.BoolRef
import org.cef.misc.IntRef
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
                ): CefResourceHandler = newHandler()
            },
        )
    }

    /**
     * One request, answered out of the plugin's archive.
     *
     * Built through [Proxy] rather than by a class of our own implementing the interface, and that is the
     * whole point of this file: the interface is not the same shape in every IDE. Since 2026.2 it asks for
     * seven methods - `open`, `read` and `skip` on top of the older four - and the types in the new
     * signatures (the read and skip callbacks, and `LongRef` beside them) do not exist in 2026.1 at all,
     * which is what Android Studio is built on. A class naming them in its own signatures cannot be loaded
     * there: the plugin verifier calls it NoSuchClassError, and the panel would simply never come up.
     * Naming only the older four does not work either - against 2026.2 such a class is three
     * implementations short and does not compile.
     *
     * A proxy is made from the interface as it is in the IDE that is running, so one archive answers the
     * four-method shape and the seven-method one alike, and the next change to this interface is not
     * something this code has to be taught about beforehand.
     *
     * Both sets do the same thing, deliberately: which of them CEF calls depends on its version, and it
     * has been checked live that the current build calls the older pair. That is also why inheriting the
     * ready adapter was never an option - it answers the older pair with a refusal, and the panel then
     * loads nothing at all.
     */
    internal fun newHandler(): CefResourceHandler =
        Proxy.newProxyInstance(
            // The interface's own loader, not ours: in 2026.2 it belongs to the bundled browser plugin
            // rather than to the platform, and a proxy can only be built by a loader that sees it.
            CefResourceHandler::class.java.classLoader,
            arrayOf(CefResourceHandler::class.java),
            Serving(),
        ) as CefResourceHandler

    /** The state of one such request, and the answers to whatever the running CEF asks for. */
    private class Serving : InvocationHandler {

        private var stream: InputStream? = null
        private var mimeType: String = "application/octet-stream"
        private var found: Boolean = false

        override fun invoke(proxy: Any?, method: Method, args: Array<out Any?>?): Any? =
            try {
                dispatch(proxy, method, args ?: emptyArray())
            } catch (e: Throwable) {
                // On the other side of this call is CEF's own IO thread, across a JNI boundary: an
                // exception thrown back at it is not a stack trace in the log but an unclear failure
                // inside the browser. A refused read is better - the page shows it as a resource that did
                // not load, and the reason stays here.
                thisLogger().warn("The webview resource handler failed on ${method.name}", e)
                blankFor(method)
            }

        private fun dispatch(proxy: Any?, method: Method, args: Array<out Any?>): Any? = when (method.name) {
            // The current pair. We answer at once and synchronously: the resource lies in the archive,
            // there is nothing to wait for.
            "open" -> {
                openResource(args[0] as CefRequest)
                (args[1] as BoolRef).set(true)
                true
            }

            "processRequest" -> {
                openResource(args[0] as CefRequest)
                (args[1] as CefCallback).Continue()
                true
            }

            "getResponseHeaders" -> writeHeaders(args[0] as CefResponse, args[1] as IntRef)

            "read", "readResponse" -> readInto(args[0] as ByteArray, args[1] as Int, args[2] as IntRef)

            "skip" -> skip(args[0] as Long, args[1])

            "cancel" -> closeStream()

            // A proxy is handed Object's own three as well, and there is nothing underneath to answer
            // them.
            "toString" -> "acc-webview resource handler"
            "hashCode" -> System.identityHashCode(proxy)
            "equals" -> proxy === args.firstOrNull()

            else -> blankFor(method)
        }

        private fun writeHeaders(response: CefResponse, responseLength: IntRef) {
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

        /**
         * How far the reader was moved on.
         *
         * [bytesSkipped] is a `LongRef`, one of the classes 2026.1 does not have, so it is filled in by
         * method name rather than through its type - naming the type is the one thing this class exists
         * to avoid.
         */
        private fun skip(bytesToSkip: Long, bytesSkipped: Any?): Boolean {
            val skipped = stream?.skip(bytesToSkip) ?: 0L

            if (bytesSkipped != null) {
                bytesSkipped.javaClass
                    .getMethod("set", java.lang.Long.TYPE)
                    .invoke(bytesSkipped, skipped)
            }

            return skipped > 0L
        }

        /**
         * An answer to a method this code has never heard of - a newer CEF than the one it was written
         * against. A proxy cannot hand a primitive-returning method a null, so the blank has to match the
         * shape the caller expects.
         */
        private fun blankFor(method: Method): Any? = when (method.returnType) {
            java.lang.Boolean.TYPE -> false
            java.lang.Integer.TYPE -> 0
            java.lang.Long.TYPE -> 0L
            else -> null
        }

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

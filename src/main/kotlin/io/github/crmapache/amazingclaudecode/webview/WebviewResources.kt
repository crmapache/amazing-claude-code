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
 * Отдача собранного интерфейса встроенному браузеру.
 *
 * Файлы лежат внутри архива плагина, а браузеру нужен настоящий адрес: без него
 * не работают модульные скрипты и запросы из страницы (пустой Origin у `file://`
 * ломает и то, и другое). Поэтому перехватываем `http` для своего домена и
 * отвечаем байтами из ресурсов.
 */
internal object WebviewResources {

    /** Домен вымышленный: наружу такие запросы не уходят, их забирает наш обработчик. */
    const val ORIGIN: String = "http://acc-webview"

    private const val DOMAIN = "acc-webview"
    private const val RESOURCE_ROOT = "webview"

    private val registered = AtomicBoolean(false)

    /** Регистрация действует на весь процесс IDE, поэтому выполняем её один раз. */
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
     * У обработчика два набора методов: `open`/`read` из нынешнего API и
     * `processRequest`/`readResponse` из прежнего. Реализованы оба, потому что какой
     * из них позовёт CEF, зависит от версии, а расходиться в поведении им нельзя.
     */
    @Suppress("OVERRIDE_DEPRECATION")
    private class ResourceHandler : CefResourceHandler {

        private var stream: InputStream? = null
        private var mimeType: String = "application/octet-stream"
        private var found: Boolean = false

        override fun open(request: CefRequest, handleRequest: BoolRef, callback: CefCallback): Boolean {
            openResource(request)
            // Отвечаем немедленно и синхронно: ресурс лежит в архиве, ждать нечего.
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
            // Длину не знаем заранее — читаем поток до конца.
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
            val resource = javaClass.classLoader.getResourceAsStream("$RESOURCE_ROOT/$path")

            if (resource == null) {
                // Браузер сам просит иконку вкладки, которой у панели нет: это не ошибка.
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

        private fun mimeTypeOf(path: String): String = when (path.substringAfterLast('.', "")) {
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
    }
}

package io.github.crmapache.amazingclaudecode.net

import com.intellij.openapi.diagnostic.thisLogger
import com.intellij.util.net.JdkProxyProvider
import com.intellij.util.net.ssl.CertificateManager
import java.net.http.HttpClient
import java.time.Duration

/**
 * An HTTP client that goes out the way the IDE does.
 *
 * Corporate networks are the ordinary case rather than the exception, and both halves matter: the proxy
 * because there is no way out without it, the certificate store because a network that inspects TLS
 * presents a certificate the JDK's own trust store has never heard of.
 *
 * One place for all three of the plugin's ways out - the relay, the feedback report and Deepgram. It was
 * three copies of these fifteen lines, which is a very quiet way to fail: mend the proxy in one of them
 * and the other two go on being the parts of the plugin that a company's network refuses, with nothing
 * on screen to say why.
 *
 * The two halves are wrapped separately on purpose. A company that has no proxy but does have its own
 * certificate authority should not lose the second because the first was not there to be read.
 */
internal object IdeHttp {

    /**
     * The client the plugin goes out through, built once.
     *
     * Once because building it reads the IDE's proxy settings and its certificate store, and because a
     * client of one's own per caller is a connection pool of one's own: three of them means the same
     * host is reconnected to three times over.
     */
    val shared: HttpClient by lazy { client() }

    fun client(connectSeconds: Long = CONNECT_SECONDS): HttpClient {
        val builder = HttpClient.newBuilder().connectTimeout(Duration.ofSeconds(connectSeconds))

        runCatching {
            val provider = JdkProxyProvider.getInstance()
            builder.proxy(provider.proxySelector)
            builder.authenticator(provider.authenticator)
        }.onFailure { thisLogger().info("The IDE's proxy settings were not available: ${it.message}") }

        runCatching {
            builder.sslContext(CertificateManager.getInstance().sslContext)
        }.onFailure { thisLogger().info("The IDE's certificate store was not available: ${it.message}") }

        return builder.build()
    }

    /** Long enough for a proxy that thinks about it, short enough not to look like a hang. */
    private const val CONNECT_SECONDS = 15L
}

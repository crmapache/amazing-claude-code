package io.github.crmapache.amazingclaudecode.remote

import kotlin.test.Test
import kotlin.test.assertFalse
import kotlin.test.assertTrue

/**
 * The address rule, kept apart from everything that needs a running IDE.
 *
 * It reads like strictness for its own sake and is not. A browser gives a page `crypto.subtle` only in
 * a secure context, so a relay served over plain HTTP does not make phase 3's encryption weaker - it
 * makes it impossible. Better to refuse the address than to ship something that looks encrypted.
 */
class RemoteAgentTest {

    @Test
    fun `a secure relay address is accepted`() {
        assertTrue(RemoteAgent.isSecure("wss://relay.example.com"))
        assertTrue(RemoteAgent.isSecure(RemoteAgent.DEFAULT_RELAY))
    }

    @Test
    fun `a plain address is refused`() {
        assertFalse(RemoteAgent.isSecure("ws://relay.example.com"))
        assertFalse(RemoteAgent.isSecure("http://relay.example.com"))
        assertFalse(RemoteAgent.isSecure("https://relay.example.com"))
        assertFalse(RemoteAgent.isSecure(""))
    }

    /** Loopback is the exception, because a browser counts it as secure and it is where this is built. */
    @Test
    fun `loopback is allowed for development`() {
        assertTrue(RemoteAgent.isSecure("ws://localhost:8080"))
        assertTrue(RemoteAgent.isSecure("ws://127.0.0.1:8080"))
    }

    /**
     * A hostname that merely starts with "localhost" is somebody else's machine. This is the shape of
     * mistake that reads as harmless in review and hands a third party the traffic.
     */
    @Test
    fun `a hostname that only looks like loopback is still refused`() {
        assertFalse(RemoteAgent.isSecure("ws://localhost.example.com"))
        assertFalse(RemoteAgent.isSecure("ws://127.0.0.1.example.com"))
    }
}

package io.github.crmapache.amazingclaudecode.webview

import com.intellij.openapi.Disposable
import com.intellij.openapi.util.Disposer
import java.util.concurrent.CountDownLatch
import java.util.concurrent.FutureTask
import java.util.concurrent.TimeUnit
import java.util.concurrent.atomic.AtomicBoolean
import kotlin.concurrent.thread
import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertFalse
import kotlin.test.assertTrue

class WebviewLifetimeTest {

    @Test
    fun `late callbacks are refused before the first resource is disposed`() {
        val lifetime = WebviewLifetime()
        var resourceDisposed = false
        var callbacks = 0
        Disposer.register(lifetime, object : Disposable {
            override fun dispose() {
                assertFalse(lifetime.ifAlive { callbacks++ })
                resourceDisposed = true
            }
        })

        assertTrue(lifetime.ifAlive { callbacks++ })
        Disposer.dispose(lifetime)

        assertTrue(resourceDisposed)
        assertFalse(lifetime.ifAlive { callbacks++ })
        assertEquals(1, callbacks)
    }

    @Test
    fun `closing the host waits for an active callback before releasing its resources`() {
        val host = Disposer.newDisposable()
        val lifetime = WebviewLifetime()
        Disposer.register(host, lifetime)
        val resourceDisposed = AtomicBoolean()
        Disposer.register(lifetime, object : Disposable {
            override fun dispose() {
                resourceDisposed.set(true)
            }
        })

        val entered = CountDownLatch(1)
        val release = CountDownLatch(1)
        val callback = FutureTask {
            lifetime.ifAlive {
                entered.countDown()
                assertTrue(release.await(10, TimeUnit.SECONDS), "callback was not released")
                assertFalse(resourceDisposed.get(), "a callback used an already disposed resource")
            }
        }
        val delivery = thread(name = "webview-delivery", isDaemon = true) { callback.run() }
        val closing = FutureTask { Disposer.dispose(host) }
        val closer = thread(start = false, name = "webview-close", isDaemon = true) { closing.run() }

        try {
            assertTrue(entered.await(10, TimeUnit.SECONDS), "callback did not start")
            closer.start()
            val deadline = System.nanoTime() + TimeUnit.SECONDS.toNanos(10)
            while (closer.state != Thread.State.BLOCKED && closer.isAlive && System.nanoTime() < deadline) {
                Thread.sleep(1)
            }
            assertEquals(Thread.State.BLOCKED, closer.state, "closing did not wait for the active callback")
            assertFalse(resourceDisposed.get())

            release.countDown()
            assertTrue(callback.get(10, TimeUnit.SECONDS))
            closing.get(10, TimeUnit.SECONDS)
            assertTrue(resourceDisposed.get())
            assertFalse(lifetime.ifAlive { error("a late repaint must not touch the browser") })
        } finally {
            release.countDown()
            delivery.join(10_000)
            if (closer.state != Thread.State.NEW) closer.join(10_000)
            Disposer.dispose(host)
        }
    }

    @Test
    fun `a delivery may ask for a repaint inside the same callback`() {
        val lifetime = WebviewLifetime()
        var repaints = 0

        try {
            assertTrue(lifetime.ifAlive {
                assertTrue(lifetime.ifAlive { repaints++ })
            })
            assertEquals(1, repaints)
        } finally {
            Disposer.dispose(lifetime)
        }
    }
}

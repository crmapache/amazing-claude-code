package io.github.crmapache.amazingclaudecode.webview

import com.intellij.openapi.Disposable

/**
 * Stops callbacks before the browser and its timers are disposed.
 *
 * A parent's dispose() runs after its children, so a flag set there cannot protect those children.
 * beforeTreeDispose() runs first. It takes the same lock as callbacks, letting any current use finish
 * and refusing later uses before the platform starts releasing the resources.
 */
internal class WebviewLifetime : Disposable.Parent {

    private val lock = Any()
    private var closed = false

    /** Whether the callback ran while the resources were still available. */
    fun ifAlive(action: () -> Unit): Boolean = synchronized(lock) {
        if (closed) return false
        action()
        true
    }

    override fun beforeTreeDispose() {
        synchronized(lock) { closed = true }
    }

    override fun dispose() = Unit
}

package io.github.crmapache.amazingclaudecode.search

import java.util.concurrent.ConcurrentHashMap

/**
 * The model's searches under way, by the request's number - and which of them a person has taken back.
 *
 * A cancel names a request, not a process, and the two are not the same thing for the first seconds of
 * a search: the index is brought up to date and the corpus written before any process exists. A cancel
 * that only knew processes fell into that gap and did nothing - it was not even remembered - so the run
 * started a moment later as though nobody had pressed anything, worked to the end and was paid for, and
 * its answer was thrown away by a window that had long since moved on. Here the request is known from
 * the moment it is asked, and a cancel is kept until the run it names is over, whichever comes first.
 *
 * [H] is whatever a run is stopped through; [stop] stops it. Generic so the rule can be checked without
 * a process behind it.
 */
internal class AiRuns<H : Any>(private val stop: (H) -> Unit) {

    private class Run<H> {
        var handle: H? = null
        var cancelled = false
    }

    private val runs = ConcurrentHashMap<String, Run<H>>()

    /** A request has been asked - from here on a cancel naming it means something. */
    fun asked(id: String) {
        runs[id] = Run()
    }

    /**
     * The run has a process now. Stopped on the spot when the request was taken back while it was still
     * being prepared - that is the gap this class exists for.
     */
    fun started(id: String, handle: H) {
        val run = runs[id] ?: run {
            // Nobody is waiting for this one any more - it is finished or taken back and forgotten.
            stop(handle)
            return
        }
        val late = synchronized(run) {
            run.handle = handle
            run.cancelled
        }
        if (late) runCatching { stop(handle) }
    }

    /** The person pressed Cancel. Whether anybody was still working on it. */
    fun cancel(id: String): Boolean {
        val run = runs[id] ?: return false
        val handle = synchronized(run) {
            run.cancelled = true
            run.handle
        }
        if (handle != null) runCatching { stop(handle) }
        return true
    }

    /** Whether the request was taken back - asked before its process is started, so it never is. */
    fun isCancelled(id: String): Boolean = runs[id]?.let { synchronized(it) { it.cancelled } } ?: true

    /**
     * The run is over, however it ended. Returns whether it had been taken back - in which case its
     * outcome is not news to anybody.
     */
    fun finished(id: String): Boolean {
        val run = runs.remove(id) ?: return true
        return synchronized(run) { run.cancelled }
    }

    /** How many requests are known - for the tests: what is asked has to be forgotten again. */
    val size: Int get() = runs.size
}

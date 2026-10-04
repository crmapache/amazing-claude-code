package io.github.crmapache.amazingclaudecode.claude

import kotlinx.serialization.json.JsonObject
import java.util.concurrent.ConcurrentHashMap

/**
 * The control requests out to a conversation's process, by request id - see ClaudeSession.control.
 *
 * Most of them nobody watches - a usage probe, a context count - and those are dropped quietly when the
 * process goes, as they always were. A [Control.watched] one has somebody waiting on screen: a rewind's
 * dialog stands "working" and its tab holds its queue until the answer comes. Thrown away with the process
 * (a restart at the end of the very turn the rewind interrupted, a stop from the phone, a move to another
 * account), its answer never came, and the dialog and the queue stood that way for good - the timeout found
 * nothing left to time out. So the process going hands the watched ones back to be answered as failed.
 */
internal class AwaitedControls {

    class Control(val onResult: (JsonObject) -> Unit, val onFailure: (String) -> Unit, val watched: Boolean)

    private val waiting = ConcurrentHashMap<String, Control>()

    fun put(id: String, control: Control) {
        waiting[id] = control
    }

    /** The request [id], taken out to be answered - null when it was answered, timed out or abandoned already. */
    fun take(id: String): Control? = waiting.remove(id)

    /** The watched requests, taken out for the process that was to answer them has gone; the rest stay. */
    fun abandonWatched(): List<Control> =
        waiting.entries.filter { (id, control) -> control.watched && waiting.remove(id, control) }.map { it.value }

    /**
     * Everything nobody watches, dropped as the process goes. Not everything: a watched request put in after
     * [abandonWatched] (a reader thread a step behind the stop) stays and is answered by its own timeout,
     * rather than vanishing the way all of them used to.
     */
    fun dropUnwatched() {
        waiting.entries.removeIf { !it.value.watched }
    }

    companion object {
        /** What a watched request still out is told when the process that was to answer it goes. */
        const val PROCESS_ENDED = "the process ended"
    }
}

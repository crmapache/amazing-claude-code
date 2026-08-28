package io.github.crmapache.amazingclaudecode.editor

import com.intellij.ide.SaveAndSyncHandler
import com.intellij.openapi.Disposable
import com.intellij.openapi.application.ReadAction
import com.intellij.openapi.diagnostic.thisLogger
import com.intellij.openapi.vfs.LocalFileSystem
import com.intellij.openapi.vfs.VfsUtil
import com.intellij.openapi.vfs.VirtualFile
import com.intellij.util.Alarm
import java.nio.file.Path

/**
 * Bringing back into the IDE what the agent has changed on disk.
 *
 * The IDE holds its own picture of the files, and the two ways it has of noticing a change from
 * outside both amount to "eventually": the application regaining focus, and the file watcher of
 * whatever file system the project sits on. A person working with the panel never leaves the
 * application, and a watcher is late or silent often enough to be worth not relying on - a network
 * share, a symlink, a hundred files rewritten in one turn. What they see meanwhile is the editor
 * showing the text the agent has already replaced.
 *
 * So the agent's own stream is what asks for the re-read (see [AgentEdits] for reading it), and this
 * decides what the IDE is asked to do about it.
 */
internal class DiskRefresh(
    /** Where the agent runs, for the paths it names relative to it. */
    private val workingDirectory: String?,
    parentDisposable: Disposable,
) {

    private val edits = AgentEdits()

    /** Files named since the last batch went out - see [flush]. */
    private val waiting = LinkedHashSet<String>()
    private var scheduled = false
    private val batchAlarm = Alarm(Alarm.ThreadToUse.POOLED_THREAD, parentDisposable)

    private val sweepLock = Any()
    private var sweepScheduled = false
    private var lastSweep = 0L
    private val sweepAlarm = Alarm(Alarm.ThreadToUse.POOLED_THREAD, parentDisposable)

    /** A line of the agent's stream, live: a replay is the past, and the disk has long since caught up. */
    fun noteLine(line: String) {
        for (refresh in edits.note(line)) {
            when (refresh) {
                is AgentEdits.Refresh.One -> queue(refresh.path)
                AgentEdits.Refresh.Everything -> sweep()
            }
        }
    }

    /**
     * A file to re-read, once the ones around it have arrived too.
     *
     * In batches because edits come in bursts - a rename touches twenty files in as many seconds - and
     * each refresh is a walk of the disk. The wait is short enough to read as immediate and long enough
     * that a burst costs one walk instead of twenty. The batch already in flight is not pushed back by
     * a new file joining it, or a working agent would keep postponing it to the end of the turn.
     */
    private fun queue(path: String) {
        val full = absolute(path) ?: return

        val first = synchronized(waiting) {
            waiting += full
            val first = !scheduled
            scheduled = true
            first
        }

        if (first) batchAlarm.addRequest({ flush() }, BATCH_MS)
    }

    private fun flush() {
        val paths = synchronized(waiting) {
            scheduled = false
            val batch = waiting.toList()
            waiting.clear()
            batch
        }
        if (paths.isEmpty()) return

        runCatching { reread(paths) }
            .onFailure { thisLogger().warn("Couldn't re-read what the agent changed", it) }
    }

    /**
     * Ask the IDE for these files again.
     *
     * Only for what it already knows about: a file it has never heard of is one it is not showing
     * anybody, and pulling it into the IDE's picture of the world because the agent read something in
     * `/tmp` is not our business. A file that is new to it, though, may be new to the disk as well -
     * then its folder is what has to look again, and only a folder the IDE knows counts as one.
     */
    private fun reread(paths: List<String>) {
        val fs = LocalFileSystem.getInstance()
        val files = mutableListOf<VirtualFile>()
        val folders = mutableListOf<VirtualFile>()

        ReadAction.run<Throwable> {
            for (path in paths) {
                val nio = runCatching { Path.of(path) }.getOrNull() ?: continue
                val known = fs.findFileByNioFile(nio)
                if (known != null) {
                    files += known
                    continue
                }

                val parent = nio.parent ?: continue
                fs.findFileByNioFile(parent)?.let { folders += it }
            }
        }

        // Asynchronously: this runs on the thread reading the agent's output, and a refresh walks the
        // disk. The IDE has its own thread for that and its own moment to apply the result on.
        if (files.isNotEmpty()) {
            VfsUtil.markDirtyAndRefresh(true, false, false, *files.toTypedArray())
        }

        // The children are what is being asked about here - the file the agent has just created is one
        // of them, and without recounting them the folder goes on being sure it has never existed.
        if (folders.isNotEmpty()) {
            VfsUtil.markDirtyAndRefresh(true, false, true, *folders.toTypedArray())
        }
    }

    /**
     * Something changed and nothing said what - ask the IDE to look around the way it does when a
     * person comes back to it from another application.
     *
     * Rate-limited rather than dropped: a turn can be a long row of shell commands, each of them ending
     * in one of these, and a full look costs more than one file does. Postponed instead of skipped
     * because the one that matters most is the last - the end of the turn, after which nothing else
     * will ask at all.
     */
    private fun sweep() {
        val wait = synchronized(sweepLock) {
            if (sweepScheduled) return
            sweepScheduled = true
            (SWEEP_MS - (System.currentTimeMillis() - lastSweep)).coerceIn(0L, SWEEP_MS)
        }

        sweepAlarm.addRequest({ sweepNow() }, wait)
    }

    private fun sweepNow() {
        synchronized(sweepLock) {
            sweepScheduled = false
            lastSweep = System.currentTimeMillis()
        }

        runCatching { SaveAndSyncHandler.getInstance().scheduleRefresh() }
            .onFailure { thisLogger().warn("Couldn't ask the IDE to look at the disk again", it) }
    }

    /**
     * The path as the disk spells it. The agent names files from where it runs, and "src/main.kt" means
     * nothing to a file system without that.
     */
    private fun absolute(path: String): String? {
        if (path.isBlank()) return null

        val named = runCatching { Path.of(path) }.getOrNull() ?: return null
        if (named.isAbsolute) return named.normalize().toString()

        val base = workingDirectory ?: return null
        return runCatching { Path.of(base).resolve(named).normalize().toString() }.getOrNull()
    }

    private companion object {
        /** How long files gather before they are re-read together - see [queue]. */
        const val BATCH_MS = 400L

        /** The shortest gap between two full looks around - see [sweep]. */
        const val SWEEP_MS = 2_000L
    }
}

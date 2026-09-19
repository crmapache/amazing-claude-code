package io.github.crmapache.amazingclaudecode.scenario

import com.intellij.openapi.diagnostic.thisLogger
import io.github.crmapache.amazingclaudecode.feedback.ShortHash
import java.io.File
import java.nio.channels.FileChannel
import java.nio.channels.FileLock
import java.nio.file.Files
import java.nio.file.StandardCopyOption
import java.nio.file.StandardOpenOption

/**
 * One small JSON file this machine keeps for one project, and the three careful things every such file
 * needs: a lock across IDE windows, a write that is never seen half done, and a reading that says "I could
 * not" apart from "there is nothing".
 *
 * Written once and used by both the scheduled hours and the queue. Two copies of this would not disagree
 * loudly - they would disagree in the one direction nobody watches: one of them writing straight through
 * the file, or holding the lock on the file it is writing, and a list somebody spent a week building
 * disappearing after a power cut with no word anywhere about why.
 *
 * What is NOT here is what the file means. Which records are dropped, which are named, what an unreadable
 * file should make the screen say - that belongs to whoever owns the list (see ScheduleStore, QueueStore),
 * because it differs for each of them and it is the part worth testing.
 */
internal class ScenarioFile(private val file: File) {

    /** What the file had to say when it was asked. */
    internal sealed interface Stored {
        /** There is no file: nothing has ever been written, which is a legitimate empty list. */
        data object Missing : Stored

        /**
         * There is one and it could not be read - a share that went away, a file half written by
         * something that died, one written by a build that is not this one.
         *
         * Never the same sentence as [Missing]. Read as an empty list, an unreadable file empties whatever
         * the screen shows and then everything upstream writes that emptiness back over the file - which
         * is a week of somebody's arrangements gone, silently, over a share that hiccuped.
         */
        data object Unreadable : Stored

        data class Text(val text: String) : Stored
    }

    /**
     * What the file says.
     *
     * A file of no length counts as damage rather than as an empty list: this side never writes one (see
     * [put]), so one that is there was left by something going wrong.
     */
    fun read(): Stored {
        if (!file.exists()) return Stored.Missing

        val text = runCatching { file.readText() }
            .onFailure { thisLogger().warn("Could not read ${file.name}", it) }
            .getOrNull()
            ?: return Stored.Unreadable

        return if (text.isBlank()) Stored.Unreadable else Stored.Text(text)
    }

    /**
     * Put text on the disk, and say whether it got there.
     *
     * Beside the file and then moved onto it, rather than written over it. A write straight over the file
     * is readable garbage for as long as it takes, and the power going - or the IDE being killed - in that
     * window leaves a half file, which reads as no file at all. The move is one step for anybody else
     * looking, so a reader sees either yesterday's list or today's and never half of either.
     *
     * The answer is a boolean because the caller has to be able to fail. A full disk and a folder that
     * turned read-only are ordinary, and a write that quietly reports success is worse than one that fails
     * loudly: everything upstream believes the thing was stored.
     */
    fun put(text: String): Boolean =
        runCatching {
            file.parentFile?.mkdirs()
            val beside = File(file.parentFile, "${file.name}$PART")
            beside.writeText(text)
            runCatching {
                Files.move(
                    beside.toPath(),
                    file.toPath(),
                    StandardCopyOption.ATOMIC_MOVE,
                    StandardCopyOption.REPLACE_EXISTING,
                )
            }.recover {
                // Not every filesystem promises an atomic move; a plain replace is still better than
                // writing through the file itself, which cannot even be attempted here.
                Files.move(beside.toPath(), file.toPath(), StandardCopyOption.REPLACE_EXISTING)
            }.getOrThrow()
        }.onFailure { thisLogger().warn("Could not write ${file.name}", it) }.isSuccess

    /**
     * Held while the file is read and written - by every window on this machine, not just this one.
     *
     * Two locks because there are two kinds of neighbour. [GATE] keeps this JVM's own threads apart and,
     * being one object for every file, keeps two instances of this class off one path: a second lock
     * request on a file this process already holds is an error rather than a wait.
     *
     * The lock FILE is the one that matters, and it is what the promise about a second IDE window rests
     * on. Read-modify-write across two processes is not made safe by comparing what was read - both read
     * the same old list, both decide the same thing, both write. A lock of its own rather than a lock on
     * the list: on POSIX a lock is released by closing ANY descriptor for that file, so writing the list
     * would drop the lock on the list halfway through the work it is guarding.
     *
     * A filesystem that will not lock (some network shares) is not a reason to refuse the work: it is done
     * unlocked, which is exactly where all of this stood before there was a lock at all.
     */
    fun <T> underLock(work: () -> T): T = synchronized(GATE) {
        val channel = runCatching {
            file.parentFile?.mkdirs()
            FileChannel.open(
                File(file.parentFile, "${file.name}$LOCK").toPath(),
                StandardOpenOption.CREATE,
                StandardOpenOption.WRITE,
            )
        }.getOrNull() ?: return@synchronized work()

        channel.use {
            val held = waitedFor(it)
            try {
                work()
            } finally {
                runCatching { held?.release() }
            }
        }
    }

    /**
     * The lock, or null after a short wait - and then the work is done without it.
     *
     * Asked for rather than waited on, because the caller is whoever brought the message: the thread of
     * the relay, or the one a panel is talking on. A share that went away mid-write, or another window
     * stopped in a debugger, would hold this for as long as it liked, and everything behind that thread
     * would stand with it - a whole line of conversations paying for one file.
     *
     * Giving up leaves exactly what there was before any of this: an unlocked read-modify-write, whose
     * worst case is one scheduled run raised twice. Standing here for ever has no best case at all.
     */
    private fun waitedFor(channel: FileChannel): FileLock? {
        val until = System.currentTimeMillis() + WAIT_MS

        do {
            val held = runCatching { channel.tryLock() }.getOrNull()
            if (held != null) return held
            runCatching { Thread.sleep(WAIT_STEP_MS) }.onFailure { return null }
        } while (System.currentTimeMillis() < until)

        return null
    }

    internal companion object {
        /** Beside the file while it is being written, and moved onto it when it is whole. */
        private const val PART = ".part"

        /** The thing the windows actually take turns on - never the file itself, see [underLock]. */
        private const val LOCK = ".lock"

        /** How long a window waits for its turn before going on without one - see [waitedFor]. */
        private const val WAIT_MS = 2_000L

        private const val WAIT_STEP_MS = 20L

        /** One for every file in this process: see [underLock]. */
        private val GATE = Any()

        /**
         * Where this machine keeps a project's own small lists: under its data folder, by a hash of the
         * project's path rather than by the path itself.
         *
         * The hash is what keeps two checkouts of one repository apart without writing anybody's paths into
         * a folder name - the same thing the statistics and the search index do.
         */
        fun of(folder: String, workingDirectory: String?, name: String): ScenarioFile =
            ScenarioFile(
                File(
                    File(File(File(System.getProperty("user.home"), ".amazing-claude-code"), folder), key(workingDirectory)),
                    name,
                ),
            )

        private fun key(workingDirectory: String?): String =
            if (workingDirectory.isNullOrBlank()) "unknown" else ShortHash.of(workingDirectory, length = 16)
    }
}

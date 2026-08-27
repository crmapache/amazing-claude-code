package io.github.crmapache.amazingclaudecode.stats

import com.intellij.openapi.Disposable
import com.intellij.openapi.application.ApplicationManager
import com.intellij.openapi.application.PathManager
import com.intellij.openapi.components.Service
import com.intellij.openapi.components.service
import com.intellij.openapi.diagnostic.thisLogger
import com.intellij.util.concurrency.AppExecutorUtil
import io.github.crmapache.amazingclaudecode.feedback.DiagnosticsLog
import java.nio.charset.StandardCharsets
import java.nio.file.Files
import java.nio.file.Path
import java.nio.file.StandardCopyOption
import java.time.LocalDate
import java.util.TreeMap
import java.util.concurrent.ScheduledFuture
import java.util.concurrent.TimeUnit

/**
 * The statistics' memory: every project's days and every achievement's tiers, kept for the whole
 * machine rather than for one project or one IDE.
 *
 * One service for the application rather than one per project, because the figures are about a person:
 * "a hundred hours in the panel" is a hundred hours wherever they were spent, and a streak does not
 * break because yesterday's work was in another project. The file lives in the directory JetBrains
 * products share, so WebStorm and IntelliJ count into one and the same book (see [directory]).
 *
 * Writes go through [update] under a lock and are put on disk a little later rather than at once: the
 * ticker marks a minute every half-minute in every busy project, and a file rewritten that often would
 * be noise on the disk for nothing. What is dirty is written within [SAVE_DELAY_SECONDS], and at the
 * IDE's shutdown whatever is left (see [dispose]).
 */
@Service(Service.Level.APP)
internal class StatsLedger(private val file: Path) : Disposable {

    /** The platform's own way in: the book lives where every JetBrains product can find it. */
    @Suppress("unused")
    constructor() : this(directory().resolve(FILE_NAME))

    private val lock = Any()

    private var snapshot: StatsSnapshot

    /** The text last written or read - what tells a file changed by another IDE from one that is ours. */
    private var lastSeen: String = ""

    private var dirty = false

    private var pendingSave: ScheduledFuture<*>? = null

    /**
     * Whether a save is waiting its turn.
     *
     * Kept apart from [pendingSave] and cleared when the task begins rather than when it ends. Asking
     * "is the scheduled task done" answers no while it is running, so anything that changed during the
     * write - a turn finishing while the file goes to disk - was told a save was already coming when in
     * truth the one it meant had already read what it was going to write. Nothing then scheduled another,
     * and that change waited in memory for the next one to arrive; if the project fell quiet and the IDE
     * died without shutting down properly, the last turn of the day never reached the book at all.
     */
    private var saveScheduled = false

    private var pendingEvaluation: ScheduledFuture<*>? = null

    init {
        val loaded = load()
        snapshot = loaded
        if (snapshot.since == 0L) {
            snapshot.since = System.currentTimeMillis()
            dirty = true
        }
        if (recalibrate(snapshot)) dirty = true
    }

    /**
     * The lines of some achievements have moved since this book was last measured - so what was written
     * down against the old ones is forgotten, once, and earned again against the new (see
     * Achievements.RECALIBRATED).
     *
     * Only the ones that moved, and only their moments: nothing about the work itself is touched, and
     * whatever is still deserved is written down again within seconds of the panel opening. The other way
     * round - keeping a fifth tier awarded against a line that no longer exists - is the one thing the
     * screen must not do, because then it is not saying anything about the work at all.
     */
    private fun recalibrate(snapshot: StatsSnapshot): Boolean {
        if (snapshot.rulesVersion >= Achievements.RULES_VERSION) return false

        // Only what moved since this book was last measured (see Achievements.forgottenSince) - a book
        // with nothing in it has nothing to forget, and one already measured against the version before
        // does not lose what it has since earned back.
        val moved = Achievements.forgottenSince(snapshot.rulesVersion)
        val forgotten = snapshot.earned.keys.count { it in moved }
        snapshot.earned.keys.removeAll(moved)
        snapshot.rulesVersion = Achievements.RULES_VERSION
        if (forgotten > 0) {
            thisLogger().info("The achievement lines moved: $forgotten of them are to be earned again")
        }
        return true
    }

    /** Read something out of the book. The block runs under the lock: do not keep what it hands over. */
    fun <T> read(block: (StatsSnapshot) -> T): T = synchronized(lock) { block(snapshot) }

    /**
     * Change something in the book. The block runs under the lock; afterwards the file is scheduled to be
     * written and the achievements to be re-read - both a little later, folded with whatever else happens
     * in the meantime.
     */
    fun <T> update(block: (StatsSnapshot) -> T): T {
        val result = synchronized(lock) {
            val out = block(snapshot)
            dirty = true
            // Whatever the block did, it did it to a day - and the days folded together are made of those.
            snapshot.daysChanged()
            out
        }
        scheduleSave()
        scheduleEvaluation()
        return result
    }

    /** One project's record for one day, made if it is not there yet. Call inside [update]. */
    fun day(snapshot: StatsSnapshot, projectKey: String, projectName: String, date: LocalDate): DayRecord {
        val project = snapshot.project(projectKey, projectName)
        val record = project.days.getOrPut(date.toString()) { DayRecord() }
        record.updatedAt = System.currentTimeMillis()
        return record
    }

    /** A phone was paired with this IDE - not about any one project, so it is written here directly. */
    fun notePaired() {
        update { it.devicesPaired++ }
    }

    /**
     * Where every achievement stands, with the moments its tiers were reached.
     *
     * The moments are written down here rather than looked up later: a tier crossed while no panel is
     * open still has to carry the time it was crossed. Called from the scheduled evaluation, and by
     * whoever builds the payload for the tab - so what the tab shows is never a step behind the file.
     */
    fun achievements(today: LocalDate = LocalDate.now()): List<Achievements.State> {
        val now = System.currentTimeMillis()
        var changed = false

        val states = synchronized(lock) {
            // The highest tier each achievement has ever been written down at - a floor under the answer,
            // so that a figure counted more honestly than it once was cannot take a tier back.
            val floors = snapshot.earned.mapValues { (_, tiers) -> tiers.keys.maxOrNull() ?: 0 }
            val evaluated = Achievements.evaluate(snapshot, today, floors)

            for (state in evaluated) {
                if (state.tier == 0) continue
                val definition = Achievements.ALL.first { it.id == state.id }
                val tiers = snapshot.earned.getOrPut(state.id) { TreeMap() }
                // A milestone lights every tier at once, and the moment worth keeping is the one: the
                // ladder's tiers are each their own line, crossed each at its own time.
                val reached = if (definition.isMilestone) listOf(Achievements.TIERS) else (1..state.tier).toList()
                for (tier in reached) {
                    if (!tiers.containsKey(tier)) {
                        tiers[tier] = now
                        changed = true
                    }
                }
            }

            if (changed) dirty = true
            evaluated
        }

        if (changed) scheduleSave()
        return states
    }

    /** The moments each tier of an achievement was reached, by id. Read under the lock. */
    fun earnedAt(snapshot: StatsSnapshot, id: String): Map<Int, Long> = snapshot.earned[id] ?: emptyMap()

    private fun scheduleSave() {
        synchronized(lock) {
            if (saveScheduled) return
            saveScheduled = true
            pendingSave = AppExecutorUtil.getAppScheduledExecutorService().schedule(
                {
                    // Given up before the writing starts, so that whatever changes while the file is
                    // being written can ask for a save of its own - see [saveScheduled].
                    synchronized(lock) { saveScheduled = false }
                    save()
                },
                SAVE_DELAY_SECONDS,
                TimeUnit.SECONDS,
            )
        }
    }

    private fun scheduleEvaluation() {
        synchronized(lock) {
            if (pendingEvaluation?.isDone == false) return
            pendingEvaluation = AppExecutorUtil.getAppScheduledExecutorService()
                .schedule({ runCatching { achievements() }.onFailure { thisLogger().warn("Could not evaluate achievements", it) } }, EVALUATION_DELAY_SECONDS, TimeUnit.SECONDS)
        }
    }

    /**
     * Put the book on disk.
     *
     * The file is read again first: another IDE may have written it since we last looked, and simply
     * overwriting would lose its evening's work. What it wrote is merged in (see
     * [StatsSnapshot.mergedWith]) and the merged whole is what goes back - through a temporary file and a
     * rename, so a crash mid-write leaves the previous file whole rather than half a new one.
     */
    fun save() {
        val text = synchronized(lock) {
            if (!dirty) return

            val onDisk = readFile()
            if (onDisk != null && onDisk != lastSeen) {
                StatsJson.decode(onDisk)?.let { theirs -> snapshot = snapshot.mergedWith(theirs) }
            }

            dirty = false
            StatsJson.encode(snapshot).also { lastSeen = it }
        }

        runCatching {
            Files.createDirectories(file.parent)
            val temporary = file.resolveSibling("$FILE_NAME.tmp")
            Files.write(temporary, text.toByteArray(StandardCharsets.UTF_8))
            runCatching {
                Files.move(temporary, file, StandardCopyOption.REPLACE_EXISTING, StandardCopyOption.ATOMIC_MOVE)
            }.recover {
                Files.move(temporary, file, StandardCopyOption.REPLACE_EXISTING)
            }
        }.onFailure {
            thisLogger().warn("Could not write the statistics to $file", it)
            /*
             * The kind of failure, not its words. A file error's message *is* the path - and this path
             * names the IDE's configuration directory, which names the person. The buffer scrubs paths on
             * the way in (see DiagnosticsLog), but here the leak is total and predictable, so it is
             * removed at the source rather than left to a pattern: "AccessDeniedException" says everything
             * worth knowing about why the statistics did not get written.
             */
            DiagnosticsLog.note(
                DiagnosticsLog.STATS,
                "the statistics could not be written (${it::class.simpleName ?: "unknown failure"})",
            )
            synchronized(lock) { dirty = true }
        }
    }

    private fun load(): StatsSnapshot {
        val text = readFile() ?: return StatsSnapshot()
        val decoded = StatsJson.decode(text)

        if (decoded == null) {
            // The file is not ours to understand - perhaps half-written by a crash. It is put aside rather
            // than overwritten: whatever is in it may still be worth something to somebody looking by hand.
            thisLogger().warn("The statistics file could not be read; starting afresh and keeping it aside")
            runCatching {
                Files.move(file, file.resolveSibling("$FILE_NAME.broken-${System.currentTimeMillis()}"))
            }
            return StatsSnapshot()
        }

        lastSeen = text
        return decoded
    }

    private fun readFile(): String? {
        if (!Files.isRegularFile(file)) return null
        return runCatching { Files.readString(file, StandardCharsets.UTF_8) }
            .onFailure { thisLogger().warn("Could not read the statistics from $file", it) }
            .getOrNull()
    }

    override fun dispose() {
        pendingSave?.cancel(false)
        pendingEvaluation?.cancel(false)
        runCatching { achievements() }
        save()
    }

    companion object {
        fun getInstance(): StatsLedger = service()

        const val FILE_NAME = "statistics.json"

        /** How long a change may sit in memory before it reaches the disk. */
        const val SAVE_DELAY_SECONDS = 15L

        /** How long after a change the achievements are re-read: soon, but folded with the next changes. */
        const val EVALUATION_DELAY_SECONDS = 2L

        /**
         * The book's home: the directory every JetBrains product on the machine shares, so that a person
         * working in two of them keeps one set of figures. The IDE's own configuration directory is the
         * fallback - one per product, but never missing.
         */
        fun directory(): Path {
            // A test IDE keeps its book to itself: the platform's tests raise a whole application, and a
            // run of them must not write a few minutes of make-believe into the person's own figures.
            if (ApplicationManager.getApplication()?.isUnitTestMode == true) {
                return Files.createTempDirectory("acc-stats")
            }

            val shared = runCatching { PathManager.getCommonDataPath() }.getOrNull()
            val base = shared ?: Path.of(PathManager.getConfigPath())
            return base.resolve("AmazingClaudeCode")
        }
    }
}

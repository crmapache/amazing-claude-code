package io.github.crmapache.amazingclaudecode.scenario

import java.io.File
import java.nio.file.Files
import kotlin.test.AfterTest
import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertFalse
import kotlin.test.assertIs
import kotlin.test.assertNull
import kotlin.test.assertTrue

/**
 * The file the queue lives in, read and written the way two windows really do it.
 *
 * The one thing worth proving here is the order: a turn has to be WRITTEN as taken before anything is
 * raised, because the other IDE window beats against this same file on its own timer. A claim that says
 * it took the turn while nothing reached the disk means the next beat takes the same turn again - two sets
 * of agents in one working copy, and on the screen it looks like a night that went fine.
 */
class QueueStoreTest {

    private val folder: File = Files.createTempDirectory("acc-queue").toFile()
    private val file = File(folder, "queue.json")

    private fun store() = QueueStore(file)

    @AfterTest
    fun tidy() {
        folder.setWritable(true)
        folder.deleteRecursively()
    }

    private fun entry(id: String = "q1", name: String = "Review and fix") = ScenarioQueued(
        id = id,
        scenarioId = "s1",
        scope = ScenarioScope.USER,
        scenarioName = name,
        addedAt = 1_000,
    )

    /** A turn put on the queue the way the desk puts one: with how the run the queue names stands. */
    private fun QueueStore.add(entry: ScenarioQueued, outcome: String = QueueOutcome.NONE): Boolean =
        edit { QueueRules.put(it, entry, outcome, now = 1_500) }

    @Test
    fun `a queue nobody has written yet is empty rather than unreadable`() {
        assertEquals(ScenarioQueue(), store().stored())
    }

    @Test
    fun `a turn taken is on the disk before anything is raised`() {
        store().add(entry())

        val move = store().claimNext({ QueueAhead(QueueOutcome.NONE) }, runId = "r1", now = 2_000)

        assertIs<QueueMove.Start>(move)
        // What the NEXT reader sees, which is the other window and this one after a restart.
        val written = store().all()
        assertEquals("r1", written.runId)
        assertTrue(written.waiting.isEmpty())
    }

    /** The second window's beat, landing a moment later: the turn is gone, so there is nothing to take. */
    @Test
    fun `the same turn is not taken twice`() {
        store().add(entry())

        assertIs<QueueMove.Start>(store().claimNext({ QueueAhead(QueueOutcome.NONE) }, runId = "r1", now = 2_000))
        assertIs<QueueMove.Wait>(store().claimNext({ QueueAhead(QueueOutcome.NONE) }, runId = "r2", now = 2_100))
    }

    @Test
    fun `a turn that would not start goes back to the head of the queue`() {
        store().add(entry())
        val move = assertIs<QueueMove.Start>(store().claimNext({ QueueAhead(QueueOutcome.NONE) }, runId = "r1", now = 2_000))

        assertTrue(store().putBack(move.entry, why = "scenarioGone"))

        val written = store().all()
        assertEquals(listOf("q1"), written.waiting.map { it.id })
        assertEquals("scenarioGone", written.waiting.single().failure)
        assertTrue(written.held)
    }

    /**
     * A turn added while the one before it was failing to start is kept.
     *
     * The refusal is written from what the disk says NOW rather than from the copy the claim handed back:
     * between taking a turn and failing to raise it lie the disk and a process that would not come up.
     */
    @Test
    fun `putting a turn back keeps what was added meanwhile`() {
        store().add(entry())
        val move = assertIs<QueueMove.Start>(store().claimNext({ QueueAhead(QueueOutcome.NONE) }, runId = "r1", now = 2_000))

        // Put while r1 is going, which is the only moment this can happen at all.
        store().add(entry(id = "q2", name = "Ship it"), QueueOutcome.GOING)
        store().putBack(move.entry, why = "noClaude")

        assertEquals(listOf("q1", "q2"), store().all().waiting.map { it.id })
    }

    /**
     * A file that could not be read is not an empty queue.
     *
     * Read as one, the first thing that prunes it would write that emptiness back, and a night somebody
     * lined up would be gone with nothing said anywhere. Nothing is started from it either: not knowing is
     * a reason to stand still, never a reason to raise agents.
     */
    @Test
    fun `an unreadable file starts nothing and is not written over`() {
        file.parentFile.mkdirs()
        file.writeText("{ this is not json")

        assertNull(store().stored())
        assertIs<QueueMove.Wait>(store().claimNext({ QueueAhead(QueueOutcome.NONE) }, runId = "r1", now = 2_000))
        assertFalse(store().add(entry()))
        assertEquals("{ this is not json", file.readText())
    }

    /**
     * How the last run ended is asked about the queue on the DISK, not about one read a moment earlier.
     *
     * This is the race two IDE windows are actually in. This window reads the queue, sees the run it names
     * as finished, and goes for the lock; the other window takes a turn in that gap and writes a run that
     * has only just started. Handed a verdict worked out before the lock, the rules would be told "the one
     * before is done" about a run that is going - and raise a second set of agents over one working copy,
     * with nothing on any screen to say why.
     */
    @Test
    fun `how the last run ended is asked about the queue under the lock`() {
        store().add(entry(id = "q1"))
        store().add(entry(id = "q2"))
        // The other window's turn, taken between this one's read and its lock.
        assertIs<QueueMove.Start>(store().claimNext({ QueueAhead(QueueOutcome.NONE) }, runId = "r1", now = 2_000))

        val asked = mutableListOf<String>()
        val move = store().claimNext(
            { queue ->
                asked += queue.runId
                // What this window would have said about the queue it read BEFORE that turn was taken.
                QueueAhead(if (queue.runId == "r1") QueueOutcome.GOING else QueueOutcome.DONE)
            },
            runId = "r2",
            now = 2_100,
        )

        assertEquals(listOf("r1"), asked)
        assertIs<QueueMove.Wait>(move)
        assertEquals(listOf("q2"), store().all().waiting.map { it.id })
    }

    /**
     * Standing behind a run somebody started by hand is written for the same reason a turn taken is: the
     * other window judges that run's ending off this file, and reads nothing to wait for otherwise.
     */
    @Test
    fun `standing behind a run started by hand reaches the disk`() {
        store().add(entry())

        val move = store().claimNext(
            { QueueAhead(QueueOutcome.NONE, going = listOf(QueueGoing(id = "r9", name = "Build it", startedAt = 1_800))) },
            runId = "r1",
            now = 2_000,
        )

        assertIs<QueueMove.Follow>(move)
        val written = store().all()
        assertEquals("r9", written.runId)
        assertEquals("Build it", written.runName)
        assertEquals(listOf("q1"), written.waiting.map { it.id })
    }

    /** A write that did not land is not a turn taken: the next beat must find the queue as it was. */
    @Test
    fun `a turn is not taken when the disk refuses the write`() {
        store().add(entry())
        folder.setWritable(false)

        val move = store().claimNext({ QueueAhead(QueueOutcome.NONE) }, runId = "r1", now = 2_000)

        folder.setWritable(true)
        assertIs<QueueMove.Wait>(move)
        assertEquals(listOf("q1"), store().all().waiting.map { it.id })
    }
}

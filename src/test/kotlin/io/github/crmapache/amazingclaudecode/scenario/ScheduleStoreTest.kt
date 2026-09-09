package io.github.crmapache.amazingclaudecode.scenario

import java.io.File
import java.nio.file.Files
import kotlin.test.AfterTest
import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertFalse
import kotlin.test.assertNotNull
import kotlin.test.assertNull
import kotlin.test.assertTrue

/**
 * The file the hours live in, read and written the way two windows really do it.
 *
 * Everything here fails silently and is only noticed the morning after. A claim that says it took the
 * hour when nothing reached the disk means the next beat takes the same hour again - two rounds of work
 * editing one working copy - and on the screen it looks exactly like a plugin nobody was running.
 */
class ScheduleStoreTest {

    private val folder: File = Files.createTempDirectory("acc-schedules").toFile()

    private fun store() = ScheduleStore(File(folder, "schedules.json"))

    @AfterTest
    fun tidy() {
        folder.setWritable(true)
        folder.deleteRecursively()
    }

    private fun hour(at: Int = 9 * 60, due: Long = 1_800_000_000_000) = ScenarioSchedule(
        scenarioId = "round",
        scope = ScenarioScope.USER,
        at = at,
        repeat = ScenarioSchedule.DAILY,
        nextAt = due,
    )

    /**
     * The half that happens on an ordinary machine: a disk that is full or a folder that turned read-only.
     * The claim is the only gate before a round of work is raised, so a claim that lies leaves the old
     * moment on disk and the very next beat - half a minute later, inside the same grace window - raises a
     * second run of the same thing.
     */
    @Test
    fun `an hour is not taken when the claim never reaches the disk`() {
        val store = store()
        store.put(hour())
        val stored = store.all().single()

        folder.setWritable(false)
        // Running as somebody who cannot be kept out of their own folder - nothing to prove here.
        if (runCatching { File(folder, "probe").also { it.writeText("x") }.delete() }.getOrDefault(false)) return

        assertNull(store.claimHour(stored.id, expected = stored.nextAt, armed = stored.copy(nextAt = 0)))
    }

    /**
     * The other half, and the one no check inside a single window can see: the second IDE on the same
     * repository, with its own clock against the same file. Whoever writes first has the hour; the other
     * one is looking at a moment that is no longer there and must not raise anything.
     */
    @Test
    fun `the second window finds the hour already taken`() {
        val first = store()
        first.put(hour())
        val stored = first.all().single()

        val second = store()
        assertNotNull(second.claimHour(stored.id, expected = stored.nextAt, armed = stored.copy(nextAt = 0)))

        assertNull(first.claimHour(stored.id, expected = stored.nextAt, armed = stored.copy(nextAt = 0)))
        assertEquals(0, store().all().single().nextAt)
    }

    /**
     * "The file could not be read" and "there is nothing in it" are different sentences, and reading the
     * first as the second is what makes somebody's mornings look deleted. The screen has to be able to
     * tell them apart, the pruning must not act on a list it never saw, and a save that could not be made
     * has to say so - otherwise the row is drawn, vanishes at the next look, and the panel appears to have
     * forgotten it on purpose.
     */
    @Test
    fun `a file that cannot be read is not an empty list`() {
        val damaged = File(folder, "schedules.json")
        damaged.writeText("[{\"id\":\"nine\",\"at\":54")

        val store = store()

        assertNull(store.stored())
        assertNull(store.keepOnly(project = emptyList(), user = emptyList()))
        assertFalse(store.put(hour()))
        assertFalse(store.remove("nine"))

        // And nothing was written over it: what is on the disk is still there to be rescued by hand.
        assertTrue(damaged.readText().startsWith("[{"))
    }

    /** A file of no length is damage too - this side never writes one, so one that is there was left. */
    @Test
    fun `an empty file is damage rather than an empty list`() {
        File(folder, "schedules.json").writeText("")

        assertNull(store().stored())
    }

    /** No file at all IS the empty list: nothing has ever been scheduled here. */
    @Test
    fun `no file at all is simply nothing scheduled`() {
        assertEquals(emptyList(), store().stored())
    }

    /**
     * Two arrangements that say exactly the same thing, in a file written before they had names.
     *
     * The names are worked out from what each one says, so identical twins are told apart by their place
     * in the list - and a place is not a name: the one that survives its neighbour would answer to the
     * name the neighbour had. An edit form still holding the old one would add a third arrangement
     * instead of changing this one, and a delete by it would ring on every morning after.
     */
    @Test
    fun `a twin keeps its name when its neighbour goes`() {
        File(folder, "schedules.json").writeText(
            """[{"scenarioId":"round","scope":"user","at":540,"repeat":"daily","nextAt":10},""" +
                """{"scenarioId":"round","scope":"user","at":540,"repeat":"daily","nextAt":20}]""",
        )

        val store = store()
        val (first, second) = store.all().let { it[0] to it[1] }
        assertTrue(first.id.isNotBlank() && second.id.isNotBlank() && first.id != second.id)

        // On the disk, not merely worked out again: the reading itself writes them down the first time.
        val onDisk = File(folder, "schedules.json").readText()
        assertTrue(onDisk.contains(first.id) && onDisk.contains(second.id))

        assertTrue(store.remove(first.id))
        assertEquals(second.id, store().all().single().id)
    }
}

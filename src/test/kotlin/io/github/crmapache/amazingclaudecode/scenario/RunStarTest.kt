package io.github.crmapache.amazingclaudecode.scenario

import java.nio.file.Files
import kotlin.test.AfterTest
import kotlin.test.BeforeTest
import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertFalse
import kotlin.test.assertTrue

/**
 * The star a person puts on a past run (see RunStore.star).
 *
 * Kept on the record and copied onto the row, and written without touching the moment the run was last
 * walked: that stamp is what a crashed run is closed at, and a star put on in the morning is not it.
 */
class RunStarTest {

    private val home = System.getProperty("user.home")
    private val sandbox = Files.createTempDirectory("acc-run-star").toFile()

    @BeforeTest
    fun moveHome() {
        System.setProperty("user.home", sandbox.absolutePath)
    }

    @AfterTest
    fun bringHomeBack() {
        System.setProperty("user.home", home)
        sandbox.deleteRecursively()
    }

    private fun finished(writtenAt: Long) = ScenarioRun(
        id = "r1",
        scenarioName = "Task -> Prod",
        state = RunState.DONE,
        startedAt = 1_000,
        finishedAt = 5_000,
        writtenAt = writtenAt,
    )

    @Test
    fun `a star goes on and comes off, on the record and on its row`() {
        val store = RunStore("/work/project")
        store.keep(finished(writtenAt = 5_000), now = 5_000)

        assertTrue(store.star("r1", starred = true))
        assertEquals(true, store.read("r1")?.starred)
        assertEquals(true, store.summaries().single().starred)

        assertTrue(store.star("r1", starred = false))
        assertEquals(false, store.read("r1")?.starred)
        assertEquals(false, store.summaries().single().starred)
    }

    @Test
    fun `starring does not move the moment the run was last walked`() {
        val store = RunStore("/work/project")
        store.keep(finished(writtenAt = 5_000), now = 5_000)

        store.star("r1", starred = true)

        assertEquals(5_000, store.read("r1")?.writtenAt)
    }

    @Test
    fun `a run that is not there is not starred into being`() {
        val store = RunStore("/work/project")

        assertFalse(store.star("gone", starred = true))
        assertTrue(store.summaries().isEmpty())
    }
}

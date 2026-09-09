package io.github.crmapache.amazingclaudecode.scenario

import java.io.File
import java.nio.file.Files
import kotlin.test.AfterTest
import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertFalse
import kotlin.test.assertNotEquals
import kotlin.test.assertNull
import kotlin.test.assertTrue

/**
 * The repository's own shelf, written and read back.
 *
 * Only the project shelf is exercised here on purpose: the other one is the person's real Claude home,
 * and a test that wrote into it would leave scenarios in the folder they actually work in.
 */
class ScenarioStoreTest {

    private val project: File = Files.createTempDirectory("acc-scenarios").toFile()
    private val store = ScenarioStore(project.absolutePath)

    @AfterTest
    fun tidy() {
        project.deleteRecursively()
    }

    /**
     * What is on the repository's shelf, which is the only one these tests write to.
     *
     * Counted here rather than through everything the store can see: the other shelf is the person's real
     * Claude home, and on a machine where they keep a scenario of their own every count through it is one
     * too many - which is what these assertions used to do.
     */
    private fun onTheShelf(): Int = store.shelf(ScenarioScope.PROJECT).orEmpty().size

    private fun scenario(name: String = "Round", id: String = "") = Scenario(
        id = id,
        name = name,
        stages = listOf(
            Stage(
                id = "s1",
                title = "Look",
                cards = listOf(Card(id = "c1", title = "Read", prompt = "read {{file}}")),
            ),
        ),
        inputs = listOf(ScenarioInput(id = "i1", name = "file", label = "File")),
    )

    @Test
    fun `a scenario written down comes back the same`() {
        val stored = store.save(scenario(), ScenarioScope.PROJECT)!!

        val read = store.find(stored.id, ScenarioScope.PROJECT)!!
        assertEquals("Round", read.name)
        assertEquals("read {{file}}", read.stages.single().cards.single().prompt)
        assertEquals(ScenarioScope.PROJECT, read.scope)
    }

    // The shelf is where the file lies, not what it says: nothing in the file may claim to know it, or a
    // scenario copied to the other shelf would go on calling itself a project one.
    @Test
    fun `the shelf is not written into the file`() {
        val stored = store.save(scenario(), ScenarioScope.PROJECT)!!
        val text = File(store.projectDirectory(), "${stored.id}.json").readText()

        assertFalse(text.contains("scope"), "the shelf must not be written into the file")
    }

    @Test
    fun `an identifier is given to a scenario that has none`() {
        val stored = store.save(scenario(), ScenarioScope.PROJECT)!!

        assertTrue(stored.id.isNotEmpty())
        assertTrue(stored.createdAt > 0)
        assertTrue(stored.updatedAt > 0)
    }

    @Test
    fun `a copy shares no identifier with what it was copied from`() {
        val stored = store.save(scenario(), ScenarioScope.PROJECT)!!
        val copy = store.duplicate(stored.id, ScenarioScope.PROJECT)!!

        assertNotEquals(stored.id, copy.id)
        assertNotEquals(stored.stages.single().id, copy.stages.single().id)
        assertNotEquals(stored.stages.single().cards.single().id, copy.stages.single().cards.single().id)
        assertNotEquals(stored.inputs.single().id, copy.inputs.single().id)
        assertEquals(2, onTheShelf())
    }

    @Test
    fun `deleting takes the file with it`() {
        val stored = store.save(scenario(), ScenarioScope.PROJECT)!!

        assertTrue(store.delete(stored.id, ScenarioScope.PROJECT))
        assertNull(store.find(stored.id, ScenarioScope.PROJECT))
        assertFalse(store.delete(stored.id, ScenarioScope.PROJECT))
    }

    // A file half-written when the power went, or written by an older build, must not take the panel down
    // with it: what cannot be read is left out of the list rather than thrown.
    @Test
    fun `an unreadable file is left out rather than thrown over`() {
        store.save(scenario(), ScenarioScope.PROJECT)
        File(store.projectDirectory(), "broken.json").writeText("{ this is not json")

        assertEquals(1, onTheShelf())
    }

    @Test
    fun `a pass count out of range is repaired on the way in`() {
        val stored = store.save(scenario(), ScenarioScope.PROJECT)!!
        val file = File(store.projectDirectory(), "${stored.id}.json")
        file.writeText(file.readText().replace("\"repeat\": 1", "\"repeat\": 400"))

        assertEquals(MAX_STAGE_REPEAT, store.find(stored.id, ScenarioScope.PROJECT)!!.stages.single().repeat)
    }

    /*
     * The identifiers are all this side's own, and they still come back from a page before they become file
     * names. One separator in one of them walks out of the shelf, and above the shelf of runs lie the
     * machine's book of accounts, its statistics and every other project's runs.
     */
    @Test
    fun `an identifier that is not a name is not put into a path`() {
        assertTrue(ScenarioStore.usableId(ScenarioStore.newId()))
        assertTrue(ScenarioStore.usableId("round-two_3"))

        assertFalse(ScenarioStore.usableId(".."))
        assertFalse(ScenarioStore.usableId("../../etc/passwd"))
        assertFalse(ScenarioStore.usableId("..\\..\\accounts"))
        assertFalse(ScenarioStore.usableId("run.json"))
        assertFalse(ScenarioStore.usableId(""))
        assertFalse(ScenarioStore.usableId("a".repeat(65)))
    }

    @Test
    fun `a scenario saved under such an identifier gets a real one instead`() {
        val stored = store.save(scenario(id = "../escaped"), ScenarioScope.PROJECT)!!

        assertTrue(ScenarioStore.usableId(stored.id))
        assertEquals(listOf("${stored.id}.json"), store.projectDirectory()!!.list()!!.toList())
    }

    @Test
    fun `deleting by such an identifier does nothing at all`() {
        store.save(scenario(), ScenarioScope.PROJECT)

        assertFalse(store.delete("../..", ScenarioScope.PROJECT))
        assertEquals(1, onTheShelf())
    }

    /**
     * A shelf that was never made is an EMPTY shelf, and a disk that will not answer is an unknown one.
     *
     * Told apart because one caller acts on the difference and acts destructively: the scheduled runs are
     * pruned against the scenarios that still exist, and an unknown shelf stops the pruning entirely. Read
     * as unknown, the folder nobody ever created - which is every machine with no scenarios of its own -
     * turned the pruning off for good, and a deleted scenario went on taking its hour every morning for
     * ever, answering "that scenario is gone" and marking the row as missed.
     */
    @Test
    fun `a shelf that was never made is empty rather than unknown`() {
        assertEquals(emptyList(), store.shelf(ScenarioScope.PROJECT))
    }

    @Test
    fun `a shelf under a folder that is not there at all is unknown`() {
        assertNull(ScenarioStore(File(project, "gone-with-the-branch").absolutePath).shelf(ScenarioScope.PROJECT))
    }
}

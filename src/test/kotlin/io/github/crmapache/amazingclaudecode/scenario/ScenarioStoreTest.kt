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

    // --- Dragged into place ------------------------------------------------------------

    /** A store whose personal shelf is a folder of the test's own rather than this person's Claude home. */
    private fun withHome(): ScenarioStore = ScenarioStore(project.absolutePath, claudeHome = File(project, "home"))

    private fun names(shelf: List<Scenario>?): List<String> = shelf.orEmpty().map { it.name }

    private fun three(on: ScenarioStore): List<Scenario> =
        listOf("One", "Two", "Three").map { name ->
            on.save(scenario(name), ScenarioScope.PROJECT)!!.also { Thread.sleep(2) }
        }

    @Test
    fun `a row put before another stays there`() {
        val (one, _, three) = three(store)

        assertNull(store.place(three.id, ScenarioScope.PROJECT, ScenarioScope.PROJECT, before = one.id))

        assertEquals(listOf("Three", "One", "Two"), names(store.shelf(ScenarioScope.PROJECT)))
    }

    @Test
    fun `a row put before nothing goes last`() {
        val (one, _, _) = three(store)

        assertNull(store.place(one.id, ScenarioScope.PROJECT, ScenarioScope.PROJECT, before = ""))

        assertEquals(listOf("Two", "Three", "One"), names(store.shelf(ScenarioScope.PROJECT)))
    }

    // The neighbour it was dropped before was deleted in another window meanwhile: last, rather than lost.
    @Test
    fun `a neighbour that is gone puts the row last`() {
        val (one, _, _) = three(store)

        assertNull(store.place(one.id, ScenarioScope.PROJECT, ScenarioScope.PROJECT, before = "deleted-meanwhile"))

        assertEquals(listOf("Two", "Three", "One"), names(store.shelf(ScenarioScope.PROJECT)))
    }

    // Written since the shelf was put in order: nobody placed it, so it goes where a new one always went.
    @Test
    fun `a scenario the order does not name comes after it`() {
        val (one, _, three) = three(store)
        store.place(three.id, ScenarioScope.PROJECT, ScenarioScope.PROJECT, before = one.id)

        store.save(scenario("Four"), ScenarioScope.PROJECT)

        assertEquals(listOf("Three", "One", "Two", "Four"), names(store.shelf(ScenarioScope.PROJECT)))
    }

    // Every field of a scenario has a default, so the order file would read as one called "Untitled".
    @Test
    fun `the order is never read as a scenario`() {
        val (one, _, three) = three(store)
        store.place(three.id, ScenarioScope.PROJECT, ScenarioScope.PROJECT, before = one.id)

        assertTrue(File(store.projectDirectory(), ScenarioStore.ORDER).isFile)
        assertEquals(3, onTheShelf())
    }

    @Test
    fun `an order that will not parse costs the places and not the rows`() {
        three(store)
        File(store.projectDirectory(), ScenarioStore.ORDER).writeText("{ not json")

        assertEquals(listOf("One", "Two", "Three"), names(store.shelf(ScenarioScope.PROJECT)))
    }

    @Test
    fun `a row dragged onto the other shelf takes its file with it`() {
        val home = withHome()
        val (one, two, _) = three(home)
        val mine = home.save(scenario("Mine"), ScenarioScope.USER)!!
        val before = File(home.projectDirectory(), "${two.id}.json").readText()

        assertNull(home.place(two.id, ScenarioScope.PROJECT, ScenarioScope.USER, before = mine.id))

        assertEquals(listOf("One", "Three"), names(home.shelf(ScenarioScope.PROJECT)))
        assertEquals(listOf("Two", "Mine"), names(home.shelf(ScenarioScope.USER)))
        assertFalse(File(home.projectDirectory(), "${two.id}.json").exists())
        // Carried rather than written again: not a character of it changes, the moment it was edited included.
        assertEquals(before, File(home.userDirectory(), "${two.id}.json").readText())
        assertEquals(ScenarioScope.USER, home.find(two.id, ScenarioScope.USER)!!.scope)
        assertNull(home.find(one.id, ScenarioScope.USER))
    }

    // A project file that came back with a checkout beside somebody's own copy: either could be the keeper.
    @Test
    fun `a move onto a shelf that holds the same identifier is refused`() {
        val home = withHome()
        val shared = home.save(scenario("Shared"), ScenarioScope.PROJECT)!!
        File(home.userDirectory().apply { mkdirs() }, "${shared.id}.json")
            .writeText(File(home.projectDirectory(), "${shared.id}.json").readText().replace("Shared", "Own copy"))

        assertEquals(
            ScenarioStore.TWIN,
            home.place(shared.id, ScenarioScope.PROJECT, ScenarioScope.USER, before = ""),
        )
        assertEquals("Shared", home.find(shared.id, ScenarioScope.PROJECT)!!.name)
        assertEquals("Own copy", home.find(shared.id, ScenarioScope.USER)!!.name)
    }

    @Test
    fun `a row that is on neither shelf is gone`() {
        val home = withHome()
        three(home)

        assertEquals(ScenarioStore.GONE, home.place("nobody", ScenarioScope.PROJECT, ScenarioScope.USER, before = ""))
        assertEquals(ScenarioStore.GONE, home.place("nobody", ScenarioScope.PROJECT, ScenarioScope.PROJECT, before = ""))
        assertEquals(ScenarioStore.GONE, home.place("../..", ScenarioScope.PROJECT, ScenarioScope.PROJECT, before = ""))
    }
}

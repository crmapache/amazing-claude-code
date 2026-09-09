package io.github.crmapache.amazingclaudecode.scenario

import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertNotNull
import kotlin.test.assertNull
import kotlin.test.assertTrue

/**
 * The list of scheduled runs, exercised away from the file it lives in.
 *
 * Every rule here fails silently and expensively. A schedule that came back after being deleted starts
 * agents in somebody's working copy at nine in the morning; one whose name two IDE windows disagree about
 * cannot be edited or removed at all; a hour taken twice is two rounds of work in one checkout. None of
 * those says anything on any screen - the morning after they all look like a plugin that was not running.
 */
class SchedulesTest {

    private fun schedule(
        id: String = "",
        scenarioId: String = "s1",
        scope: String = ScenarioScope.PROJECT,
        at: Int = 9 * 60,
        repeat: String = ScenarioSchedule.ONCE,
        nextAt: Long = 0,
        inputs: Map<String, String> = emptyMap(),
    ) = ScenarioSchedule(
        id = id,
        scenarioId = scenarioId,
        scope = scope,
        at = at,
        repeat = repeat,
        nextAt = nextAt,
        inputs = inputs,
    )

    private fun scenario(id: String = "s1", scope: String = ScenarioScope.PROJECT) =
        Scenario(id = id, name = "Round", scope = scope)

    // --- Naming what a previous build left unnamed ------------------------------------

    @Test
    fun `a record written before names existed gets one`() {
        val named = Schedules.identify(listOf(schedule()))

        assertTrue(named.single().id.isNotBlank())
    }

    /**
     * The point of the digest: the file belongs to a project and two IDE windows read it on their own.
     * Handed out fresh, the names would differ between them, and whichever wrote last would leave the
     * other pointing at records that do not exist.
     */
    @Test
    fun `two readings of the same file agree on the name`() {
        val file = listOf(schedule(at = 9 * 60), schedule(scenarioId = "s2", at = 21 * 60))

        assertEquals(Schedules.identify(file).map { it.id }, Schedules.identify(file).map { it.id })
    }

    @Test
    fun `two arrangements that say the same thing still get names of their own`() {
        val named = Schedules.identify(listOf(schedule(), schedule()))

        assertEquals(2, named.map { it.id }.toSet().size)
    }

    @Test
    fun `a name that is already there is left alone`() {
        val named = Schedules.identify(listOf(schedule(id = "kept"), schedule()))

        assertEquals("kept", named.first().id)
    }

    /**
     * Naming has to happen at the single door of the store, and this is what it buys: an arrangement from
     * an older file can be edited and removed like any other. Read raw, a save would add a second alarm
     * and a delete would do nothing while the hour went on coming round.
     */
    @Test
    fun `a named legacy record can be edited and removed`() {
        val named = Schedules.identify(listOf(schedule()))
        val id = named.single().id

        val edited = Schedules.put(named, named.single().copy(at = 15 * 60))
        assertEquals(1, edited.size)
        assertEquals(15 * 60, edited.single().at)

        assertEquals(0, Schedules.remove(edited, id).size)
    }

    // --- Adding and changing ----------------------------------------------------------

    @Test
    fun `a scenario may carry several arrangements`() {
        val list = Schedules.put(Schedules.put(emptyList(), schedule(at = 9 * 60)), schedule(at = 21 * 60))

        assertEquals(2, list.size)
        assertEquals(listOf(9 * 60, 21 * 60), list.map { it.at })
    }

    @Test
    fun `saving one that is already there replaces it`() {
        val list = Schedules.put(emptyList(), schedule(at = 9 * 60))
        val again = Schedules.put(list, list.single().copy(at = 21 * 60))

        assertEquals(1, again.size)
        assertEquals(21 * 60, again.single().at)
    }

    /**
     * The form may have been open while the arrangement behind it was deleted in another window. Silence
     * would lose what somebody just typed, so it becomes a new record - and under this side's own name,
     * because what a stored thing is called is not a page's to choose.
     */
    @Test
    fun `saving one that is gone makes a new record with a name of our own`() {
        val list = Schedules.put(emptyList(), schedule(id = "vanished", at = 21 * 60))

        assertEquals(1, list.size)
        assertEquals(21 * 60, list.single().at)
        assertTrue(list.single().id.isNotBlank())
        assertTrue(list.single().id != "vanished")
    }

    // --- Taking the hour ---------------------------------------------------------------

    /**
     * The claim is what replaced the old refusal "a run is already going", which quietly kept the clock
     * from raising a second run of the same thing inside the five minutes an hour stays due.
     */
    @Test
    fun `only the first of two attempts on one hour wins`() {
        val due = 1_700_000_000_000
        val list = Schedules.put(emptyList(), schedule(repeat = ScenarioSchedule.DAILY, nextAt = due))
        val id = list.single().id
        val armed = ScheduleClock.armed(list.single(), firedAt = due)

        val first = Schedules.claimHour(list, id, expected = due, armed = armed)
        assertNotNull(first)

        assertNull(Schedules.claimHour(first, id, expected = due, armed = armed))
    }

    @Test
    fun `an hour of a record that is gone is not taken`() {
        assertNull(Schedules.claimHour(emptyList(), "nobody", expected = 1, armed = schedule()))
    }

    // --- Writing down what happened ----------------------------------------------------

    /**
     * The clock reads the list at the top of a tick and writes at the bottom of it, with a disk and a
     * process coming up in between. Writing back its own copy would put the old time back every morning,
     * silently, over the change somebody had just made.
     */
    @Test
    fun `an edit made while the hour was firing is not rolled back`() {
        val due = 1_700_000_000_000
        val list = Schedules.put(emptyList(), schedule(repeat = ScenarioSchedule.DAILY, nextAt = due, at = 9 * 60))
        val id = list.single().id
        val taken = Schedules.claimHour(list, id, expected = due, armed = ScheduleClock.armed(list.single(), firedAt = due))
        assertNotNull(taken)

        // Somebody moves it to the afternoon while the run is coming up.
        val edited = Schedules.put(taken, taken.single().copy(at = 15 * 60))

        val settled = Schedules.settle(edited, id, due = due, firedAt = due + 1_000, ran = true)
        assertEquals(15 * 60, settled.single().at)
        assertEquals(due + 1_000, settled.single().lastAt)
    }

    @Test
    fun `a one-off that ran leaves the list, and a refused one stays`() {
        val due = 1_700_000_000_000
        val list = Schedules.put(emptyList(), schedule(nextAt = due))
        val id = list.single().id
        val taken = Schedules.claimHour(list, id, expected = due, armed = ScheduleClock.armed(list.single(), firedAt = due))
        assertNotNull(taken)

        assertEquals(0, Schedules.settle(taken, id, due = due, firedAt = due, ran = true).size)

        val refused = Schedules.settle(taken, id, due = due, firedAt = due, ran = false)
        assertEquals(1, refused.size)
        assertEquals(due, refused.single().missedAt)
    }

    @Test
    fun `writing down an hour of a record that was deleted brings nothing back`() {
        assertEquals(0, Schedules.settle(emptyList(), "vanished", due = 1, firedAt = 2, ran = true).size)
    }

    // --- Pruning against the shelves ---------------------------------------------------

    @Test
    fun `an arrangement whose scenario is gone goes with it`() {
        val list = Schedules.put(emptyList(), schedule(scenarioId = "s1"))

        assertEquals(0, Schedules.keepOnly(list, project = emptyList(), user = emptyList()).size)
    }

    /**
     * Moving a scenario from the repository to one's own folder is what the editor does when the shelf is
     * changed, and by the old rule - matched on identifier AND shelf - it quietly took every hour set for
     * it. With a list of them that is a morning's worth of times and answers typed in by hand.
     */
    @Test
    fun `an arrangement follows its scenario to the other shelf`() {
        val list = Schedules.put(emptyList(), schedule(scope = ScenarioScope.PROJECT))
        val kept = Schedules.keepOnly(list, project = emptyList(), user = listOf(scenario(scope = ScenarioScope.USER)))

        assertEquals(1, kept.size)
        assertEquals(ScenarioScope.USER, kept.single().scope)
    }

    /**
     * One identifier on both shelves is possible - a project file that came back with a git checkout
     * beside somebody's own copy - and then there is no answer to "which one is it now".
     */
    @Test
    fun `one identifier on two shelves leaves the arrangement where it was`() {
        val list = Schedules.put(emptyList(), schedule(scope = ScenarioScope.PROJECT))
        val kept = Schedules.keepOnly(
            list,
            project = listOf(scenario(scope = ScenarioScope.PROJECT)),
            user = listOf(scenario(scope = ScenarioScope.USER)),
        )

        assertEquals(ScenarioScope.PROJECT, kept.single().scope)
    }

    /**
     * A branch checked out without a `.claude/scenarios` folder in it is not the same sentence as "this
     * project has no scenarios". Read as the second, it empties the whole file, and the arrangements do
     * not come back when the branch does.
     */
    @Test
    fun `a shelf nobody could read takes nothing away`() {
        val list = Schedules.put(emptyList(), schedule())

        assertEquals(1, Schedules.keepOnly(list, project = null, user = emptyList()).size)
        assertEquals(1, Schedules.keepOnly(list, project = emptyList(), user = null).size)
    }
}

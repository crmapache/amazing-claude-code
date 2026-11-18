package io.github.crmapache.amazingclaudecode.scenario

import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertFalse
import kotlin.test.assertIs
import kotlin.test.assertTrue
import kotlinx.serialization.json.Json
import kotlinx.serialization.json.jsonObject

/**
 * A stage that runs once per item of a list: the decisions that either do an item twice or lose one, and
 * look perfectly healthy on the screen either way (see StageList).
 */
class StageListTest {

    private fun body(json: String) = Json.parseToJsonElement(json).jsonObject

    private val stage = Stage(
        id = "plans",
        title = "Plans",
        each = StageEach(name = "card", description = "the cards"),
        cards = listOf(
            Card(id = "plan", title = "Plan it", prompt = "/plan [[card]]"),
            Card(id = "check", title = "Check it", prompt = "/check [[card]]"),
        ),
    )

    private val check = Stage(id = "check", title = "Check", cards = listOf(Card(id = "sum", title = "Sum up", prompt = "/sum")))

    /** The run as begin() writes it: one stand-in pass for the list, then the stage after it. */
    private val planned = ScenarioRules.plan(Scenario(stages = listOf(stage, check))).map {
        RunStep(key = it.key, cardId = it.cardId, stageId = it.stageId, pass = it.pass, title = it.title)
    }

    private fun items(vararg labels: String) = labels.map { StageList.Listed(label = it, value = "https://cards/$it") }

    @Test
    fun `a list is read from objects and from bare strings`() {
        val reading = StageList.read(body("""{"items": [{"label": "Titles", "value": "https://a"}, "https://b", {"value": " https://c "}]}"""))

        assertIs<StageList.Reading.Items>(reading)
        assertEquals(listOf("Titles", "https://b", "https://c"), reading.items.map { it.label })
        assertEquals(listOf("https://a", "https://b", "https://c"), reading.items.map { it.value })
    }

    // Dropped, an item with no value is one that never gets its pass and is never mentioned again.
    @Test
    fun `an item with nothing to write in spoils the answer rather than being dropped`() {
        val reading = StageList.read(body("""{"items": [{"value": "https://a"}, {"label": "no value"}, null, 7]}"""))

        assertIs<StageList.Reading.Unusable>(reading)
        assertEquals(listOf(2, 3), reading.places)
        assertIs<StageList.Reading.Missing>(StageList.read(body("""{"items": "the cards"}""")))
        assertIs<StageList.Reading.Missing>(StageList.read(body("""{"ready": true}""")))
    }

    @Test
    fun `an empty list is a list and a long one is refused whole`() {
        assertEquals(StageList.Reading.Items(emptyList()), StageList.read(body("""{"items": []}""")))

        val long = (1..MAX_STAGE_ITEMS + 1).joinToString(",") { "\"$it\"" }
        assertEquals(StageList.Reading.TooLong(MAX_STAGE_ITEMS + 1), StageList.read(body("""{"items": [$long]}""")))
    }

    @Test
    fun `a label is a line of a few words`() {
        val reading = StageList.read(body("""{"items": [{"label": "two\n  lines", "value": "v"}, {"label": "${"x".repeat(300)}", "value": "w"}]}"""))

        assertIs<StageList.Reading.Items>(reading)
        assertEquals("two lines", reading.items[0].label)
        assertEquals(StageList.LABEL_CHARS + 3, reading.items[1].label.length)
    }

    @Test
    fun `the stand-in becomes one pass per item, every card in each, in the head's order`() {
        val steps = StageList.expand(planned, stage, items("one", "two", "three"), now = 5)

        assertEquals(
            listOf("plans:plan:1", "plans:check:1", "plans:plan:2", "plans:check:2", "plans:plan:3", "plans:check:3", "check:sum:1"),
            steps.map { it.key },
        )
        assertEquals(listOf("one", "one", "two", "two", "three", "three"), steps.take(6).map { it.item?.label })
        assertEquals(listOf(1, 1, 2, 2, 3, 3), steps.take(6).map { it.item?.index })
        assertTrue(steps.take(6).all { it.item?.count == 3 && it.state == StepState.WAITING })
        assertEquals(null, steps.last().item)
    }

    // A stage with nothing to do is not one a stopped run never reached, and the screen says which.
    @Test
    fun `an empty list skips the stage and says it was empty`() {
        val begun = planned.mapIndexed { index, step -> if (index == 0) step.copy(state = StepState.JUDGING, startedAt = 3) else step }
        val steps = StageList.expand(begun, stage, emptyList(), now = 9)

        assertEquals(planned.map { it.key }, steps.map { it.key })
        assertTrue(steps.take(2).all { it.state == StepState.SKIPPED && it.item?.count == 0 && it.startedAt == 0L })
        assertEquals(2, StageList.afterPass(steps, 0))
    }

    @Test
    fun `an item is put off once, on its first go`() {
        val first = StageList.expand(planned, stage, items("one"), now = 0)

        assertTrue(StageList.canPutOff(first[0]))
        assertFalse(StageList.canPutOff(first[0].copy(item = first[0].item?.copy(again = "it was down"))))
        assertFalse(StageList.canPutOff(planned[0]))
        assertFalse(StageList.canPutOff(planned[0].copy(item = RunItem())))
    }

    /*
     * Put off on its first card: the card after it in the pass was written in the belief it had run, so it is
     * skipped now and comes back with it - at the end of the stage, before the stage after it.
     */
    @Test
    fun `a second go goes to the end of the stage with the rest of its pass`() {
        val steps = StageList.expand(planned, stage, items("one", "two"), now = 0)
            .mapIndexed { index, step -> if (index == 0) step.copy(state = StepState.DONE, verdict = "later") else step }
        val after = StageList.putOff(steps, at = 0, reason = "Notion asked to sign in", now = 7)

        assertEquals(
            listOf("plans:plan:1", "plans:check:1", "plans:plan:2", "plans:check:2", "plans:plan:3", "plans:check:3", "check:sum:1"),
            after.map { it.key },
        )
        assertEquals(StepState.SKIPPED, after[1].state)
        assertEquals(listOf("one", "one"), after.subList(4, 6).map { it.item?.label })
        assertTrue(after.subList(4, 6).all { it.item?.again == "Notion asked to sign in" && it.item.index == 1 && it.state == StepState.WAITING })
        assertEquals(2, StageList.afterPass(after, 0))
    }

    // The cards before it in the pass did finish: the second go starts at the card that was put off.
    @Test
    fun `a second go starts at the card that was put off`() {
        val steps = StageList.expand(planned, stage, items("one"), now = 0)
            .mapIndexed { index, step -> if (index <= 1) step.copy(state = StepState.DONE) else step }
        val after = StageList.putOff(steps, at = 1, reason = "the check could not reach CI", now = 7)

        assertEquals(listOf("plans:plan:1", "plans:check:1", "plans:check:2", "check:sum:1"), after.map { it.key })
        assertEquals(2, StageList.afterPass(after, 1))
    }
}

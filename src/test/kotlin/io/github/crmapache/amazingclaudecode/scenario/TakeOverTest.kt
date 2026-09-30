package io.github.crmapache.amazingclaudecode.scenario

import io.github.crmapache.amazingclaudecode.claude.PermissionChannel
import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertFalse
import kotlin.test.assertTrue
import kotlinx.serialization.json.Json
import kotlinx.serialization.json.JsonObject

/**
 * When the head does a card's work itself, and what it may do while the fence is down.
 *
 * Both halves fail quietly, in opposite directions. A take-over that never fires is the night ending red
 * on something the head could have finished, which is the whole reason the setting exists; one that fires
 * where it should not is the head getting past a stop the scenario put there on purpose, with nobody
 * watching.
 */
class TakeOverTest {

    private val handsOver = HeadSettings(onGiveUp = HeadSettings.ON_GIVE_UP_HEAD)

    private fun request(tool: String, input: String = "{}") = PermissionChannel.ToolPermission(
        requestId = "req-1",
        toolName = tool,
        toolUseId = "call-1",
        input = Json.parseToJsonElement(input) as JsonObject,
        requiresUserInteraction = tool == "AskUserQuestion",
    )

    @Test
    fun `a scenario that says nothing keeps stopping where it always did`() {
        assertEquals(HeadSettings.ON_GIVE_UP_STOP, HeadSettings().onGiveUp)
        assertFalse(TakeOver.wanted(HeadSettings(), alreadyTaken = false, stopAsked = false))
    }

    @Test
    fun `a card its session could not finish goes to the head once`() {
        assertTrue(TakeOver.wanted(handsOver, alreadyTaken = false, stopAsked = false))
        assertFalse(TakeOver.wanted(handsOver, alreadyTaken = true, stopAsked = false), "a second take-over of one card")
    }

    // The head names a hard stop at the verdict, and that is what keeps it a stop with the fence down.
    @Test
    fun `a stop the head named as not its own is never taken over`() {
        assertFalse(TakeOver.wanted(handsOver, alreadyTaken = false, stopAsked = true))
    }

    @Test
    fun `while it does a card's work the head is trusted the way the card was`() {
        val verdict = TakeOver.answer(handsOver, request("Bash", """{"command":"git commit -m x"}"""))

        assertTrue(verdict.ok, "the same commit the fence refuses a foreman")
        assertFalse(HeadFence.judge(request("Bash", """{"command":"git commit -m x"}""")).ok)
    }

    @Test
    fun `a scenario that leaves questions to a person grants the head nothing beyond the trust`() {
        val verdict = TakeOver.answer(
            handsOver.copy(onQuestion = HeadSettings.ON_QUESTION_STOP),
            request("Bash", """{"command":"rm -rf build"}"""),
        )

        assertFalse(verdict.ok)
        assertTrue(verdict.why.isNotBlank(), "a refusal the head can read and work around")
    }

    // The one who would answer it is the one asking.
    @Test
    fun `a question in words is refused whichever way questions go`() {
        for (settings in listOf(handsOver, handsOver.copy(onQuestion = HeadSettings.ON_QUESTION_STOP))) {
            val verdict = TakeOver.answer(settings, request("AskUserQuestion", """{"questions":[]}"""))
            assertFalse(verdict.ok)
            assertEquals(TakeOver.NOBODY_TO_ASK, verdict.why)
        }
    }
}

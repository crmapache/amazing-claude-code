package io.github.crmapache.amazingclaudecode.scenario

import kotlin.test.Test
import kotlin.test.assertEquals

/**
 * The English line a panel note carries for a phone older than the panel's own notes (see RunMove.inEnglish).
 *
 * Such a phone draws the note's text under the main thread's name. Left empty, every move of a run between
 * accounts was an empty line signed by the main thread; worded wrong, it says the run went somewhere it did not.
 */
class RunMoveTest {

    @Test
    fun `a move away from a refusing account names the window and both accounts`() {
        val move = RunMove(RunMove.LIMIT, from = "Main", to = "Proton", window = "five_hour")

        assertEquals("The 5-hour limit of Main ran out. Moved the run to Proton.", move.inEnglish())
    }

    @Test
    fun `a wait with no reset known promises no time`() {
        val move = RunMove(RunMove.LIMIT, from = "Main", to = "", waits = true, window = "seven_day_opus")

        assertEquals("The weekly Opus limit of Main ran out, and no other account has room. The run waits.", move.inEnglish())
    }

    @Test
    fun `an account that could not take the run is not said to have run out`() {
        val move = RunMove(RunMove.UNFIT, from = "Work", to = "", waits = true, window = "")

        assertEquals("Work could not take the run, and no other account has room. The run waits.", move.inEnglish())
    }

    @Test
    fun `the person's choice and an unnamed CLI sign-in are said as what they are`() {
        assertEquals(
            "Moved the run to the Claude Code sign-in - the account you chose.",
            RunMove(RunMove.CHOICE, from = "Work", to = "").inEnglish(),
        )
    }
}

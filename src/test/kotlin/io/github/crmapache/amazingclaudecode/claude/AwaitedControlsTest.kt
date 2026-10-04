package io.github.crmapache.amazingclaudecode.claude

import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertNull
import kotlin.test.assertSame
import kotlin.test.assertTrue

class AwaitedControlsTest {

    private fun control(watched: Boolean, failures: MutableList<String> = mutableListOf()) =
        AwaitedControls.Control(onResult = {}, onFailure = { failures += it }, watched = watched)

    // A rewind stopped by its process going (a restart at the end of the turn it interrupted, a stop from
    // the phone) used to get no answer at all: its dialog stood "working" and its tab's queue stood still.
    @Test
    fun `a watched request is handed back when the process goes, the rest are left`() {
        val controls = AwaitedControls()
        val rewind = control(watched = true)
        val probe = control(watched = false)
        controls.put("rewind", rewind)
        controls.put("probe", probe)

        val abandoned = controls.abandonWatched()

        assertEquals(listOf(rewind), abandoned)
        assertNull(controls.take("rewind"))
        assertSame(probe, controls.take("probe"))
    }

    @Test
    fun `a request answered or timed out is not handed back a second time`() {
        val controls = AwaitedControls()
        controls.put("rewind", control(watched = true))

        assertTrue(controls.take("rewind") != null)
        assertEquals(emptyList(), controls.abandonWatched())
    }

    @Test
    fun `a stop drops what nobody watches and leaves a watched latecomer to its timeout`() {
        val controls = AwaitedControls()
        controls.put("probe", control(watched = false))
        val late = control(watched = true)
        controls.put("late", late)

        controls.dropUnwatched()

        assertNull(controls.take("probe"))
        assertSame(late, controls.take("late"))
    }
}

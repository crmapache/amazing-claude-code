package io.github.crmapache.amazingclaudecode.claude

import io.github.crmapache.amazingclaudecode.claude.ProjectCatalog.SentHints
import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertFalse
import kotlin.test.assertTrue

/**
 * Whether an incomplete walk of the disk may be broadcast.
 *
 * Every way of getting this wrong is silent, and each one shows up as the same thing on screen: the "/"
 * hint stops answering, with nothing anywhere to say why. Hence the rule apart from the disk.
 */
class SentHintsTest {

    private val sent = SentHints.of("canonical", setOf("task", "fix"))

    @Test
    fun `nothing has been sent yet, so nothing can have been lost`() {
        // A fresh install. Held as a glued string and parsed back, the empty map read as one empty name
        // that every walk had "lost", and the very first real broadcast was blocked.
        assertTrue(SentHints.NOTHING.believes(setOf("task")))
        assertTrue(SentHints.NOTHING.believes(emptySet()))
    }

    @Test
    fun `a walk that still has every name we sent is believed`() {
        assertTrue(sent.believes(setOf("task", "fix", "review")))
    }

    @Test
    fun `a walk that lost a name we sent is not`() {
        assertFalse(sent.believes(setOf("task")))
    }

    @Test
    fun `a description written on several lines is not a lost name`() {
        // The map is compared by names, never by taking the broadcast string apart again. A description
        // over several lines is something the skill file format allows and a test next door already
        // covers, and parsed back each extra line read as a name that no longer exists.
        val multiline = SentHints.of("task\tfirst line\nsecond line\t", setOf("task"))

        assertTrue(multiline.believes(setOf("task")))
    }

    @Test
    fun `patience runs out, so a door that closed for good is not a life sentence`() {
        // A hiccup is ridden out in silence; a directory that will never be readable again - macOS
        // revoking access, a plugin folder that lost its mode - used to freeze the hint on what was read
        // before the loss for the whole life of the project, with the disk re-read in full every two
        // seconds meanwhile.
        var state = sent
        val lost = setOf("task")

        repeat(SentHints.PATIENCE) {
            assertFalse(state.believes(lost), "gave up after $it rounds instead of ${SentHints.PATIENCE}")
            state = state.heldBack()
        }

        assertTrue(state.believes(lost))
    }

    @Test
    fun `a walk that got through restores the patience`() {
        val state = sent.heldBack().heldBack().believed()

        assertEquals(0, state.refusals)
        assertFalse(state.believes(setOf("task")))
    }

    @Test
    fun `what was accepted becomes the new baseline`() {
        // Once the loss is taken for the truth the smaller map is what has been sent, so the next round
        // is not a refusal all over again.
        val accepted = SentHints.of("smaller", setOf("task"))

        assertTrue(accepted.believes(setOf("task")))
        assertEquals(0, accepted.refusals)
    }
}

package io.github.crmapache.amazingclaudecode.claude

import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertTrue

/**
 * Recovering a swallowed message is the panel's most expensive place in both directions: do too little
 * and a person wrote something and nothing happened, do too much and one and the same request is
 * carried out twice. There is no live process here, so a turn is substituted by a flag and a send by an
 * entry in the list.
 */
class PromptDeliveriesTest {

    private var turn = 0L

    /** A send: each has a time of its own, so that the order is as it is in life. */
    private fun sent(text: String, repeat: Boolean = false) =
        PromptDeliveries.Delivery(text, emptyList(), sentAt = ++turn, repeat = repeat)

    // Exactly the loss this whole thing exists for: two "go on" in a row, and only one arrived. Closing
    // both waits by them means silently losing the second.
    @Test
    fun `what arrived closes only its own wait`() {
        val deliveries = PromptDeliveries()
        val first = sent("go on")
        val second = sent("go on")
        deliveries.watch(first)
        deliveries.watch(second)

        val missing = deliveries.settle(listOf(first, second), listOf(first))

        assertEquals(listOf(second), missing)
    }

    // The second lost message waits for the end of the turn the first one started: sending them in a row
    // means writing the second into a turn already running - the very place where messages get lost.
    @Test
    fun `one message is resent at a time`() {
        val deliveries = PromptDeliveries()
        val first = sent("fix the tests")
        val second = sent("and build it")
        deliveries.watch(first)
        deliveries.watch(second)

        var running = false
        val resent = mutableListOf<String>()
        deliveries.resendLost(listOf(first, second), isTurnRunning = { running }) { lost ->
            resent += lost.text
            // The send started a turn - exactly what a real resend does.
            running = true
        }

        assertEquals(listOf("fix the tests"), resent)
        // The second one has not gone anywhere: the check after this turn's end will pick it up.
        assertEquals(listOf(second), deliveries.stillPending(listOf(first, second)))
    }

    // A repeat has run out of attempts, and it comes to nothing but an error in the panel. No turn
    // starts from that, and the next lost message would otherwise wait for it forever.
    @Test
    fun `a send that never became a turn does not hold up the next one`() {
        val deliveries = PromptDeliveries()
        val exhausted = sent("go on", repeat = true)
        val next = sent("and build it")
        deliveries.watch(exhausted)
        deliveries.watch(next)

        var running = false
        val resent = mutableListOf<String>()
        deliveries.resendLost(listOf(exhausted, next), isTurnRunning = { running }) { lost ->
            resent += lost.text
            // A repeat does not go outwards - no turn begins from it.
            if (!lost.repeat) running = true
        }

        assertEquals(listOf("go on", "and build it"), resent)
    }

    // The very hole this exists for: the repeat vanished as silently as the original. The turn it
    // declared is never going to end, so waiting for a free one means waiting forever - and the person
    // would be left with a spinner and no word about the loss.
    @Test
    fun `an exhausted repeat is handed over even in the middle of a turn`() {
        val deliveries = PromptDeliveries()
        val exhausted = sent("deploy it", repeat = true)
        deliveries.watch(exhausted)

        val handed = mutableListOf<String>()
        deliveries.resendLost(listOf(exhausted), isTurnRunning = { true }) { handed += it.text }

        assertEquals(listOf("deploy it"), handed)
        // Taken out of the list: nothing more is going to be sent for it.
        assertTrue(deliveries.snapshot().isEmpty())
    }

    // While the check was awaited, the conversation could have gone into a new turn - because the person
    // wrote again, for instance.
    @Test
    fun `nothing is resent in the middle of someone else's turn`() {
        val deliveries = PromptDeliveries()
        val lost = sent("fix the tests")
        deliveries.watch(lost)

        var resent = 0
        deliveries.resendLost(listOf(lost), isTurnRunning = { true }) { resent++ }

        assertEquals(0, resent)
        assertEquals(listOf(lost), deliveries.stillPending(listOf(lost)))
    }

    // There are several chains of checks in the air - one per turn's end. What one of them took must not
    // go out with a second.
    @Test
    fun `what a neighbouring chain closed does not go out twice`() {
        val deliveries = PromptDeliveries()
        val first = sent("fix the tests")
        val second = sent("and build it")
        deliveries.watch(first)
        deliveries.watch(second)

        // A neighbouring chain managed to find the first one in the conversation.
        deliveries.settle(listOf(first), listOf(first))

        val resent = mutableListOf<String>()
        deliveries.resendLost(listOf(first, second), isTurnRunning = { false }) { resent += it.text }

        assertEquals(listOf("and build it"), resent)
    }

    // The conversation was stopped, wiped, or its process died: there is nowhere left to deliver.
    @Test
    fun `after forgetting there is nothing to resend`() {
        val deliveries = PromptDeliveries()
        val lost = sent("fix the tests")
        deliveries.watch(lost)

        deliveries.forget()

        var resent = 0
        deliveries.resendLost(listOf(lost), isTurnRunning = { false }) { resent++ }

        assertEquals(0, resent)
        assertTrue(deliveries.snapshot().isEmpty())
    }

    // A snapshot is what the chain lives by from then on: a message sent later does not get into it and
    // gets a chain of its own (see ClaudeSession.scheduleDeliveryCheck).
    @Test
    fun `a snapshot does not change from what was sent later`() {
        val deliveries = PromptDeliveries()
        val first = sent("fix the tests")
        deliveries.watch(first)

        val watched = deliveries.snapshot()
        deliveries.watch(sent("and build it"))

        assertEquals(listOf(first), watched)
        assertEquals(2, deliveries.snapshot().size)
    }
}

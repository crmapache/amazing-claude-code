package io.github.crmapache.amazingclaudecode.claude

import kotlin.test.Test
import kotlin.test.assertFalse
import kotlin.test.assertTrue

/**
 * Which conversation may give its process back.
 *
 * Every clause of the rule is a way to lose work silently, and none of them shows on the screen: a tab
 * holding forty background agents looks exactly like a tab holding nothing, and a question waiting for a
 * person looks like an idle one to everything except the process that asked it. What breaks here is
 * noticed hours later, as an agent that never reported and an answer that went nowhere - so the rule is
 * kept apart from the timer that runs it, and tested.
 */
class IdleSleepTest {

    private val long = IdleSleep.AFTER_MS + 1

    private fun idle(
        status: String = SessionSnapshot.STATUS_IDLE,
        agents: Set<String> = emptySet(),
        commands: Set<String> = emptySet(),
        permissions: Set<String> = emptySet(),
        plans: Set<String> = emptySet(),
        asks: Set<String> = emptySet(),
    ) = SessionSnapshot(
        status = status,
        pendingPermissions = permissions,
        pendingPlans = plans,
        pendingAsks = asks,
        pendingAgents = agents,
        pendingCommands = commands,
    )

    private fun sleeps(
        snapshot: SessionSnapshot = idle(),
        running: Boolean = true,
        queued: Boolean = false,
        awake: Long = 0,
        now: Long = long,
    ) = IdleSleep.sleeps(snapshot, running = running, queued = queued, awake = awake, now = now)

    @Test
    fun `a conversation left alone long enough gives its process back`() {
        assertTrue(sleeps(awake = 1, now = 1 + IdleSleep.AFTER_MS))
    }

    @Test
    fun `one touched a moment ago keeps it`() {
        assertTrue(sleeps(awake = 1, now = 1 + IdleSleep.AFTER_MS))
        assertFalse(sleeps(awake = 1, now = IdleSleep.AFTER_MS))
    }

    @Test
    fun `there is nothing to take from a conversation without a process`() {
        assertFalse(sleeps(running = false, awake = 1))
    }

    @Test
    fun `a running turn is never interrupted`() {
        assertFalse(sleeps(idle(status = SessionSnapshot.STATUS_RUNNING), awake = 1))
    }

    /**
     * The three cards hold the turn open, and the CLI keeps the question inside the process: killing it
     * answers nothing, and what a person types onto the card afterwards is written into a process that
     * is gone (see ClaudeSession.processTerminated).
     */
    @Test
    fun `a card waiting for a person holds the process`() {
        assertFalse(sleeps(idle(permissions = setOf("1")), awake = 1))
        assertFalse(sleeps(idle(plans = setOf("i-4")), awake = 1))
        assertFalse(sleeps(idle(asks = setOf("i-7")), awake = 1))
    }

    /**
     * The invisible one. A turn that raised background subagents ends the moment it has raised them, so
     * the status says idle and the tab looks like any other - while the agents report back into this very
     * process, some of them half an hour later.
     */
    @Test
    fun `background agents hold the process, though the turn has ended`() {
        assertFalse(sleeps(idle(agents = setOf("task-1")), awake = 1))
    }

    /**
     * The same invisibility, and what is lost is not a report but the thing itself: a dev server the
     * agent raised is a child of this process, and the sweep is silent, so it goes without a word (see
     * SessionSnapshot.pendingCommands).
     */
    @Test
    fun `a background command holds the process that started it`() {
        assertFalse(sleeps(idle(commands = setOf("bfa0ez3d6")), awake = 1))
    }

    @Test
    fun `a command that has reported its end holds nothing`() {
        assertTrue(sleeps(idle(commands = emptySet()), awake = 1))
    }

    @Test
    fun `a queued message holds the process it is queued for`() {
        assertFalse(sleeps(queued = true, awake = 1))
    }

    /**
     * An unknown moment is not evidence of an old one. Zero means neither a status change nor a launch
     * has been recorded, and read as "long ago" it would take the process out from under whatever the
     * conversation is in the middle of.
     */
    @Test
    fun `an unknown last moment never sleeps`() {
        assertFalse(sleeps(awake = 0, now = Long.MAX_VALUE))
    }
}

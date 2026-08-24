package io.github.crmapache.amazingclaudecode.claude

import com.intellij.testFramework.fixtures.BasePlatformTestCase
import io.github.crmapache.amazingclaudecode.remote.RemoteLimits
import kotlinx.serialization.json.buildJsonObject
import kotlinx.serialization.json.put

/**
 * Two clients watching one project.
 *
 * Until now there was exactly one - the panel's browser - and everything was sent straight to it. The
 * moment a second one exists (a browser window in phase 1, a phone in phase 2), three things have to
 * hold, and none of them held before: everyone sees the same feed, a client that arrives late is
 * caught up rather than left with a blank tab, and one that comes back after a break is given only
 * what it missed.
 *
 * No process is started anywhere here. The journal is fed directly, which is exactly what a
 * conversation's own stream does to it.
 */
class SessionFanOutTest : BasePlatformTestCase() {

    private class Recorder(override val id: String) : SessionClient {
        val received = mutableListOf<String>()

        override fun deliver(messages: List<String>) {
            received += messages
        }
    }

    private fun hub() = ClaudeSessionHub.getInstance(project)

    private fun status(hub: ClaudeSessionHub, sessionId: String, state: String) {
        hub.sendStatus(sessionId, state)
    }

    private fun newSession(sessionId: String) = buildJsonObject {
        put("type", "newSession")
        put("kind", "main")
        put("sessionId", sessionId)
        put("title", "")
    }

    fun testEveryoneSeesTheSameMessage() {
        val hub = hub()
        val desk = Recorder("desk")
        val phone = Recorder("phone")
        hub.register(desk)
        hub.attach(desk.id)
        hub.register(phone)
        hub.attach(phone.id)

        status(hub, "shared", SessionSnapshot.STATUS_RUNNING)

        assertTrue(desk.received.any { it.contains("\"state\":\"running\"") })
        assertTrue(phone.received.any { it.contains("\"state\":\"running\"") })
    }

    /**
     * The point of the journal. A client that was not there for the turn is handed it on joining -
     * before, its tab would simply have been empty while the agent worked on.
     */
    fun testALateClientIsCaughtUp() {
        val hub = hub()
        status(hub, "late", SessionSnapshot.STATUS_RUNNING)
        status(hub, "late", SessionSnapshot.STATUS_IDLE)

        val latecomer = Recorder("latecomer")
        hub.register(latecomer)
        hub.attach(latecomer.id)

        val forSession = latecomer.received.filter { it.contains("\"sessionId\":\"late\"") }
        assertTrue("got ${forSession.size} messages", forSession.count { it.contains("\"type\":\"status\"") } == 2)
        assertTrue(forSession.any { it.contains("\"type\":\"restoreStarted\"") })
        assertTrue(forSession.any { it.contains("\"type\":\"restoreFinished\"") })
    }

    /**
     * A phone in a lift reconnects constantly. Without this it would reload the whole feed every time;
     * with it, it names the last number it saw and is given the tail alone.
     */
    fun testAReturningClientIsGivenOnlyTheTail() {
        val hub = hub()
        status(hub, "tail", SessionSnapshot.STATUS_RUNNING)
        val afterFirst = hub.lastSeq("tail")
        status(hub, "tail", SessionSnapshot.STATUS_IDLE)

        val returning = Recorder("returning")
        hub.register(returning)
        hub.attach(returning.id, since = mapOf("tail" to afterFirst))

        val statuses = returning.received.filter {
            it.contains("\"sessionId\":\"tail\"") && it.contains("\"type\":\"status\"")
        }
        assertEquals(1, statuses.size)
        assertTrue(statuses.single().contains("\"state\":\"idle\""))
    }

    /** Numbers are what a client comes back with - they have to be on the messages themselves. */
    fun testMessagesCarryTheirNumber() {
        val hub = hub()
        val watcher = Recorder("watcher")
        hub.register(watcher)
        hub.attach(watcher.id)

        status(hub, "numbered", SessionSnapshot.STATUS_RUNNING)

        val message = watcher.received.last { it.contains("\"sessionId\":\"numbered\"") }
        assertTrue(message, message.startsWith("{\"seq\":"))
        assertTrue(message, message.contains("\"at\":"))
    }

    fun testAClientThatLeftIsNoLongerSentTo() {
        val hub = hub()
        val leaving = Recorder("leaving")
        hub.register(leaving)
        hub.attach(leaving.id)
        val before = leaving.received.size

        hub.detach(leaving.id)
        status(hub, "gone", SessionSnapshot.STATUS_RUNNING)

        assertEquals(before, leaving.received.size)
    }

    /**
     * The project's own facts come first and only once: a client cannot draw a tab before it knows the
     * project, and asking for them again would mean starting CLI processes over.
     */
    fun testTheProjectComesBeforeTheTabs() {
        val hub = hub()
        hub.broadcastProject("""{"type":"init","projectName":"demo"}""")

        val joining = Recorder("joining")
        hub.register(joining)
        hub.attach(joining.id)

        val init = joining.received.indexOfFirst { it.contains("\"type\":\"init\"") }
        val sessions = joining.received.indexOfFirst { it.contains("\"type\":\"sessions\"") }
        assertTrue("init at $init, sessions at $sessions", init >= 0 && init < sessions)
    }

    /** Only the latest of each kind is kept - a joining client wants the present state, not a history of it. */
    fun testOnlyTheFreshestProjectFactIsKept() {
        val hub = hub()
        hub.broadcastProject("""{"type":"project","gitBranch":"old"}""")
        hub.broadcastProject("""{"type":"project","gitBranch":"new"}""")

        val joining = Recorder("branch-watcher")
        hub.register(joining)
        hub.attach(joining.id)

        val branches = joining.received.filter { it.contains("\"type\":\"project\"") }
        assertEquals(1, branches.size)
        assertTrue(branches.single().contains("new"))
    }

    /**
     * What a phone is handed when it opens one conversation.
     *
     * Not the project's other tabs, and not the whole of this one: between the hub and a phone sits a
     * queue that holds a bounded number of frames (see RemoteOutbox), and a working day's journal
     * overflowed it - which throws the queue away whole. On the phone that looked like a conversation
     * that opened blank and stayed blank, while a short one worked perfectly.
     */
    fun testAPhoneIsHandedTheEndOfOneConversation() {
        val hub = hub()
        repeat(20) { status(hub, "watched", SessionSnapshot.STATUS_RUNNING) }
        status(hub, "elsewhere", SessionSnapshot.STATUS_RUNNING)

        val phone = Recorder("phone")
        hub.register(phone)
        hub.attach(phone.id, catchUp = ClaudeSessionHub.CatchUp(sessions = setOf("watched"), maxEntries = 5))

        val watched = phone.received.filter { it.contains("\"sessionId\":\"watched\"") }
        assertEquals(5, watched.count { it.contains("\"type\":\"status\"") })
        // The other tab is not this phone's business at all - it asked for one conversation.
        assertFalse(phone.received.any { it.contains("\"sessionId\":\"elsewhere\"") })
        // And what was left out is said out loud rather than shown as a stump.
        assertTrue(watched.any { it.contains("\"type\":\"restoreStarted\"") && it.contains("\"truncated\":true") })
    }

    /** The number to come back with is the journal's last, not the last one handed over. */
    fun testAPhoneIsCaughtUpToTheJournalsEndEvenWhenTrimmed() {
        val hub = hub()
        repeat(10) { status(hub, "trimmed", SessionSnapshot.STATUS_RUNNING) }

        val phone = Recorder("phone-tail")
        hub.register(phone)
        hub.attach(phone.id, catchUp = ClaudeSessionHub.CatchUp(sessions = setOf("trimmed"), maxEntries = 2))

        val finished = phone.received.single { it.contains("\"type\":\"restoreFinished\"") }
        assertTrue(finished, finished.contains("\"upTo\":${hub.lastSeq("trimmed")}"))
    }

    /** Nothing left out means nothing to warn about - the mark in the feed has to stay honest. */
    fun testAShortConversationIsNotMarkedTruncated() {
        val hub = hub()
        status(hub, "short", SessionSnapshot.STATUS_RUNNING)

        val phone = Recorder("phone-short")
        hub.register(phone)
        hub.attach(phone.id, catchUp = ClaudeSessionHub.CatchUp(sessions = setOf("short"), maxEntries = 50))

        assertFalse(phone.received.any { it.contains("\"truncated\":true") })
    }

    /**
     * How fast someone may ask for things is a question about one phone.
     *
     * Every phone paired with this IDE arrives through a single client of this hub, so counting their
     * requests together meant one of them using up its allowance stopped the others - and the way a
     * refused "open a conversation" showed itself was a conversation that opened empty.
     */
    fun testOnePhoneUsingUpItsAllowanceDoesNotStopAnother() {
        val hub = hub()
        val relay = Recorder("relay-fanout")
        hub.register(relay)

        val allowance = RemoteLimits.PER_MINUTE.getValue("newSession")
        repeat(allowance + 1) { index ->
            hub.commands.handle(relay.id, newSession("first-$index"), asker = "phone-one")
        }
        hub.commands.handle(relay.id, newSession("second-phone"), asker = "phone-two")

        // The one over the allowance is refused, as it should be...
        assertFalse(hub.tabs.contains("first-$allowance"))
        // ...and the other phone is untouched by it.
        assertTrue(hub.tabs.contains("second-phone"))
    }

    /**
     * A conversation that has been wiped or replaced must not come back from the journal: the feed it
     * left describes something that no longer exists.
     */
    fun testAResetFeedIsNotHandedOut() {
        val hub = hub()
        status(hub, "wiped", SessionSnapshot.STATUS_RUNNING)
        hub.resetJournal("wiped")

        val joining = Recorder("after-reset")
        hub.register(joining)
        hub.attach(joining.id)

        assertFalse(
            joining.received.any { it.contains("\"sessionId\":\"wiped\"") && it.contains("\"type\":\"status\"") },
        )
    }
}

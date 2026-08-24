package io.github.crmapache.amazingclaudecode.claude

import com.intellij.testFramework.fixtures.BasePlatformTestCase
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.buildJsonObject
import kotlinx.serialization.json.put

/**
 * A question the agent stops a turn for is remembered until someone answers it - and a great many are
 * never answered: the tab is closed over them, the conversation is wiped, the process dies. Remembered
 * anyway, they pile up for as long as the project is open.
 *
 * There is no process at all here, so nothing is answerable - which is exactly the state a closed tab
 * leaves behind. It is also enough for the second thing tested here: whether one question can be
 * answered twice, which is what two clients pressing the same button comes down to.
 */
class SessionPermissionsTest : BasePlatformTestCase() {

    private fun hub() = ClaudeSessionHub.getInstance(project)

    private fun request(
        id: String,
        tool: String = "Bash",
        input: JsonObject = buildJsonObject { put("command", "ls") },
    ) = PermissionChannel.ToolPermission(
        requestId = id,
        toolName = tool,
        toolUseId = id,
        input = input,
        requiresUserInteraction = true,
    )

    fun testQuestionsNobodyCanAnswerAreNotKept() {
        val permissions = hub().permissions

        repeat(50) { permissions.ask("kept", request("perm-$it")) }

        // Each new question throws out what died before it, so what is kept is what is genuinely alive
        // plus the one that has only just arrived.
        assertTrue("kept ${permissions.keptCount()}", permissions.keptCount() <= 1)
    }

    // Plans are kept apart from ordinary permissions - the card with the buttons is the plan's own - so
    // they need the cleanup just as much.
    fun testAbandonedPlansAreNotKeptEither() {
        val permissions = hub().permissions

        repeat(50) {
            permissions.ask(
                "plans",
                request("plan-$it", tool = "ExitPlanMode", input = buildJsonObject { put("plan", "- a step") }),
            )
        }

        assertTrue("kept ${permissions.keptCount()}", permissions.keptCount() <= 1)
    }

    /**
     * Two devices show one question and both are pressed. The first press unblocks the turn; the second
     * must change nothing at all - not answer the agent again, and not put a second "answered" into the
     * feed everyone is reading.
     *
     * Counted by the journal rather than by a spy: the journal is what a client is rebuilt from, so a
     * duplicate that leaves no entry there leaves no trace anywhere.
     */
    fun testOneQuestionIsAnsweredOnce() {
        val hub = hub()
        hub.permissions.ask("twice", request("perm-twice"))

        hub.permissions.decide("perm-twice", "once")
        val afterFirst = hub.lastSeq("twice")

        hub.permissions.decide("perm-twice", "deny")

        assertEquals(afterFirst, hub.lastSeq("twice"))
    }

    /**
     * The card is gone from everyone's screen, not only from the one it was pressed on. With a single
     * client this message would be pointless - that client had already drawn the decision on the click.
     */
    fun testAnsweringTellsEveryoneTheCardIsGone() {
        val hub = hub()
        hub.permissions.ask("shared", request("perm-shared"))
        val afterAsk = hub.lastSeq("shared")

        hub.permissions.decide("perm-shared", "once")

        assertTrue(hub.lastSeq("shared") > afterAsk)
        assertFalse(hub.snapshotOf("shared").awaitsYou)
    }

    /** And a question that has been asked is a conversation waiting for you - that is what a list shows. */
    fun testAnAskedQuestionIsVisibleInTheSnapshot() {
        val hub = hub()

        hub.permissions.ask("waiting", request("perm-waiting"))

        assertTrue(hub.snapshotOf("waiting").awaitsYou)
    }
}

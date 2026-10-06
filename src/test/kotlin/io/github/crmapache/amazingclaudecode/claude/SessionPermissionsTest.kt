package io.github.crmapache.amazingclaudecode.claude

import com.intellij.testFramework.fixtures.BasePlatformTestCase
import kotlinx.serialization.json.JsonArray
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
        agentId: String? = null,
    ) = PermissionChannel.ToolPermission(
        requestId = id,
        toolName = tool,
        toolUseId = id,
        input = input,
        requiresUserInteraction = true,
        agentId = agentId,
    )

    private val question = buildJsonObject {
        put("questions", JsonArray(listOf(buildJsonObject { put("question", "Which fruit?") })))
    }

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

    /**
     * The agent takes its question back - Stop pressed over a card waiting for a decision cancels the
     * question along with the turn.
     *
     * Before this was handled the card stayed on screen with live buttons, the conversation went on
     * saying "waiting for you" in every list, and a press wrote "allowed" into the feed while the agent
     * threw the answer away. So a withdrawal has to close the card exactly as a decision does - the
     * difference being that nobody decided anything.
     */
    fun testAWithdrawnQuestionStopsWaiting() {
        val hub = hub()
        hub.permissions.ask("withdrawn", request("perm-withdrawn"))
        val afterAsk = hub.lastSeq("withdrawn")

        hub.permissions.withdraw("withdrawn", "perm-withdrawn")

        assertTrue(hub.lastSeq("withdrawn") > afterAsk)
        assertFalse(hub.snapshotOf("withdrawn").awaitsYou)
    }

    /** And pressing it afterwards - on this device or the other one - changes nothing. */
    fun testPressingAWithdrawnCardChangesNothing() {
        val hub = hub()
        hub.permissions.ask("pressed", request("perm-pressed"))
        hub.permissions.withdraw("pressed", "perm-pressed")
        val afterWithdrawal = hub.lastSeq("pressed")

        hub.permissions.decide("perm-pressed", "once")

        assertEquals(afterWithdrawal, hub.lastSeq("pressed"))
    }

    /**
     * A plan is held apart from ordinary permissions - the card with the buttons is the plan's own - and
     * a withdrawal names the request rather than the card, so the plan has to be found by the number of
     * the question standing under it.
     */
    fun testAWithdrawnPlanIsNoLongerWaitedOn() {
        val hub = hub()
        hub.permissions.ask(
            "withdrawnPlan",
            request("plan-withdrawn", tool = "ExitPlanMode", input = buildJsonObject { put("plan", "- a step") }),
        )
        assertTrue(hub.snapshotOf("withdrawnPlan").awaitsYou)

        hub.permissions.withdraw("withdrawnPlan", "plan-withdrawn")

        assertFalse(hub.snapshotOf("withdrawnPlan").awaitsYou)
        assertEquals(0, hub.permissions.keptCount())
    }

    /** And a question that has been asked is a conversation waiting for you - that is what a list shows. */
    fun testAnAskedQuestionIsVisibleInTheSnapshot() {
        val hub = hub()

        hub.permissions.ask("waiting", request("perm-waiting"))

        assertTrue(hub.snapshotOf("waiting").awaitsYou)
    }

    /**
     * A message written while the turn stands on a question closes the question: the turn would otherwise
     * hold the message for as long as the card stands, and a phone had no way to close a question at all.
     * The card leaves every screen, and the conversation stops saying it waits for you.
     */
    fun testAMessageClosesTheQuestionItWasWrittenOver() {
        val hub = hub()
        hub.permissions.ask("chatAsk", request("ask-chat", tool = ClaudeLaunch.ASK_TOOL, input = question))
        assertTrue(hub.snapshotOf("chatAsk").awaitsYou)
        val afterAsk = hub.lastSeq("chatAsk")

        hub.permissions.answeredInChat("chatAsk")

        assertTrue(hub.lastSeq("chatAsk") > afterAsk)
        assertFalse(hub.snapshotOf("chatAsk").awaitsYou)
        assertEquals(0, hub.permissions.keptCount())
    }

    /*
     * The same for a plan and for a permission - all three hold the turn the same way.
     *
     * One card per test: with no process behind them, every new card throws out the ones before it (see
     * testQuestionsNobodyCanAnswerAreNotKept), so a second card here would be testing that instead.
     */
    fun testAMessageClosesAPlan() {
        val hub = hub()
        hub.permissions.ask(
            "chatPlan",
            request("plan-chat", tool = "ExitPlanMode", input = buildJsonObject { put("plan", "- a step") }),
        )

        hub.permissions.answeredInChat("chatPlan")

        assertFalse(hub.snapshotOf("chatPlan").awaitsYou)
        assertEquals(0, hub.permissions.keptCount())
    }

    fun testAMessageClosesAPermission() {
        val hub = hub()
        hub.permissions.ask("chatPerm", request("perm-chat"))
        val afterAsk = hub.lastSeq("chatPerm")

        hub.permissions.answeredInChat("chatPerm")

        assertTrue(hub.lastSeq("chatPerm") > afterAsk)
        assertFalse(hub.snapshotOf("chatPerm").awaitsYou)
        assertEquals(0, hub.permissions.keptCount())
    }

    /** And once closed it is closed: a press on the card arriving late from another device changes nothing. */
    fun testACardClosedByAMessageIgnoresALatePress() {
        val hub = hub()
        hub.permissions.ask("chatLate", request("perm-late"))
        hub.permissions.answeredInChat("chatLate")
        val afterMessage = hub.lastSeq("chatLate")

        hub.permissions.decide("perm-late", "once")

        assertEquals(afterMessage, hub.lastSeq("chatLate"))
    }

    /** Only the cards the conversation's own turn stands on: a subagent's permission is not what the message answers. */
    fun testAMessageLeavesASubagentsPermissionAlone() {
        val hub = hub()
        hub.permissions.ask("chatSubagent", request("perm-subagent", agentId = "agent-1"))

        hub.permissions.answeredInChat("chatSubagent")

        assertTrue(hub.snapshotOf("chatSubagent").awaitsYou)
        assertEquals(1, hub.permissions.keptCount())
    }

    /** And another conversation's card has nothing to do with it at all. */
    fun testAMessageLeavesAnotherConversationsCardAlone() {
        val hub = hub()
        hub.permissions.ask("chatElsewhere", request("perm-elsewhere"))

        hub.permissions.answeredInChat("chatHere")

        assertTrue(hub.snapshotOf("chatElsewhere").awaitsYou)
        assertEquals(1, hub.permissions.keptCount())
    }
}

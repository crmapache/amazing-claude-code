package io.github.crmapache.amazingclaudecode.toolwindow

import com.intellij.testFramework.fixtures.BasePlatformTestCase
import io.github.crmapache.amazingclaudecode.claude.PermissionChannel
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.buildJsonObject
import kotlinx.serialization.json.put

/**
 * A question the agent stops a turn for is remembered until someone answers it - and a great many are
 * never answered: the tab is closed over them, the conversation is wiped, the process dies. Remembered
 * anyway, they pile up for the panel's whole life.
 *
 * There is no conversation at all here, so nothing is answerable - which is exactly the state a closed
 * tab leaves behind.
 */
class PanelPermissionsTest : BasePlatformTestCase() {

    private fun permissions() = PanelPermissions(
        sessions = { null },
        send = {},
        sendPrompt = { _, _ -> },
        changeMode = { _, _ -> },
    )

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
        val permissions = permissions()

        repeat(50) { permissions.ask("main", request("perm-$it")) }

        // Each new question throws out what died before it, so what is kept is what is genuinely alive
        // plus the one that has only just arrived.
        assertTrue("kept ${permissions.keptCount()}", permissions.keptCount() <= 1)
    }

    // Plans are kept apart from ordinary permissions - the card with the buttons is the plan's own - so
    // they need the cleanup just as much.
    fun testAbandonedPlansAreNotKeptEither() {
        val permissions = permissions()

        repeat(50) {
            permissions.ask(
                "main",
                request("plan-$it", tool = "ExitPlanMode", input = buildJsonObject { put("plan", "- a step") }),
            )
        }

        assertTrue("kept ${permissions.keptCount()}", permissions.keptCount() <= 1)
    }
}

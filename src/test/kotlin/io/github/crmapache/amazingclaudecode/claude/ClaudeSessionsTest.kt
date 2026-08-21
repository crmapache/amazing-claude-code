package io.github.crmapache.amazingclaudecode.claude

import com.intellij.testFramework.fixtures.BasePlatformTestCase

/**
 * The permission mode answers two different questions, and they are allowed to disagree: what THIS
 * conversation works in, and what a new tab starts in. Answering both with one control is expensive in a
 * way nobody notices at the time - the panel simply starts every next tab, in every project, in a mode
 * chosen once for one tab.
 *
 * No process comes up here: a conversation with no process applies a mode straight away, because the
 * mode travels as a flag at launch.
 */
class ClaudeSessionsTest : BasePlatformTestCase() {

    private fun sessions() = ClaudeSessions(
        workingDirectory = null,
        parentDisposable = testRootDisposable,
        onEvent = { _, _ -> },
        onError = { _, _ -> },
        onFinished = {},
    )

    // The MODE selector, Shift+Tab and an approved plan all come down this way, and none of them is an
    // answer to "how do I want to work from now on": spending one tab in bypass says nothing about the
    // next one. What new tabs start in is written only from the header's menu (see ClaudePanel).
    fun testAConversationModeIsNotASavedDefault() {
        ClaudePreferences.mode = PermissionModes.ASK

        val sessions = sessions()
        var applied = false
        sessions.setPermissionMode("main", PermissionModes.BYPASS) { applied = it.applied }

        assertTrue(applied)
        // The conversation itself did switch - that is what was asked for.
        assertEquals(PermissionModes.BYPASS, sessions.permissionMode("main"))
        // And nothing else did.
        assertEquals(PermissionModes.ASK, ClaudePreferences.mode)
    }

    // Two tabs, two modes, and neither one is the other's business.
    fun testConversationsKeepTheirOwnModes() {
        val sessions = sessions()
        sessions.setPermissionMode("main", PermissionModes.BYPASS) {}
        sessions.setPermissionMode("branch-1", PermissionModes.PLAN) {}

        assertEquals(PermissionModes.BYPASS, sessions.permissionMode("main"))
        assertEquals(PermissionModes.PLAN, sessions.permissionMode("branch-1"))
    }

    // A tab nobody has touched has no mode of its own to report: whoever asks falls back to the setting.
    fun testAConversationThatDoesNotExistReportsNoModeOfItsOwn() {
        assertNull(sessions().permissionMode("never-opened"))
    }

    override fun tearDown() {
        ClaudePreferences.mode = ""
        super.tearDown()
    }
}

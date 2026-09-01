package io.github.crmapache.amazingclaudecode.claude

import com.intellij.testFramework.fixtures.BasePlatformTestCase

/**
 * A conversation's settings answer two different questions, and they are allowed to disagree: what THIS
 * conversation works at, and what a new tab starts at. Answering both with one control is expensive in a
 * way nobody notices at the time - the panel simply starts every next tab, in every project, in whatever
 * was chosen once for one tab.
 *
 * The permission mode answers only the first question, the effort answers both at once, and neither of
 * them ever reaches a conversation that is already open.
 *
 * No process comes up here: a conversation with no process applies both straight away, because both
 * travel as flags at launch.
 */
class ClaudeSessionsTest : BasePlatformTestCase() {

    private fun sessions(onBorn: (String, String) -> Unit = { _, _ -> }) = ClaudeSessions(
        workingDirectory = null,
        parentDisposable = testRootDisposable,
        onEvent = { _, _ -> },
        onError = { _, _ -> },
        onFinished = {},
        onBorn = onBorn,
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

    // The effort is the other half: it does become what new tabs start at - that is what was asked for -
    // and it still applies to the one conversation it was chosen in.
    fun testAnEffortIsAppliedHereAndRememberedForTheNextTab() {
        val sessions = sessions()
        sessions.setEffort("main", "low")

        assertEquals("low", sessions.effort("main"))
        assertEquals("low", ClaudePreferences.effort)
    }

    // Two tabs, two efforts - and the choice in one reaches neither the other's conversation nor its
    // chip: that is the whole complaint this was built for.
    fun testConversationsKeepTheirOwnEfforts() {
        val sessions = sessions()
        sessions.setEffort("main", "low")
        sessions.setEffort("branch-1", "ultracode")

        assertEquals("low", sessions.effort("main"))
        assertEquals("ultracode", sessions.effort("branch-1"))
    }

    /**
     * And the whole point of it: a conversation is born at whatever was chosen by then, and a choice made
     * afterwards in another tab does not reach back to it.
     *
     * Its birth is announced, because nothing else could tell: the CLI says nothing about the effort ever
     * (see ClaudeSession.setEffort), so a panel left to guess would draw every untouched tab by the
     * current setting - that is, by a choice made somewhere else entirely.
     */
    fun testEachConversationIsBornAtWhatWasChosenByThen() {
        val born = mutableMapOf<String, String>()
        val sessions = sessions { sessionId, effort -> born[sessionId] = effort }

        ClaudePreferences.effort = "high"
        sessions.setPermissionMode("first", PermissionModes.PLAN) {}

        sessions.setEffort("second", "low")

        assertEquals("high", born["first"])
        assertEquals("low", born["second"])
        // And the first one stayed where it was born, though the setting has moved on since.
        assertEquals("high", sessions.effort("first"))
    }

    /**
     * A fork carries on the same conversation, so it carries on it the same way: on the parent's model,
     * at the parent's effort and in the parent's permission mode.
     *
     * The saved setting is not the answer here, and the difference is not theoretical: every selector
     * writes the machine's default as well as changing its own tab, so a model chosen in a neighbouring
     * tab decided what a fork made from this one started on.
     */
    fun testAForkStartsOnWhatItsParentRunsOn() {
        ClaudePreferences.model = "opus"
        ClaudePreferences.effort = "high"
        ClaudePreferences.mode = PermissionModes.ASK

        val sessions = sessions()
        sessions.setModel("parent", "sonnet") {}
        sessions.setEffort("parent", "low")
        sessions.setPermissionMode("parent", PermissionModes.PLAN) {}

        // The settings move on afterwards - in another tab, as they do.
        ClaudePreferences.model = "haiku"
        ClaudePreferences.effort = "ultracode"

        sessions.branchFrom("parent", "branch-1")

        assertEquals("sonnet", sessions.model("branch-1"))
        assertEquals("low", sessions.effort("branch-1"))
        assertEquals(PermissionModes.PLAN, sessions.permissionMode("branch-1"))
    }

    /**
     * A parent nobody has touched hands down nothing: an empty field means "as the settings have it",
     * which is exactly what such a tab is itself running on.
     */
    fun testAForkOfAnUntouchedTabFollowsTheSettings() {
        ClaudePreferences.model = "opus"
        ClaudePreferences.effort = "high"

        val sessions = sessions()
        sessions.branchFrom("parent", "branch-1")

        assertEquals("opus", sessions.model("branch-1"))
        assertEquals("high", sessions.effort("branch-1"))
    }

    /**
     * A fork asked for with a model of its own is still a fork: the model comes from the request, and
     * everything the request said nothing about still comes from the parent.
     *
     * Nobody sends such a request today - the panel forks without a choice, and a phone cannot fork at all
     * - so this is the first thing that would break the moment one did, and it would break in silence.
     */
    fun testAForkKeepsItsParentWhereTheRequestSaidNothing() {
        ClaudePreferences.model = "opus"
        ClaudePreferences.effort = "high"

        val sessions = sessions()
        sessions.setModel("parent", "sonnet") {}
        sessions.setEffort("parent", "low")
        sessions.setPermissionMode("parent", PermissionModes.PLAN) {}

        sessions.rememberLaunch("branch-1", SessionLaunch(model = "haiku"))
        sessions.branchFrom("parent", "branch-1")

        assertEquals("haiku", sessions.model("branch-1"))
        assertEquals("low", sessions.effort("branch-1"))
        assertEquals(PermissionModes.PLAN, sessions.permissionMode("branch-1"))
    }

    override fun tearDown() {
        ClaudePreferences.mode = ""
        ClaudePreferences.effort = ""
        ClaudePreferences.model = ""
        super.tearDown()
    }
}

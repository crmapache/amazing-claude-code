package io.github.crmapache.amazingclaudecode.claude

import com.intellij.testFramework.fixtures.BasePlatformTestCase

/**
 * The choice of model and mode outlives an IDE restart, which is why it lives in the IDE's settings.
 * This test guards exactly that: storage gone silently looks like "the panel has forgotten my model
 * again".
 */
class ClaudePreferencesTest : BasePlatformTestCase() {

    fun testSnapshotKeepsWhatWasWritten() {
        ClaudePreferences.model = "haiku"
        ClaudePreferences.effort = "low"
        ClaudePreferences.mode = "acceptEdits"
        ClaudePreferences.composerLayout = "right"

        val snapshot = ClaudePreferences.snapshot()

        assertEquals("haiku", snapshot.model)
        assertEquals("low", snapshot.effort)
        assertEquals("acceptEdits", snapshot.mode)
        assertEquals("right", snapshot.composerLayout)
    }

    fun testEmptyValueMeansDefault() {
        ClaudePreferences.model = "opus"
        ClaudePreferences.model = ""

        // An empty string means "as Claude Code has it by default": then the flag is not passed at
        // process launch at all.
        assertEquals("", ClaudePreferences.model)
    }

    override fun tearDown() {
        ClaudePreferences.model = ""
        ClaudePreferences.effort = ""
        ClaudePreferences.mode = ""
        ClaudePreferences.composerLayout = ""
        super.tearDown()
    }
}

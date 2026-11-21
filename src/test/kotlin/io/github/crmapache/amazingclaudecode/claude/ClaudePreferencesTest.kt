package io.github.crmapache.amazingclaudecode.claude

import com.intellij.ide.util.PropertiesComponent
import com.intellij.testFramework.fixtures.BasePlatformTestCase

/**
 * The choice of model and mode outlives an IDE restart, which is why it lives in the IDE's settings.
 * This test guards exactly that: storage gone silently looks like "the panel has forgotten my model
 * again".
 */
class ClaudePreferencesTest : BasePlatformTestCase() {

    /**
     * The address the old feedback form remembered. The form is gone, so a person's address has no business
     * staying in the IDE's settings - and PRIVACY.md says it is deleted.
     */
    fun testTheOldFeedbackAddressIsWiped() {
        PropertiesComponent.getInstance().setValue("acc.feedback.email", "someone@example.com")

        ClaudePreferences.forgetRetired()

        assertNull(PropertiesComponent.getInstance().getValue("acc.feedback.email"))
    }

    /**
     * The panel's own font is a name the page puts into CSS and nothing more: one line, without what a control
     * character would do to a stylesheet, and empty for "as the console's".
     */
    fun testTheFontIsAPlainName() {
        ClaudePreferences.fontFamily = "  Menlo\n"
        assertEquals("Menlo", ClaudePreferences.fontFamily)

        ClaudePreferences.fontFamily = "Fira\u0000 Code"
        assertEquals("Fira Code", ClaudePreferences.fontFamily)

        ClaudePreferences.fontFamily = ""
        assertEquals("", ClaudePreferences.fontFamily)
    }

    fun testSnapshotKeepsWhatWasWritten() {
        ClaudePreferences.mode = "acceptEdits"
        ClaudePreferences.composerLayout = "right"

        val snapshot = ClaudePreferences.snapshot()

        assertEquals("acceptEdits", snapshot.mode)
        assertEquals("right", snapshot.composerLayout)
    }

    /**
     * The models somebody names by hand. What is stored is what will one day be a launch argument, so
     * the filter is the point of the setting rather than a nicety: an argument holding a line feed or a
     * quotation mark is cut short by a shell nobody asked for, taking the rest of the command line with
     * it (see ClaudeLaunch).
     */
    fun testCustomModelsSurviveARoundTrip() {
        ClaudePreferences.customModels = listOf("glm-4.6", "claude-fable-5-1[1m]")

        assertEquals(listOf("glm-4.6", "claude-fable-5-1[1m]"), ClaudePreferences.customModels)
    }

    fun testCustomModelsDropWhatCannotBeALaunchArgument() {
        ClaudePreferences.customModels = listOf(
            "  glm-4.6  ",
            "two words",
            "with\"quote",
            "with\nfeed",
            "with,comma",
            "",
            "glm-4.6",
        )

        // Trimmed, deduplicated, and everything a shell could cut short left out - a comma among them,
        // because a comma is what separates the entries in this setting.
        assertEquals(listOf("glm-4.6"), ClaudePreferences.customModels)
    }

    /** What an older version of this list left behind is filtered on the way out as well as in. */
    fun testUnusableNamesAreFilteredOnReadingToo() {
        assertEquals(listOf("glm-4.6"), ClaudePreferences.usableModelNames(listOf("glm-4.6", "two words")))
    }

    /**
     * The indicators switched off around the field. What is stored is what is OFF - an empty setting means
     * "all shown" - and the value comes in by a message, so anything that is not a plain word is dropped
     * on the way in and on the way out.
     */
    fun testHiddenIndicatorsSurviveARoundTrip() {
        ClaudePreferences.hiddenIndicators = setOf("tokens", "thanks")

        assertEquals(setOf("thanks", "tokens"), ClaudePreferences.hiddenIndicators)
        assertEquals(setOf("thanks", "tokens"), ClaudePreferences.snapshot().hiddenIndicators)
    }

    fun testHiddenIndicatorsKeepOnlyPlainWords() {
        ClaudePreferences.hiddenIndicators = setOf(" week ", "with,comma", "two words", "", "a1")

        assertEquals(setOf("week"), ClaudePreferences.hiddenIndicators)
    }

    fun testNothingHiddenIsTheDefault() {
        ClaudePreferences.hiddenIndicators = setOf("week")
        ClaudePreferences.hiddenIndicators = emptySet()

        assertEquals(emptySet<String>(), ClaudePreferences.hiddenIndicators)
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
        ClaudePreferences.customModels = emptyList()
        ClaudePreferences.hiddenIndicators = emptySet()
        super.tearDown()
    }
}

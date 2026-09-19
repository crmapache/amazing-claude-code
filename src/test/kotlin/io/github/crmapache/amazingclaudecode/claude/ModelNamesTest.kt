package io.github.crmapache.amazingclaudecode.claude

import kotlin.test.assertEquals
import kotlin.test.assertFalse
import kotlin.test.assertTrue
import org.junit.Test

/**
 * The same examples the panel's own rule is held to (modelKey in catalog.ts). The two are one rule in two
 * languages, and the case that made it necessary is the last group here: a catalogue that knows `opus`
 * being asked about the `claude-opus-5` a transcript signs its answers with.
 */
class ModelNamesTest {

    @Test
    fun `a window mark is not another model`() {
        assertTrue(ModelNames.same("opus", "opus[1m]"))
        assertTrue(ModelNames.same("claude-opus-5", "claude-opus-5[1m]"))
    }

    @Test
    fun `a build date is not a version`() {
        assertTrue(ModelNames.same("claude-haiku-4-5-20251001", "claude-haiku-4-5"))
    }

    @Test
    fun `different families stay apart`() {
        assertFalse(ModelNames.same("claude-opus-5", "claude-sonnet-5"))
        assertFalse(ModelNames.same("opus", "haiku"))
    }

    @Test
    fun `opusplan is not opus`() {
        assertFalse(ModelNames.same("opusplan", "opus"))
    }

    @Test
    fun `generations stay apart`() {
        assertFalse(ModelNames.same("claude-opus-5", "claude-opus-4-8"))
    }

    @Test
    fun `a catalogue of launch values holds the identifier a transcript signs`() {
        val catalogue = setOf("default", "opus", "opus[1m]", "sonnet", "haiku", "opusplan")

        assertTrue(ModelNames.holds(catalogue, "claude-opus-5"))
        assertTrue(ModelNames.holds(catalogue, "claude-sonnet-5"))
        assertTrue(ModelNames.holds(catalogue, "claude-haiku-4-5-20251001"))
    }

    @Test
    fun `a catalogue without a family refuses it`() {
        val catalogue = setOf("default", "sonnet", "haiku")

        assertFalse(ModelNames.holds(catalogue, "claude-opus-5"))
        assertTrue(ModelNames.holds(catalogue, "claude-sonnet-5"))
    }

    @Test
    fun `a catalogue naming full identifiers answers about a launch value`() {
        val catalogue = setOf("claude-opus-5", "claude-sonnet-5")

        assertTrue(ModelNames.holds(catalogue, "opus"))
        // Not the large window, though: a catalogue that has it names it (see the test below).
        assertFalse(ModelNames.holds(catalogue, "opus[1m]"))
        assertFalse(ModelNames.holds(catalogue, "haiku"))
    }

    // The case behind the strictness: a conversation held on "Opus (1M context)" resumed under an account
    // whose catalogue knows `opus` and not `opus[1m]`. Handed the mark all the same, the process comes up
    // looking well and dies on the first message (see ClaudeAccounts.canRun).
    @Test
    fun `a window mark is held only by a catalogue that names it`() {
        val ordinary = setOf("default", "opus", "sonnet", "haiku")
        val large = setOf("default", "opus", "opus[1m]", "claude-opus-5[1m]", "sonnet", "haiku")

        assertFalse(ModelNames.holds(ordinary, "claude-opus-5[1m]"))
        assertFalse(ModelNames.holds(ordinary, "opus[1m]"))
        assertTrue(ModelNames.holds(large, "claude-opus-5[1m]"))
        assertTrue(ModelNames.holds(large, "opus[1m]"))
        // The other way round the mark says nothing: served at the large window, served at the ordinary one.
        assertTrue(ModelNames.holds(setOf("default", "opus[1m]", "sonnet", "sonnet[1m]", "haiku"), "claude-opus-5"))
    }

    @Test
    fun `the mark comes off a name and nothing else does`() {
        assertEquals("claude-opus-5", ModelNames.unmarked("claude-opus-5[1m]"))
        assertEquals("opus", ModelNames.unmarked("opus[1m]"))
        assertEquals("opus", ModelNames.unmarked("opus"))
        assertEquals("claude-haiku-4-5-20251001", ModelNames.unmarked("claude-haiku-4-5-20251001"))
    }

    @Test
    fun `an empty catalogue holds nothing`() {
        assertFalse(ModelNames.holds(emptySet(), "claude-opus-5"))
    }
}

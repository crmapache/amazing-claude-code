package io.github.crmapache.amazingclaudecode.claude

import java.io.File
import kotlin.test.Test
import kotlin.test.assertEquals

class PermissionDefaultModeTest {

    private fun source(layer: ClaudeSettings.Layer, content: String): ClaudeSettings.Source =
        ClaudeSettings.Source(
            layer,
            File.createTempFile("settings", ".json").apply {
                deleteOnExit()
                writeText(content)
            },
        )

    private fun mode(mode: String): String = """{"permissions": {"defaultMode": "$mode"}}"""

    @Test
    fun `with no settings we start in the strictest mode`() {
        assertEquals(PermissionModes.ASK, PermissionDefaultMode.of(sources = emptyList(), bypassAllowed = true))
    }

    @Test
    fun `the mode from a person's own settings is the panel's default`() {
        val sources = listOf(source(ClaudeSettings.Layer.USER, mode("acceptEdits")))

        assertEquals("acceptEdits", PermissionDefaultMode.of(sources, bypassAllowed = true))
    }

    // That is what this mode is called in the launch flag, and the panel's selector knows only that name.
    @Test
    fun `the old name is brought to the current one`() {
        val sources = listOf(source(ClaudeSettings.Layer.USER, mode("default")))

        assertEquals(PermissionModes.ASK, PermissionDefaultMode.of(sources, bypassAllowed = true))
    }

    @Test
    fun `a stronger layer overrides a weaker one`() {
        val sources = listOf(
            source(ClaudeSettings.Layer.POLICY, mode("plan")),
            source(ClaudeSettings.Layer.USER, mode("acceptEdits")),
        )

        assertEquals("plan", PermissionDefaultMode.of(sources, bypassAllowed = true))
    }

    @Test
    fun `an empty settings file is skipped rather than cancelling the rest`() {
        val sources = listOf(
            source(ClaudeSettings.Layer.POLICY, "{}"),
            source(ClaudeSettings.Layer.USER, mode("dontAsk")),
        )

        assertEquals("dontAsk", PermissionDefaultMode.of(sources, bypassAllowed = true))
    }

    // A project's settings live in the repository: the mode where a classifier decides the questions
    // could have been put there by anyone with write access. The CLI does not trust such a default - and
    // the panel must not either.
    @Test
    fun `auto from a project's settings is not accepted`() {
        for (layer in listOf(ClaudeSettings.Layer.PROJECT, ClaudeSettings.Layer.LOCAL)) {
            val sources = listOf(source(layer, mode("auto")))

            assertEquals(PermissionModes.ASK, PermissionDefaultMode.of(sources, bypassAllowed = true))
        }
    }

    @Test
    fun `auto from personal settings and from a policy is accepted`() {
        for (layer in listOf(ClaudeSettings.Layer.USER, ClaudeSettings.Layer.POLICY)) {
            val sources = listOf(source(layer, mode("auto")))

            assertEquals("auto", PermissionDefaultMode.of(sources, bypassAllowed = true))
        }
    }

    // A forbidden mode the CLI would throw away anyway, and the panel would be left showing a mode the
    // conversation does not have.
    @Test
    fun `bypass is not taken as the default when the mode is forbidden`() {
        val sources = listOf(source(ClaudeSettings.Layer.USER, mode("bypassPermissions")))

        assertEquals(PermissionModes.ASK, PermissionDefaultMode.of(sources, bypassAllowed = false))
        assertEquals("bypassPermissions", PermissionDefaultMode.of(sources, bypassAllowed = true))
    }

    // With an unfamiliar name the CLI would not start at all - the panel must not start on it either.
    @Test
    fun `an unfamiliar mode name is thrown away`() {
        val sources = listOf(source(ClaudeSettings.Layer.USER, mode("yolo")))

        assertEquals(PermissionModes.ASK, PermissionDefaultMode.of(sources, bypassAllowed = true))
    }

    @Test
    fun `broken settings do not stop the default being taken from the next layer`() {
        val sources = listOf(
            source(ClaudeSettings.Layer.POLICY, "{ this is not json"),
            source(ClaudeSettings.Layer.USER, mode("plan")),
        )

        assertEquals("plan", PermissionDefaultMode.of(sources, bypassAllowed = true))
    }
}

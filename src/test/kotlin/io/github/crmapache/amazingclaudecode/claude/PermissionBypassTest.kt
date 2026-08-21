package io.github.crmapache.amazingclaudecode.claude

import java.io.File
import kotlin.test.Test
import kotlin.test.assertFalse
import kotlin.test.assertTrue

class PermissionBypassTest {

    private fun settings(vararg contents: String): List<File> = contents.map { content ->
        File.createTempFile("settings", ".json").apply {
            deleteOnExit()
            writeText(content)
        }
    }

    @Test
    fun `without the launch flag the mode is unavailable, whatever the settings hold`() {
        assertFalse(PermissionBypass.isAvailable(cliKnowsFlag = false, settings = settings("{}")))
    }

    @Test
    fun `ordinary settings do not forbid the mode`() {
        val files = settings("{}", """{"permissions": {"defaultMode": "plan"}}""")

        assertTrue(PermissionBypass.isAvailable(cliKnowsFlag = true, settings = files))
    }

    // An organization's policy goes into managed-settings.json, but a person can put the same field into
    // their own settings too - the CLI looks at the merged result.
    @Test
    fun `a ban in any of the settings files removes the mode`() {
        val files = settings("{}", """{"permissions": {"disableBypassPermissionsMode": "disable"}}""")

        assertFalse(PermissionBypass.isAvailable(cliKnowsFlag = true, settings = files))
    }

    @Test
    fun `a missing settings file forbids nothing`() {
        val missing = File(System.getProperty("java.io.tmpdir"), "no-such-settings-file.json")

        assertTrue(PermissionBypass.isAvailable(cliKnowsFlag = true, settings = listOf(missing)))
    }

    // Parsing someone else's file is not our business: broken settings are the CLI's own concern, and
    // the panel must not silently take a mode away over them.
    @Test
    fun `broken settings neither forbid the mode nor bring the panel down`() {
        val files = settings("{ this is not json")

        assertTrue(PermissionBypass.isAvailable(cliKnowsFlag = true, settings = files))
    }

    @Test
    fun `the settings list holds the policy, user and project files`() {
        val project = File(System.getProperty("java.io.tmpdir"), "project")
        val paths = PermissionBypass.settingsFiles(project.absolutePath).map { it.absolutePath }

        assertTrue(paths.any { it.endsWith("managed-settings.json") })
        assertTrue(paths.any { it.endsWith(File(".claude", "settings.json").path) && it.startsWith(System.getProperty("user.home")) })
        assertTrue(paths.any { it.startsWith(project.absolutePath) && it.endsWith("settings.json") })
        assertTrue(paths.any { it.endsWith("settings.local.json") })
    }
}

package io.github.crmapache.amazingclaudecode.claude

import java.io.File
import kotlin.io.path.createTempDirectory
import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertFalse
import kotlin.test.assertTrue

/**
 * Arithmetic over three strings, held by a test because every mistake in it is silent: a value that
 * survives normalization becomes a launch argument, and an argument the CLI does not understand stops
 * the conversation from starting at all - with no panel of its own to say why.
 */
class SettingSourcesTest {

    @Test
    fun `only the three known answers survive`() {
        assertEquals(SettingSources.USER_ONLY, SettingSources.normalize("user"))
        assertEquals(SettingSources.WITHOUT_LOCAL, SettingSources.normalize("user,project"))
        assertEquals(SettingSources.ALL, SettingSources.normalize(""))
    }

    // Anything else is a message from a panel of another version, or a value stored by one. Both must
    // land on "everything", never on a narrower answer nobody chose and never on the CLI's doorstep.
    @Test
    fun `an unknown value is every layer rather than a guess`() {
        assertEquals(SettingSources.ALL, SettingSources.normalize("project"))
        assertEquals(SettingSources.ALL, SettingSources.normalize("user, project"))
        assertEquals(SettingSources.ALL, SettingSources.normalize("policy"))
        assertEquals(SettingSources.ALL, SettingSources.normalize("--dangerous"))
    }

    @Test
    fun `the flag is passed only when it narrows something`() {
        assertEquals(null, SettingSources.flagValue(SettingSources.ALL))
        assertEquals(null, SettingSources.flagValue("nonsense"))
        assertEquals("user", SettingSources.flagValue(SettingSources.USER_ONLY))
    }

    // The policy layer is not in the flag's vocabulary at all: an organization's managed settings apply
    // whatever is chosen, and the panel has to read them under every answer for the same reason.
    @Test
    fun `an organization's policy is read under every answer`() {
        for (value in SettingSources.CHOICES) {
            assertTrue(ClaudeSettings.Layer.POLICY in SettingSources.layers(value), "policy missing for '$value'")
        }
    }

    @Test
    fun `each answer drops exactly the layers it names`() {
        assertEquals(ClaudeSettings.Layer.entries.toSet(), SettingSources.layers(SettingSources.ALL))

        val shared = SettingSources.layers(SettingSources.WITHOUT_LOCAL)
        assertTrue(ClaudeSettings.Layer.PROJECT in shared)
        assertFalse(ClaudeSettings.Layer.LOCAL in shared)

        val mine = SettingSources.layers(SettingSources.USER_ONLY)
        assertFalse(ClaudeSettings.Layer.PROJECT in mine)
        assertFalse(ClaudeSettings.Layer.LOCAL in mine)
        assertTrue(ClaudeSettings.Layer.USER in mine)
    }

    // What the warning about a checked-in key hangs on: layers that are not loaded cannot outrank
    // anything, so there is nothing to warn about.
    @Test
    fun `the repository counts as read until both of its layers are off`() {
        assertTrue(SettingSources.readsRepository(SettingSources.ALL))
        assertTrue(SettingSources.readsRepository(SettingSources.WITHOUT_LOCAL))
        assertFalse(SettingSources.readsRepository(SettingSources.USER_ONLY))
    }

    /**
     * The half that decides what the panel reads off disk: a layer left out of the launch must be left
     * out here too, or the mode selector names a mode the process will not come up in.
     */
    @Test
    fun `the files the panel reads follow the same choice`() {
        val project = createTempDirectory("settings-sources").toFile()
        project.deleteOnExit()
        File(project, ".claude").mkdirs()

        val layersOf = { value: String ->
            ClaudeSettings.sources(project.absolutePath, value)
                .filter { it.file.absolutePath.startsWith(project.absolutePath) }
                .map { it.layer }
                .toSet()
        }

        assertEquals(
            setOf(ClaudeSettings.Layer.LOCAL, ClaudeSettings.Layer.PROJECT),
            layersOf(SettingSources.ALL),
        )
        assertEquals(setOf(ClaudeSettings.Layer.PROJECT), layersOf(SettingSources.WITHOUT_LOCAL))
        assertEquals(emptySet(), layersOf(SettingSources.USER_ONLY))
    }
}

package io.github.crmapache.amazingclaudecode.claude.accounts

import io.github.crmapache.amazingclaudecode.claude.SettingSources
import java.io.File
import kotlin.io.path.createTempDirectory
import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertTrue

/**
 * What the panel says when a repository overrules the account somebody chose in it.
 *
 * Held by a test rather than by care, because the failure it guards is the silent one: a turn that runs,
 * answers and is billed to a subscription nobody picked, with the picked one still drawn on screen.
 */
class AccountOverrideTest {

    private fun project(shared: String? = null, local: String? = null): String {
        val directory = createTempDirectory("account-override").toFile()
        directory.deleteOnExit()
        File(directory, ".claude").mkdirs()
        shared?.let { File(directory, ".claude/settings.json").writeText(it) }
        local?.let { File(directory, ".claude/settings.local.json").writeText(it) }

        return directory.absolutePath
    }

    @Test
    fun `a key in the repository's settings is named`() {
        val directory = project(shared = """{"env": {"ANTHROPIC_API_KEY": "sk-ant-whatever"}}""")

        assertEquals(listOf("ANTHROPIC_API_KEY"), AccountOverride.namesIn(directory, SettingSources.ALL))
    }

    // The address counts too: with the credential pointed elsewhere, the account chosen here is no more
    // in use than it would be under a foreign key.
    @Test
    fun `a base URL counts, and both files are read`() {
        val directory = project(
            shared = """{"env": {"ANTHROPIC_BASE_URL": "https://gateway.example"}}""",
            local = """{"env": {"ANTHROPIC_AUTH_TOKEN": "a-token"}}""",
        )

        assertEquals(
            listOf("ANTHROPIC_AUTH_TOKEN", "ANTHROPIC_BASE_URL"),
            AccountOverride.namesIn(directory, SettingSources.ALL),
        )
    }

    @Test
    fun `a command that prints a key is named as well`() {
        val directory = project(shared = """{"apiKeyHelper": "/usr/local/bin/print-key"}""")

        assertEquals(listOf(AccountOverride.API_KEY_HELPER), AccountOverride.namesIn(directory, SettingSources.ALL))
    }

    // The whole point of the setting: layers the CLI is told to skip decide nothing, so there is nothing
    // to warn about. Measured on a real CLI before this was written - see SettingSources.
    @Test
    fun `nothing is named once the layers are not loaded`() {
        val directory = project(
            shared = """{"env": {"ANTHROPIC_BASE_URL": "https://gateway.example"}}""",
            local = """{"env": {"ANTHROPIC_API_KEY": "sk-ant-whatever"}}""",
        )

        assertTrue(AccountOverride.namesIn(directory, SettingSources.USER_ONLY).isEmpty())
        // Only the local file is skipped here, so what the shared one sets still decides.
        assertEquals(
            listOf("ANTHROPIC_BASE_URL"),
            AccountOverride.namesIn(directory, SettingSources.WITHOUT_LOCAL),
        )
    }

    // An empty value is how the plugin itself blanks these variables in a process's environment, and the
    // CLI reads it as absent (see AccountStore.OUTRANKING_VARIABLES). Read otherwise here, the warning
    // would fire on settings that override nothing.
    @Test
    fun `an empty value sets nothing`() {
        val directory = project(shared = """{"env": {"ANTHROPIC_API_KEY": "", "ANTHROPIC_BASE_URL": ""}}""")

        assertTrue(AccountOverride.namesIn(directory, SettingSources.ALL).isEmpty())
    }

    @Test
    fun `everything else in env is somebody's own business`() {
        val directory = project(shared = """{"env": {"EDITOR": "vim", "MAX_THINKING_TOKENS": "31999"}}""")

        assertTrue(AccountOverride.namesIn(directory, SettingSources.ALL).isEmpty())
    }

    // Somebody else's settings file may hold anything at all, and the panel must neither crash over it
    // nor start warning about a file it could not read.
    @Test
    fun `a broken or odd file is not a warning`() {
        assertTrue(AccountOverride.namesIn(project(shared = "{ this is not json"), SettingSources.ALL).isEmpty())
        assertTrue(AccountOverride.namesIn(project(shared = """{"env": "not an object"}"""), SettingSources.ALL).isEmpty())
        assertTrue(AccountOverride.namesIn(project(), SettingSources.ALL).isEmpty())
        assertTrue(AccountOverride.namesIn(null, SettingSources.ALL).isEmpty())
    }

    // One odd entry must not cost the names standing beside it: `jsonPrimitive` throws on an object, and
    // a thrown read would have answered "nothing is overridden" for the whole file.
    @Test
    fun `a nested value beside a key does not hide the key`() {
        val directory = project(shared = """{"env": {"NESTED": {"a": 1}, "ANTHROPIC_API_KEY": "sk-ant-whatever"}}""")

        assertEquals(listOf("ANTHROPIC_API_KEY"), AccountOverride.namesIn(directory, SettingSources.ALL))
    }
}

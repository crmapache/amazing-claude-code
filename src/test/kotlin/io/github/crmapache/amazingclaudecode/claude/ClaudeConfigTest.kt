package io.github.crmapache.amazingclaudecode.claude

import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertNull
import kotlin.test.assertTrue
import kotlinx.serialization.json.Json
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.jsonObject

/**
 * Claude Code's own settings as the panel's screen shows them (see ClaudeConfig). Checked here because a
 * wrong value on that screen is worse than no screen: it says a setting is on when it is off, and the
 * person trusts it instead of the file.
 */
class ClaudeConfigTest {

    /** The head of what `/config` prints in a stream (2.1.280), word for word. */
    private val usage = """
        Usage: /config key=value [key=value ...]
          autoCompact=true|false
          language=<value>
          switchModelsOnFlag=Switch automatically|Ask each time
          outputStyle=default|Proactive|Concise|Explanatory|Learning
          permissionMode=default|plan|acceptEdits|auto|dontAsk
          workflows=true|false
          brandNewSetting=on|off
    """.trimIndent()

    private val catalog = ClaudeConfig.parse(usage)

    private fun json(text: String): JsonObject = Json.parseToJsonElement(text).jsonObject

    private fun files(
        user: String = "{}",
        project: String = "{}",
        local: String = "{}",
        global: String = "{}",
    ) = ClaudeConfig.Files(
        layers = listOf(
            ClaudeSettings.Layer.POLICY to json("{}"),
            ClaudeSettings.Layer.LOCAL to json(local),
            ClaudeSettings.Layer.PROJECT to json(project),
            ClaudeSettings.Layer.USER to json(user),
        ),
        globalConfig = json(global),
    )

    private fun setting(key: String, files: ClaudeConfig.Files) =
        ClaudeConfig.settings(catalog, files).first { it.key == key }

    @Test
    fun `the usage text is read into keys and the values they take`() {
        assertEquals(
            listOf("autoCompact", "language", "switchModelsOnFlag", "outputStyle", "permissionMode", "workflows", "brandNewSetting"),
            catalog.map { it.key },
        )
        assertEquals(listOf("true", "false"), catalog.first().options)
        assertTrue(catalog.first { it.key == "language" }.free)
        // A value with a space in it is one value.
        assertEquals(listOf("Switch automatically", "Ask each time"), catalog.first { it.key == "switchModelsOnFlag" }.options)
    }

    // An old CLI, or one that answers differently: the screen says it could not read the list.
    @Test
    fun `an answer that is not a usage text reads as nothing`() {
        assertTrue(ClaudeConfig.parse("Opening settings…").isEmpty())
    }

    // The chain the CLI's own screen reads a global setting by: the settings file, then the old
    // ~/.claude.json, then its default.
    @Test
    fun `a global setting is read from the settings file, then the old config, then the default`() {
        assertEquals("true", setting("autoCompact", files()).value)
        assertEquals("false", setting("autoCompact", files(global = """{"autoCompactEnabled":false}""")).value)
        assertEquals(
            "true",
            setting("autoCompact", files(user = """{"autoCompactEnabled":true}""", global = """{"autoCompactEnabled":false}""")).value,
        )
    }

    // A global setting is the user's alone: a repository cannot set it for them.
    @Test
    fun `a project's files do not speak for a global setting`() {
        assertEquals("true", setting("autoCompact", files(project = """{"autoCompactEnabled":false}""")).value)
    }

    @Test
    fun `an ordinary setting is read from the strongest layer, and a stronger one than the write locks it`() {
        val mode = setting("permissionMode", files(user = """{"permissions":{"defaultMode":"plan"}}"""))
        assertEquals("plan", mode.value)
        assertNull(mode.lockedBy)

        // `/config` writes the user's file; the project's holding the setting means a change here changes nothing.
        val locked = setting(
            "permissionMode",
            files(user = """{"permissions":{"defaultMode":"plan"}}""", project = """{"permissions":{"defaultMode":"acceptEdits"}}"""),
        )
        assertEquals("acceptEdits", locked.value)
        assertEquals(ClaudeSettings.Layer.PROJECT, locked.lockedBy)
    }

    // The output style is the one `/config` writes into the project's local file - that layer is where it
    // lives, not something standing over it.
    @Test
    fun `the output style in the local file is its own place rather than a lock`() {
        val style = setting("outputStyle", files(local = """{"outputStyle":"Concise"}"""))
        assertEquals("Concise", style.value)
        assertNull(style.lockedBy)
        // And it holds for this project alone, which the screen says.
        assertTrue(style.projectOnly)
        assertTrue(!setting("autoCompact", files()).projectOnly)
    }

    // The order of importance rather than the CLI's alphabet; what the table does not know goes last.
    @Test
    fun `the settings come in the order that matters, the unknown ones last`() {
        val keys = ClaudeConfig.settings(catalog, files()).map { it.key }
        assertEquals("autoCompact", keys.first())
        assertEquals("brandNewSetting", keys.last())
    }

    // Where the CLI works the default out at run time, a guess would show a value that is not in force.
    @Test
    fun `a setting with no default of its own is unknown until written`() {
        assertNull(setting("workflows", files()).value)
        assertEquals("true", setting("workflows", files(user = """{"enableWorkflows":true}""")).value)
        // `disableWorkflows: true` wins over everything, the way the CLI reads it.
        assertEquals("false", setting("workflows", files(user = """{"enableWorkflows":true,"disableWorkflows":true}""")).value)
        assertNull(setting("switchModelsOnFlag", files()).value)
        assertEquals("Ask each time", setting("switchModelsOnFlag", files(user = """{"switchModelsOnFlag":false}""")).value)
    }

    // A setting a newer CLI added is still offered - without a value marked as current.
    @Test
    fun `a setting the table does not know is offered without a value`() {
        val fresh = setting("brandNewSetting", files())
        assertNull(fresh.value)
        assertEquals(ClaudeConfig.Group.OTHER, fresh.group)
        assertEquals(listOf("on", "off"), fresh.options)
    }

    // What reaches a process on this machine is decided here, not by whoever sent the message.
    @Test
    fun `only a listed key with a listed value becomes a command`() {
        assertEquals("/config autoCompact=false", ClaudeConfig.command(catalog, "autoCompact", "false"))
        assertNull(ClaudeConfig.command(catalog, "autoCompact", "maybe"))
        assertNull(ClaudeConfig.command(catalog, "apiKey", "true"))
        assertEquals("/config language=Brazilian Portuguese", ClaudeConfig.command(catalog, "language", "  Brazilian\nPortuguese "))
        assertNull(ClaudeConfig.command(catalog, "language", "  "))
    }
}

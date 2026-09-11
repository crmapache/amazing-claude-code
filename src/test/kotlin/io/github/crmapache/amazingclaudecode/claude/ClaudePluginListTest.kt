package io.github.crmapache.amazingclaudecode.claude

import kotlinx.serialization.json.Json
import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertFalse
import kotlin.test.assertNull
import kotlin.test.assertTrue

/**
 * How an answer from `claude plugin list` is told apart from a shape we did not expect.
 *
 * The "/" hint is built from this list, and the failure it guards against is a silent one: a field
 * renamed in some later CLI reads as "no plugins installed", every plugin's commands leave the hint,
 * and nothing anywhere says why. Both doors into the list ask the same question - see [ClaudePlugin].
 */
class ClaudePluginListTest {

    private fun parse(text: String) = ClaudePlugin.parseInstalled(Json.parseToJsonElement(text))

    @Test
    fun `an entry with the fields we expect is read`() {
        val plugin = parse(
            """
            {
              "id": "context7@claude-plugins-official",
              "version": "1.2.0",
              "scope": "user",
              "enabled": true,
              "installPath": "/Users/somebody/.claude/plugins/context7"
            }
            """.trimIndent(),
        )

        assertEquals("context7@claude-plugins-official", plugin?.id)
        assertEquals("/Users/somebody/.claude/plugins/context7", plugin?.installPath)
        assertTrue(plugin?.enabled == true)
    }

    @Test
    fun `an entry in a shape we do not know reads as nothing rather than as a blank plugin`() {
        // A plugin with no id names no commands and cannot be found on disk: kept, it would be an entry
        // in the hint pointing at nowhere.
        assertNull(parse("""{ "name": "context7", "version": "1.2.0" }"""))
        assertNull(parse(""""a string where an object was promised""""))
    }

    @Test
    fun `an answer with entries out of which none could be read is an error, not an empty list`() {
        // The whole point of the guard, and the reason it now sits in one place: the plugins screen and
        // the hint's own refresh come through two different calls, and only one of them used to ask.
        assertTrue(ClaudePlugin.unreadable(entries = 3, read = 0))
    }

    @Test
    fun `an honestly empty answer is believed`() {
        // The other half. Told apart, an empty answer may empty the cache - so a plugin that has been
        // removed leaves the hint instead of living on in it until the hub is disposed of.
        assertFalse(ClaudePlugin.unreadable(entries = 0, read = 0))
    }

    @Test
    fun `an answer we could partly read is not an error`() {
        assertFalse(ClaudePlugin.unreadable(entries = 3, read = 1))
    }
}

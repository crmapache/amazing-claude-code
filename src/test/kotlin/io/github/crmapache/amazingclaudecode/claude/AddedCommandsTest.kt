package io.github.crmapache.amazingclaudecode.claude

import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertFalse
import kotlin.test.assertNull
import kotlin.test.assertTrue

/**
 * The commands a conversation's CLI came to know after its first catalogue - and the lines they are read
 * from, shaped the way CLI 2.1.293 wrote them in a recorded session with a mod that registers `/replay`.
 */
class AddedCommandsTest {

    private fun described(
        name: String,
        builtin: Boolean = false,
        description: String = "$name does it",
        fromMod: Boolean = !builtin,
    ) = ClaudeCommandNames.Described(name, description, "", builtin, fromMod)

    @Test
    fun `the later catalogue is read with descriptions, and tells a mod's command from a skill and an MCP prompt`() {
        val line = """{"type":"system","subtype":"commands_changed","commands":[""" +
            """{"name":"compact","description":"Clear the history","argumentHint":"<instructions>","aliases":[],"builtin":true},""" +
            """{"name":"pdf","description":"Use this skill whenever the user wants to do anything with PDF files. (claude.ai sync)",""" +
            """"argumentHint":"","aliases":[]},""" +
            """{"name":"snakein:analyze (MCP)","description":"Analyze the calls","argumentHint":""},""" +
            """{"name":"replay","description":"Replay Theater: step through the last turn's file edits","argumentHint":""}],""" +
            """"uuid":"u","session_id":"s"}"""

        assertEquals(
            listOf(
                ClaudeCommandNames.Described("compact", "Clear the history", "<instructions>", builtin = true, fromMod = false),
                ClaudeCommandNames.Described(
                    "pdf",
                    "Use this skill whenever the user wants to do anything with PDF files. (claude.ai sync)",
                    "",
                    builtin = false,
                    fromMod = false,
                ),
                ClaudeCommandNames.Described("snakein:analyze (MCP)", "Analyze the calls", "", builtin = false, fromMod = false),
                ClaudeCommandNames.Described(
                    "replay",
                    "Replay Theater: step through the last turn's file edits",
                    "",
                    builtin = false,
                    fromMod = true,
                ),
            ),
            ClaudeCommandNames.changed(line),
        )
    }

    /**
     * The skills synced from claude.ai arrive after the first catalogue too - in every conversation of an
     * account that has them, with or without a mod. They are not a mod's, and the hint stays as it was.
     */
    @Test
    fun `a skill that arrives late on its own is not added`() {
        val added = AddedCommands()
        added.noteCatalogue("main", listOf("compact"))

        assertFalse(added.noteChanged("main", listOf(described("pdf", fromMod = false), described("docs", fromMod = false))))
        assertTrue(added.all().isEmpty())
    }

    /**
     * An MCP server's prompts arrive after the first catalogue too, named for show and with no aliases - in
     * every conversation with such a server, mod or no mod. They are not a mod's, and the hint stays as it was.
     */
    @Test
    fun `an MCP prompt that arrives late is not taken for a mod's command`() {
        val line = """{"type":"system","subtype":"commands_changed","commands":[""" +
            """{"name":"chatkepr:archive (MCP)","description":"Read the whole archive","argumentHint":""},""" +
            """{"name":"mcp__server__prompt","description":"A prompt","argumentHint":""}]}"""

        assertEquals(listOf(false, false), ClaudeCommandNames.changed(line)!!.map { it.fromMod })
    }

    @Test
    fun `no other line is taken for the later catalogue`() {
        assertNull(ClaudeCommandNames.changed("""{"type":"system","subtype":"init","slash_commands":["compact"]}"""))
        assertNull(
            ClaudeCommandNames.changed(
                """{"type":"assistant","message":{"content":[{"type":"text","text":"\"subtype\":\"commands_changed\""}]}}""",
            ),
        )
        assertNull(ClaudeCommandNames.changed("""{"type":"system","subtype":"commands_changed","task_id":"t","commands":[]}"""))
    }

    @Test
    fun `a command the first catalogue lacked is added, with its description`() {
        val added = AddedCommands()
        added.noteCatalogue("main", listOf("compact", "review"))

        assertTrue(added.noteChanged("main", listOf(described("compact", builtin = true), described("review"), described("replay"))))
        assertEquals(mapOf("replay" to CommandHint("replay does it", "")), added.all())
    }

    /**
     * The lock on everyone else: without a mod the later catalogue names what the first one did, and the
     * hint is told nothing at all.
     */
    @Test
    fun `a later catalogue naming nothing new adds nothing`() {
        val added = AddedCommands()
        added.noteCatalogue("main", listOf("compact", "review", "mcp__server__prompt"))

        assertFalse(added.noteChanged("main", listOf(described("compact", builtin = true), described("review"), described("mcp__server__prompt"))))
        assertTrue(added.all().isEmpty())
    }

    /** The CLI's own commands are never taken from here - the panel leaves some of them out on purpose. */
    @Test
    fun `the CLI's own commands are not added even when the first catalogue lacked them`() {
        val added = AddedCommands()
        added.noteCatalogue("main", listOf("compact"))

        assertFalse(added.noteChanged("main", listOf(described("skills", builtin = true))))
        assertTrue(added.all().isEmpty())
    }

    @Test
    fun `nothing is taken before the first catalogue is known`() {
        val added = AddedCommands()

        assertFalse(added.noteChanged("main", listOf(described("replay"))))
        assertTrue(added.all().isEmpty())
    }

    /** Every turn reports a catalogue, and by the second one the mod's command is in it: the first one counts. */
    @Test
    fun `only a process's first catalogue counts`() {
        val added = AddedCommands()
        added.noteCatalogue("main", listOf("compact"))
        added.noteCatalogue("main", listOf("compact", "replay"))

        assertTrue(added.noteChanged("main", listOf(described("compact", builtin = true), described("replay"))))
        assertEquals(setOf("replay"), added.all().keys)
    }

    @Test
    fun `the same news twice is not news`() {
        val added = AddedCommands()
        added.noteCatalogue("main", listOf("compact"))

        assertTrue(added.noteChanged("main", listOf(described("replay"))))
        assertFalse(added.noteChanged("main", listOf(described("replay"))))
    }

    @Test
    fun `a mod taken away takes its command with it`() {
        val added = AddedCommands()
        added.noteCatalogue("main", listOf("compact"))
        added.noteChanged("main", listOf(described("replay")))

        assertTrue(added.noteChanged("main", listOf(described("compact", builtin = true))))
        assertTrue(added.all().isEmpty())
    }

    @Test
    fun `a replaced process and a closed conversation let their commands go`() {
        val added = AddedCommands()
        added.noteCatalogue("main", listOf("compact"))
        added.noteChanged("main", listOf(described("replay")))
        added.noteCatalogue("other", listOf("compact"))
        added.noteChanged("other", listOf(described("standup")))

        assertTrue(added.processStarted("main"))
        assertEquals(setOf("standup"), added.all().keys)
        // The new process reports its own first catalogue before anything is taken from it again.
        assertFalse(added.noteChanged("main", listOf(described("replay"))))

        assertTrue(added.forget("other"))
        assertTrue(added.all().isEmpty())
        assertFalse(added.forget("other"))
    }
}

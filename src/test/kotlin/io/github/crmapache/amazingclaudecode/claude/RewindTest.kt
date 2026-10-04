package io.github.crmapache.amazingclaudecode.claude

import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertFalse
import kotlin.test.assertNull
import kotlin.test.assertTrue
import kotlinx.serialization.json.Json
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.buildJsonObject
import kotlinx.serialization.json.put
import kotlinx.serialization.json.jsonArray
import kotlinx.serialization.json.jsonObject
import kotlinx.serialization.json.jsonPrimitive

/** The answers below are the bodies 2.1.280 sent back in live runs (see Rewind). */
class RewindTest {

    private fun json(text: String): JsonObject = Json.parseToJsonElement(text).jsonObject

    @Test
    fun `a cut that happened gives the dropped message's text back`() {
        val cut = Rewind.cutOf(
            json("""{"rewound":true,"targetMessageUuid":"a7e2","prefillText":"Remember the word BANANA.","precedingAssistantUuid":"8777"}"""),
        )

        assertEquals(Rewind.Cut.Done("Remember the word BANANA."), cut)
    }

    // A refusal is a success answer with `rewound: false` - read for the reason, in the panel's own words.
    @Test
    fun `a refused cut says why, as the panel words it`() {
        val refused = { reason: String ->
            Rewind.cutOf(json("""{"rewound":false,"prefillText":null,"precedingAssistantUuid":null,"error":"x","reason":"$reason"}"""))
        }

        assertEquals(Rewind.Refusal.MOVED, (refused("stale_target") as Rewind.Cut.Refused).refusal)
        assertEquals(Rewind.Refusal.MOVED, (refused("unseen_later_turn") as Rewind.Cut.Refused).refusal)
        assertEquals(Rewind.Refusal.BUSY, (refused("turn_running") as Rewind.Cut.Refused).refusal)
        assertEquals(Rewind.Refusal.GONE, (refused("target_not_found") as Rewind.Cut.Refused).refusal)
        assertEquals(Rewind.Refusal.MID_CALL, (refused("target_splits_tool_call") as Rewind.Cut.Refused).refusal)
        assertEquals(Rewind.Refusal.NOT_SAVED, (refused("persist_failed") as Rewind.Cut.Refused).refusal)
        assertEquals(Rewind.Refusal.OTHER, (refused("something_new") as Rewind.Cut.Refused).refusal)
    }

    @Test
    fun `the files a code rewind would put back, and how much`() {
        val code = Rewind.codeOf(
            json("""{"canRewind":true,"filesChanged":["/p/f.txt","/p/g.txt"],"insertions":4,"deletions":2}"""),
        )

        assertEquals(Rewind.Code.Ready(listOf("/p/f.txt", "/p/g.txt"), 4, 2), code)
    }

    @Test
    fun `nothing changed since is nothing to offer, not a failure`() {
        assertEquals(Rewind.Code.None, Rewind.codeOf(json("""{"canRewind":true,"filesChanged":[],"insertions":0,"deletions":0}""")))
        assertEquals(Rewind.Code.None, Rewind.codeOf(json("""{"canRewind":true}""")))
    }

    // The CLI's two refusals before a dry run, word for word as 2.1.280 says them.
    @Test
    fun `code that was never kept is told apart from code kept for other messages`() {
        assertEquals(
            Rewind.Code.NotTracked,
            Rewind.codeOf(json("""{"canRewind":false,"error":"File rewinding is not enabled."}""")),
        )
        assertEquals(
            Rewind.Code.NoCheckpoint,
            Rewind.codeOf(json("""{"canRewind":false,"error":"No file checkpoint found for this message."}""")),
        )
        assertEquals(
            Rewind.Code.Unavailable("Failed to rewind: EACCES"),
            Rewind.codeOf(json("""{"canRewind":false,"error":"Failed to rewind: EACCES"}""")),
        )
    }

    @Test
    fun `a restore that went through has nothing to say, one that did not says why`() {
        assertNull(Rewind.restoredOf(json("""{"canRewind":true,"skippedLinks":0}""")))
        assertEquals("Failed to rewind: EACCES", Rewind.restoredOf(json("""{"canRewind":false,"error":"Failed to rewind: EACCES"}""")))
    }

    // The name goes into the process's stdin and the CLI's matching - nothing but a uuid passes.
    @Test
    fun `only a uuid names a message`() {
        assertTrue(Rewind.isUuid("2fd136cf-b840-41f5-938f-5eaa3a7c2738"))
        assertFalse(Rewind.isUuid("2fd136cf"))
        assertFalse(Rewind.isUuid("2fd136cf-b840-41f5-938f-5eaa3a7c2738\"}"))
        assertFalse(Rewind.isUuid(null))
    }

    @Test
    fun `the preview says files from the project's folder, from home past it, and leaves the rest whole`() {
        val files = listOf("/home/me/app/src/a.ts", "/home/me/.claude/memory/note.md", "/tmp/scratch.txt", "/home/me/application.txt")
        val code = Rewind.relativeTo(Rewind.Code.Ready(files, 3, 1), "/home/me/app", "/home/me")
        val json = json(Rewind.previewJson("tab", "u-1", code))
        val sent = json["code"]!!.jsonObject

        assertEquals("ready", sent["state"]!!.jsonPrimitive.content)
        assertEquals(
            listOf("src/a.ts", "~/.claude/memory/note.md", "/tmp/scratch.txt", "~/application.txt"),
            sent["files"]!!.jsonArray.map { it.jsonPrimitive.content },
        )
        assertEquals(4, sent["count"]!!.jsonPrimitive.content.toInt())
    }

    // The IDE says the project's folder with "/" on Windows too, the CLI says its files with "\\", and the
    // home directory comes from the JVM with "\\" and maybe another case of the drive letter.
    @Test
    fun `a Windows path is said from its folders whichever separator each side uses`() {
        val code = Rewind.relativeTo(
            Rewind.Code.Ready(listOf("C:\\work\\app\\src\\a.ts", "C:\\Users\\me\\.claude\\note.md", "C:\\work\\apple\\b.ts"), 1, 0),
            "C:/work/app",
            "c:\\Users\\me",
        ) as Rewind.Code.Ready

        assertEquals(listOf("src\\a.ts", "~\\.claude\\note.md", "C:\\work\\apple\\b.ts"), code.files)
    }

    @Test
    fun `the outcome says what went, and a refusal says why`() {
        val done = json(Rewind.outcomeJson("tab", "u-1", Rewind.Outcome.Done(true, "hello", Rewind.Files.RESTORED, listOf("/a"))))
        assertEquals(true, done["ok"]!!.jsonPrimitive.content.toBoolean())
        assertEquals("restored", done["files"]!!.jsonPrimitive.content)
        assertEquals("hello", done["prefill"]!!.jsonPrimitive.content)

        val refused = json(Rewind.outcomeJson("tab", "u-1", Rewind.Outcome.Refused(Rewind.Refusal.MOVED, "unseen later turn")))
        assertEquals(false, refused["ok"]!!.jsonPrimitive.content.toBoolean())
        assertEquals("moved", refused["reason"]!!.jsonPrimitive.content)
    }

    // The process went while the rewind was out (see AwaitedControls): its own reason, not "some error".
    @Test
    fun `a rewind cut short by its process going says so`() {
        assertEquals(Rewind.Refusal.ENDED, Rewind.Refusal.ofError(AwaitedControls.PROCESS_ENDED))
        assertEquals(Rewind.Refusal.NO_PROCESS, Rewind.Refusal.ofError(SideQuestion.NO_SESSION))
    }

    // Said into the tab's feed as a code the panel words (see feed/rewind.ts, forkCodeOf), like FORK_WHOLE.
    @Test
    fun `code a fork could not take along is said as a code with its reason`() {
        assertEquals("FORK_CODE|busy|", Rewind.forkCodeError(Rewind.Outcome.Refused(Rewind.Refusal.BUSY, "")))
        assertEquals(
            "FORK_CODE|code|noCheckpoint",
            Rewind.forkCodeError(Rewind.Outcome.Refused(Rewind.Refusal.CODE, "noCheckpoint")),
        )
    }

    // Measured live on 2.1.280: a message written into a running turn sits unread in the CLI until the agent's
    // next step, and a cut asked for meanwhile is refused with `commands_queued` - interrupt_if_running or not.
    // That one is worth stopping the turn and asking again (see ClaudeSession.cut); a turn that is merely running
    // is not, and neither is anything else.
    @Test
    fun `a cut refused over a message the CLI has not read yet is told apart`() {
        fun refusal(reason: String) = buildJsonObject {
            put("rewound", false)
            put("reason", reason)
            put("error", reason.replace('_', ' '))
        }

        assertTrue(Rewind.waitsOnUnread(refusal("commands_queued")))
        assertTrue(Rewind.waitsOnUnread(refusal("prompt_pending")))
        assertFalse(Rewind.waitsOnUnread(refusal("turn_running")))
        assertFalse(Rewind.waitsOnUnread(refusal("stale_target")))
        assertFalse(Rewind.waitsOnUnread(buildJsonObject { put("rewound", true) }))
    }
}

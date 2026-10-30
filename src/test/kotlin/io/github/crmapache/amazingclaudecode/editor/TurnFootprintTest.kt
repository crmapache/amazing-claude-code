package io.github.crmapache.amazingclaudecode.editor

import kotlinx.serialization.json.Json
import kotlinx.serialization.json.JsonArray
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.addJsonObject
import kotlinx.serialization.json.boolean
import kotlinx.serialization.json.buildJsonObject
import kotlinx.serialization.json.int
import kotlinx.serialization.json.jsonArray
import kotlinx.serialization.json.jsonObject
import kotlinx.serialization.json.jsonPrimitive
import kotlinx.serialization.json.put
import kotlinx.serialization.json.putJsonArray
import java.io.File
import java.nio.file.Files
import java.util.concurrent.TimeUnit
import kotlin.test.AfterTest
import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertFalse
import kotlin.test.assertNotNull
import kotlin.test.assertNull
import kotlin.test.assertTrue

/**
 * A turn held against the project as it began, on a real git repository: every file it changed is found however it
 * changed it, the person's repository is never written, and the rows carry diffs a revert takes back exactly.
 */
class TurnFootprintTest {

    private val temp: File = Files.createTempDirectory("acc-footprint").toFile()
    private val repo = File(temp, "repo").apply { mkdirs() }
    private val storage = File(temp, "store")
    private var clock = 1_000L

    @AfterTest
    fun cleanUp() {
        temp.deleteRecursively()
    }

    private fun git(vararg args: String, cwd: File = repo): String {
        val process = ProcessBuilder(listOf("git", *args)).directory(cwd).redirectErrorStream(true)
            .also { it.environment().keys.removeIf { key -> key.startsWith("GIT_") } }
            .start()
        val out = process.inputStream.readAllBytes().toString(Charsets.UTF_8)
        assertTrue(process.waitFor(30, TimeUnit.SECONDS))
        assertEquals(0, process.exitValue(), "git ${args.joinToString(" ")}: $out")
        return out
    }

    private fun write(path: String, text: String) = File(repo, path).apply { parentFile.mkdirs() }.writeText(text)

    private fun committed(vararg files: Pair<String, String>) {
        git("init", "-q")
        files.forEach { (path, text) -> write(path, text) }
        git("add", "-A")
        git("-c", "user.name=t", "-c", "user.email=t@t", "commit", "-qm", "start")
    }

    private fun footprint(root: File = repo) = TurnFootprint(root = { root }, snapshots = WorkTreeSnapshots(storage), now = { clock++ })

    private fun JsonObject.text(key: String) = this[key]?.jsonPrimitive?.content.orEmpty()

    private fun byName(rows: List<JsonObject>) = rows.associateBy { File(it.text("path")).name }

    private fun editsOf(row: JsonObject): List<ChangeRevert.Edit> =
        ChangeRevert.requestsOf(JsonArray(listOf(buildJsonObject {
            put("path", row.text("path"))
            put("edits", row["edits"]!!)
        }))).single().edits

    @Test
    fun `every file the turn changed is found, however it was changed, and nothing else`() {
        committed("kept.ts" to "a\nb\nc\n", "edited.ts" to "one\ntwo\n", "gone.ts" to "x\ny\n", ".gitignore" to "build/\n")
        write("dirty.ts", "was dirty before the turn\n")
        val footprint = footprint()
        footprint.begin("tab")

        // What a turn does: a script, an `rm`, a new file, a build nobody tracks.
        write("edited.ts", "one\nTWO\nthree\n")
        File(repo, "gone.ts").delete()
        write("src/new.ts", "fresh\nfile\n")
        write("dirty.ts", "was dirty before the turn\nand the turn added to it\n")
        write("build/out.js", "ignored\n")

        val rows = byName(footprint.end("tab"))
        assertEquals(setOf("edited.ts", "gone.ts", "new.ts", "dirty.ts"), rows.keys)
        assertEquals(2, rows.getValue("edited.ts")["added"]!!.jsonPrimitive.int)
        assertEquals(1, rows.getValue("edited.ts")["removed"]!!.jsonPrimitive.int)
        assertTrue(rows.getValue("new.ts")["created"]!!.jsonPrimitive.boolean)
        assertEquals(2, rows.getValue("new.ts")["added"]!!.jsonPrimitive.int)
        assertTrue(rows.getValue("gone.ts")["deleted"]!!.jsonPrimitive.boolean)
        assertEquals(2, rows.getValue("gone.ts")["removed"]!!.jsonPrimitive.int)
        // A file dirty before the turn counts from how the turn found it, not from the last commit.
        assertEquals(1, rows.getValue("dirty.ts")["added"]!!.jsonPrimitive.int)
        assertEquals(0, rows.getValue("dirty.ts")["removed"]!!.jsonPrimitive.int)
    }

    @Test
    fun `the rows' edits take each file back to where the turn found it`() {
        committed("edited.ts" to "one\ntwo\nthree\n", "gone.ts" to "x\ny\n")
        val footprint = footprint()
        footprint.begin("tab")
        write("edited.ts", "one\n2\nthree\nfour\n")
        File(repo, "gone.ts").delete()
        write("new.ts", "n\n")

        val rows = byName(footprint.end("tab"))
        assertEquals(ChangeRevert.Result.Text("one\ntwo\nthree\n"), ChangeRevert.revert(File(repo, "edited.ts").readText(), editsOf(rows.getValue("edited.ts"))))
        assertEquals(ChangeRevert.Result.Delete, ChangeRevert.revert(File(repo, "new.ts").readText(), editsOf(rows.getValue("new.ts"))))
        val removed = editsOf(rows.getValue("gone.ts"))
        assertTrue(ChangeRevert.removes(removed))
        assertEquals(ChangeRevert.Result.Text("x\ny\n"), ChangeRevert.unremove(removed))
    }

    @Test
    fun `the person's repository is only read`() {
        committed("a.ts" to "a\n")
        write("b.ts", "untracked\n")
        // Without --no-optional-locks a status writes the index itself whenever it finds an entry whose
        // time equals the index's own ("racy git") - this test's own question would then fail it, about
        // one run in three, on a file whose time the test has just reset.
        val status = git("--no-optional-locks", "status", "--porcelain")
        val index = File(repo, ".git/index").readBytes()
        val objects = File(repo, ".git/objects").walkTopDown().count()

        val footprint = footprint()
        footprint.begin("tab")
        write("a.ts", "changed\n")
        write("c.ts", "new\n")
        footprint.end("tab")
        write("a.ts", "a\n")
        File(repo, "c.ts").delete()

        assertEquals(status, git("--no-optional-locks", "status", "--porcelain"))
        assertTrue(index.contentEquals(File(repo, ".git/index").readBytes()), "the index is the person's")
        assertEquals(objects, File(repo, ".git/objects").walkTopDown().count(), "no object of ours in their store")
    }

    @Test
    fun `a file the IDE wrote or another tab's agent named is not this turn's`() {
        committed("mine.ts" to "1\n", "hand.ts" to "1\n", "theirs.ts" to "1\n", "both.ts" to "1\n")
        val footprint = footprint()
        footprint.begin("tab")
        write("mine.ts", "2\n")
        write("hand.ts", "2\n")
        footprint.noteIdeWrite(File(repo, "hand.ts").path)
        write("theirs.ts", "2\n")
        footprint.noteLine("other", editLine(File(repo, "theirs.ts").path))
        // Named by this turn's own call: the turn answers for it, whoever else touched it.
        write("both.ts", "2\n")
        footprint.noteIdeWrite(File(repo, "both.ts").path)
        footprint.noteLine("tab", editLine(File(repo, "both.ts").path))

        assertEquals(setOf("mine.ts", "both.ts"), byName(footprint.end("tab")).keys)
    }

    @Test
    fun `a turn the CLI starts by itself is measured from the end of the one before`() {
        committed("a.ts" to "1\n")
        val footprint = footprint()
        footprint.begin("tab")
        write("a.ts", "2\n")
        assertEquals(setOf("a.ts"), byName(footprint.end("tab")).keys)
        footprint.turnOver("tab")

        // A background agent of that turn writes on, and reports back: a turn nobody sent.
        write("b.ts", "agent\n")
        assertEquals(setOf("b.ts"), byName(footprint.end("tab")).keys)
    }

    @Test
    fun `a turn stopped without a result leaves nothing to the next`() {
        committed("a.ts" to "1\n")
        val footprint = footprint()
        footprint.begin("tab")
        write("a.ts", "2\n")
        footprint.turnOver("tab")
        assertTrue(footprint.end("tab").isEmpty())
    }

    @Test
    fun `a message while a background agent works keeps the start it works from`() {
        committed("a.ts" to "1\n")
        val footprint = footprint()
        footprint.begin("tab")
        write("a.ts", "2\n")
        footprint.begin("tab", carryOn = true)
        write("b.ts", "3\n")
        assertEquals(setOf("a.ts", "b.ts"), byName(footprint.end("tab")).keys)
    }

    @Test
    fun `a project in a folder of a repository sees its own folder only, from its own root`() {
        committed("app/a.ts" to "1\n", "other/b.ts" to "1\n")
        val app = File(repo, "app")
        val footprint = footprint(app)
        footprint.begin("tab")
        write("app/a.ts", "2\n")
        write("other/b.ts", "2\n")
        val rows = footprint.end("tab")
        assertEquals(listOf(File(app, "a.ts").path), rows.map { it.text("path") })
    }

    @Test
    fun `a binary file is listed without figures, and without a way back`() {
        committed("a.bin" to "x")
        val footprint = footprint()
        footprint.begin("tab")
        File(repo, "a.bin").writeBytes(byteArrayOf(0, 1, 2, 3))
        val row = footprint.end("tab").single()
        assertTrue(row["uncounted"]!!.jsonPrimitive.boolean)
        assertNull(row["edits"])
    }

    @Test
    fun `no repository, no footprint - the list stays as the edit calls make it`() {
        val plain = File(temp, "plain").apply { mkdirs() }
        val footprint = footprint(plain)
        footprint.begin("tab")
        File(plain, "a.ts").writeText("1\n")
        assertTrue(footprint.end("tab").isEmpty())
    }

    @Test
    fun `the footprint's word stands over the settling's for a file both know, and found files follow`() {
        val settled = buildJsonObject {
            put("type", UndiffedEdits.SETTLED_TYPE)
            putJsonArray("files") {
                addJsonObject {
                    put("path", "/p/a.ts")
                    put("added", 1)
                    put("removed", 0)
                }
                addJsonObject {
                    put("path", "/p/b.ts")
                    put("added", 1)
                    put("removed", 0)
                }
            }
        }.toString()
        val found = listOf(
            buildJsonObject {
                put("path", "/p/b.ts")
                put("added", 5)
                put("removed", 2)
            },
            buildJsonObject {
                put("path", "/p/c.ts")
                put("added", 3)
                put("removed", 0)
            },
        )
        val event = Json.parseToJsonElement(assertNotNull(TurnFootprint.settledEvent(settled, found, "t1"))).jsonObject
        assertEquals("t1", event.text("turn"))
        val files = event["files"]!!.jsonArray.map { it.jsonObject }
        assertEquals(listOf("/p/a.ts" to 1, "/p/b.ts" to 5, "/p/c.ts" to 3), files.map { it.text("path") to it["added"]!!.jsonPrimitive.int })
        // Nothing found: the settling goes as it was, or nothing at all.
        assertEquals(settled, TurnFootprint.settledEvent(settled, emptyList(), "t2"))
        assertNull(TurnFootprint.settledEvent(null, emptyList(), "t3"))
    }

    @Test
    fun `a removed file comes back as it was, and goes again only while it reads so`() {
        val edits = listOf(
            ChangeRevert.Edit.Patch(listOf(ChangeRevert.Hunk(newStart = 0, oldStart = 1, lines = listOf("-x", "-y")))),
            ChangeRevert.Edit.Remove,
        )
        assertEquals(ChangeRevert.Result.Text("x\ny\n"), ChangeRevert.unremove(edits))
        // Something standing where the turn removed a file is not the turn's to undo.
        assertEquals(ChangeRevert.Result.Changed, ChangeRevert.undo("other", edits))
        assertEquals(ChangeRevert.Result.Delete, ChangeRevert.redo("x\ny\n", edits))
        assertEquals(ChangeRevert.Result.Changed, ChangeRevert.redo("x\nchanged", edits))
        assertFalse(ChangeRevert.removes(edits.dropLast(1)))
    }

    private fun editLine(path: String): String = buildJsonObject {
        put("type", "assistant")
        put(
            "message",
            buildJsonObject {
                putJsonArray("content") {
                    addJsonObject {
                        put("type", "tool_use")
                        put("id", "toolu_1")
                        put("name", "Edit")
                        put("input", buildJsonObject { put("file_path", path) })
                    }
                }
            },
        )
    }.toString()
}

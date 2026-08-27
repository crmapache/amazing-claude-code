package io.github.crmapache.amazingclaudecode.feedback

import kotlin.test.Test
import kotlin.test.assertContains
import kotlin.test.assertEquals
import kotlin.test.assertFalse
import kotlin.test.assertTrue

/**
 * The buffer a debug report is built from. Small on purpose, and bounded on both axes: a stack trace must
 * not be able to push out the twenty lines before it that explain what led to it.
 */
class DiagnosticsLogTest {

    @Test
    fun `it holds the last lines and drops the oldest`() {
        val log = DiagnosticsLog()

        repeat(DiagnosticsLog.KEPT + 50) { index -> log.note("agent", "line $index") }

        val tail = log.tail()
        assertEquals(DiagnosticsLog.KEPT, tail.size)
        assertEquals("line 50", tail.first().text)
        assertEquals("line ${DiagnosticsLog.KEPT + 49}", tail.last().text)
    }

    @Test
    fun `one line cannot swallow the buffer`() {
        val log = DiagnosticsLog()

        log.note("panel", "x".repeat(10_000))

        assertEquals(DiagnosticsLog.MAX_TEXT, log.tail().first().text.length)
    }

    @Test
    fun `a line arrives as one line`() {
        val log = DiagnosticsLog()

        // A stack trace comes with its own newlines, and a report reads as a column - so what goes in is
        // flattened rather than left to break the shape of everything around it.
        log.note("panel", "  uncaught: TypeError\n    at foo\n    at bar  ")

        assertEquals("uncaught: TypeError at foo at bar", log.tail().first().text)
    }

    @Test
    fun `blank lines are not worth keeping`() {
        val log = DiagnosticsLog()

        log.note("stderr", "   ")
        log.note("stderr", "")

        assertTrue(log.tail().isEmpty())
    }

    @Test
    fun `the source and the time come along`() {
        val log = DiagnosticsLog()

        log.note("relay", "reconnecting", at = 1_700_000_000_000)

        val entry = log.tail().single()
        assertEquals("relay", entry.source)
        assertEquals(1_700_000_000_000, entry.at)
    }
}

/**
 * The scrubbing, which is the part of this buffer the feedback screen's promise rests on.
 *
 * Everything here is somebody else's text: a warning the CLI printed, the message of a file error, a
 * stack trace. All of it turns up in a debug report that leaves the machine, and all of it is exactly the
 * kind of text that carries an absolute path - which carries a home directory, which carries a name.
 */
class DiagnosticsScrubTest {

    private val home: String = System.getProperty("user.home")

    private val user: String = System.getProperty("user.name")

    @Test
    fun `a path from a library's warning does not survive`() {
        val line = DiagnosticsLog.scrub(
            "(node:41234) Warning: reading $home/work/secret-client/node_modules/x/index.js is deprecated",
        )

        assertFalse(line.contains(home), "the home directory leaked")
        assertFalse(line.contains("secret-client"), "a project name leaked")
        assertContains(line, "path:")
        // What happened is still legible - which is the point of hashing rather than dropping.
        assertContains(line, "Warning")
        assertContains(line, "is deprecated")
    }

    @Test
    fun `the same path reads as the same path`() {
        val first = DiagnosticsLog.scrub("could not open /Users/somebody/app/config.json")
        val second = DiagnosticsLog.scrub("could not open /Users/somebody/app/config.json either")

        val marks = listOf(first, second).map { Regex("path:([A-Za-z0-9_-]+)").find(it)?.groupValues?.get(1) }
        assertEquals(marks[0], marks[1])
        assertTrue(marks[0] != null)
    }

    @Test
    fun `a windows path goes too`() {
        val line = DiagnosticsLog.scrub("""ENOENT: C:\Users\Somebody\Projects\thing\.claude\settings.json""")

        assertFalse(line.contains("Somebody"))
        assertFalse(line.contains("thing"))
        assertContains(line, "path:")
    }

    @Test
    fun `a frame of a node stack trace goes, url and all`() {
        // How Node actually writes a frame: not a bare root, but a file URL. It used to pass whole.
        val line = DiagnosticsLog.scrub(
            "at run (file:///Users/somebody/Projects/thing/node_modules/@anthropic-ai/claude-code/cli.js:9:42)"
        )

        assertFalse(line.contains("somebody"))
        assertFalse(line.contains("thing"))
        assertFalse(line.contains("cli.js"))
        assertContains(line, "path:")
        assertContains(line, ":9:42")
    }

    @Test
    fun `a drive written with forward slashes goes as well`() {
        val line = DiagnosticsLog.scrub("ENOENT: C:/Users/Somebody/Projects/thing/.claude/settings.json")

        assertFalse(line.contains("Somebody"))
        assertFalse(line.contains("thing"))
        assertContains(line, "path:")
    }

    @Test
    fun `a line and column survive, because that is the useful part`() {
        val line = DiagnosticsLog.scrub("at /app/dist/index.js:112:9")

        assertContains(line, ":112:9")
        assertFalse(line.contains("/app/dist"))
    }

    @Test
    fun `an address on the network is not a path and stays readable`() {
        val line = DiagnosticsLog.scrub("relay refused wss://relay.example.com/v1/agent with 503")

        assertContains(line, "wss://relay.example.com/v1/agent")
        assertContains(line, "503")
    }

    @Test
    fun `a name that is not a path is left alone`() {
        // Two things that look path-like and are not: a Node module id and a plain word with a slash.
        val line = DiagnosticsLog.scrub("node:internal/errors and read/write both failed")

        assertContains(line, "node:internal/errors")
        assertContains(line, "read/write")
    }

    @Test
    fun `the user's own name goes even without a path around it`() {
        // Only worth asserting on a machine whose account name is long enough to be searched for.
        if (user.length < 3) return

        val line = DiagnosticsLog.scrub("EACCES: permission denied for user $user")

        assertFalse(line.contains(user), "the account name leaked")
        assertContains(line, "permission denied")
    }

    @Test
    fun `a line that reaches the buffer is already scrubbed`() {
        val log = DiagnosticsLog()

        log.note("stderr", "cannot stat $home/work/private/thing.log")

        val kept = log.tail().single().text
        assertFalse(kept.contains(home))
        assertFalse(kept.contains("private"))
    }
}

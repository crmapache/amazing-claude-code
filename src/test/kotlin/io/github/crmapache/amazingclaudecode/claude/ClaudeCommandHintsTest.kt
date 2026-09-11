package io.github.crmapache.amazingclaudecode.claude

import java.io.File
import java.nio.file.Files
import java.util.concurrent.atomic.AtomicBoolean
import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertFalse
import kotlin.test.assertNotNull
import kotlin.test.assertNull
import kotlin.test.assertTrue

class ClaudeCommandHintsTest {

    /**
     * A CLI home of our own, so that the scan under test reads nothing but the temporary directories
     * this file makes. Before the home became a parameter every one of these tests also read the
     * personal commands and skills of whoever ran them.
     */
    private fun homeAt(directory: File): ClaudeHome = ClaudeHome(
        configDirectory = directory,
        managedSettingsDirectory = File(directory, "managed"),
        projectPaths = emptyList(),
        remote = false,
        toHost = { it },
    )

    private fun emptyHome(): ClaudeHome = homeAt(Files.createTempDirectory("acc-hints-home").toFile())

    private fun scanWith(name: String, frontmatter: String): CommandHint? {
        val base = Files.createTempDirectory("acc-hints").toFile()
        val file = File(base, ".claude/commands/$name.md")
        file.parentFile.mkdirs()
        file.writeText(frontmatter)

        return ClaudeCommandHints.scan(emptyHome(), base.absolutePath, installed = emptyList()).hints[name]
    }

    @Test
    fun `a one-line description is read as it is`() {
        val hint = scanWith(
            "one-line",
            """
            ---
            name: one-line
            description: Open a pull request
            argument-hint: "[number]"
            ---

            # body
            """.trimIndent(),
        )

        assertEquals("Open a pull request", hint?.description)
        assertEquals("[number]", hint?.argumentHint)
    }

    @Test
    fun `a folded block is joined into one line rather than turning into an arrow`() {
        // Exactly the case where the command hint ended up holding a single ">": everything after the
        // colon was taken, and there is nothing there but the block indicator.
        val hint = scanWith(
            "folded",
            """
            ---
            name: folded
            description: >
              Check the CI status for a pull request
              and explain the failures in plain words.
            argument-hint: "opt. [PR number]"
            ---

            # body
            """.trimIndent(),
        )

        assertEquals(
            "Check the CI status for a pull request and explain the failures in plain words.",
            hint?.description,
        )
        assertEquals("opt. [PR number]", hint?.argumentHint)
    }

    @Test
    fun `a literal block keeps its newlines`() {
        val hint = scanWith(
            "literal",
            """
            ---
            name: literal
            description: |
              First line.
              Second line.
            ---

            # body
            """.trimIndent(),
        )

        assertEquals("First line.\nSecond line.", hint?.description)
    }

    @Test
    fun `a field after a block is read rather than swallowed by it`() {
        val hint = scanWith(
            "after-block",
            """
            ---
            description: >
              A long one
              over two lines.
            argument-hint: "[what]"
            ---

            # body
            """.trimIndent(),
        )

        assertEquals("A long one over two lines.", hint?.description)
        assertEquals("[what]", hint?.argumentHint)
    }

    private fun projectWith(vararg files: Pair<String, String>): Map<String, CommandHint> {
        val base = Files.createTempDirectory("acc-hints-project").toFile()
        for ((path, text) in files) {
            val file = File(base, path)
            file.parentFile.mkdirs()
            file.writeText(text)
        }

        return ClaudeCommandHints.scan(emptyHome(), base.absolutePath, installed = emptyList()).hints
    }

    @Test
    fun `a command in a subdirectory is named through a colon`() {
        // The CLI's own naming, taken off a live agent's slash_commands rather than the docs:
        // .claude/commands/demo/deep/twice.md is /demo:deep:twice.
        val hints = projectWith(
            ".claude/commands/demo/nested.md" to "---\ndescription: nested one\n---\nbody\n",
            ".claude/commands/demo/deep/twice.md" to "---\ndescription: deep one\n---\nbody\n",
        )

        assertEquals("nested one", hints["demo:nested"]?.description)
        assertEquals("deep one", hints["demo:deep:twice"]?.description)
    }

    @Test
    fun `a command deeper than the walk goes is not a command`() {
        // The depth limit is what keeps a symlinked loop under .claude/ from turning a refresh into an
        // endless walk, and the walk is now split in two - so the limit is pinned rather than assumed.
        val hints = projectWith(
            ".claude/commands/one/two/three/deep.md" to "---\ndescription: still here\n---\nbody\n",
            ".claude/commands/one/two/three/four/deeper.md" to "---\ndescription: too far\n---\nbody\n",
        )

        assertEquals("still here", hints["one:two:three:deep"]?.description)
        assertTrue("one:two:three:four:deeper" !in hints)
    }

    /**
     * The two doors into a skill, as the CLI keeps them (see CommandHint): `disable-model-invocation`
     * shuts the Skill tool, `user-invocable: false` shuts the slash command. Both default to open, and a
     * skill's file is named so that whoever reads the rule can read the rest.
     */
    @Test
    fun `the invocation flags are read, and default to open`() {
        val hints = projectWith(
            ".claude/skills/person-only/SKILL.md" to "---\ndescription: only by hand\ndisable-model-invocation: true\n---\nbody\n",
            ".claude/skills/model-only/SKILL.md" to "---\ndescription: only by the model\nuser-invocable: false\n---\nbody\n",
            ".claude/skills/open/SKILL.md" to "---\ndescription: either\n---\nbody\n",
        )

        assertEquals(false, hints["person-only"]?.modelInvocable)
        assertEquals(true, hints["person-only"]?.userInvocable)
        assertEquals(true, hints["model-only"]?.modelInvocable)
        assertEquals(false, hints["model-only"]?.userInvocable)
        assertEquals(true, hints["open"]?.modelInvocable)
        assertEquals(true, hints["open"]?.userInvocable)
        assertTrue(hints["open"]?.file.orEmpty().endsWith("SKILL.md"))
    }

    @Test
    fun `a command without frontmatter keeps its name`() {
        // Frontmatter is optional for the CLI, and such a command used to fall out of the scan whole -
        // name and all, which is the greater half of what the hint is for.
        val hints = projectWith(".claude/commands/plain.md" to "just say hi\n")

        val plain = hints["plain"]
        assertNotNull(plain)
        assertEquals("", plain.description)
        assertEquals("", plain.argumentHint)
        assertTrue(plain.modelInvocable)
        assertTrue(plain.file.endsWith("plain.md"))
    }

    @Test
    fun `a file that is not markdown is not a command`() {
        val hints = projectWith(".claude/commands/README.txt" to "not a command\n")

        assertTrue("README" !in hints)
    }

    @Test
    fun `the project's own command outranks a plugin's of the same name`() {
        val base = Files.createTempDirectory("acc-hints-project").toFile()
        File(base, ".claude/commands/deploy.md").apply {
            parentFile.mkdirs()
            writeText("---\ndescription: ours\n---\nbody\n")
        }

        val pluginHome = Files.createTempDirectory("acc-hints-plugin").toFile()
        File(pluginHome, "commands/deploy.md").apply {
            parentFile.mkdirs()
            writeText("---\ndescription: theirs\n---\nbody\n")
        }

        val hints = ClaudeCommandHints.scan(
            emptyHome(),
            base.absolutePath,
            installed = listOf(
                InstalledPlugin(
                    id = "someone@market",
                    version = "1",
                    scope = "user",
                    enabled = true,
                    installPath = pluginHome.absolutePath,
                ),
            ),
        ).hints

        assertEquals("ours", hints["deploy"]?.description)
        // The plugin's own copy is still there under its namespaced name.
        assertEquals("theirs", hints["someone:deploy"]?.description)
    }

    @Test
    fun `the project's own command outranks a personal one of the same name`() {
        // The walk order IS the precedence rule, so nothing in it may be sorted - the fingerprint sorts
        // a copy. Reachable as a test only because the CLI's home is a parameter now.
        val base = Files.createTempDirectory("acc-hints-project").toFile()
        File(base, ".claude/commands/deploy.md").apply {
            parentFile.mkdirs()
            writeText("---\ndescription: the project's\n---\nbody\n")
        }

        val home = Files.createTempDirectory("acc-hints-home").toFile()
        File(home, "commands/deploy.md").apply {
            parentFile.mkdirs()
            writeText("---\ndescription: the person's\n---\nbody\n")
        }

        val hints = ClaudeCommandHints.scan(homeAt(home), base.absolutePath, installed = emptyList()).hints

        assertEquals("the project's", hints["deploy"]?.description)
    }

    @Test
    fun `the map keeps the order of the walk`() {
        // The order the map is built in is what the scenario writer's catalogue is handed in, so it is
        // the walk's - the project first, the person after it.
        val base = Files.createTempDirectory("acc-hints-project").toFile()
        File(base, ".claude/commands/zulu.md").apply {
            parentFile.mkdirs()
            writeText("---\ndescription: the project's\n---\nbody\n")
        }

        val home = Files.createTempDirectory("acc-hints-home").toFile()
        File(home, "commands/alpha.md").apply {
            parentFile.mkdirs()
            writeText("---\ndescription: the person's\n---\nbody\n")
        }

        val hints = ClaudeCommandHints.scan(homeAt(home), base.absolutePath, installed = emptyList()).hints

        assertEquals(listOf("zulu", "alpha"), hints.keys.toList())
    }

    @Test
    fun `two different homes give two different scans`() {
        // The home is a parameter rather than something resolved inside, and nothing caches it here: on
        // a WSL project the first answer arrives late, and a scan frozen on the earlier one would read
        // the wrong machine's personal commands for the rest of the session.
        val base = Files.createTempDirectory("acc-hints-project").toFile()

        val one = Files.createTempDirectory("acc-hints-home-one").toFile()
        File(one, "commands/here.md").apply {
            parentFile.mkdirs()
            writeText("---\ndescription: the first home\n---\nbody\n")
        }

        val two = Files.createTempDirectory("acc-hints-home-two").toFile()
        File(two, "commands/there.md").apply {
            parentFile.mkdirs()
            writeText("---\ndescription: the second home\n---\nbody\n")
        }

        val first = ClaudeCommandHints.scan(homeAt(one), base.absolutePath, installed = emptyList())
        val second = ClaudeCommandHints.scan(homeAt(two), base.absolutePath, installed = emptyList())

        assertEquals("the first home", first.hints["here"]?.description)
        assertEquals("the second home", second.hints["there"]?.description)
        assertTrue(first.stamp != second.stamp)
    }

    // --- The fingerprint ------------------------------------------------------------

    private fun project(): File = Files.createTempDirectory("acc-hints-stamp").toFile()

    private fun write(base: File, path: String, text: String): File =
        File(base, path).apply {
            parentFile.mkdirs()
            writeText(text)
        }

    @Test
    fun `an unchanged disk is not read again`() {
        val base = project()
        val home = emptyHome()
        write(base, ".claude/skills/probe/SKILL.md", "---\ndescription: one\n---\nbody\n")

        val first = ClaudeCommandHints.scan(home, base.absolutePath, installed = emptyList())
        val again = ClaudeCommandHints.scanIfChanged(home, base.absolutePath, installed = emptyList(), since = first.stamp)

        assertNull(again.scan)
        // And it says what looking cost even so. That is the half the round paces itself by, and a
        // quiet disk is nearly every round: answered only when something changed, the brake was fed
        // by the rare heavy round and never by the light one it governs.
        assertTrue(again.walkNanos > 0)
    }

    @Test
    fun `a skill added after the first walk moves the fingerprint`() {
        val base = project()
        val home = emptyHome()
        write(base, ".claude/skills/probe/SKILL.md", "---\ndescription: one\n---\nbody\n")
        val first = ClaudeCommandHints.scan(home, base.absolutePath, installed = emptyList())

        write(base, ".claude/skills/fresh/SKILL.md", "---\ndescription: brand new\n---\nbody\n")
        val second = ClaudeCommandHints.scanIfChanged(home, base.absolutePath, installed = emptyList(), since = first.stamp)

        val scan = assertNotNull(second.scan)
        assertEquals("brand new", scan.hints["fresh"]?.description)
        assertTrue(scan.whole)
    }

    @Test
    fun `a command deleted after the first walk moves the fingerprint`() {
        val base = project()
        val home = emptyHome()
        write(base, ".claude/commands/keep.md", "---\ndescription: staying\n---\nbody\n")
        val going = write(base, ".claude/commands/going.md", "---\ndescription: leaving\n---\nbody\n")
        val first = ClaudeCommandHints.scan(home, base.absolutePath, installed = emptyList())

        assertTrue(going.delete())
        val second = ClaudeCommandHints.scanIfChanged(home, base.absolutePath, installed = emptyList(), since = first.stamp)

        val scan = assertNotNull(second.scan)
        assertTrue("going" !in scan.hints)
        assertTrue("keep" in scan.hints)
    }

    @Test
    fun `an edited description moves the fingerprint`() {
        val base = project()
        val home = emptyHome()
        val skill = write(base, ".claude/skills/probe/SKILL.md", "---\ndescription: one\n---\nbody\n")
        val first = ClaudeCommandHints.scan(home, base.absolutePath, installed = emptyList())

        skill.writeText("---\ndescription: one, rather longer than before\n---\nbody\n")
        val second = ClaudeCommandHints.scanIfChanged(home, base.absolutePath, installed = emptyList(), since = first.stamp)

        val scan = assertNotNull(second.scan)
        assertEquals("one, rather longer than before", scan.hints["probe"]?.description)
    }

    @Test
    fun `an edit of the same length at the same moment is invisible to the fingerprint, and the full read still brings it`() {
        // The fingerprint is a throttle rather than the truth: a file system with whole-second
        // timestamps (exFAT, an SMB share, the 9P share a WSL project is read through) does not move it
        // when a word is replaced by one of the same length. That is what the unconditional minute round
        // is for, and this is the case that would otherwise never arrive at all.
        val base = project()
        val home = emptyHome()
        val skill = write(base, ".claude/skills/probe/SKILL.md", "---\ndescription: one\n---\nbody\n")
        val first = ClaudeCommandHints.scan(home, base.absolutePath, installed = emptyList())
        val was = skill.lastModified()

        skill.writeText("---\ndescription: two\n---\nbody\n")
        assertTrue(skill.setLastModified(was))

        assertNull(ClaudeCommandHints.scanIfChanged(home, base.absolutePath, installed = emptyList(), since = first.stamp).scan)
        assertEquals("two", ClaudeCommandHints.scan(home, base.absolutePath, installed = emptyList()).hints["probe"]?.description)
    }

    @Test
    fun `a file where a directory is expected is not a failed walk`() {
        // `listFiles` answers null there too, and it is not a failure: there is nothing to read and
        // nothing for the hint to lose.
        val base = project()
        write(base, ".claude/commands", "not a directory\n")
        write(base, ".claude/skills", "not a directory either\n")

        val scan = ClaudeCommandHints.scan(emptyHome(), base.absolutePath, installed = emptyList())

        assertTrue(scan.whole)
        assertTrue(scan.hints.isEmpty())
    }

    @Test
    fun `a shelf whose anchor is gone too is a disk that stopped answering, not an empty project`() {
        // The whole difference the anchor buys. A project directory that is not there at all is what a
        // dead share, a sleeping WSL distribution or an unmounted volume look like from here - and read
        // as "this project simply has no commands" that is an empty map broadcast as the truth, every
        // two seconds, for as long as the share is out.
        val base = project()
        write(base, ".claude/commands/keep.md", "---\ndescription: readable\n---\nbody\n")
        val personal = Files.createTempDirectory("acc-hints-home").toFile()
        val vanished = File(base.parentFile, "acc-hints-never-existed-${System.nanoTime()}")

        val alive = ClaudeCommandHints.scan(homeAt(personal), base.absolutePath, installed = emptyList())
        val dead = ClaudeCommandHints.scan(homeAt(personal), vanished.absolutePath, installed = emptyList())

        assertTrue(alive.whole)
        assertFalse(dead.whole)
    }

    @Test
    fun `a shelf that was simply deleted is still a whole walk`() {
        // The other half of the same rule, and the criterion that a removed skill leaves the hint at
        // once depends on it: after the deletion the anchor goes on answering, so nothing is held back.
        val base = project()
        write(base, ".claude/commands/keep.md", "---\ndescription: readable\n---\nbody\n")
        val skills = write(base, ".claude/skills/probe/SKILL.md", "---\ndescription: here\n---\nbody\n")
        val home = emptyHome()

        assertEquals("here", ClaudeCommandHints.scan(home, base.absolutePath, installed = emptyList()).hints["probe"]?.description)

        File(base, ".claude/skills").deleteRecursively()
        val after = ClaudeCommandHints.scan(home, base.absolutePath, installed = emptyList())

        assertTrue(skills.exists().not())
        assertTrue(after.whole)
        assertNull(after.hints["probe"])
        assertEquals("readable", after.hints["keep"]?.description)
    }

    @Test
    fun `a directory that will not list itself is a failed walk, and the rest is still read`() {
        val base = project()
        val home = emptyHome()
        write(base, ".claude/commands/keep.md", "---\ndescription: readable\n---\nbody\n")
        File(base, ".claude/skills/probe").mkdirs()
        write(base, ".claude/skills/probe/SKILL.md", "---\ndescription: hidden away\n---\nbody\n")

        // Executable but not readable: the directory is plainly there and gives no listing - a share
        // that hiccupped, a folder owned by somebody else. Windows does not do POSIX modes.
        val skills = File(base, ".claude/skills")
        val locked = skills.setReadable(false, false)
        if (!locked || skills.listFiles() != null) return

        // Given back whatever happens. Written after the assertions, the mode was restored in every case
        // except the one this test exists for: a failing check left behind a directory on the machine
        // that neither a build clean nor a CI workspace wipe can remove. And given back to the directory
        // it was taken from - the nested one below never lost it.
        try {
            val scan = ClaudeCommandHints.scan(home, base.absolutePath, installed = emptyList())

            assertFalse(scan.whole)
            // Not an excuse to forget everything else: what could be read is read, and what to do about
            // an incomplete walk is decided by whoever broadcasts (see ProjectCatalog).
            assertEquals("readable", scan.hints["keep"]?.description)
        } finally {
            skills.setReadable(true, false)
        }
    }

    @Test
    fun `the fingerprint is taken in name order rather than in the order the disk listed`() {
        // `listFiles` promises no order at all. Folded in whatever order it happened to answer with, the
        // fingerprint would move on its own, and the fast round would read every file on every tick -
        // that is, buy nothing.
        val base = project()
        write(base, ".claude/commands/zulu.md", "---\ndescription: last\n---\nbody\n")
        write(base, ".claude/commands/alpha.md", "---\ndescription: first\n---\nbody\n")
        write(base, ".claude/commands/mike.md", "---\ndescription: middle\n---\nbody\n")

        val stamp = ClaudeCommandHints.scan(emptyHome(), base.absolutePath, installed = emptyList()).stamp
        val names = stamp.lines().map { it.substringBefore('\t') }

        assertEquals(listOf("alpha", "mike", "zulu"), names)
    }
    /**
     * Two open projects walk their own disks, and what the ceiling is worth saying about is said on the
     * edge - so the memory of that edge belongs to whoever repeats the walk. Held as one for the whole
     * IDE, a project over the ceiling and one under it flipped it back and forth between them: every
     * round became an edge again, and the buffer that travels in a bug report filled with that one line.
     *
     * The other half of the same rule is here too: a walk cut off by the ceiling is not a whole walk. The
     * shelves are walked in the CLI's order of precedence, so it never reached the personal and plugin
     * ones at all.
     */
    @Test
    fun `the ceiling is remembered by whoever walks, not by the walk`() {
        val crowded = Files.createTempDirectory("acc-hints-crowded").toFile()
        val commands = File(crowded, ".claude/commands")
        commands.mkdirs()
        // Exactly the walk's own ceiling of candidates - one more file changes nothing, one fewer is
        // an ordinary walk.
        repeat(4000) { File(commands, "c$it.md").writeText("x") }

        val small = Files.createTempDirectory("acc-hints-small").toFile()
        File(small, ".claude/commands").mkdirs()
        File(small, ".claude/commands/one.md").writeText("x")

        val crowdedSaid = AtomicBoolean(false)
        val smallSaid = AtomicBoolean(false)

        val over = ClaudeCommandHints.scan(emptyHome(), crowded.absolutePath, emptyList(), crowdedSaid)
        val under = ClaudeCommandHints.scan(emptyHome(), small.absolutePath, emptyList(), smallSaid)

        assertFalse(over.whole)
        assertTrue(under.whole)
        assertTrue(crowdedSaid.get())
        assertFalse(smallSaid.get())
    }

}

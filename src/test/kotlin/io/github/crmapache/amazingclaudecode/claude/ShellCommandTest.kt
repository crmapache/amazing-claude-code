package io.github.crmapache.amazingclaudecode.claude

import java.nio.file.Files
import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertTrue

/**
 * A bash-mode command is genuinely run here - there is no other way to check the main thing: that it
 * goes into the user's shell, sees the project's working directory and honestly returns the exit code.
 *
 * We check "contains" rather than "equals exactly": the command goes into a person's shell along with
 * their profile, and many people's profiles print something of their own - a version manager's
 * greeting, a status line, a corporate banner. A test has to catch the panel breaking, not the settings
 * of whoever runs it.
 *
 * The syntax here is POSIX, while on Windows the panel calls cmd.exe (see ShellCommand.shell) - there
 * these strings mean nothing, so on it the tests are skipped entirely.
 */
class ShellCommandTest {

    private val posix: Boolean get() = !HostOs.isWindows

    @Test
    fun `a successful command returns its output and a zero code`() {
        if (!posix) return

        val result = ShellCommand.run("echo acc-marker-hi", workingDirectory = null)

        assertEquals(0, result.exitCode)
        assertTrue(result.stdout.contains("acc-marker-hi"), "no command output: ${result.stdout}")
    }

    @Test
    fun `a failed command returns its code and what it wrote to stderr`() {
        if (!posix) return

        val result = ShellCommand.run("echo acc-marker-boom >&2; exit 3", workingDirectory = null)

        assertEquals(3, result.exitCode)
        assertTrue(result.stderr.contains("acc-marker-boom"), "no command stderr: ${result.stderr}")
    }

    @Test
    fun `a command runs in the project's working directory, not where the IDE was started`() {
        if (!posix) return

        val directory = Files.createTempDirectory("acc-shell").toRealPath()

        val result = ShellCommand.run("pwd", workingDirectory = directory.toString())

        assertEquals(0, result.exitCode)
        assertTrue(result.stdout.contains(directory.toString()), "the command ran elsewhere: ${result.stdout}")
    }

    @Test
    fun `a command waiting for input finishes at once rather than standing until the deadline`() {
        if (!posix) return

        // There is nowhere in the panel to type an answer to "Are you sure?", so the input is closed:
        // such a command has to get end-of-file and finish, or the card in the feed would promise two
        // minutes of work that is not happening.
        val result = ShellCommand.run("cat", workingDirectory = null)

        assertEquals(0, result.exitCode)
    }

    @Test
    fun `bash gets an explicit bashrc line of its own - a login shell does not read it`() {
        // On the line below rather than through ";": an alias declared and immediately used through ";"
        // on the same line bash silently fails to expand.
        val command = ShellCommand.withBashrc("/bin/bash", "echo hi")

        assertEquals("[ -f ~/.bashrc ] && source ~/.bashrc\necho hi", command)
    }

    @Test
    fun `for a non-bash shell withBashrc leaves the command alone - there -ilc already reads everything`() {
        assertEquals("echo hi", ShellCommand.withBashrc("/bin/zsh", "echo hi"))
        assertEquals("echo hi", ShellCommand.withBashrc("/bin/sh", "echo hi"))
    }

    @Test
    fun `long output is truncated - whole it fits neither the card nor the context`() {
        if (!posix) return

        // Knowingly past the limit: the panel shows this output and sends it to the agent, and a
        // megabyte-long sheet suits neither.
        val result = ShellCommand.run("for i in $(seq 1 20000); do echo 0123456789; done", workingDirectory = null)

        assertEquals(0, result.exitCode)
        assertTrue(result.stdout.endsWith("… output truncated"), "output not truncated: ${result.stdout.length} chars")
    }
}

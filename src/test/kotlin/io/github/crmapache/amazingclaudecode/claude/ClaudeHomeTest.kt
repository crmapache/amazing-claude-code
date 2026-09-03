package io.github.crmapache.amazingclaudecode.claude

import java.io.File
import java.nio.file.Files
import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertFalse
import kotlin.test.assertTrue

/**
 * The arithmetic of where Claude Code lives for a project inside WSL, as seen from Windows - apart from
 * `wsl.exe` and the disk, which a test on this machine has neither of. What breaks here breaks in
 * silence: the panel shows an empty history and says nothing (see ClaudeHome).
 */
class ClaudeHomeTest {

    private val root = "\\\\wsl.localhost\\Ubuntu"

    private fun home(configDirectory: String? = null, realLinuxPath: String? = null): ClaudeHome =
        ClaudeHome.inWsl(
            root = root,
            linuxPath = "/home/ivan/repo",
            realLinuxPath = realLinuxPath,
            home = "/home/ivan",
            configDirectory = configDirectory,
        )

    // The CLI inside the distribution keeps its files in that user's home, and Windows reaches them
    // through the share the project was opened from.
    @Test
    fun `the config directory is the distribution user's home on the share`() {
        assertEquals("\\\\wsl.localhost\\Ubuntu\\home\\ivan\\.claude", home().configDirectory.path)
        assertTrue(home().remote)
    }

    @Test
    fun `the policy directory is the distribution's etc`() {
        assertEquals("\\\\wsl.localhost\\Ubuntu\\etc\\claude-code", home().managedSettingsDirectory.path)
    }

    // A moved config directory is the CLI's own rule, and it is the distribution user's variable that
    // moves it - not one in the IDE's environment on Windows.
    @Test
    fun `CLAUDE_CONFIG_DIR inside the distribution moves the config directory`() {
        assertEquals("\\\\wsl.localhost\\Ubuntu\\srv\\claude", home(configDirectory = "/srv/claude").configDirectory.path)
        assertEquals("\\\\wsl.localhost\\Ubuntu\\home\\ivan\\cfg", home(configDirectory = "~/cfg").configDirectory.path)
        assertEquals("\\\\wsl.localhost\\Ubuntu\\home\\ivan\\cfg", home(configDirectory = "cfg").configDirectory.path)
        assertEquals("\\\\wsl.localhost\\Ubuntu\\home\\ivan\\.claude", home(configDirectory = "  ").configDirectory.path)
    }

    // The CLI names the project by the path it sees - the Linux one - and that is the slug the
    // conversations are filed under. The UNC spelling gave a folder that could not exist.
    @Test
    fun `the project is named by its Linux path`() {
        assertEquals(listOf("/home/ivan/repo"), home().projectPaths)
        assertEquals("-home-ivan-repo", ClaudeHistory.slugFor(home().projectPaths.single()))
    }

    @Test
    fun `the real path behind a link is a second name, and the same path is not`() {
        assertEquals(listOf("/home/ivan/repo", "/srv/repo"), home(realLinuxPath = "/srv/repo").projectPaths)
        assertEquals(listOf("/home/ivan/repo"), home(realLinuxPath = "/home/ivan/repo").projectPaths)
    }

    // A plugin's install path is printed by the CLI in its own terms; the hint reads it from Windows.
    @Test
    fun `a path the CLI printed is opened through the share`() {
        assertEquals(
            "\\\\wsl.localhost\\Ubuntu\\home\\ivan\\.claude\\plugins\\cache\\demo",
            home().hostPath("/home/ivan/.claude/plugins/cache/demo").path,
        )
    }

    @Test
    fun `the share's spelling is kept and slashes are turned`() {
        assertEquals("\\\\wsl$\\Ubuntu\\home\\ivan", ClaudeHome.windowsPathOf("\\\\wsl$\\Ubuntu", "/home/ivan"))
        assertEquals("\\\\wsl.localhost\\Ubuntu\\home\\ivan", ClaudeHome.windowsPathOf("\\\\wsl.localhost\\Ubuntu\\", "home/ivan"))
        assertEquals("\\\\wsl.localhost\\Ubuntu\\", ClaudeHome.windowsPathOf("\\\\wsl.localhost\\Ubuntu", "/"))
    }

    // A project on this machine is answered exactly as every reader answered it for itself before: the
    // machine's own directories, the path beside its canonical form. Nothing about WSL is touched.
    @Test
    fun `a project on this machine is the local answer`() {
        val directory = Files.createTempDirectory("acc-home").toFile()
        val home = ClaudeHome.local(directory.path)

        assertFalse(home.remote)
        assertEquals(HostOs.configDirectory(), home.configDirectory)
        assertEquals(HostOs.managedSettingsDirectory(), home.managedSettingsDirectory)
        assertEquals(directory.path, home.projectPaths.first())
        assertEquals(directory.canonicalPath, home.projectPaths.last())
        assertEquals(File("/x/y"), home.hostPath("/x/y"))
    }

    @Test
    fun `no project directory means nowhere to look, not this machine's home`() {
        assertEquals(emptyList(), ClaudeHome.local(null).projectPaths)
        assertEquals(emptyList(), ClaudeHome.of(null).projectPaths)
    }

    // The share is a Windows thing: on any other machine a path that merely starts with two slashes is a
    // local path, and asking the WSL classes about it would be asking the wrong machine.
    @Test
    fun `off Windows a share-looking path takes the local road`() {
        if (HostOs.isWindows) return

        val home = ClaudeHome.of("//wsl.localhost/Ubuntu/home/ivan/repo")

        assertFalse(home.remote)
        assertEquals(HostOs.configDirectory(), home.configDirectory)
    }

    // The history looks into the CLI's projects folder under the project's slug - and only into folders
    // that exist, because a missing one is the ordinary state of a machine with no conversations yet.
    @Test
    fun `the history looks under the project's slug inside the config directory`() {
        val config = Files.createTempDirectory("acc-home-config").toFile()
        val home = ClaudeHome(
            configDirectory = config,
            managedSettingsDirectory = File(config, "etc"),
            projectPaths = listOf("/home/ivan/repo", "/srv/repo"),
            remote = true,
            toHost = { it },
        )

        assertEquals(emptyList(), ClaudeHistory.directoriesFor(home))

        val filed = File(config, "projects/-home-ivan-repo").also { it.mkdirs() }

        assertEquals(listOf(filed), ClaudeHistory.directoriesFor(home))
    }
}

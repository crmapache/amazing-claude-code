package io.github.crmapache.amazingclaudecode.claude

import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertFalse
import kotlin.test.assertTrue

/**
 * The executable lookup breaks where hands cannot reach: someone else's Windows, an unusual install
 * location, the PATH of the IDE's shell. We check the path walking against a substituted environment -
 * otherwise Windows would be guesswork and a person would be sent to check blind.
 */
class ClaudeLookupTest {

    private fun unix(
        env: Map<String, String> = emptyMap(),
        configured: String = "",
        home: String = "/Users/max",
    ) = ClaudeLookup.candidates(windows = false, home = home, env = env, configured = configured, separator = ':')

    private fun windows(
        env: Map<String, String> = emptyMap(),
        configured: String = "",
        home: String = "C:\\Users\\max",
    ) = ClaudeLookup.candidates(windows = true, home = home, env = env, configured = configured, separator = ';')

    @Test
    fun `on Windows every name the CLI is installed under is checked`() {
        // The native installer puts down an exe, npm a cmd wrapper, MSYS builds a file with no extension
        // at all.
        assertEquals(listOf("claude.exe", "claude.cmd", "claude.bat", "claude"), ClaudeLookup.executableNames(true))
        assertEquals(listOf("claude"), ClaudeLookup.executableNames(false))
    }

    @Test
    fun `every PATH folder is checked with every name`() {
        val paths = windows(env = mapOf("Path" to "C:\\tools\\bin;C:\\other"))

        assertTrue("C:\\tools\\bin\\claude.exe" in paths)
        assertTrue("C:\\tools\\bin\\claude.cmd" in paths)
        assertTrue("C:\\other\\claude.exe" in paths)
    }

    // On Windows the variable is called `Path`, and the environment map is not always case-insensitive:
    // asking for "PATH" alone would have found nothing.
    @Test
    fun `PATH is found under any spelling`() {
        assertEquals("A", ClaudeLookup.pathValue(mapOf("PATH" to "A")))
        assertEquals("B", ClaudeLookup.pathValue(mapOf("Path" to "B")))
        assertEquals("C", ClaudeLookup.pathValue(mapOf("path" to "C")))
    }

    @Test
    fun `the npm wrapper from APPDATA gets into the list`() {
        val paths = windows(env = mapOf("APPDATA" to "C:\\Users\\max\\AppData\\Roaming"))
        assertTrue("C:\\Users\\max\\AppData\\Roaming\\npm\\claude.cmd" in paths)
    }

    @Test
    fun `a native install in the home folder is checked on both systems`() {
        assertTrue("/Users/max/.local/bin/claude" in unix())
        assertTrue("C:\\Users\\max\\.local\\bin\\claude.exe" in windows())
    }

    // A person is just as likely to point at the file itself as at the folder holding it.
    @Test
    fun `a path given by hand comes first - as a file and as a folder`() {
        val paths = unix(configured = "/opt/claude")

        assertEquals("/opt/claude", paths.first())
        assertTrue("/opt/claude/claude" in paths)
    }

    @Test
    fun `a tilde in the given path expands to the home folder`() {
        assertTrue("/Users/max/bin/claude" in unix(configured = "~/bin/claude"))
    }

    @Test
    fun `an empty setting adds nothing`() {
        assertFalse(unix(configured = "   ").any { it.isBlank() })
    }

    @Test
    fun `one and the same path is not checked twice`() {
        // PATH often holds the same folder as our list of usual locations.
        val paths = unix(env = mapOf("PATH" to "/Users/max/.local/bin"))
        assertEquals(1, paths.count { it == "/Users/max/.local/bin/claude" })
    }
}

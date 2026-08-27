package io.github.crmapache.amazingclaudecode.webview

import java.io.File
import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertTrue

/**
 * The picture from the panel is written by the IDE, and the name for it comes over the same channel as
 * everything else the page says. What is checked here is that the name stays a name: the folder is ours
 * to choose, and no message may lead the file out of it.
 */
class ImageDownloadsTest {

    @Test
    fun `keeps a plain name as it is`() {
        assertEquals("amazing-claude-code-statistics-2026-08-26.png", ImageDownloads.safeName("amazing-claude-code-statistics-2026-08-26.png"))
    }

    @Test
    fun `a name cannot lead out of the folder`() {
        for (asked in listOf("../../etc/passwd.png", "/etc/passwd.png", """..\..\windows\system32\a.png""", "....//evil.png")) {
            val name = ImageDownloads.safeName(asked)
            assertTrue(!name.contains('/') && !name.contains('\\'), "a separator survived: $name")
            assertTrue(!name.startsWith("."), "a name that starts a hidden file: $name")
            assertEquals(name, File(name).name)
        }
    }

    @Test
    fun `always ends up a png, however it was asked for`() {
        assertEquals("chart.png", ImageDownloads.safeName("chart"))
        assertEquals("chart.png", ImageDownloads.safeName("chart.png"))
        assertEquals("amazing-claude-code.png", ImageDownloads.safeName("///"))
    }

    @Test
    fun `a second picture does not eat the first`() {
        val folder = createTempDir()
        try {
            val first = ImageDownloads.free(folder, "shot.png")
            first.writeBytes(byteArrayOf(1))
            assertEquals("shot.png", first.name)

            val second = ImageDownloads.free(folder, "shot.png")
            assertEquals("shot-2.png", second.name)
            second.writeBytes(byteArrayOf(2))

            assertEquals("shot-3.png", ImageDownloads.free(folder, "shot.png").name)
        } finally {
            folder.deleteRecursively()
        }
    }

    private fun createTempDir(): File = File.createTempFile("acc-downloads", "").let { file ->
        file.delete()
        file.mkdirs()
        file
    }
}

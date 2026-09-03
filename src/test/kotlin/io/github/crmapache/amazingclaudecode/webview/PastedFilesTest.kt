package io.github.crmapache.amazingclaudecode.webview

import java.io.File
import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertFalse
import kotlin.test.assertTrue

/**
 * Anything pasted into the panel is given a file of its own, and the folder it goes into is nobody's
 * working copy - it is the IDE's own, swept by age. What is checked here is what would go wrong quietly:
 * a name that leads out of that folder, a second paste eating the first, and the sweep taking away what
 * is still in use.
 */
class PastedFilesTest {

    @Test
    fun `the name says when and in what format`() {
        assertEquals("pasted-1756000000000.png", PastedFiles.nameFor("", "image/png", 1_756_000_000_000))
        assertEquals("pasted-17.jpg", PastedFiles.nameFor("", "image/jpeg", 17))
        assertEquals("pasted-17.webp", PastedFiles.nameFor("", "image/webp", 17))
    }

    // The clipboard says what it holds, and it is free to say it with a charset on the end or in capitals.
    @Test
    fun `the format is read past the case and the parameters`() {
        assertEquals("pasted-1.png", PastedFiles.nameFor("", "IMAGE/PNG", 1))
        assertEquals("pasted-1.gif", PastedFiles.nameFor("", "image/gif; something=else", 1))
    }

    // A screenshot is a png on every platform we run on, so an unknown type is likelier a type we have
    // not heard of than a file that is not a picture.
    @Test
    fun `an unknown format becomes a png`() {
        assertEquals("pasted-1.png", PastedFiles.nameFor("", "image/avif", 1))
        assertEquals("pasted-1.png", PastedFiles.nameFor("", "", 1))
    }

    // A document copied in a file manager arrives with a name, and half the point of pasting it is that
    // the name says what it is.
    @Test
    fun `a document keeps the name it came with`() {
        assertEquals("contract-final.pdf", PastedFiles.nameFor("contract-final.pdf", "application/pdf", 17))
    }

    // The page is ours, but a message that says where to write is a message that can be made to say
    // anything - the folder is not up for discussion.
    @Test
    fun `a name cannot lead out of the folder`() {
        assertEquals("passwd.png", PastedFiles.nameFor("../../etc/passwd", "image/png", 17))
        assertEquals("evil.sh", PastedFiles.nameFor("/tmp/evil.sh", "text/x-sh", 17))
    }

    @Test
    fun `a taken name gets a number rather than eating the file that has it`() {
        val folder = createTempDir()
        File(folder, "pasted-5.png").writeText("first")

        assertEquals("pasted-5-2.png", PastedFiles.free(folder, "pasted-5.png").name)
    }

    // Several files pasted at once are saved at once, and a name only looked at is a name two of them
    // can take together. So it is claimed on the spot: the second asking gets the next one.
    @Test
    fun `a free name is claimed the moment it is found, so two askings get two files`() {
        val folder = createTempDir()

        val first = PastedFiles.free(folder, "shot.png")
        val second = PastedFiles.free(folder, "shot.png")

        assertTrue(first.exists())
        assertEquals("shot.png", first.name)
        assertEquals("shot-2.png", second.name)
    }

    @Test
    fun `the sweep takes the old ones and leaves the rest`() {
        val folder = createTempDir()
        val now = 1_756_000_000_000

        val old = File(folder, "pasted-old.png").also { it.writeText("old"); it.setLastModified(now - 20L * 24 * 3600 * 1000) }
        val fresh = File(folder, "pasted-fresh.png").also { it.writeText("fresh"); it.setLastModified(now - 3L * 24 * 3600 * 1000) }

        PastedFiles.sweep(folder, now)

        assertFalse(old.exists())
        assertTrue(fresh.exists())
    }

    private fun createTempDir(): File =
        File(System.getProperty("java.io.tmpdir"), "acc-pasted-${System.nanoTime()}").also { it.mkdirs() }
}

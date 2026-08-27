package io.github.crmapache.amazingclaudecode.feedback

import java.nio.file.Files
import java.nio.file.Path
import kotlin.test.Test
import kotlin.test.assertContains
import kotlin.test.assertEquals
import kotlin.test.assertNotNull
import kotlin.test.assertNull
import kotlin.test.assertTrue

/**
 * The limits on what can be attached, and the reason the panel is told ids rather than paths.
 *
 * The limits are not tidiness: on the other end of this is a Telegram bot with a ceiling of its own and a
 * server that has to hold the whole thing in memory while it forwards it. The ids are not tidiness either -
 * a screen that sends things to somebody else's machine should not be holding a list of paths on this one.
 */
class FeedbackAttachmentsTest {

    private fun file(directory: Path, name: String, bytes: Int): Path {
        val path = directory.resolve(name)
        Files.write(path, ByteArray(bytes))
        return path
    }

    @Test
    fun `a file the panel never picked cannot be named`() {
        val directory = Files.createTempDirectory("acc-attach")
        val attachments = FeedbackAttachments()
        attachments.add(listOf(file(directory, "one.txt", 10)))

        // Whatever the panel says, it can only say it about the list - and removing something that is not
        // on it changes nothing rather than reaching for a path.
        attachments.remove("/etc/passwd")
        attachments.remove("a999")

        assertEquals(1, attachments.list().size)
        // What it does know is a name and a size, and nothing that says where the file is.
        val only = attachments.list().first()
        assertEquals("one.txt", only.name)
        assertEquals(10L, only.bytes)
        assertContains(only.id, "a")
    }

    @Test
    fun `a file over the single-file ceiling is left out, and the rest still go`() {
        val directory = Files.createTempDirectory("acc-attach")
        val attachments = FeedbackAttachments()

        val note = attachments.add(
            listOf(
                file(directory, "small.txt", 100),
                file(directory, "huge.bin", (FeedbackAttachments.MAX_FILE_BYTES + 1).toInt()),
                file(directory, "also-small.txt", 100),
            ),
        )

        assertEquals(listOf("small.txt", "also-small.txt"), attachments.list().map { it.name })
        assertNotNull(note)
        assertContains(note, "one file bigger than 10 MB")
    }

    @Test
    fun `the list stops at ten`() {
        val directory = Files.createTempDirectory("acc-attach")
        val attachments = FeedbackAttachments()

        val note = attachments.add((1..12).map { file(directory, "f$it.txt", 10) })

        assertEquals(FeedbackAttachments.MAX_FILES, attachments.list().size)
        assertTrue(attachments.full())
        assertNotNull(note)
        assertContains(note, "over the 10 file")
    }

    @Test
    fun `the same file is not attached twice`() {
        val directory = Files.createTempDirectory("acc-attach")
        val attachments = FeedbackAttachments()
        val path = file(directory, "one.txt", 10)

        attachments.add(listOf(path))
        val note = attachments.add(listOf(path))

        assertEquals(1, attachments.list().size)
        assertNotNull(note)
        assertContains(note, "already on the list")
    }

    @Test
    fun `a file that grew past the limit after being picked does not travel`() {
        val directory = Files.createTempDirectory("acc-attach")
        val attachments = FeedbackAttachments()
        val path = file(directory, "log.txt", 100)
        attachments.add(listOf(path))

        // A log file being appended to is the likeliest attachment there is - the size is read again on
        // the way out rather than trusted from when the dialog closed.
        Files.write(path, ByteArray((FeedbackAttachments.MAX_FILE_BYTES + 1).toInt()))

        assertEquals(1, attachments.list().size)
        assertTrue(attachments.readyToSend().files.isEmpty())
        // And it is named rather than dropped in silence - the whole point of attaching a growing log.
        assertContains(attachments.readyToSend().left.single(), "log.txt")
        assertContains(attachments.readyToSend().left.single(), "grew past")
    }

    @Test
    fun `a file that has gone away is dropped rather than failing the send`() {
        val directory = Files.createTempDirectory("acc-attach")
        val attachments = FeedbackAttachments()
        val gone = file(directory, "gone.txt", 10)
        val kept = file(directory, "kept.txt", 10)
        attachments.add(listOf(gone, kept))

        Files.delete(gone)

        val outgoing = attachments.readyToSend()

        assertEquals(listOf("kept.txt"), outgoing.files.map { it.name })
        assertContains(outgoing.left.single(), "no longer there")
    }

    @Test
    fun `a directory is not a thing that can be attached`() {
        val directory = Files.createTempDirectory("acc-attach")
        val attachments = FeedbackAttachments()

        val note = attachments.add(listOf(Files.createDirectory(directory.resolve("folder"))))

        assertTrue(attachments.list().isEmpty())
        assertNotNull(note)
        assertContains(note, "could not be read")
    }

    @Test
    fun `nothing to say when everything went in`() {
        val directory = Files.createTempDirectory("acc-attach")
        val attachments = FeedbackAttachments()

        assertNull(attachments.add(listOf(file(directory, "one.txt", 10))))
    }

    @Test
    fun `the total is capped as well as each file`() {
        val directory = Files.createTempDirectory("acc-attach")
        val attachments = FeedbackAttachments()
        val each = (FeedbackAttachments.MAX_FILE_BYTES / 2).toInt()

        // Five halves of the per-file ceiling is more than the total allows, so the last of them is left
        // out even though every single one of them is small enough.
        attachments.add((1..5).map { file(directory, "part$it.bin", each) })

        assertTrue(attachments.total() <= FeedbackAttachments.MAX_TOTAL_BYTES)
        assertEquals(4, attachments.list().size)
    }
}

package io.github.crmapache.amazingclaudecode.claude.accounts

import java.io.File
import java.nio.file.Files
import java.nio.file.LinkOption
import java.nio.file.attribute.BasicFileAttributeView
import java.nio.file.attribute.FileTime
import kotlin.test.AfterTest
import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertFalse
import kotlin.test.assertTrue

/**
 * The sweep that removes what the usage and identity questions left behind.
 *
 * It deletes on a person's disk without asking, so what it must NOT touch is held here as firmly as what
 * it must: the CLI's finished state beside the leftovers, anything young enough to belong to a question
 * still running, and whatever a link points at.
 */
class ProbeLeftoversTest {

    private val root = Files.createTempDirectory("probe-leftovers").toFile()
    private val usage = File(root, "usage")
    private val identity = File(root, "identity")

    private val now = System.currentTimeMillis()
    private val old = now - ProbeLeftovers.MIN_AGE_MS - 60_000L
    private val young = now - 60_000L

    @AfterTest
    fun cleanUp() {
        root.deleteRecursively()
    }

    /** A folder with a file inside, dated [at] once its contents are in place. */
    private fun folder(path: File, at: Long, bytes: Int = 100): File {
        path.mkdirs()
        File(path, "pack").writeBytes(ByteArray(bytes))
        File(path, "pack").setLastModified(at)
        path.setLastModified(at)
        return path
    }

    private fun file(path: File, at: Long): File {
        path.parentFile.mkdirs()
        path.writeText("{}")
        path.setLastModified(at)
        return path
    }

    // The reported machine: 1,029 of these in usage/default, about 450 MB each.
    @Test
    fun `an abandoned marketplace clone goes`() {
        val clone = folder(File(usage, "default/plugins/marketplaces/temp_git_1793258875123_ab12cd"), old)

        val swept = ProbeLeftovers.sweep(usage, identity, now)

        assertFalse(clone.exists())
        assertEquals(1, swept.entries)
        assertEquals(100L, swept.bytes)
    }

    @Test
    fun `an abandoned plugin download and a half-written config go too`() {
        val download = folder(File(usage, "s-1/plugins/cache/temp_github_1793258875123_x1"), old)
        val halfWritten = file(File(usage, "s-1/.claude.json.tmp.72160.e4a40ddacfd7"), old)

        ProbeLeftovers.sweep(usage, identity, now)

        assertFalse(download.exists())
        assertFalse(halfWritten.exists())
    }

    // The CLI's finished state is not a leftover: an installed marketplace, the record of it, the config
    // itself and its backups stay exactly as they are, however old.
    @Test
    fun `what the CLI finished stays`() {
        val installed = folder(File(usage, "default/plugins/marketplaces/claude-plugins-official"), old)
        val known = file(File(usage, "default/plugins/known_marketplaces.json"), old)
        val config = file(File(usage, "default/.claude.json"), old)
        val backup = file(File(usage, "default/backups/.claude.json.backup.1"), old)

        val swept = ProbeLeftovers.sweep(usage, identity, now)

        assertEquals(0, swept.entries)
        listOf(installed, known, config, backup).forEach { assertTrue(it.exists(), "$it was removed") }
    }

    // A question lives a quarter of a minute at most; anything younger than the threshold may be one
    // still at work.
    @Test
    fun `what is young enough to be in use stays`() {
        val clone = folder(File(usage, "default/plugins/marketplaces/temp_git_1793258875123_ab12cd"), young)
        val halfWritten = file(File(usage, "default/.claude.json.tmp.1.a"), young)
        val scratch = folder(File(identity, "s-young"), young)

        assertEquals(0, ProbeLeftovers.sweep(usage, identity, now).entries)
        listOf(clone, halfWritten, scratch).forEach { assertTrue(it.exists(), "$it was removed") }
    }

    // Each identity folder lives for one question and is deleted after it, so an old one went astray.
    @Test
    fun `an identity question's folder that outlived it goes whole`() {
        val scratch = folder(File(identity, "s-1a2b"), old)
        file(File(scratch, ".claude.json"), old)
        scratch.setLastModified(old)

        ProbeLeftovers.sweep(usage, identity, now)

        assertFalse(scratch.exists())
    }

    // A link is removed as a link. Followed, it would empty whatever folder it points at.
    @Test
    fun `a link is removed, never followed`() {
        val outside = folder(File(root, "outside"), old)
        val link = File(usage, "default/plugins/marketplaces/temp_git_1793258875123_ln")
        link.parentFile.mkdirs()
        Files.createSymbolicLink(link.toPath(), outside.toPath())
        // The link's own date, not its target's: setLastModifiedTime would follow it.
        Files.getFileAttributeView(link.toPath(), BasicFileAttributeView::class.java, LinkOption.NOFOLLOW_LINKS)
            .setTimes(FileTime.fromMillis(old), null, null)

        ProbeLeftovers.sweep(usage, identity, now)

        assertFalse(Files.exists(link.toPath(), LinkOption.NOFOLLOW_LINKS))
        assertTrue(File(outside, "pack").exists(), "the folder behind the link was emptied")
    }

    // A config directory that is a link leads out of our folders, so the sweep does not go in at all.
    @Test
    fun `a linked config directory is not searched`() {
        val elsewhere = File(root, "elsewhere")
        val clone = folder(File(elsewhere, "plugins/marketplaces/temp_git_1793258875123_zz"), old)
        usage.mkdirs()
        Files.createSymbolicLink(File(usage, "linked").toPath(), elsewhere.toPath())

        ProbeLeftovers.sweep(usage, identity, now)

        assertTrue(clone.exists(), "a leftover outside our folders was removed")
    }

    @Test
    fun `nothing there is nothing to do`() {
        assertEquals(0, ProbeLeftovers.sweep(usage, identity, now).entries)
    }
}

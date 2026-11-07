package io.github.crmapache.amazingclaudecode.claude.accounts

import java.io.File
import java.io.IOException
import java.nio.file.FileVisitResult
import java.nio.file.Files
import java.nio.file.LinkOption
import java.nio.file.Path
import java.nio.file.SimpleFileVisitor
import java.nio.file.attribute.BasicFileAttributes

/**
 * What the questions asked in a config directory of their own leave on disk, and the sweep that takes it
 * away.
 *
 * Those questions - the usage one per account, the identity one in a folder of its own (see
 * AccountStore.usageProbeEnvironment) - are processes that live a second or two. Until 0.13.53 the panel
 * ended each of them by killing its whole process tree outright, once a minute per account, and whatever
 * the CLI was in the middle of stayed on disk half done:
 *
 *  - **marketplace clones**, `plugins/marketplaces/temp_*`: the CLI clones a declared marketplace under a
 *    temporary name and renames it once done, and git killed outright removes nothing. Reported
 *    2026-10-30 from a machine whose disk had filled up: 1,029 of them in `usage/default`, about 450 MB
 *    each, 321 GB in all. The plugin cache stages the same way, `plugins/cache/temp_*`;
 *  - **config writes**, `.claude.json.tmp.*`: the CLI writes beside the file and renames over it. Hundreds
 *    per account on a machine that has run the panel for a couple of months.
 *
 * The causes are gone - the seed in AccountStore, the process left to finish in ClaudeControlPing - but
 * what they left is still there on every machine that ran an older plugin, and nothing else will ever
 * remove it: the CLI's own sweeps do not reach these names. Nor is it ruled out for good: the seed covers
 * only the marketplaces the person already has, and a process that will not leave is still killed in the
 * end. So the sweep stays.
 *
 * Only names the CLI gives to unfinished work, only in directories that are entirely ours, and only once
 * older than [MIN_AGE_MS]: no question lives longer than a quarter of a minute, so anything that old
 * belongs to nobody. The identity question's folders go whole, whatever is inside: each lives for one
 * question and is removed right after it (see ClaudeAccounts.identityOf), so one that is still there is
 * one that got away. A link is removed as a link and never followed.
 */
internal object ProbeLeftovers {

    /** How old a leftover must be before it is anybody's to remove. See the class comment. */
    const val MIN_AGE_MS = 10 * 60_000L

    /** The prefix the CLI stages marketplaces and plugins under, before renaming them into place. */
    private const val STAGING_PREFIX = "temp_"

    /** The prefix of the CLI's half-written config file, renamed over `.claude.json` once complete. */
    private const val HALF_WRITTEN_PREFIX = ".claude.json.tmp."

    /** Where inside a config directory the CLI stages its downloads. */
    private val STAGING_FOLDERS = listOf("plugins/marketplaces", "plugins/cache")

    class Swept(val entries: Int, val bytes: Long)

    /** Remove [leftovers] and say how much went. A leftover that will not go is left for the next sweep. */
    fun sweep(usageRoot: File, identityRoot: File, now: Long = System.currentTimeMillis()): Swept {
        var entries = 0
        var bytes = 0L

        for (leftover in leftovers(usageRoot, identityRoot, now)) {
            val freed = remove(leftover) ?: continue
            entries++
            bytes += freed
        }

        return Swept(entries, bytes)
    }

    /** What is old enough to go: see the class comment for which names and where. */
    fun leftovers(usageRoot: File, identityRoot: File, now: Long): List<Path> {
        val fromUsage = children(usageRoot.toPath()).filter(::isRealDirectory).flatMap { config ->
            val staging = STAGING_FOLDERS.flatMap { children(config.resolve(it)) }
                .filter { it.fileName.toString().startsWith(STAGING_PREFIX) }
            val halfWritten = children(config).filter { it.fileName.toString().startsWith(HALF_WRITTEN_PREFIX) }

            staging + halfWritten
        }

        return (fromUsage + children(identityRoot.toPath())).filter { isOlder(it, now) }
    }

    private fun children(directory: Path): List<Path> =
        if (!isRealDirectory(directory)) {
            emptyList()
        } else {
            runCatching { Files.list(directory).use { it.toList() } }.getOrDefault(emptyList())
        }

    private fun isRealDirectory(path: Path): Boolean = Files.isDirectory(path, LinkOption.NOFOLLOW_LINKS)

    private fun isOlder(path: Path, now: Long): Boolean =
        runCatching { now - Files.getLastModifiedTime(path, LinkOption.NOFOLLOW_LINKS).toMillis() >= MIN_AGE_MS }
            .getOrDefault(false)

    /**
     * Delete [path] and everything under it without following a link, and return the bytes it held - or
     * null when it could not be removed whole. Two IDEs sweeping at once is expected: what the other one
     * removed first is not an error.
     */
    private fun remove(path: Path): Long? = runCatching {
        var bytes = 0L

        Files.walkFileTree(
            path,
            object : SimpleFileVisitor<Path>() {
                override fun visitFile(file: Path, attrs: BasicFileAttributes): FileVisitResult {
                    bytes += attrs.size()
                    Files.deleteIfExists(file)
                    return FileVisitResult.CONTINUE
                }

                override fun visitFileFailed(file: Path, exc: IOException): FileVisitResult = FileVisitResult.CONTINUE

                override fun postVisitDirectory(dir: Path, exc: IOException?): FileVisitResult {
                    Files.deleteIfExists(dir)
                    return FileVisitResult.CONTINUE
                }
            },
        )

        bytes
    }.getOrNull()?.takeIf { !Files.exists(path, LinkOption.NOFOLLOW_LINKS) }
}

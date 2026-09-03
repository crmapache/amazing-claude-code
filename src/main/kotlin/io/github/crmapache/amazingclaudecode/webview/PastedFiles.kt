package io.github.crmapache.amazingclaudecode.webview

import com.intellij.openapi.application.ApplicationManager
import com.intellij.openapi.application.PathManager
import com.intellij.openapi.diagnostic.thisLogger
import java.io.File
import java.util.Base64

/**
 * Anything pasted into the panel that has bytes but no file: a screenshot off the clipboard, a document
 * copied in a file manager.
 *
 * Such bytes have nowhere to live. The panel holds them inside the message and the agent is handed them
 * as an attachment, so on screen the attachment is a chip saying "Image #3" - and that is all anyone can
 * take away from it. Copy such a message and the clipboard gets that caption: a name for something that
 * exists in no place a person could open, mail or point anybody at. With a file behind it the attachment
 * behaves like every other one - copied as a path, opened in the editor, named to somebody else.
 *
 * Written here rather than in the project: a screenshot pasted into a chat is not part of anybody's
 * source tree, and a plugin that drops files into a working copy is a plugin one notices in `git status`.
 * The IDE's own system folder is where a tool's own leftovers belong, and what is left there is swept up
 * by age (see [sweep]).
 */
internal object PastedFiles {

    /** How long a pasted file stays on disk. A path copied out of the panel should still work tomorrow. */
    private const val KEEP_DAYS = 14L
    private const val MAX_ATTEMPTS = 99

    private const val MAX_NAME = 80

    /** The picture formats a clipboard hands over, and what each is called on disk. */
    private val EXTENSIONS = mapOf(
        "image/png" to "png",
        "image/jpeg" to "jpg",
        "image/gif" to "gif",
        "image/webp" to "webp",
        "image/bmp" to "bmp",
        "image/tiff" to "tif",
        "image/svg+xml" to "svg",
    )

    /**
     * Decode the bytes and write them out, then hand the path back to whoever asked.
     *
     * Off the interface thread: the panel is drawing a chip for this picture right now, and a screenshot
     * of a 6K display is megabytes to decode before a single byte is written.
     */
    fun save(id: String, name: String, mediaType: String, data: String, answer: (String, String) -> Unit) {
        if (id.isEmpty() || data.isEmpty()) return

        ApplicationManager.getApplication().executeOnPooledThread {
            runCatching {
                val folder = folder()
                sweep(folder, System.currentTimeMillis())

                val file = free(folder, nameFor(name, mediaType, stamp = System.currentTimeMillis()))
                // A write that fails leaves the name it claimed behind, and an empty file under a pasted
                // name would be handed to the agent as the document itself.
                runCatching { file.writeBytes(Base64.getDecoder().decode(data)) }
                    .onFailure { file.delete() }
                    .getOrThrow()
                answer(id, file.path)
            }.onFailure { thisLogger().warn("Could not save a pasted file", it) }
        }
    }

    private fun folder(): File =
        File(PathManager.getSystemPath(), "amazing-claude-code/pasted").also { it.mkdirs() }

    /**
     * What the file is called here.
     *
     * A document copied in a file manager arrives with a name of its own, and it is worth keeping: half
     * the point of pasting a document is that it is called "contract-final.pdf". A screenshot has no name
     * at all - the clipboard holds pixels - so it gets one made of the moment it was pasted, which is
     * also the order such files sort in.
     *
     * The name that arrives is treated as a name and nothing else: a separator does not survive the
     * filter, and neither does "..". The folder is ours to choose, and a message that says where to write
     * is a message that can be made to say anything.
     */
    internal fun nameFor(name: String, mediaType: String, stamp: Long): String {
        val plain = name.substringAfterLast('/').substringAfterLast('\\')
            .filter { it.isLetterOrDigit() || it == '.' || it == '-' || it == '_' || it == ' ' }
            .trim()
            .trimStart('.')
            .take(MAX_NAME)

        if (plain.isNotBlank() && plain.substringAfterLast('.', "").isNotBlank()) return plain

        val extension = EXTENSIONS[mediaType.lowercase().substringBefore(';').trim()] ?: "png"
        return if (plain.isBlank()) "pasted-$stamp.$extension" else "$plain.$extension"
    }

    /**
     * The same name with a number added while one is taken - two pastes of one name are two files.
     *
     * The name is claimed the moment it is found free, not merely looked at: the file is created here,
     * empty, and the caller fills it. Several files pasted at once are saved at once, each on a thread of
     * its own, and a check that only looked let two of them find the same name free and take the same
     * path - the second write ate the first, and the agent was handed one document twice while the other
     * was gone without a word. Creating the file is one step on the file system, so two threads cannot
     * both succeed at it.
     */
    internal fun free(folder: File, name: String): File {
        val file = File(folder, name)
        if (file.createNewFile()) return file

        val base = name.substringBeforeLast('.')
        val extension = name.substringAfterLast('.')
        for (attempt in 2..MAX_ATTEMPTS) {
            val next = File(folder, "$base-$attempt.$extension")
            if (next.createNewFile()) return next
        }

        return file
    }

    /**
     * Older files go. Nobody deletes these by hand - the folder is one nobody knows about - and a pasted
     * screenshot is worth keeping exactly as long as the message it went into is still being talked
     * about.
     *
     * Swept on the way in rather than on a timer: the only moment this folder is known to matter is the
     * moment something is being added to it, and a plugin that walks a folder on every start pays for it
     * on every start.
     */
    internal fun sweep(folder: File, now: Long) {
        val deadline = now - KEEP_DAYS * 24 * 60 * 60 * 1000
        folder.listFiles()?.forEach { file ->
            if (file.isFile && file.lastModified() < deadline) file.delete()
        }
    }
}

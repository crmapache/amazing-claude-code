package io.github.crmapache.amazingclaudecode.webview

import com.intellij.ide.actions.RevealFileAction
import com.intellij.notification.NotificationAction
import com.intellij.notification.NotificationGroupManager
import com.intellij.notification.NotificationType
import com.intellij.openapi.application.ApplicationManager
import com.intellij.openapi.diagnostic.thisLogger
import com.intellij.openapi.project.Project
import java.io.File
import java.util.Base64

/**
 * A picture the panel drew of itself, written where downloads belong.
 *
 * The embedded browser has no downloads of its own: a link with `download` on it does nothing at all
 * inside JCEF, and there is no download manager behind it to ask. So the page draws the picture, hands
 * over the bytes (see the saveImage message), and the file is written here.
 *
 * The name that arrives is treated as a name and nothing else - see [safeName]. The page is ours, but a
 * message that says where to write is a message that can be made to say anything, and the folder is not
 * up for discussion.
 */
internal object ImageDownloads {

    private const val GROUP = "Amazing Claude Code"
    private const val FALLBACK_NAME = "amazing-claude-code.png"
    private const val MAX_NAME = 80
    /** How many times a name is tried with a number added before giving up on being tidy about it. */
    private const val MAX_ATTEMPTS = 99

    fun save(project: Project, name: String, data: String) {
        // Decoding a picture and writing it out are both too much for the interface thread: the panel is
        // waiting to be redrawn with the button's "saved" tick on it.
        ApplicationManager.getApplication().executeOnPooledThread {
            runCatching {
                val bytes = Base64.getDecoder().decode(data)
                val file = free(folder(), safeName(name))
                file.writeBytes(bytes)
                announce(project, file)
            }.onFailure { thisLogger().warn("Could not save the picture from the panel", it) }
        }
    }

    /** Where a browser would have put it: the downloads folder, or the home folder if there is none. */
    private fun folder(): File {
        val home = File(System.getProperty("user.home").orEmpty())
        val downloads = File(home, "Downloads")
        return if (downloads.isDirectory) downloads else home
    }

    /**
     * The file name out of what the page asked for: the last segment, letters, digits and the plainest
     * punctuation, and a .png on the end. Anything that could lead out of the folder is gone by then -
     * a separator does not survive the filter, and neither does "..". Open to the test for that reason.
     */
    internal fun safeName(name: String): String {
        val plain = name.substringAfterLast('/').substringAfterLast('\\')
            .filter { it.isLetterOrDigit() || it == '.' || it == '-' || it == '_' }
            .trimStart('.')
            .take(MAX_NAME)

        return when {
            plain.isBlank() -> FALLBACK_NAME
            plain.endsWith(".png", ignoreCase = true) -> plain
            else -> "$plain.png"
        }
    }

    /** The same name with a number added while one is taken - a second picture does not eat the first. */
    internal fun free(folder: File, name: String): File {
        val file = File(folder, name)
        if (!file.exists()) return file

        val base = name.removeSuffix(".png")
        for (attempt in 2..MAX_ATTEMPTS) {
            val next = File(folder, "$base-$attempt.png")
            if (!next.exists()) return next
        }

        return file
    }

    /**
     * The IDE says where the file went - the panel cannot: a browser's own downloads bar is exactly what
     * is missing here, and a file written silently is a file nobody finds.
     */
    private fun announce(project: Project, file: File) {
        val notification = NotificationGroupManager.getInstance()
            .getNotificationGroup(GROUP)
            .createNotification("Saved ${file.name}", file.parent.orEmpty(), NotificationType.INFORMATION)

        if (RevealFileAction.isSupported()) {
            notification.addAction(
                NotificationAction.createSimple(RevealFileAction.getActionName()) { RevealFileAction.openFile(file) },
            )
        }

        notification.notify(project)
    }
}

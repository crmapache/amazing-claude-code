package io.github.crmapache.amazingclaudecode.editor

import com.intellij.openapi.application.ApplicationManager
import com.intellij.openapi.application.ModalityState
import com.intellij.openapi.components.service
import com.intellij.openapi.diagnostic.thisLogger
import com.intellij.openapi.fileEditor.FileDocumentManager
import com.intellij.openapi.project.Project
import com.intellij.openapi.roots.ProjectFileIndex
import com.intellij.openapi.vfs.VirtualFile
import io.github.crmapache.amazingclaudecode.feedback.DiagnosticsLog
import java.util.concurrent.CountDownLatch
import java.util.concurrent.TimeUnit

/**
 * The edits still sitting in the editor, written to disk before anything goes looking for the files.
 *
 * The agent has no idea an editor exists: it opens the file on disk and sees what was last written
 * there. The IDE writes editors out when the focus leaves the application - and stepping from the
 * editor into our panel does not leave it, because the panel is the same application. So the ordinary
 * "fixed a line, didn't press save, asked Claude" ends with the agent reading the text as it was
 * before the fix and putting its own version over it. From the person's side that looks like the agent
 * undoing their work, which is exactly how it was reported.
 *
 * Hence this: what the IDE would have saved on Alt+Tab is saved a moment before the turn starts
 * instead. Nothing new happens to the files - the same save, at a moment when it matters.
 */
internal object UnsavedEdits {

    /**
     * Write out the project's unsaved editors.
     *
     * Synchronously, and before the caller goes on: saving after the text has reached the process is
     * the same race with a shorter fuse. Writing is only allowed on the interface thread, so the check
     * for "nothing to save" is made first, off it - that is the usual case, and it should not have to
     * queue behind whatever the IDE happens to be drawing.
     *
     * Waited for, but not indefinitely. The caller is whichever thread carried the message in, and for
     * a message from a phone that is the relay's own: an IDE sitting behind a modal dialog would hold
     * it there for as long as the dialog stands, and with it every other conversation on that line. A
     * turn that starts a moment early is a worse read of one file; a line that never comes back is
     * remote access gone until somebody walks to the machine.
     */
    fun flush(project: Project) {
        if (project.isDisposed) return

        val manager = FileDocumentManager.getInstance()
        if (manager.unsavedDocuments.isEmpty()) return

        val app = ApplicationManager.getApplication()
        if (app.isDispatchThread) {
            save(project, manager)
            return
        }

        val done = CountDownLatch(1)
        app.invokeLater(
            {
                try {
                    save(project, manager)
                } finally {
                    done.countDown()
                }
            },
            ModalityState.nonModal(),
        )

        if (!done.await(WAIT_MS, TimeUnit.MILLISECONDS)) {
            service<DiagnosticsLog>().note("editor", "the editors didn't save in time - the turn went on")
        }
    }

    private fun save(project: Project, manager: FileDocumentManager) {
        if (project.isDisposed) return

        var saved = 0
        runCatching {
            ApplicationManager.getApplication().runWriteIntentReadAction<Unit, Throwable> {
                manager.saveDocuments { document ->
                    val file = manager.getFile(document) ?: return@saveDocuments false
                    val ours = ours(project, file)
                    if (ours) saved++
                    ours
                }
            }
        }.onFailure { thisLogger().warn("Couldn't write out the editors before the turn", it) }

        // The count and nothing else: this buffer travels out with a bug report, and a file's name is
        // the person's business (see DiagnosticsLog).
        if (saved > 0) service<DiagnosticsLog>().note("editor", "saved $saved unsaved editor(s)")
    }

    /**
     * Whether this file is one of the project's own.
     *
     * All of them rather than this project's would mean a message here writing out an untouched draft
     * in another window's project - a surprise nobody asked for, and one the agent could not see
     * anyway: it runs in this project's directory.
     *
     * Two questions rather than one, because neither answers alone. The directory is where the agent
     * actually is, and files under it count even when they belong to no module - a scratch config, an
     * ignored folder. The project's own index catches the other side: a module attached from outside
     * the root is still this project's code, and the agent reaches it by an absolute path like any
     * other.
     */
    private fun ours(project: Project, file: VirtualFile): Boolean {
        if (!file.isInLocalFileSystem) return false
        if (under(file.path, project.basePath)) return true

        return runCatching { ProjectFileIndex.getInstance(project).isInContent(file) }.getOrDefault(false)
    }

    /**
     * Whether [path] lies inside [root] - apart from the IDE, so a test can check it.
     *
     * By whole segments: `/work/site` must not swallow `/work/site-old`, and prefix matching says it
     * does. Both paths come from the same place (the VFS, which spells them with forward slashes on
     * every OS), so no normalising is needed beyond a trailing slash on the root.
     */
    internal fun under(path: String, root: String?): Boolean {
        val base = root?.trimEnd('/')?.takeIf { it.isNotEmpty() } ?: return false
        return path == base || path.startsWith("$base/")
    }

    /** How long a turn waits for the editors - see [flush]. */
    private const val WAIT_MS = 2_000L
}

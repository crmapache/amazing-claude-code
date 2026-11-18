package io.github.crmapache.amazingclaudecode.editor

import com.intellij.openapi.application.ApplicationManager
import com.intellij.openapi.application.ModalityState
import com.intellij.openapi.command.WriteCommandAction
import com.intellij.openapi.diagnostic.thisLogger
import com.intellij.openapi.fileEditor.FileDocumentManager
import com.intellij.openapi.project.Project
import com.intellij.openapi.vfs.LocalFileSystem
import com.intellij.openapi.vfs.VfsUtil
import com.intellij.openapi.vfs.VirtualFile
import java.nio.file.Path

/**
 * The disk half of [ChangeRevert]: one file read, its turn undone - or made again - and the result written
 * back.
 *
 * Through the file's document and as a command of the IDE, rather than straight onto the disk. That way an
 * editor showing the file changes in place, and the revert is one more step on that editor's undo - a person
 * who pressed the wrong row takes it back with the key they already know. A file the turn created is deleted
 * the same way, so the IDE's local history keeps it, and is written anew when the changes are brought back.
 *
 * Runs off the event thread: the file is refreshed from the disk first (the agent wrote it from outside, and
 * the IDE's picture may be a step behind), and that is a walk of the disk. The edit itself goes to the event
 * thread, as every write to a document must.
 */
internal object FileReverts {

    private const val REVERT = "Revert Claude's Changes"
    private const val RESTORE = "Bring Back Claude's Changes"

    /** [edits] undone, or with [restore] made again after an undo. */
    fun apply(project: Project, path: String, edits: List<ChangeRevert.Edit>, restore: Boolean): ChangeRevert.Outcome {
        val nio = runCatching { Path.of(path) }.getOrNull()?.takeIf { it.isAbsolute }
            ?: return ChangeRevert.Outcome.FAILED
        val created = edits.firstOrNull() is ChangeRevert.Edit.Create

        val file = LocalFileSystem.getInstance().refreshAndFindFileByNioFile(nio)
        if (ChangeRevert.removes(edits)) return removed(project, nio, file, edits, restore)
        if (file == null || !file.isValid || file.isDirectory) {
            return when {
                // A file the turn created and somebody has since removed is already what a revert would make it.
                !restore -> if (created) ChangeRevert.Outcome.REVERTED else ChangeRevert.Outcome.MISSING
                // And bringing it back is writing it anew.
                created -> onEventThread(project, ChangeRevert.Outcome.RESTORED) {
                    val made = ChangeRevert.redo(null, edits) as? ChangeRevert.Result.Text ?: return@onEventThread ChangeRevert.Outcome.CHANGED
                    recreate(project, nio, made.text, RESTORE)
                    ChangeRevert.Outcome.RESTORED
                }
                else -> ChangeRevert.Outcome.MISSING
            }
        }
        file.refresh(false, false)

        return onEventThread(project, if (restore) ChangeRevert.Outcome.RESTORED else ChangeRevert.Outcome.REVERTED) {
            rewrite(project, file, edits, restore)
        }
    }

    /** [work] on the event thread, with anything it throws said as a failure rather than lost. */
    private fun onEventThread(project: Project, done: ChangeRevert.Outcome, work: () -> ChangeRevert.Outcome): ChangeRevert.Outcome {
        var outcome = ChangeRevert.Outcome.FAILED
        ApplicationManager.getApplication().invokeAndWait(
            {
                if (project.isDisposed) return@invokeAndWait
                outcome = runCatching { work() }
                    .onFailure { thisLogger().warn("Couldn't put a file ${if (done == ChangeRevert.Outcome.RESTORED) "forward" else "back"}", it) }
                    .getOrDefault(ChangeRevert.Outcome.FAILED)
            },
            ModalityState.defaultModalityState(),
        )
        return outcome
    }

    private fun rewrite(project: Project, file: VirtualFile, edits: List<ChangeRevert.Edit>, restore: Boolean): ChangeRevert.Outcome {
        val manager = FileDocumentManager.getInstance()
        // No document means a file the IDE does not hold as text - nothing the CLI edited line by line.
        val document = manager.getDocument(file) ?: return ChangeRevert.Outcome.FAILED
        val result = if (restore) ChangeRevert.bringBack(document.text, edits) else ChangeRevert.revert(document.text, edits)

        return when (result) {
            ChangeRevert.Result.Changed -> ChangeRevert.Outcome.CHANGED

            ChangeRevert.Result.Delete -> {
                WriteCommandAction.writeCommandAction(project).withName(REVERT).run<Throwable> { file.delete(this) }
                ChangeRevert.Outcome.REVERTED
            }

            is ChangeRevert.Result.Text -> {
                if (!document.isWritable) return ChangeRevert.Outcome.FAILED
                val before = document.text
                val after = result.text
                // Only the stretch that differs is replaced: the caret, the folds and the scroll of an editor
                // showing the file stay where they were everywhere else.
                val head = before.commonPrefixWith(after).length
                val tail = minOf(before.length, after.length).let { shorter ->
                    var same = 0
                    while (same < shorter - head && before[before.length - 1 - same] == after[after.length - 1 - same]) same++
                    same
                }
                if (head < before.length - tail || head < after.length - tail) {
                    WriteCommandAction.writeCommandAction(project).withName(if (restore) RESTORE else REVERT).run<Throwable> {
                        document.replaceString(head, before.length - tail, after.substring(head, after.length - tail))
                    }
                    manager.saveDocument(document)
                }
                if (restore) ChangeRevert.Outcome.RESTORED else ChangeRevert.Outcome.REVERTED
            }
        }
    }

    /**
     * A file the turn removed. Put back, it is written again as it was before the turn - unless something stands at its
     * path already: that is somebody's file, or the very one, already back. Brought back, it is removed again, but only
     * while it reads exactly as the turn found it.
     */
    private fun removed(
        project: Project,
        path: Path,
        file: VirtualFile?,
        edits: List<ChangeRevert.Edit>,
        restore: Boolean,
    ): ChangeRevert.Outcome {
        val was = (ChangeRevert.unremove(edits) as? ChangeRevert.Result.Text)?.text ?: return ChangeRevert.Outcome.FAILED
        val there = file != null && file.isValid && !file.isDirectory
        if (!there) {
            if (restore) return ChangeRevert.Outcome.RESTORED
            return onEventThread(project, ChangeRevert.Outcome.REVERTED) {
                recreate(project, path, was, REVERT)
                ChangeRevert.Outcome.REVERTED
            }
        }
        file.refresh(false, false)
        return onEventThread(project, if (restore) ChangeRevert.Outcome.RESTORED else ChangeRevert.Outcome.REVERTED) {
            val document = FileDocumentManager.getInstance().getDocument(file) ?: return@onEventThread ChangeRevert.Outcome.FAILED
            val same = document.text.replace("\r\n", "\n") == was.replace("\r\n", "\n")
            when {
                !same -> ChangeRevert.Outcome.CHANGED
                // Back already, exactly as it was: nothing to write.
                !restore -> ChangeRevert.Outcome.REVERTED
                else -> {
                    WriteCommandAction.writeCommandAction(project).withName(RESTORE).run<Throwable> { file.delete(this) }
                    ChangeRevert.Outcome.RESTORED
                }
            }
        }
    }

    /** A file written anew with [text] - a created one the revert deleted, a removed one put back - its folders too. */
    private fun recreate(project: Project, path: Path, text: String, name: String) {
        val parent = path.parent ?: error("no folder")
        WriteCommandAction.writeCommandAction(project).withName(name).run<Throwable> {
            val folder = VfsUtil.createDirectoryIfMissing(parent.toString()) ?: error("no folder")
            val file = folder.findChild(path.fileName.toString()) ?: folder.createChildData(this, path.fileName.toString())
            VfsUtil.saveText(file, text)
        }
    }
}

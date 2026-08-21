package io.github.crmapache.amazingclaudecode.editor

import com.intellij.openapi.editor.Editor
import com.intellij.openapi.project.Project
import com.intellij.openapi.vfs.VirtualFile
import java.nio.file.Path

/**
 * A reference to a piece of a file open in the editor.
 *
 * A reference specifically, not the text: the agent will read the file itself and see it whole rather
 * than a torn-out piece. Lines and columns start at one, the way the editor itself shows them, or the
 * user would compare them with the status bar and find they do not match.
 */
internal data class SelectionReference(
    val path: String,
    val startLine: Int,
    val startColumn: Int,
    val endLine: Int,
    val endColumn: Int,
    /**
     * The selection takes whole lines. Then the columns in the reference are unnecessary: they only add
     * noise without adding precision.
     */
    val wholeLines: Boolean,
) {

    companion object {

        fun of(project: Project, editor: Editor, file: VirtualFile): SelectionReference {
            val document = editor.document
            val selection = editor.selectionModel

            val start = if (selection.hasSelection()) selection.selectionStart else editor.caretModel.offset
            val end = if (selection.hasSelection()) selection.selectionEnd else start

            val startLine = document.getLineNumber(start)
            // A selection ending at the start of a line must not end on that line: a triple click takes
            // the newline with it, and the range would slide a line forward.
            val rawEndLine = document.getLineNumber(end)
            val endLine = if (rawEndLine > startLine && end == document.getLineStartOffset(rawEndLine)) {
                rawEndLine - 1
            } else {
                rawEndLine
            }

            val startColumn = start - document.getLineStartOffset(startLine)
            val endColumn = end - document.getLineStartOffset(endLine)

            val wholeLines = !selection.hasSelection() ||
                (startColumn == 0 && end >= document.getLineEndOffset(endLine))

            return SelectionReference(
                path = relativePath(project, file),
                startLine = startLine + 1,
                startColumn = startColumn + 1,
                endLine = endLine + 1,
                endColumn = endColumn + 1,
                wholeLines = wholeLines,
            )
        }

        /** The path from the project's root: a full one does not fit the panel and adds nothing. */
        private fun relativePath(project: Project, file: VirtualFile): String {
            val base = project.basePath ?: return file.path

            return runCatching {
                Path.of(base).relativize(Path.of(file.path)).toString()
            }.getOrNull()?.takeIf { !it.startsWith("..") } ?: file.path
        }
    }
}

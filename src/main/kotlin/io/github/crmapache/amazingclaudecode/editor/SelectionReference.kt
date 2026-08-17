package io.github.crmapache.amazingclaudecode.editor

import com.intellij.openapi.editor.Editor
import com.intellij.openapi.project.Project
import com.intellij.openapi.vfs.VirtualFile
import java.nio.file.Path

/**
 * Ссылка на кусок файла, открытого в редакторе.
 *
 * Именно ссылка, а не текст: агент прочитает файл сам и увидит его целиком, а не
 * вырванный кусок. Строки и колонки — с единицы, как их показывает сам редактор,
 * иначе пользователь сверит их со строкой состояния и не сойдётся.
 */
internal data class SelectionReference(
    val path: String,
    val startLine: Int,
    val startColumn: Int,
    val endLine: Int,
    val endColumn: Int,
    /**
     * Выделение захватывает строки целиком. Тогда колонки в ссылке не нужны: они
     * только зашумляют её, ничего не уточняя.
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
            // Выделение до начала строки заканчивать этой строкой нельзя: тройной
            // клик забирает перевод строки, и диапазон уезжал бы на строку вперёд.
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

        /** Путь от корня проекта: полный не помещается в панель и ничего не добавляет. */
        private fun relativePath(project: Project, file: VirtualFile): String {
            val base = project.basePath ?: return file.path

            return runCatching {
                Path.of(base).relativize(Path.of(file.path)).toString()
            }.getOrNull()?.takeIf { !it.startsWith("..") } ?: file.path
        }
    }
}

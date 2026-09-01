package io.github.crmapache.amazingclaudecode.editor

import com.intellij.openapi.application.ApplicationManager
import com.intellij.openapi.diagnostic.thisLogger
import com.intellij.openapi.editor.Document
import com.intellij.openapi.editor.Editor
import com.intellij.openapi.fileEditor.FileEditorManager
import com.intellij.openapi.fileEditor.OpenFileDescriptor
import com.intellij.openapi.project.Project
import com.intellij.openapi.vfs.LocalFileSystem
import com.intellij.openapi.vfs.VfsUtilCore
import com.intellij.openapi.vfs.VirtualFile
import com.intellij.util.concurrency.AppExecutorUtil
import java.io.File

/**
 * A path named in the panel, opened in the IDE's editor.
 *
 * The agent talks in paths all day - the head of every Read and Edit card, "see webview/src/App.tsx:120"
 * in the middle of an answer - and until now not one of them was worth clicking: the panel could send an
 * address to a browser and nothing to the editor two panes away. So a path was read off the screen and
 * typed into "go to file" by hand, which is the one thing an IDE plugin should never make anybody do.
 *
 * Deliberately not restricted to the project's own files. The agent reads a dependency's source, a log
 * under /tmp, a config in the home directory, and a click on the path it just named should open exactly
 * that. What guards this is the door rather than the destination: the request is served by the panel's
 * own handler, which a network client never reaches, `openFile` is refused outright to anyone remote (see
 * RemoteCommands), and a network path is refused on both sides (see below and isOpenablePath).
 */
internal object OpenInEditor {

    /**
     * Where the panel asks to go, exactly as a person writes it: `App.tsx`, `App.tsx:120`,
     * `App.tsx:120:30`, `App.tsx:15-20`, `App.tsx:15:33-40`.
     *
     * Everything here is 1-based, the way what is read on screen is - the editor counts lines and columns
     * from zero, and the conversion happens on this side rather than in the panel, which has no business
     * knowing that.
     */
    data class Place(
        val line: Int = 0,
        val column: Int = 0,
        /** The end of a range, when the reference named one - then it is selected rather than only reached. */
        val endLine: Int = 0,
        val endColumn: Int = 0,
        /** A line of text to land on when no number was named at all - see [lineOf]. */
        val find: String = "",
    )

    /**
     * The whole of it happens off the thread that brought the request.
     *
     * Asking the disk whether a path is a file is not free: a sleeping external drive or an unmounted
     * share answers in seconds rather than in milliseconds, and that thread is the one every message from
     * the panel arrives on - so the panel would sit silent, whole, until the disk got round to it. The
     * file chooser and the clipboard beside this one step aside for the same reason.
     */
    fun open(project: Project, path: String, place: Place) {
        if (path.isBlank()) return

        AppExecutorUtil.getAppExecutorService().execute {
            val file = resolve(project, path) ?: run {
                // Never with the path: this buffer travels outwards inside a bug report (see
                // DiagnosticsLog), and the ordinary log is enough for a link that led nowhere.
                thisLogger().info("A file link from the panel pointed at nothing")
                return@execute
            }

            val line = if (place.line > 0) place.line - 1 else lineOf(file, place.find)
            // The column only where the reference named one: a person who wrote "120:30" meant the
            // thirtieth character, and a caret at the start of the line answers a question nobody asked.
            val column = if (place.line > 0 && place.column > 0) place.column - 1 else 0

            ApplicationManager.getApplication().invokeLater {
                if (project.isDisposed) return@invokeLater

                // Through a descriptor rather than plain openFile: it is the only one that can put the
                // caret in a place, and a link to line 120 that opens at line 1 has done half its job. The
                // editor itself comes back from it, which is what a range needs (see select).
                val descriptor = OpenFileDescriptor(project, file, line, column)
                FileEditorManager.getInstance(project).openTextEditor(descriptor, true)
                    ?.let { editor -> select(editor, line, place) }
            }
        }
    }

    /**
     * A range named in the reference, selected in the editor.
     *
     * Writing "15:33-40" is asking to see those eight characters, not to be dropped on the first of them
     * and left to count the rest by eye. The end is inclusive, the way a person counts, and both ends are
     * clamped to what the file actually has: a reference written from memory - or against a file that has
     * changed since - must land somewhere real rather than nowhere.
     */
    private fun select(editor: Editor, line: Int, place: Place) {
        if (place.line <= 0) return

        val document = editor.document
        val lastLine = (document.lineCount - 1).coerceAtLeast(0)
        val from = line.coerceIn(0, lastLine)

        val start =
            if (place.column > 0) offsetIn(document, from, place.column - 1)
            else document.getLineStartOffset(from)

        val end = when {
            // A piece of one line: "33-40" ends after the fortieth character.
            place.column > 0 && place.endColumn > place.column -> offsetIn(document, from, place.endColumn)
            // A piece of the file: "15-20" ends where line twenty ends.
            place.endLine > place.line ->
                document.getLineEndOffset((place.endLine - 1).coerceIn(0, lastLine))
            else -> return
        }

        if (end > start) editor.selectionModel.setSelection(start, end)
    }

    /** An offset inside a line, never past its end: a column written from memory may be longer than it. */
    private fun offsetIn(document: Document, line: Int, column: Int): Int =
        (document.getLineStartOffset(line) + column).coerceAtMost(document.getLineEndOffset(line))

    /**
     * Where in the file the change is, when the request named a line of text instead of a number.
     *
     * The number cannot come from the panel: the CLI answers an edit with a sentence about success and no
     * position in the file at all (checked against every conversation in the local archive), so what the
     * panel can honestly send is the first line the edit added - and here, with the file at hand, that
     * line has exactly one obvious place.
     *
     * Zero - the top of the file - whenever there is nothing to look for, the text is not there, or the
     * file is big enough that reading it to answer would cost more than the answer is worth.
     */
    private fun lineOf(file: VirtualFile, find: String): Int {
        val needle = find.trim()
        if (needle.isEmpty() || file.length > MAX_SEARCHED_BYTES) return 0

        val text = runCatching { VfsUtilCore.loadText(file) }.getOrNull() ?: return 0
        val at = text.indexOf(needle)
        if (at < 0) return 0

        return text.substring(0, at).count { it == '\n' }
    }

    /**
     * The file this path names, or nothing when there is none.
     *
     * A network path never gets this far: reaching for a host somebody else named is what makes Windows
     * introduce itself to it, and the same reach is what hangs on a share that is no longer mounted. The
     * panel refuses those too (see isOpenablePath) - both sides, because this one is the side that would
     * actually go there.
     *
     * A directory is nothing here as well: the agent names those too (`Glob` over `src/`), and an editor
     * has nothing to open for one.
     */
    private fun resolve(project: Project, path: String): VirtualFile? {
        val trimmed = path.trim()
        if (trimmed.isEmpty()) return null
        if (trimmed.startsWith("//") || trimmed.startsWith("\\\\")) return null
        if (trimmed.any { it.isISOControl() }) return null

        val base = project.basePath
        val candidate = File(trimmed).let { file ->
            if (file.isAbsolute || base == null) file else File(base, trimmed)
        }
        if (!candidate.isFile) return null

        // refreshAndFind rather than find: a file the agent has just written may not be in the IDE's
        // picture of the disk yet, and the one moment it is asked for is right after it appeared.
        return LocalFileSystem.getInstance().refreshAndFindFileByPath(candidate.absolutePath)
    }

    /**
     * Past this, the file is not read to find a line in it.
     *
     * A minified bundle or a log of a day's work is megabytes of one line, and the answer - "somewhere
     * near the top" - is worth neither the read nor the memory. Such a file simply opens at its beginning.
     */
    private const val MAX_SEARCHED_BYTES = 4L * 1024 * 1024
}

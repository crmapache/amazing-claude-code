package io.github.crmapache.amazingclaudecode.editor

import com.intellij.ide.actions.RevealFileAction
import com.intellij.ide.projectView.ProjectView
import com.intellij.openapi.application.ApplicationManager
import com.intellij.openapi.application.ReadAction
import com.intellij.openapi.diagnostic.thisLogger
import com.intellij.openapi.editor.Document
import com.intellij.openapi.editor.Editor
import com.intellij.openapi.fileEditor.FileEditorManager
import com.intellij.openapi.fileEditor.OpenFileDescriptor
import com.intellij.openapi.project.Project
import com.intellij.openapi.roots.ProjectRootManager
import com.intellij.openapi.ui.popup.JBPopupFactory
import com.intellij.openapi.util.SystemInfo
import com.intellij.openapi.util.io.FileUtil
import com.intellij.openapi.vfs.LocalFileSystem
import com.intellij.openapi.vfs.VfsUtilCore
import com.intellij.openapi.vfs.VirtualFile
import com.intellij.openapi.wm.ToolWindowId
import com.intellij.openapi.wm.ToolWindowManager
import com.intellij.psi.search.FilenameIndex
import com.intellij.psi.search.GlobalSearchScope
import com.intellij.ui.SimpleListCellRenderer
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
 *
 * A folder is a destination too, and the one thing it cannot be is opened in the editor: it is shown
 * instead - in the project's tree when it belongs to the project, in the system's file manager when it
 * does not (see [reveal]). Before that a click on one did nothing at all, which is the answer a link must
 * never give: `~/.claude` in an answer looked exactly like a file and behaved like plain text.
 *
 * A name is found the way "go to file" finds it. Half of what the agent writes in backticks is a bare
 * name - `Button.js`, `UserService.java` - and the first release of this looked for it at the project's
 * root only, so for any source file in a folder the click did nothing at all, silently: the very first
 * review of the feature said exactly that. Now a name that is not at the root is looked up across the
 * project by the index, narrowed by whatever folders were written in front of it, and when several files
 * are left the person picks (see [byName], [rank]).
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
     * file chooser and the clipboard beside this one step aside for the same reason. The index is slower
     * still when it is being built: the lookup waits for it, and nothing else does.
     */
    fun open(project: Project, path: String, place: Place) {
        if (path.isBlank()) return

        AppExecutorUtil.getAppExecutorService().execute {
            val files = resolve(project, path)

            when (files.size) {
                0 -> {
                    // Never with the path: this buffer travels outwards inside a bug report (see
                    // DiagnosticsLog), and the ordinary log is enough for a link that led nowhere.
                    thisLogger().info("A file link from the panel pointed at nothing")
                }

                1 -> files.single().let { file ->
                    if (file.isDirectory) reveal(project, file) else show(project, file, place)
                }

                else -> ApplicationManager.getApplication().invokeLater {
                    if (project.isDisposed) return@invokeLater
                    choose(project, path.trim(), files) { chosen ->
                        AppExecutorUtil.getAppExecutorService().execute { show(project, chosen, place) }
                    }
                }
            }
        }
    }

    /** One file, opened where the reference points. Reads the file on the calling thread, never on the EDT. */
    private fun show(project: Project, file: VirtualFile, place: Place) {
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

    /**
     * A folder, shown rather than opened - the editor has nothing to open for one.
     *
     * Inside the project it is shown in the project's own tree, which is where a folder is looked at in
     * an IDE and where the rest of it is already visible; the tool window is raised for it, because
     * asking to see a folder and being shown it behind a hidden panel is the same as not being shown it.
     * Outside the project there is no tree it belongs to, so it goes to the system's file manager - the
     * same road a saved picture takes (see ImageDownloads).
     */
    private fun reveal(project: Project, folder: VirtualFile) {
        if (underProject(project, folder)) {
            ApplicationManager.getApplication().invokeLater {
                if (project.isDisposed) return@invokeLater

                val select = Runnable { ProjectView.getInstance(project).select(null, folder, true) }
                val window = ToolWindowManager.getInstance(project).getToolWindow(ToolWindowId.PROJECT_VIEW)
                if (window == null) select.run() else window.activate(select, true)
            }
            return
        }

        // A Linux without a desktop has nowhere to send it, and there is nothing to fall back on: the
        // folder is outside the project by definition, so the tree has no row for it either.
        if (!RevealFileAction.isSupported()) {
            thisLogger().info("There is no file manager to show a folder in")
            return
        }

        RevealFileAction.openDirectory(File(folder.path))
    }

    /**
     * Whether the folder is one the project's tree has a row for.
     *
     * By the roots rather than by the index: an excluded folder - `build`, `node_modules` - is still
     * drawn in the tree and still worth selecting there, while the index answers that it is not part of
     * the project at all. The base directory is asked alongside them because a project may have no
     * content roots configured yet, and its own folder is the one place a path most often points at.
     */
    private fun underProject(project: Project, file: VirtualFile): Boolean {
        val roots = runCatching {
            ReadAction.compute<List<VirtualFile>, RuntimeException> {
                ProjectRootManager.getInstance(project).contentRoots.toList()
            }
        }.getOrDefault(emptyList())

        val base = project.basePath?.let { LocalFileSystem.getInstance().findFileByPath(it) }
        return (roots + listOfNotNull(base)).any { root -> VfsUtilCore.isAncestor(root, file, false) }
    }

    /**
     * Several files answer to the name: the person picks, the way "go to file" has them pick.
     *
     * The list shows each file's path from the project's root - the name is the same on every row, and
     * the folder is the only thing that tells them apart - and the popup's title is what was written, so
     * it is clear what the list is an answer to. Typing into the popup narrows the rows by that path, as
     * in every chooser of the IDE. No words of the plugin's own anywhere in it: the panel speaks ten
     * languages and the IDE one, and a path is the same in all of them.
     */
    private fun choose(project: Project, written: String, files: List<VirtualFile>, onChosen: (VirtualFile) -> Unit) {
        val base = project.basePath
        val caption = { file: VirtualFile -> base?.let { FileUtil.getRelativePath(it, file.path, '/') } ?: file.path }

        JBPopupFactory.getInstance()
            .createPopupChooserBuilder(files)
            .setTitle(written)
            .setRenderer(SimpleListCellRenderer.create("") { file -> caption(file) })
            .setNamerForFiltering(caption)
            .setRequestFocus(true)
            .setItemChosenCallback(onChosen)
            .createPopup()
            .showCenteredInCurrentWindow(project)
    }

    /**
     * A range named in the reference, selected in the editor.
     *
     * Writing "15:33-40" is asking to see those eight characters, not to be dropped on the first of them
     * and left to count the rest by eye. The end is inclusive, the way a person counts, and both ends are
     * clamped to what the file actually has: a reference written from memory - or against a file that has
     * changed since - must land somewhere real rather than nowhere.
     *
     * A range across lines may name a column at each end as well - `L12:5-L18:30` is how a selection
     * made in the editor is written on its chip (see SelectionReference) - and then the end is that
     * column of that line. Read as a piece of one line, which is what happened before the chip could be
     * clicked, it selected the first line only.
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
            // A piece of the file: "15-20" ends where line twenty ends, "12:5-18:30" after its thirtieth
            // character.
            place.endLine > place.line -> {
                val to = (place.endLine - 1).coerceIn(0, lastLine)
                if (place.endColumn > 0) offsetIn(document, to, place.endColumn) else document.getLineEndOffset(to)
            }
            // A piece of one line: "33-40" ends after the fortieth character.
            place.column > 0 && place.endColumn > place.column -> offsetIn(document, from, place.endColumn)
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
     * The files this path names: none, one, or several to choose from.
     *
     * A network path never gets this far: reaching for a host somebody else named is what makes Windows
     * introduce itself to it, and the same reach is what hangs on a share that is no longer mounted. The
     * panel refuses those too (see isOpenablePath) - both sides, because this one is the side that would
     * actually go there.
     *
     * A directory is one of the answers: the agent names those too (`Glob` over `src/`, `~/.claude` in a
     * sentence), and what happens to it afterwards is [reveal] rather than the editor.
     *
     * An absolute path, or one that resolves from the project's root, is the file it says. Anything else
     * relative is a name to look up (see [byName]): the agent writes `Button.js` for a file three folders
     * down, and `src/App.tsx` for `webview/src/App.tsx` when that is the folder it was working in.
     *
     * A `~` is expanded first (see [expandHome]) - and a path that started with one never goes on to the
     * lookup by name, whether it expanded or not. It names a place outside the project, so a project file
     * of the same name is not a worse answer than none: it is the wrong file, opened confidently.
     * `~/.claude/settings.json` used to offer the project's own settings.json files to choose between.
     */
    private fun resolve(project: Project, path: String): List<VirtualFile> {
        val trimmed = path.trim()
        if (trimmed.isEmpty()) return emptyList()
        if (trimmed.startsWith("//") || trimmed.startsWith("\\\\")) return emptyList()
        if (trimmed.any { it.isISOControl() }) return emptyList()

        val base = project.basePath
        val written = expandHome(trimmed, homeFor(base))
        val absolute = File(written).isAbsolute
        val candidate = if (absolute || base == null) File(written) else File(base, written)

        // refreshAndFind rather than find: a file the agent has just written may not be in the IDE's
        // picture of the disk yet, and the one moment it is asked for is right after it appeared.
        if (candidate.isFile || candidate.isDirectory) {
            return listOfNotNull(LocalFileSystem.getInstance().refreshAndFindFileByPath(candidate.absolutePath))
        }

        if (absolute || trimmed.startsWith("~")) return emptyList()
        return byName(project, trimmed)
    }

    /**
     * `~` turned into the home directory it stands for, and everything else left exactly as written.
     *
     * The agent writes the home this way constantly - `~/.claude/settings.json` is the single most named
     * path outside any project - and without this the panel handed the IDE a path that resolves from the
     * project's root, found nothing there, and went looking for the name among the project's own files.
     *
     * `~user` is left alone: another person's home is not this one's, and guessing where it is by pasting
     * a name after the home's parent is a guess this has no need to make.
     *
     * The arithmetic and nothing else, so that it can be asked without an IDE (see OpenInEditorTest).
     */
    fun expandHome(path: String, home: String?): String {
        if (home.isNullOrBlank()) return path
        if (path == "~") return home
        if (!path.startsWith("~/") && !path.startsWith("~\\")) return path

        return home.trimEnd('/', '\\') + path.substring(1)
    }

    /**
     * The home a `~` in this project's conversation means, or null when it means one we cannot open.
     *
     * A project on a WSL share is another machine's disk: the CLI runs inside the distribution and its
     * `~` is the distribution's home, while this JVM's is a Windows profile which may perfectly well have
     * a `.claude` of its own in it (see ClaudeHome). Expanding to that one would open a real file that
     * nobody named. Nothing is expanded then, and the path stays as written - which reaches the share
     * check above and stops there.
     */
    private fun homeFor(basePath: String?): String? {
        if (basePath != null && (basePath.startsWith("//") || basePath.startsWith("\\\\"))) return null
        return System.getProperty("user.home")
    }

    /**
     * The project's files that go by this name, in the folders that were written - the IDE's own
     * "go to file", asked by the last piece of the path and narrowed by the rest (see [rank]).
     *
     * Through the index rather than by walking the disk: a project is tens of thousands of files, and a
     * click must answer at once. The index covers what the IDE considers the project's own - excluded
     * folders and libraries are not in it, so `node_modules` never answers to a name - and it is asked in
     * smart mode: while it is still being built there is nothing to ask, and the click waits for it rather
     * than answering "nothing" about a file that is there.
     *
     * Case follows the file system: on a Mac and on Windows `readme.md` is `README.md`, on Linux it is not.
     */
    private fun byName(project: Project, written: String): List<VirtualFile> {
        val name = segmentsOf(written).lastOrNull() ?: return emptyList()
        val caseSensitive = SystemInfo.isFileSystemCaseSensitive

        val found = runCatching {
            ReadAction.nonBlocking<Collection<VirtualFile>> {
                FilenameIndex.getVirtualFilesByName(name, caseSensitive, GlobalSearchScope.projectScope(project))
            }.inSmartMode(project).executeSynchronously()
        }.getOrElse { failure ->
            thisLogger().info("Couldn't look a file link up by name", failure)
            return emptyList()
        }

        val byPath = found.filter { !it.isDirectory }.associateBy { it.path }
        return rank(written, byPath.keys, caseSensitive).mapNotNull { byPath[it] }
    }

    /**
     * Which of the files called by a name are the one that was written, and in what order to offer them.
     *
     * A written path is a tail to match: `src/Button.js` is `/app/src/Button.js` and `/app/legacy/src/Button.js`,
     * and not `/app/xsrc/Button.js` - the pieces between the separators are compared whole, so a folder
     * whose name merely ends the same way does not count. Either separator does, because the agent writes
     * both, and a `.` in the path adds nothing. A `..` refuses the whole thing: a tail cannot climb.
     *
     * Nothing under the folders written - a file that has moved since, a folder misremembered by the agent -
     * and every file of that name is offered instead. A list to pick from is an answer; "nothing
     * happened" is the one thing a click on a link must never be.
     *
     * The shallowest file comes first - nearest the root is the likeliest meaning of a bare name - and
     * among equals the order is alphabetical, so that the same name offers the same list every time.
     *
     * The arithmetic and nothing else, so that it can be asked without an IDE (see OpenInEditorTest).
     */
    fun rank(written: String, candidates: Collection<String>, caseSensitive: Boolean = true): List<String> {
        val wanted = segmentsOf(written)
        if (wanted.isEmpty() || wanted.any { it == ".." }) return emptyList()

        val underFolders = candidates.filter { endsWith(segmentsOf(it), wanted, caseSensitive) }
        val byName = underFolders.ifEmpty {
            candidates.filter { endsWith(segmentsOf(it), wanted.takeLast(1), caseSensitive) }
        }

        return byName.sortedWith(compareBy<String> { segmentsOf(it).size }.thenBy { it })
    }

    /** The pieces of a path between its separators, either kind, without the empty ones and the `.` that means "here". */
    private fun segmentsOf(path: String): List<String> =
        path.split('/', '\\').filter { it.isNotEmpty() && it != "." }

    private fun endsWith(path: List<String>, tail: List<String>, caseSensitive: Boolean): Boolean {
        if (tail.size > path.size) return false
        val offset = path.size - tail.size
        return tail.indices.all { path[offset + it].equals(tail[it], ignoreCase = !caseSensitive) }
    }

    /**
     * Past this, the file is not read to find a line in it.
     *
     * A minified bundle or a log of a day's work is megabytes of one line, and the answer - "somewhere
     * near the top" - is worth neither the read nor the memory. Such a file simply opens at its beginning.
     */
    private const val MAX_SEARCHED_BYTES = 4L * 1024 * 1024
}

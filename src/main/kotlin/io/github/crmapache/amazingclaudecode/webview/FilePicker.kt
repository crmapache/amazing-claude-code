package io.github.crmapache.amazingclaudecode.webview

import com.intellij.openapi.fileChooser.FileChooser
import com.intellij.openapi.fileChooser.FileChooserDescriptor
import com.intellij.openapi.project.Project
import com.intellij.openapi.vfs.LocalFileSystem
import com.intellij.openapi.vfs.VirtualFile

/**
 * Choosing an attachment through the IDE's own dialog.
 *
 * The panel deliberately builds no file list of its own: the IDE already has a project tree with
 * exclusions, icons and search, and that is exactly what the user expects.
 */
internal object FilePicker {

    /**
     * One dialog for everything: a file, an image and a folder are chosen the same way, and splitting
     * them across three buttons serves nothing - the difference is visible from the path itself.
     */
    fun pick(project: Project, onPicked: (kind: String, path: String) -> Unit) {
        // The descriptor is built with the constructor: the factory's methods we need are declared
        // deprecated, while the behaviour here is set by flags anyway.
        val descriptor = FileChooserDescriptor(true, true, false, false, false, true)
            .withTitle("Attach files or folders")

        FileChooser.chooseFiles(descriptor, project, null) { files ->
            for (file in files) onPicked(kindOf(file), relativePath(project, file))
        }
    }

    /**
     * The same description of an attachment, but for a path that came from outside: a file dropped into
     * the input field with the mouse. The panel knows only a string about it - whether it is a folder or
     * a file, and how the path looks from the project's root, is visible only here.
     *
     * A path that does not exist is skipped silently: anything at all could have been dragged in, up to
     * a link from a browser.
     */
    fun describe(project: Project, path: String): Pair<String, String>? {
        val file = LocalFileSystem.getInstance().refreshAndFindFileByPath(path) ?: return null
        return kindOf(file) to relativePath(project, file)
    }

    /**
     * The attachment kind for a path that must not be shortened.
     *
     * That is how "Send Absolute Path…" arrives: there the full path is the whole point of the action -
     * it is asked for a conversation raised outside this project, where a path from the root leads
     * nowhere.
     */
    fun kindOf(path: String): String? =
        LocalFileSystem.getInstance().refreshAndFindFileByPath(path)?.let(::kindOf)

    private fun kindOf(file: VirtualFile): String = when {
        file.isDirectory -> "dir"
        file.extension?.lowercase() in IMAGE_EXTENSIONS -> "img"
        else -> "file"
    }

    /**
     * Inside the project the path is short, from its root - the same as for a reference from the editor,
     * and the agent reads it relative to its working directory. A file outside keeps its full path:
     * trimming its leading slash would hand the agent a path that does not exist.
     */
    private fun relativePath(project: Project, file: VirtualFile): String {
        val base = project.basePath ?: return file.path
        val prefix = "$base/"

        return if (file.path.startsWith(prefix)) file.path.removePrefix(prefix) else file.path
    }

    private val IMAGE_EXTENSIONS = setOf("png", "jpg", "jpeg", "gif", "webp", "svg")
}

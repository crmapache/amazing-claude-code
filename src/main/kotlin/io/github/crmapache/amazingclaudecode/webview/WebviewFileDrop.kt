package io.github.crmapache.amazingclaudecode.webview

import com.intellij.ide.dnd.DnDEvent
import com.intellij.ide.dnd.DnDSupport
import com.intellij.ide.dnd.FileCopyPasteUtil
import com.intellij.openapi.Disposable
import com.intellij.openapi.diagnostic.thisLogger
import javax.swing.JComponent

/**
 * Taking in files and folders dropped into the panel with the mouse - both from the IDE itself and from
 * the system file manager.
 *
 * We catch this here rather than in the page, because dragging inside the IDE - from the project tree,
 * from the editor's tabs - does not go through the system mechanism but through one of the platform's
 * own (DnDManager): it carries what is dragged itself, by mouse events, and that simply never reaches
 * the embedded browser - the page receives not a single event, however many handlers hang there.
 *
 * enableAsNativeTarget adds system dragging to that - the way a file arrives from a file manager.
 *
 * A drop can land anywhere in the panel, while what lights up is the input field alone: the file will
 * become a chip precisely there, and the frame shows where it will end up rather than where to aim the
 * mouse (see onDragging).
 */
internal object WebviewFileDrop {

    fun install(
        component: JComponent,
        parentDisposable: Disposable,
        /** A file is being held over the panel (or taken away) - the page draws the highlight itself. */
        onDragging: (Boolean) -> Unit,
        onDropped: (List<String>) -> Unit,
    ) {
        DnDSupport.createBuilder(component)
            // The panel is a target only: there is nothing to drag out of it.
            .disableAsSource()
            .enableAsNativeTarget()
            .setTargetChecker { event ->
                val possible = canAttach(event)
                event.setDropPossible(possible)
                // The platform draws no frame of its own: what has to be highlighted is the input
                // field alone, and only the page knows its bounds.
                onDragging(possible)
                true
            }
            .setCleanUpOnLeaveCallback { onDragging(false) }
            // The gesture ended however it liked - by a drop, a cancel, leaving the window: the
            // highlight must not be left hanging in any of those cases.
            .setDropEndedCallback { onDragging(false) }
            .setDropHandler { event ->
                onDragging(false)
                val paths = paths(event)
                thisLogger().info("Dropped into the panel: ${paths.size} file(s)")
                if (paths.isNotEmpty()) onDropped(paths)
            }
            .setDisposableParent(parentDisposable)
            .install()
    }

    /**
     * Whether what is being dragged can be accepted - by the kinds of content alone, without looking
     * inside.
     *
     * The content itself cannot be read before the drop: system dragging hands it over only at the
     * moment the file is released. The check used to ask for files specifically - and for a file from a
     * file manager it always got nothing: the panel decided there was nothing to accept, did not light
     * up and did not take the drop at all. From inside the IDE everything worked: there what is dragged
     * is known at once.
     */
    private fun canAttach(event: DnDEvent): Boolean =
        FileCopyPasteUtil.isFileListFlavorAvailable(event) || paths(event).isNotEmpty()

    /**
     * The paths of what was dropped. Dragging inside the IDE carries its own objects (tree nodes,
     * project files), system dragging an ordinary list of files; the platform handles both cases, and
     * for the panel they are no different anyway.
     *
     * Paths specifically, not project files: turning a path into a file means going into the virtual
     * file system, while the panel handles a drop on the interface thread, where that is forbidden ("slow
     * operations are prohibited on EDT" in the log). The path goes off into a background thread anyway,
     * where it is examined at leisure (see attachDropped).
     *
     * The one thing the panel cannot accept is a drop from the commit window. While dragging, the change
     * list hands over not files but an object of its own holding the changes, and the platform keeps it
     * closed to plugins: there is no public way to read paths out of it at all. The panel no longer
     * takes it upon itself to parse what is closed - because of it the marketplace would not let a
     * version through moderation, and that insistence bought one way of dragging a file in out of two or
     * three available.
     */
    private fun paths(event: DnDEvent): List<String> =
        FileCopyPasteUtil.getFileListFromAttachedObject(event.attachedObject).map { file -> file.path }
}

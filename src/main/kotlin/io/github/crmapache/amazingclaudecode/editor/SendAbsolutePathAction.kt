package io.github.crmapache.amazingclaudecode.editor

import com.intellij.openapi.actionSystem.ActionPlaces
import com.intellij.openapi.actionSystem.ActionUpdateThread
import com.intellij.openapi.actionSystem.AnAction
import com.intellij.openapi.actionSystem.AnActionEvent
import com.intellij.openapi.actionSystem.CommonDataKeys
import com.intellij.openapi.project.DumbAware
import com.intellij.openapi.vfs.VirtualFile
import io.github.crmapache.amazingclaudecode.toolwindow.ClaudePanels

/**
 * A whole file or folder put into the input field by its full path, as an attachment chip - the same as
 * one dragged into the panel with the mouse.
 *
 * One action in three menus. In the editor's it is "Send Absolute Path to Amazing Claude Code GUI", right
 * under "Send to…" for the selected lines. In the project tree's and in the Commit tool window's list of
 * changes it is the only item of ours, right under "Copy Path/Reference…", and goes by the plain "Send to
 * Amazing Claude Code GUI" (see plugin.xml): there is nothing smaller than a file to send from there. The
 * tree's came from a person's idea - the drag was there, but the menu is where one looks first, and it is
 * how other plugins and Cursor do it.
 *
 * The path is the full one, from every menu: it leads to the file from wherever the conversation stands,
 * this project or one raised outside it, while a path from the root leads nowhere in the second. It costs
 * nothing on screen - a chip shows the file's name, whatever the path behind it.
 *
 * Its id in plugin.xml still says "SendSelectionAbsolute", from the days it lived in the editor alone: a
 * person's keymap is filed under that id, and renaming it would silently take their shortcut away.
 */
internal class SendAbsolutePathAction : AnAction(), DumbAware {

    override fun getActionUpdateThread(): ActionUpdateThread = ActionUpdateThread.BGT

    override fun update(event: AnActionEvent) {
        event.presentation.isEnabledAndVisible =
            event.project != null && offeredIn(event) && chosenFiles(event).isNotEmpty()
    }

    override fun actionPerformed(event: AnActionEvent) {
        val project = event.project ?: return
        val files = chosenFiles(event)

        ClaudePanels.getInstance(project).withPanel { panel -> panel.attachFiles(files) }
    }
}

/**
 * Whether the item shows where it is being asked: of all the menus, only the editor's, the project tree's
 * and the Commit tool window's list of changes.
 *
 * In the tree it stands right under "Copy Path/Reference…", inside the platform's clipboard group - and
 * that group is shared with the main Edit menu, the structure view, the console and the navigation bar.
 * There the item has no business: a person did not open those to send a file. A shortcut and Search
 * Everywhere are not menus, and go through.
 */
internal fun offeredIn(event: AnActionEvent): Boolean {
    val place = event.place
    if (place in OFFERING_MENUS) return true

    val menu = ActionPlaces.isPopupPlace(place) || place == ActionPlaces.MAIN_MENU ||
        ActionPlaces.isMacSystemMenuAction(event)
    return !menu
}

/**
 * What the menu was opened on, as files the agent can open.
 *
 * In the editor that is the file being edited and nothing else. The platform derives a list of files
 * there too, but from whatever the context offers first - and the element under the caret is part of
 * that context, so the list may name the file a reference leads to rather than the one on screen. In the
 * project tree and the list of changes it is the whole selection: several files and folders go together,
 * and a deleted file, with nothing left on the disk, drops out on its own.
 *
 * Only files on the local disk are kept: an entry inside a jar under "External Libraries" has a path no
 * agent can read, so for such a node the item does not show at all, and in a mixed selection it is left
 * out.
 */
internal fun chosenFiles(event: AnActionEvent): List<VirtualFile> {
    val files = if (event.getData(CommonDataKeys.EDITOR) != null) {
        listOfNotNull(event.getData(CommonDataKeys.VIRTUAL_FILE))
    } else {
        event.getData(CommonDataKeys.VIRTUAL_FILE_ARRAY)?.toList()
            ?: listOfNotNull(event.getData(CommonDataKeys.VIRTUAL_FILE))
    }

    return files.filter { it.isValid && it.isInLocalFileSystem }
}

private val OFFERING_MENUS = setOf(
    ActionPlaces.EDITOR_POPUP,
    ActionPlaces.PROJECT_VIEW_POPUP,
    ActionPlaces.CHANGES_VIEW_POPUP,
)

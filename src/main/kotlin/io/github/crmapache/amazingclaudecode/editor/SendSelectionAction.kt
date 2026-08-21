package io.github.crmapache.amazingclaudecode.editor

import com.intellij.openapi.actionSystem.ActionUpdateThread
import com.intellij.openapi.actionSystem.AnAction
import com.intellij.openapi.actionSystem.AnActionEvent
import com.intellij.openapi.actionSystem.CommonDataKeys
import com.intellij.openapi.project.DumbAware
import io.github.crmapache.amazingclaudecode.toolwindow.ClaudePanels

/**
 * "Send to Amazing Claude Code" in the editor's context menu.
 *
 * What travels into the input field is a reference to a piece of a file rather than the text itself:
 * the agent will read the whole file and see what surrounds the selection. The path is relative to the
 * project's root: a full one does not fit the panel and adds nothing.
 */
internal class SendSelectionAction : AnAction(), DumbAware {

    override fun getActionUpdateThread(): ActionUpdateThread = ActionUpdateThread.BGT

    override fun update(event: AnActionEvent) {
        event.presentation.isEnabledAndVisible = event.project != null &&
            event.getData(CommonDataKeys.EDITOR) != null &&
            event.getData(CommonDataKeys.VIRTUAL_FILE) != null
    }

    override fun actionPerformed(event: AnActionEvent) {
        val project = event.project ?: return
        val editor = event.getData(CommonDataKeys.EDITOR) ?: return
        val file = event.getData(CommonDataKeys.VIRTUAL_FILE) ?: return

        val reference = SelectionReference.of(project, editor, file)
        ClaudePanels.getInstance(project).withPanel { panel -> panel.sendSelection(reference) }
    }
}

/**
 * "Send Absolute Path to Amazing Claude Code" - a neighbour in the menu, but not a variation of it:
 * this is a reference to a whole file rather than to the selected lines.
 *
 * A full path is asked for when the conversation was raised outside this project: there a path from the
 * root leads nowhere. Lines are not appended to such a reference - a file was asked for, not a place
 * inside it; in the input field it stands as an ordinary attachment chip, like a file dropped into the
 * panel with the mouse.
 */
internal class SendSelectionAbsoluteAction : AnAction(), DumbAware {

    override fun getActionUpdateThread(): ActionUpdateThread = ActionUpdateThread.BGT

    override fun update(event: AnActionEvent) {
        event.presentation.isEnabledAndVisible = event.project != null &&
            event.getData(CommonDataKeys.VIRTUAL_FILE) != null
    }

    override fun actionPerformed(event: AnActionEvent) {
        val project = event.project ?: return
        val file = event.getData(CommonDataKeys.VIRTUAL_FILE) ?: return

        ClaudePanels.getInstance(project).withPanel { panel -> panel.attachPath(file.path) }
    }
}

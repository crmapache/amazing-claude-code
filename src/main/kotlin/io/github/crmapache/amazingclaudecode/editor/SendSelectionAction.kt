package io.github.crmapache.amazingclaudecode.editor

import com.intellij.openapi.actionSystem.ActionUpdateThread
import com.intellij.openapi.actionSystem.AnAction
import com.intellij.openapi.actionSystem.AnActionEvent
import com.intellij.openapi.actionSystem.CommonDataKeys
import com.intellij.openapi.project.DumbAware
import io.github.crmapache.amazingclaudecode.toolwindow.ClaudePanels

/**
 * «Send to Amazing Claude Code» в контекстном меню редактора.
 *
 * В поле ввода уходит ссылка на кусок файла, а не сам текст: агент прочитает файл
 * целиком и увидит вокруг то, чего в выделении нет.
 *
 * Путь в ссылке — от корня проекта; [SendSelectionAbsoluteAction] — тот же класс,
 * только с абсолютным путём, для сессий, поднятых не в этом проекте.
 */
internal open class SendSelectionAction(private val absolute: Boolean = false) : AnAction(), DumbAware {

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

        val reference = SelectionReference.of(project, editor, file, absolute)
        ClaudePanels.getInstance(project).withPanel { panel -> panel.sendSelection(reference) }
    }
}

internal class SendSelectionAbsoluteAction : SendSelectionAction(absolute = true)

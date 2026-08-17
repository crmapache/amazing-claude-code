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
 * целиком и увидит вокруг то, чего в выделении нет. Путь — от корня проекта:
 * полный не помещается в панель и ничего не добавляет.
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
 * «Send Absolute Path to Amazing Claude Code» — сосед по меню, но не разновидность:
 * это ссылка на файл целиком, а не на выделенные строки.
 *
 * Полный путь просят для разговора, поднятого не в этом проекте: там путь от
 * корня никуда не ведёт. Строки к такой ссылке не приписываем — просили файл, а
 * не место в нём; в поле ввода она встаёт обычной плашкой вложения, как файл,
 * брошенный в панель мышью.
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

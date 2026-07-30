package io.github.crmapache.amazingclaudecode.toolwindow

import com.intellij.openapi.project.DumbAware
import com.intellij.openapi.project.Project
import com.intellij.openapi.wm.ToolWindow
import com.intellij.openapi.wm.ToolWindowFactory
import com.intellij.ui.content.ContentFactory

internal class ClaudeToolWindowFactory : ToolWindowFactory, DumbAware {

    override fun createToolWindowContent(project: Project, toolWindow: ToolWindow) {
        // Всё содержимое живёт ровно столько, сколько живёт сама панель: браузер и
        // процесс агента снимаются вместе с ней, иначе останутся висеть после
        // закрытия проекта.
        val panel = ClaudePanel(project, toolWindow.disposable)
        val content = ContentFactory.getInstance().createContent(panel.component, null, false)
        toolWindow.contentManager.addContent(content)
    }
}

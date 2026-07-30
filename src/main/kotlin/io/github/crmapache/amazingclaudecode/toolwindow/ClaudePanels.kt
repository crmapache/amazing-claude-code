package io.github.crmapache.amazingclaudecode.toolwindow

import com.intellij.openapi.Disposable
import com.intellij.openapi.components.Service
import com.intellij.openapi.components.service
import com.intellij.openapi.project.Project
import com.intellij.openapi.util.Disposer
import com.intellij.openapi.wm.ToolWindowManager

/**
 * Как добраться до панели снаружи.
 *
 * Панель создаёт платформа, когда пользователь впервые открывает её кнопку, поэтому
 * действия из редактора не могут просто взять её у себя: сначала окно надо открыть,
 * а уже потом отправлять. Открытие асинхронное — отсюда колбэк.
 */
@Service(Service.Level.PROJECT)
internal class ClaudePanels(private val project: Project) {

    @Volatile
    private var panel: ClaudePanel? = null

    fun register(panel: ClaudePanel, parentDisposable: Disposable) {
        this.panel = panel
        Disposer.register(parentDisposable) { if (this.panel === panel) this.panel = null }
    }

    /** Открывает панель, если она ещё не открыта, и отдаёт её колбэку. */
    fun withPanel(use: (ClaudePanel) -> Unit) {
        val toolWindow = ToolWindowManager.getInstance(project).getToolWindow(TOOL_WINDOW_ID) ?: return

        toolWindow.activate { panel?.let(use) }
    }

    companion object {

        const val TOOL_WINDOW_ID = "AmazingClaudeCode"

        fun getInstance(project: Project): ClaudePanels = project.service()
    }
}

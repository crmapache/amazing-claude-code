package io.github.crmapache.amazingclaudecode.toolwindow

import com.intellij.openapi.Disposable
import com.intellij.openapi.components.Service
import com.intellij.openapi.components.service
import com.intellij.openapi.project.Project
import com.intellij.openapi.util.Disposer
import com.intellij.openapi.wm.ToolWindowManager

/**
 * How to reach the panel from outside.
 *
 * The panel is created by the platform, when the user first opens its button, so actions from the
 * editor cannot simply take it for themselves: the window has to be opened first and only then sent to.
 * The opening is asynchronous - hence the callback.
 */
@Service(Service.Level.PROJECT)
internal class ClaudePanels(private val project: Project) {

    @Volatile
    private var panel: ClaudePanel? = null

    fun register(panel: ClaudePanel, parentDisposable: Disposable) {
        this.panel = panel
        Disposer.register(parentDisposable) { if (this.panel === panel) this.panel = null }
    }

    /** Opens the panel if it is not open yet, and hands it to the callback. */
    fun withPanel(use: (ClaudePanel) -> Unit) {
        val toolWindow = ToolWindowManager.getInstance(project).getToolWindow(TOOL_WINDOW_ID) ?: return

        toolWindow.activate { panel?.let(use) }
    }

    companion object {

        /** The panel's id in the platform - the same one plugin.xml registers it under. */
        const val TOOL_WINDOW_ID = "AmazingClaudeCode"

        fun getInstance(project: Project): ClaudePanels = project.service()
    }
}

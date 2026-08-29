package io.github.crmapache.amazingclaudecode.toolwindow

import com.intellij.openapi.Disposable
import com.intellij.openapi.components.Service
import com.intellij.openapi.components.service
import com.intellij.openapi.project.Project
import com.intellij.openapi.project.ProjectManager
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

        /**
         * Every panel open on this machine right now.
         *
         * For the settings that are the machine's rather than a project's - the language, voice input.
         * They are saved once and are true everywhere, but everything that carries them to a screen goes
         * through the conversation hub, and that is a project service: told to one window only, a second
         * project went on drawing itself in yesterday's language, and showed a microphone button whose
         * dictation was refused the moment it was pressed.
         *
         * Projects without a panel are not missed by this: one opening later is handed the settings as
         * they stand, along with everything else about the project.
         */
        fun everyPanel(tell: (ClaudePanel) -> Unit) {
            for (project in ProjectManager.getInstance().openProjects) {
                if (project.isDisposed) continue
                runCatching { getInstance(project).panel?.let(tell) }
            }
        }
    }
}

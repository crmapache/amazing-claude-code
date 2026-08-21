package io.github.crmapache.amazingclaudecode.startup

import com.intellij.openapi.application.EDT
import com.intellij.openapi.project.Project
import com.intellij.openapi.startup.ProjectActivity
import com.intellij.openapi.wm.ToolWindowManager
import io.github.crmapache.amazingclaudecode.toolwindow.ClaudePanels
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext

/**
 * Opens the panel right at startup when the IDE is launched with `acc.autoOpen=true`.
 *
 * For development only: the sandbox IDE comes up with the panel already open, so no run begins with
 * hunting for a button. In an ordinary installation the property is unset, so nothing is imposed on the
 * user.
 */
internal class AutoOpenPanelActivity : ProjectActivity {

    override suspend fun execute(project: Project) {
        if (System.getProperty("acc.autoOpen") != "true") return

        withContext(Dispatchers.EDT) {
            // By the same name the panel is registered under in the platform: a copy of that string
            // here would one day drift from the real one, and the sandbox IDE would silently open
            // without the panel.
            ToolWindowManager.getInstance(project).getToolWindow(ClaudePanels.TOOL_WINDOW_ID)?.activate(null)
        }
    }
}

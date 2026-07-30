package io.github.crmapache.amazingclaudecode.startup

import com.intellij.openapi.application.EDT
import com.intellij.openapi.project.Project
import com.intellij.openapi.startup.ProjectActivity
import com.intellij.openapi.wm.ToolWindowManager
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext

/**
 * Открывает панель сразу при старте, если IDE запущена с `acc.autoOpen=true`.
 *
 * Нужно только для разработки: тестовая IDE поднимается уже с открытой панелью, и
 * каждый прогон не начинается с поиска кнопки. В обычной установке свойство не
 * задано, поэтому пользователю ничего не навязывается.
 */
internal class AutoOpenPanelActivity : ProjectActivity {

    override suspend fun execute(project: Project) {
        if (System.getProperty("acc.autoOpen") != "true") return

        withContext(Dispatchers.EDT) {
            ToolWindowManager.getInstance(project).getToolWindow(TOOL_WINDOW_ID)?.activate(null)
        }
    }

    private companion object {
        const val TOOL_WINDOW_ID = "AmazingClaudeCode"
    }
}

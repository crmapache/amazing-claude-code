package io.github.crmapache.amazingclaudecode.editor

import com.intellij.openapi.actionSystem.ActionPlaces
import com.intellij.openapi.actionSystem.ActionUiKind
import com.intellij.openapi.actionSystem.AnAction
import com.intellij.openapi.actionSystem.AnActionEvent
import com.intellij.openapi.actionSystem.CommonDataKeys
import com.intellij.openapi.actionSystem.DataKey
import com.intellij.openapi.actionSystem.Presentation
import com.intellij.openapi.actionSystem.impl.SimpleDataContext
import com.intellij.openapi.util.io.FileUtil
import com.intellij.openapi.vfs.LocalFileSystem
import com.intellij.openapi.vfs.VirtualFile
import com.intellij.openapi.vfs.newvfs.impl.VfsRootAccess
import com.intellij.testFramework.LightVirtualFile
import com.intellij.testFramework.fixtures.BasePlatformTestCase
import java.awt.event.InputEvent
import java.awt.event.KeyEvent
import java.io.File
import javax.swing.JPanel

/**
 * What "Send Absolute Path…" - "Send to Amazing Claude Code GUI" in the project tree - takes from the menu
 * it was opened in, and which menus show it at all.
 *
 * Where the item stands in the menus is not checked here: a platform test does not load this plugin's
 * plugin.xml, so that is seen only in the sandbox IDE.
 */
class SendAbsolutePathActionTest : BasePlatformTestCase() {

    private lateinit var folder: File

    override fun setUp() {
        super.setUp()
        folder = FileUtil.createTempDirectory("acc-send-path", null)
        // A light test keeps its files in memory and refuses the disk; these have to be real ones.
        VfsRootAccess.allowRootAccess(testRootDisposable, folder.path)
    }

    override fun tearDown() {
        try {
            FileUtil.delete(folder)
        } finally {
            super.tearDown()
        }
    }

    fun testTreeSelectionTakesEveryFileAndFolder() {
        val file = local("README.md")
        val dir = local("src", directory = true)
        val event = event(SendAbsolutePathAction(), CommonDataKeys.VIRTUAL_FILE_ARRAY to arrayOf(file, dir))

        assertEquals(listOf(file, dir), chosenFiles(event))
        SendAbsolutePathAction().update(event)
        assertTrue(event.presentation.isEnabledAndVisible)
    }

    fun testWhatIsNotOnTheDiskIsNotOffered() {
        // A file that lives only in memory - as good a stand-in as any for an entry inside a jar: there is
        // no path to it the agent could read. Not the fixture's own files: their temporary file system
        // counts as the local one.
        val inMemory = LightVirtualFile("Notes.kt", "")
        val alone = event(SendAbsolutePathAction(), CommonDataKeys.VIRTUAL_FILE_ARRAY to arrayOf(inMemory))

        SendAbsolutePathAction().update(alone)
        assertFalse(alone.presentation.isEnabledAndVisible)

        val file = local("README.md")
        val mixed = event(SendAbsolutePathAction(), CommonDataKeys.VIRTUAL_FILE_ARRAY to arrayOf(inMemory, file))
        assertEquals(listOf(file), chosenFiles(mixed))
    }

    fun testEditorMenuTakesTheFileOnScreen() {
        val onScreen = local("Shown.kt")
        val elsewhere = local("Referenced.kt")
        myFixture.configureByText("Scratch.kt", "")

        val event = event(
            SendAbsolutePathAction(),
            CommonDataKeys.EDITOR to myFixture.editor,
            CommonDataKeys.VIRTUAL_FILE to onScreen,
            CommonDataKeys.VIRTUAL_FILE_ARRAY to arrayOf(elsewhere),
        )

        assertEquals(listOf(onScreen), chosenFiles(event))
    }

    fun testOfMenusOnlyTheEditorTheProjectTreeAndTheCommitWindowShowIt() {
        val file = local("README.md")
        val shown = { place: String, uiKind: ActionUiKind, input: InputEvent? ->
            val event = event(
                SendAbsolutePathAction(),
                CommonDataKeys.VIRTUAL_FILE_ARRAY to arrayOf(file),
                place = place,
                uiKind = uiKind,
                input = input,
            )
            SendAbsolutePathAction().update(event)
            event.presentation.isEnabledAndVisible
        }

        assertTrue(shown(ActionPlaces.PROJECT_VIEW_POPUP, ActionUiKind.POPUP, null))
        assertTrue(shown(ActionPlaces.EDITOR_POPUP, ActionUiKind.POPUP, null))
        assertTrue(shown(ActionPlaces.CHANGES_VIEW_POPUP, ActionUiKind.POPUP, null))
        // The clipboard group the tree's item stands in is shared with these - none of them is for sending a file.
        assertFalse(shown(ActionPlaces.MAIN_MENU, ActionUiKind.MAIN_MENU, null))
        assertFalse(shown(ActionPlaces.STRUCTURE_VIEW_POPUP, ActionUiKind.POPUP, null))
        assertFalse(shown(ActionPlaces.NAVIGATION_BAR_POPUP, ActionUiKind.POPUP, null))
        // Not menus: a shortcut and Search Everywhere work wherever there is a file. The shortcut comes with
        // its key press, as it does in the IDE - the old check for the macOS menu bar took that for a menu.
        val keyPress = KeyEvent(JPanel(), KeyEvent.KEY_PRESSED, 0, 0, KeyEvent.VK_A, 'a')
        assertTrue(shown(ActionPlaces.KEYBOARD_SHORTCUT, ActionUiKind.NONE, keyPress))
        assertTrue(shown(ActionPlaces.ACTION_SEARCH, ActionUiKind.SEARCH_POPUP, null))
    }

    private fun local(name: String, directory: Boolean = false): VirtualFile {
        val file = File(folder, name)
        if (directory) file.mkdirs() else file.writeText("")

        return LocalFileSystem.getInstance().refreshAndFindFileByIoFile(file)!!
    }

    @Suppress("UNCHECKED_CAST")
    private fun event(
        action: AnAction,
        vararg data: Pair<DataKey<*>, Any>,
        place: String = ActionPlaces.PROJECT_VIEW_POPUP,
        uiKind: ActionUiKind = ActionUiKind.POPUP,
        input: InputEvent? = null,
    ): AnActionEvent {
        val context = SimpleDataContext.builder().add(CommonDataKeys.PROJECT, project)
        for ((key, value) in data) context.add(key as DataKey<Any>, value)

        return AnActionEvent.createEvent(action, context.build(), Presentation(), place, uiKind, input)
    }
}

package io.github.crmapache.amazingclaudecode.toolwindow

import com.intellij.openapi.Disposable
import com.intellij.openapi.actionSystem.ActionUpdateThread
import com.intellij.openapi.actionSystem.AnActionEvent
import com.intellij.openapi.actionSystem.KeyboardShortcut
import com.intellij.openapi.actionSystem.PlatformCoreDataKeys
import com.intellij.openapi.actionSystem.Shortcut
import com.intellij.openapi.actionSystem.ShortcutSet
import com.intellij.openapi.keymap.KeymapManager
import com.intellij.openapi.keymap.impl.ui.KeymapPanel
import com.intellij.openapi.options.ShowSettingsUtil
import com.intellij.openapi.project.DumbAwareAction
import com.intellij.openapi.project.Project
import com.intellij.openapi.util.Key
import com.intellij.ui.ClientProperty
import io.github.crmapache.amazingclaudecode.voice.caps
import java.awt.Component
import javax.swing.JComponent
import javax.swing.KeyStroke
import kotlinx.serialization.json.JsonArray
import kotlinx.serialization.json.buildJsonArray
import kotlinx.serialization.json.buildJsonObject
import kotlinx.serialization.json.put
import kotlinx.serialization.json.putJsonObject

/**
 * The panel's own keys: the next and the previous tab, a new one, closing the one on screen, opening again the
 * one closed last, and Queue.
 *
 * They are actions of the IDE rather than keys the page listens for, because the IDE has the keyboard
 * first. A press reaches the keymap before the embedded browser sees it, so a page listening for Cmd+W
 * would never hear one: the IDE would already have spent it on Close Tab (the wall Ctrl+V hit on Linux,
 * see PasteKeys). As actions they also live where a JetBrains user looks for keys - Settings | Keymap,
 * under the plugin, where each can be rebound - and in Find Action.
 *
 * Three of them take the keys of the IDE's own tab actions (`use-shortcut-of` in plugin.xml): whatever
 * moves between and closes editor tabs in this person's keymap does the same to the panel's tabs while
 * the focus is in the panel, and follows when that keymap changes. New tab and the closed one opened again take
 * the browser's pair - Cmd+T and Cmd+Shift+T on a Mac, Ctrl+T and Ctrl+Shift+T elsewhere: the second one is a
 * reflex long before anybody looks for it in a cheat sheet, and the reflex is the whole of what it is for.
 *
 * Two roads lead to the same command. A press inside the panel is caught by an action registered on the
 * browser itself ([install]): the IDE asks the focused component's own shortcuts before the keymap's, so
 * there - and only there - the panel's action wins over Close Tab, Update Project or Show Context Actions
 * bound to the same key. The actions in plugin.xml ([PanelKeyAction]) are what Keymap lists and what Find
 * Action runs; outside the panel they stand disabled, which leaves the key to whatever else owns it.
 */
internal object PanelKeys {

    /** Each action's id in the keymap, and the word the page is told when it fires (see protocol.ts). */
    enum class Command(val actionId: String, val wire: String) {
        NEXT_TAB("AmazingClaudeCode.NextTab", "nextTab"),
        PREVIOUS_TAB("AmazingClaudeCode.PreviousTab", "previousTab"),
        NEW_TAB("AmazingClaudeCode.NewTab", "newTab"),
        CLOSE_TAB("AmazingClaudeCode.CloseTab", "closeTab"),
        REOPEN_TAB("AmazingClaudeCode.ReopenTab", "reopenTab"),
        QUEUE("AmazingClaudeCode.QueueMessage", "queue"),
        TERMINAL("AmazingClaudeCode.ContinueInTerminal", "terminal"),
    }

    /** What the panel does with a command - hung on the browser, found again from wherever the focus is. */
    private val PERFORM: Key<(Command) -> Unit> = Key.create("AmazingClaudeCode.PanelKeys.perform")

    /**
     * The IDE's own action that brings the panel up and puts the focus in it, from anywhere - the way into
     * the panel without the mouse, so the cheat sheet names its key too (unbound until somebody binds it).
     * The platform registers one for every tool window as "Activate" + id + "ToolWindow"; the method that
     * spells it is closed to plugins, so the spelling is written out here for our id.
     */
    private const val OPEN_PANEL = "ActivateAmazingClaudeCodeToolWindow"

    /** Teach the browser the panel's keys, for as long as [parent] lives. */
    fun install(component: JComponent, parent: Disposable, perform: (Command) -> Unit) {
        ClientProperty.put(component, PERFORM, perform)

        for (command in Command.entries) {
            val action = object : DumbAwareAction() {
                override fun getActionUpdateThread() = ActionUpdateThread.BGT

                override fun actionPerformed(event: AnActionEvent) = perform(command)
            }
            action.registerCustomShortcutSet(KeymapShortcuts(command.actionId), component, parent)
        }
    }

    /** The panel the focus is in, if it is in one at all - found up the component tree from the focus. */
    fun performerFor(component: Component?): ((Command) -> Unit)? =
        component?.let { ClientProperty.findInHierarchy(it, PERFORM) }

    /**
     * The keys every command answers to right now, for the page to draw beside the buttons and on the
     * cheat sheet: `{ "nextTab": [[cap, cap], ...], ... }` with one inner list per keystroke, plus the key
     * that opens the panel. An empty list is a key nobody has bound.
     */
    fun message(): String = buildJsonObject {
        put("type", "panelKeys")
        putJsonObject("keys") {
            for (command in Command.entries) {
                put(command.wire, strokesJson(shownShortcut(shortcutsOf(command.actionId))))
            }
            put("openPanel", strokesJson(shownShortcut(shortcutsOf(OPEN_PANEL))))
        }
    }.toString()

    /**
     * Which of an action's shortcuts the page shows - an action may have several, and one is drawn.
     *
     * The first keyboard shortcut of a single keystroke, in the keymap's own order: that is the one the
     * keymap lists first, and a chord of two strokes is the harder one to tell somebody about. Only when
     * there is nothing else does a two-stroke chord stand in.
     */
    internal fun shownShortcut(shortcuts: Array<Shortcut>): KeyboardShortcut? {
        val keyboard = shortcuts.filterIsInstance<KeyboardShortcut>()
        return keyboard.firstOrNull { it.secondKeyStroke == null } ?: keyboard.firstOrNull()
    }

    private fun strokesJson(shortcut: KeyboardShortcut?): JsonArray = buildJsonArray {
        if (shortcut == null) return@buildJsonArray
        for (stroke in listOfNotNull<KeyStroke>(shortcut.firstKeyStroke, shortcut.secondKeyStroke)) {
            add(
                buildJsonArray {
                    for (cap in stroke.caps()) {
                        add(
                            buildJsonObject {
                                put("glyph", cap.glyph)
                                put("text", cap.text)
                                put("side", cap.side)
                            },
                        )
                    }
                },
            )
        }
    }

    private fun shortcutsOf(actionId: String): Array<Shortcut> =
        KeymapManager.getInstance()?.activeKeymap?.getShortcuts(actionId) ?: Shortcut.EMPTY_ARRAY

    /**
     * Settings | Keymap, opened on the panel's own actions - the cheat sheet's way to "change these".
     *
     * By selecting the first of them: Keymap unfolds the plugin's node around it, so all of them stand on the
     * screen at once, ready to be rebound. Keymap's `selectAction` is made for being asked before the page is
     * built - it holds the id and applies it once a keymap is loaded.
     *
     * Two other roads were tried live and do not work (2026.2). Typing words into Keymap's own search before
     * the dialog opens fell over inside the platform on a keymap not loaded yet, and the dialog never showed.
     * Handing the same words to the dialog's search found the Plugins page instead: the settings search does
     * not look into the names of actions.
     */
    fun openKeymap(project: Project) {
        ShowSettingsUtil.getInstance().showSettingsDialog(project, KeymapPanel::class.java) { keymap ->
            keymap.selectAction(Command.NEXT_TAB.actionId)
        }
    }

    /**
     * An action's keys as the active keymap has them at the moment of the press.
     *
     * Read on every press rather than copied once: a key rebound in Settings | Keymap, or a different
     * keymap chosen, has to work in the panel straight away, without reopening it.
     */
    private class KeymapShortcuts(private val actionId: String) : ShortcutSet {
        override fun getShortcuts(): Array<Shortcut> = shortcutsOf(actionId)
    }
}

/**
 * One of the panel's keys as Keymap and Find Action know it (see PanelKeys).
 *
 * Enabled only while the focus is in the panel. Everywhere else the same key belongs to something else -
 * Cmd+W to the editor's tab, Alt+Enter to the intentions - and a disabled action steps aside for it.
 */
internal abstract class PanelKeyAction(private val command: PanelKeys.Command) : DumbAwareAction() {

    override fun getActionUpdateThread() = ActionUpdateThread.EDT

    override fun update(event: AnActionEvent) {
        event.presentation.isEnabled = performer(event) != null
    }

    override fun actionPerformed(event: AnActionEvent) {
        performer(event)?.invoke(command)
    }

    private fun performer(event: AnActionEvent) =
        PanelKeys.performerFor(event.getData(PlatformCoreDataKeys.CONTEXT_COMPONENT))
}

internal class NextTabAction : PanelKeyAction(PanelKeys.Command.NEXT_TAB)

internal class PreviousTabAction : PanelKeyAction(PanelKeys.Command.PREVIOUS_TAB)

internal class NewTabAction : PanelKeyAction(PanelKeys.Command.NEW_TAB)

internal class CloseTabAction : PanelKeyAction(PanelKeys.Command.CLOSE_TAB)

internal class ReopenTabAction : PanelKeyAction(PanelKeys.Command.REOPEN_TAB)

internal class QueueMessageAction : PanelKeyAction(PanelKeys.Command.QUEUE)

/** Continue in terminal for the tab on screen (see TerminalDesk) - unbound until somebody binds it in Keymap. */
internal class ContinueInTerminalAction : PanelKeyAction(PanelKeys.Command.TERMINAL)

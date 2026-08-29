package io.github.crmapache.amazingclaudecode.voice

import com.intellij.ide.IdeEventQueue
import com.intellij.openapi.Disposable
import com.intellij.openapi.components.Service
import com.intellij.openapi.components.service
import com.intellij.openapi.project.Project
import com.intellij.openapi.util.Disposer
import com.intellij.openapi.wm.WindowManager
import io.github.crmapache.amazingclaudecode.claude.ClaudePreferences
import java.awt.AWTEvent
import java.awt.KeyboardFocusManager
import java.awt.event.KeyEvent
import java.awt.event.MouseEvent
import java.awt.event.WindowEvent

/**
 * The keys that start dictation, and the screen that records them.
 *
 * Events are taken from the IDE's own queue rather than from a native hook, and that is the decision the
 * whole feature is shaped around. A system-wide hook would work with the IDE in the background, and it
 * costs: on macOS an Accessibility grant, on every platform a native binary, and in practice a licence -
 * the library everyone uses for it is GPL, which this plugin cannot take. The alternatives that are not
 * GPL do not report key releases at all, and without a release there is no push-to-talk. So the rule is
 * plain and says so on the settings screen: the hotkey works while the IDE has the keyboard.
 *
 * Taking events from the queue also lets a chord be swallowed. Ctrl+Shift+D held for five seconds would
 * otherwise fire whatever the keymap has on it, five seconds of dictation and an unrelated action at
 * once - so the dispatcher answers "handled" for the presses that are ours.
 */
@Service(Service.Level.APP)
internal class VoiceHotkeys : Disposable {

    /** A panel that can receive a dictation, by the project whose window it belongs to. */
    private val panels = mutableMapOf<Project, VoiceDictation.Sink>()

    /** What a capture ends with: a binding, or the reason it cannot be one. */
    private var capturing: ((Capture) -> Unit)? = null

    /**
     * Which device the screen is waiting for, while it is waiting.
     *
     * A slot takes one or the other and never both: the row asks for a chord in one half and for a mouse
     * button in the other. Listening for everything meant a thumb on a side button while "press a key"
     * was on screen bound that button as the keyboard hotkey - a binding whose own row said MOUSE beside
     * an empty slot, and which no keyboard could ever press.
     */
    private var wanted: Device = Device.KEYS

    /** A modifier is held and nothing else yet - it becomes a binding of its own if it is let go alone. */
    private var pendingModifier: HotkeyBinding.Keys? = null

    /**
     * The press we have just swallowed still has a character coming, and that character is ours too.
     *
     * A chord arrives as three events - pressed, typed, released - and only the first and the last carry
     * a key code. Swallowing those two left the middle one alone, so a hotkey of Option and F started a
     * dictation and typed the character that pair makes: the input field filled with ƒ every time
     * somebody spoke into it.
     *
     * Tied to the press rather than asked of the engine, because a typed event has nothing to ask about -
     * no code, no side, only the character. What identifies it is that it follows the press it belongs to.
     */
    private var swallowTyped = false

    sealed interface Capture {
        data class Bound(val binding: HotkeyBinding) : Capture
        /** A mouse button we will not bind - see [BINDABLE_BUTTONS]. */
        data object BadButton : Capture
        data object Cancelled : Capture
    }

    /** What a slot is bound with. Each slot takes one of the two, never both - see [wanted]. */
    enum class Device { KEYS, MOUSE }

    private val engine = HotkeyEngine(object : HotkeyEngine.Handlers {
        override fun start(mode: HotkeyEngine.Mode) = begin(mode)
        override fun stop(mode: HotkeyEngine.Mode) = VoiceDictation.getInstance().stop()
        override fun cancel() = VoiceDictation.getInstance().cancel()
        override fun running() = VoiceDictation.getInstance().running()
    })

    @Volatile
    private var listening = false

    /** The panel of this project is open and can be dictated into. */
    fun register(project: Project, sink: VoiceDictation.Sink, parent: Disposable) {
        panels[project] = sink
        Disposer.register(parent) { if (panels[project] === sink) panels.remove(project) }
        refresh()
    }

    /**
     * Re-reads the settings. Called whenever they change, and once when a panel opens.
     *
     * The dispatcher is added and removed rather than left in place with a flag: it sits on the path of
     * every key the IDE receives, and a feature nobody has configured has no business being there.
     */
    fun refresh() {
        val enabled = ClaudePreferences.voiceEnabled

        // Nothing bound at all while the feature is off, and that is what switching it off means here.
        // A dispatcher cannot be taken out again once it is in, so a chord left bound went on being
        // swallowed for a dictation that would never start: the action somebody has on Ctrl+Shift+D
        // quietly stopped working, and only restarting the IDE brought it back.
        engine.bind(
            if (enabled) {
                HotkeyEngine.Bindings(
                    push = keysOf(ClaudePreferences.voicePushHotkey),
                    hold = keysOf(ClaudePreferences.voiceHoldHotkey),
                    pushMouse = mouseOf(ClaudePreferences.voicePushMouse),
                    holdMouse = mouseOf(ClaudePreferences.voiceHoldMouse),
                )
            } else {
                HotkeyEngine.Bindings()
            },
        )

        // Capturing counts whatever the switch says: the screen offers "press a key" before the feature
        // has been turned on, and without a dispatcher nothing - not even Escape - could end that wait.
        val wanted = capturing != null || (enabled && !engine.idle())

        if (wanted && !listening) {
            listening = true
            IdeEventQueue.getInstance().addDispatcher(::dispatch, this)
        }
    }

    /**
     * The settings screen is waiting for a key. The next press is the binding, whatever it is.
     *
     * Escape cancels, because a screen that can only be left by pressing something is a screen that
     * takes a hotkey nobody wanted.
     */
    fun capture(device: Device, onCaptured: (Capture) -> Unit) {
        capturing = onCaptured
        wanted = device
        pendingModifier = null
        refresh()
    }

    fun stopCapturing() {
        capturing = null
        pendingModifier = null
    }

    override fun dispose() {
        panels.clear()
        capturing = null
    }

    /**
     * Every AWT event the IDE sees. Answering true swallows it.
     *
     * Deliberately cheap on the way out: this runs on the path of every keystroke in the editor, so the
     * ordinary case - a key that is not a hotkey while nothing is being captured - has to cost a type
     * check and a couple of comparisons.
     */
    private fun dispatch(event: AWTEvent): Boolean {
        if (event is WindowEvent && event.id == WindowEvent.WINDOW_LOST_FOCUS) {
            engine.windowLostFocus()
            return false
        }

        if (event is KeyEvent) return key(event)
        if (event is MouseEvent) return mouse(event)

        return false
    }

    private fun key(event: KeyEvent): Boolean {
        val waiting = capturing

        // The character of a press we took, and every character while a binding is being recorded - see
        // [swallowTyped] for why this cannot be decided on the event's own merits.
        if (event.id == KeyEvent.KEY_TYPED) return waiting != null || swallowTyped

        if (waiting != null) return captureKey(event, waiting)

        return when (event.id) {
            KeyEvent.KEY_PRESSED -> engine.keyDown(
                code = event.keyCode,
                location = event.keyLocation,
                ctrl = event.isControlDown,
                alt = event.isAltDown,
                shift = event.isShiftDown,
                meta = event.isMetaDown,
            ).also { swallowTyped = it }

            KeyEvent.KEY_RELEASED -> {
                swallowTyped = false
                engine.keyUp(event.keyCode, event.keyLocation)
            }

            else -> false
        }
    }

    private fun mouse(event: MouseEvent): Boolean {
        val waiting = capturing

        if (waiting != null) {
            // A keyboard slot is being recorded: a button is not an answer to that question, and it is
            // not ours to swallow either - the screen behind it has a button that stops the wait.
            if (wanted == Device.KEYS) return false

            if (event.id != MouseEvent.MOUSE_PRESSED) return false

            // The left button is never offered and the other main ones are refused on their merits: a
            // dictation bound to the right button would fire alongside every context menu.
            if (event.button !in BINDABLE_BUTTONS) {
                if (event.button == MouseEvent.BUTTON1) return false
                finish(waiting, Capture.BadButton)
                return true
            }

            finish(waiting, Capture.Bound(HotkeyBinding.Mouse(event.button)))
            return true
        }

        return when (event.id) {
            MouseEvent.MOUSE_PRESSED -> engine.mouseDown(event.button)
            MouseEvent.MOUSE_RELEASED -> engine.mouseUp(event.button)
            else -> false
        }
    }

    /**
     * Recording a binding.
     *
     * A modifier alone is a legitimate binding and the only one that never collides with the keymap, so
     * it cannot be committed on the press - at that instant there is no telling "the right Option" from
     * the beginning of "the right Option and D". It is committed when the modifier is let go with
     * nothing else having been pressed, which is exactly what the person's hand just described.
     */
    private fun captureKey(event: KeyEvent, waiting: (Capture) -> Unit): Boolean {
        when (event.id) {
            KeyEvent.KEY_PRESSED -> {
                // The character of this press lands after the recording has already finished, when
                // nothing here is waiting for a key any more - see [swallowTyped].
                swallowTyped = true

                if (event.keyCode == KeyEvent.VK_ESCAPE) {
                    finish(waiting, Capture.Cancelled)
                    return true
                }

                // A mouse slot is being recorded: a key binds nothing here, but it is still swallowed.
                // Whoever is waiting for a button has their hand on the mouse, and a letter that got
                // through would land in the editor underneath.
                if (wanted == Device.MOUSE) return true

                if (isModifierKey(event.keyCode)) {
                    pendingModifier = HotkeyBinding.Keys(event.keyCode, event.keyLocation)
                    return true
                }

                pendingModifier = null
                finish(
                    waiting,
                    Capture.Bound(
                        HotkeyBinding.Keys(
                            code = event.keyCode,
                            location = event.keyLocation,
                            ctrl = event.isControlDown,
                            alt = event.isAltDown,
                            shift = event.isShiftDown,
                            meta = event.isMetaDown,
                        ),
                    ),
                )
                return true
            }

            KeyEvent.KEY_RELEASED -> {
                swallowTyped = false

                val held = pendingModifier
                if (held != null && held.code == event.keyCode && held.location == event.keyLocation) {
                    pendingModifier = null
                    finish(waiting, Capture.Bound(held))
                }
                return true
            }

            else -> return true
        }
    }

    private fun finish(waiting: (Capture) -> Unit, capture: Capture) {
        capturing = null
        pendingModifier = null
        waiting(capture)
        refresh()
    }

    /**
     * Starts a dictation in the panel of whichever project is in front.
     *
     * A panel that is not open is not a case this can be in. The dispatcher these events arrive through
     * is only ever installed by a panel opening (see [register]), and the project is looked for among the
     * panels themselves (see [activeProject]) - so by the time a press gets this far there is a panel to
     * put the words into.
     *
     * There used to be a second branch here that opened the tool window and started the dictation in the
     * callback, and a comment promising exactly that. It could not run, and nothing said so: what a
     * person got instead, before their first panel, was a hotkey that did nothing at all.
     */
    private fun begin(mode: HotkeyEngine.Mode) {
        val project = activeProject() ?: return
        val sink = panels[project] ?: return

        VoiceDictation.getInstance().start(mode, sink)
    }

    /**
     * Which project the keyboard is in.
     *
     * By the focused window rather than by "the last project that did something": with two IDE windows
     * open, the words belong to the one being typed in, and anything else would put a dictation into a
     * conversation on another screen.
     */
    private fun activeProject(): Project? {
        val active = KeyboardFocusManager.getCurrentKeyboardFocusManager().activeWindow

        val focused = panels.keys.firstOrNull { project ->
            val frame = WindowManager.getInstance().getFrame(project)
            frame != null && (frame === active || (active != null && frame.isAncestorOf(active)))
        }

        // One window is the ordinary case, and there the answer is never in doubt even when the focus
        // sits in a dialog the window manager reports as something else.
        return focused ?: panels.keys.singleOrNull()
    }

    private fun keysOf(stored: String): HotkeyBinding.Keys? = HotkeyBinding.parse(stored) as? HotkeyBinding.Keys

    private fun mouseOf(stored: String): HotkeyBinding.Mouse? = HotkeyBinding.parse(stored) as? HotkeyBinding.Mouse

    companion object {

        fun getInstance(): VoiceHotkeys = service()

        /**
         * The mouse buttons a dictation may be bound to: the side ones.
         *
         * The left button is the interface itself. The middle and the right ones already mean something
         * everywhere in the IDE - paste, a context menu - and a dictation riding along with them would be
         * a feature that fires by accident all day. The side buttons mean nothing to anybody, which is
         * exactly why a hand reaches for them.
         */
        val BINDABLE_BUTTONS = 4..HotkeyBinding.MAX_MOUSE_BUTTON
    }
}

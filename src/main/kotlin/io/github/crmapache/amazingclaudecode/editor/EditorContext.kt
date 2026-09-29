package io.github.crmapache.amazingclaudecode.editor

import com.intellij.openapi.Disposable
import com.intellij.openapi.application.ApplicationManager
import com.intellij.openapi.application.ModalityState
import com.intellij.openapi.components.Service
import com.intellij.openapi.components.service
import com.intellij.openapi.editor.Document
import com.intellij.openapi.editor.Editor
import com.intellij.openapi.editor.EditorFactory
import com.intellij.openapi.editor.event.DocumentEvent
import com.intellij.openapi.editor.event.DocumentListener
import com.intellij.openapi.editor.event.SelectionEvent
import com.intellij.openapi.editor.event.SelectionListener
import com.intellij.openapi.fileEditor.FileDocumentManager
import com.intellij.openapi.fileEditor.FileEditorManager
import com.intellij.openapi.fileEditor.FileEditorManagerEvent
import com.intellij.openapi.fileEditor.FileEditorManagerListener
import com.intellij.openapi.project.Project
import com.intellij.openapi.util.Disposer
import com.intellij.openapi.util.TextRange
import com.intellij.openapi.vfs.VirtualFile
import com.intellij.util.Alarm
import java.util.concurrent.CopyOnWriteArrayList
import java.util.concurrent.atomic.AtomicReference
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.buildJsonObject
import kotlinx.serialization.json.put

/**
 * What the editor beside the panel is showing: the file in front of the person, and the lines selected in
 * it - handed to the agent with a message, the way Claude Code does it in a terminal connected to the IDE.
 *
 * Asked for in feedback in those very words: the terminal "adds the open file or selected lines into the
 * context of the conversation automatically", and the panel did not. What a person selects before asking
 * "why is this slow?" is what the question is about, and without it the agent answered about something else
 * or asked which code was meant.
 *
 * Kept up to date as it changes rather than read at the moment of sending, and that is a matter of threads
 * rather than taste: a message arrives on whichever thread carried it in, the editor's selection may be read
 * on the interface thread only, and waiting for that thread from a message's would stall a turn behind
 * whatever the IDE happens to be drawing (see UnsavedEdits, which pays exactly that price because a save has
 * no other way). The copy here is at most [SETTLE_MS] behind the editor, and nobody sends a message that
 * fast after selecting - the hand has to travel to the panel first.
 */
@Service(Service.Level.PROJECT)
internal class EditorContext(private val project: Project) : Disposable {

    /** The file in front of the person, as the agent is told about it. */
    data class Snapshot(
        /** From the project's root, or whole for a file outside it (see SelectionReference.relativePath). */
        val path: String,
        /** What the panel's chip shows - a path is too long for it, and the name is what the tab says. */
        val name: String,
        /** Null when nothing is selected: then the agent hears which file is open and nothing more. */
        val selection: Selection?,
    )

    data class Selection(
        /** Lines from one, the way the editor's gutter numbers them. */
        val startLine: Int,
        val endLine: Int,
        /** The selected text itself, or null when there is more of it than a message should carry. */
        val text: String?,
    )

    private val current = AtomicReference<Snapshot?>(null)
    private val listeners = CopyOnWriteArrayList<(Snapshot?) -> Unit>()
    private val settle = Alarm(Alarm.ThreadToUse.SWING_THREAD, this)

    /** The document the snapshot was read from - typing into it can change the selected text. */
    @Volatile
    private var watchedDocument: Document? = null

    @Volatile
    private var started = false

    /** What the editor showed a moment ago. Safe from any thread - see the class's note. */
    fun now(): Snapshot? = current.get()

    /**
     * Hear about every change for as long as [parent] lives, starting with the state right now. Called by a
     * panel as it opens: nothing is watched in a project nobody has a panel in.
     */
    fun watch(parent: Disposable, listener: (Snapshot?) -> Unit) {
        start()
        listeners += listener
        Disposer.register(parent) { listeners -= listener }
        listener(current.get())
    }

    private fun start() {
        if (started) return
        started = true

        ApplicationManager.getApplication().invokeLater(
            {
                if (project.isDisposed) return@invokeLater

                project.messageBus.connect(this).subscribe(
                    FileEditorManagerListener.FILE_EDITOR_MANAGER,
                    object : FileEditorManagerListener {
                        override fun selectionChanged(event: FileEditorManagerEvent) = schedule()

                        override fun fileClosed(source: FileEditorManager, file: VirtualFile) = schedule()
                    },
                )

                val multicaster = EditorFactory.getInstance().eventMulticaster
                multicaster.addSelectionListener(
                    object : SelectionListener {
                        override fun selectionChanged(event: SelectionEvent) {
                            if (event.editor.project == project) schedule()
                        }
                    },
                    this,
                )
                // Only while something is selected: the text sent is the text selected, and typing inside
                // the selection changes it without the selection itself being reported as changed. With
                // nothing selected the file's name is all there is, and a keystroke cannot change that.
                multicaster.addDocumentListener(
                    object : DocumentListener {
                        override fun documentChanged(event: DocumentEvent) {
                            if (event.document === watchedDocument && current.get()?.selection != null) schedule()
                        }
                    },
                    this,
                )

                refresh()
            },
            ModalityState.any(),
        )
    }

    /**
     * Read the editor again once it has settled. A drag across forty lines is forty selection events, and the
     * panel needs the last of them, not a message for each.
     */
    private fun schedule() {
        settle.cancelAllRequests()
        settle.addRequest(::refresh, SETTLE_MS)
    }

    private fun refresh() {
        if (project.isDisposed) return

        val editor = FileEditorManager.getInstance(project).selectedTextEditor
        watchedDocument = editor?.document
        val next = editor?.let(::snapshotOf)
        val before = current.getAndSet(next)
        if (next != before) listeners.forEach { it(next) }
    }

    private fun snapshotOf(editor: Editor): Snapshot? {
        val file = FileDocumentManager.getInstance().getFile(editor.document) ?: return null
        // A file the agent could not open: an entry inside a jar, a scratch in memory, a remote file.
        if (!file.isInLocalFileSystem) return null

        return Snapshot(
            path = SelectionReference.relativePath(project, file),
            name = file.name,
            selection = selectionOf(editor),
        )
    }

    private fun selectionOf(editor: Editor): Selection? {
        val model = editor.selectionModel
        if (!model.hasSelection()) return null

        val document = editor.document
        val start = model.selectionStart
        val end = model.selectionEnd
        if (end <= start) return null

        val startLine = document.getLineNumber(start)
        // A selection ending at the start of a line does not take that line: a triple click takes the
        // newline with it, and the range would slide a line forward (the same rule as SelectionReference).
        val rawEndLine = document.getLineNumber(end)
        val endLine = if (rawEndLine > startLine && end == document.getLineStartOffset(rawEndLine)) rawEndLine - 1 else rawEndLine

        val text = if (end - start <= MAX_SELECTION_CHARS) document.getText(TextRange(start, end)) else null
        return Selection(startLine + 1, endLine + 1, text)
    }

    override fun dispose() {
        listeners.clear()
    }

    companion object {
        fun getInstance(project: Project): EditorContext = project.service()

        /** How long the editor has to stay still before it is read again. */
        const val SETTLE_MS = 150

        /**
         * How much selected text travels with a message. About five thousand tokens - a screenful of code
         * several times over. Past it the agent is told which lines were selected and reads them itself:
         * a whole file selected by Ctrl+A is a request to look at the file, not to paste it into every
         * message sent while it stays selected.
         */
        const val MAX_SELECTION_CHARS = 20_000

        /**
         * The words the agent reads, in the form Claude Code itself uses for the same thing - a model trained
         * on the terminal knows that shape, and "may or may not be related" is what keeps an unrelated file
         * left open from steering the answer.
         */
        fun reminder(snapshot: Snapshot): String {
            val selection = snapshot.selection
            val body = when {
                selection == null ->
                    "The user opened the file ${snapshot.path} in the IDE. $MAYBE"

                selection.text == null ->
                    "The user selected the lines ${selection.startLine} to ${selection.endLine} from " +
                        "${snapshot.path} in the IDE - too long to include here, read the file for them. $MAYBE"

                else ->
                    "The user selected the lines ${selection.startLine} to ${selection.endLine} from " +
                        "${snapshot.path}:\n${selection.text}\n\n$MAYBE"
            }

            return "<system-reminder>\n$body\n</system-reminder>"
        }

        private const val MAYBE = "This may or may not be related to the current task."

        /**
         * The same thing as the panel draws it: the chip in the field and the line on a sent message's card -
         * the path, the name, and the lines when there are any. The selected text stays here; the screen has
         * no use for it, and a phone that is echoed the card would carry it for nothing.
         */
        fun descriptor(snapshot: Snapshot): JsonObject = buildJsonObject {
            put("path", snapshot.path)
            put("name", snapshot.name)
            snapshot.selection?.let {
                put("from", it.startLine)
                put("to", it.endLine)
            }
        }
    }
}

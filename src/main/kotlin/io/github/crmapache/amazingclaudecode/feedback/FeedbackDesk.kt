package io.github.crmapache.amazingclaudecode.feedback

import com.intellij.openapi.application.ApplicationManager
import com.intellij.openapi.fileChooser.FileChooser
import com.intellij.openapi.fileChooser.FileChooserDescriptor
import com.intellij.openapi.project.Project
import io.github.crmapache.amazingclaudecode.claude.ClaudePreferences
import io.github.crmapache.amazingclaudecode.claude.ClaudeSessionHub
import kotlinx.serialization.json.add
import kotlinx.serialization.json.buildJsonObject
import kotlinx.serialization.json.put
import kotlinx.serialization.json.putJsonArray
import java.nio.file.Path

/**
 * The IDE's side of the feedback screen: the picked files, the report, and the one request that leaves
 * this machine.
 *
 * It lives with the panel's window rather than with the conversation hub, and that placement is the
 * point. Everything about a conversation goes through SessionCommands, which is also the door a paired
 * phone comes in by; this goes through the window's own handler instead, where a remote client does not
 * arrive at all (see ClaudePanel). A message that makes the IDE read files off the disk and post them to
 * a server should be unreachable from outside by construction, not only by being on a list - though it is
 * on that list too (see RemoteCommands).
 */
internal class FeedbackDesk(
    private val project: Project,
    private val hub: ClaudeSessionHub,
    /** How an answer gets back to the panel - the window's own channel, not the conversation's journal. */
    private val answer: (String) -> Unit,
) {

    private val attachments = FeedbackAttachments()

    /**
     * The screen has been opened. Two things are handed over: the address kept from last time, and
     * whatever files are still picked - a person who opened the screen, went to look something up and came
     * back should find their list where they left it.
     */
    fun opened() {
        // The CLI's version costs a process, so it is started now: by the time the report is asked for it
        // will be there, and nobody waits on a screen for it.
        FeedbackEnvironment.warmUp(project.basePath)
        sendState(null)
    }

    /** The report, built afresh. */
    fun report(sessionId: String) {
        val text = reportFor(sessionId, FeedbackEnvironment.lines())

        answer(buildJsonObject { put("type", "feedbackLog"); put("text", text) }.toString())
    }

    /**
     * The report for one conversation - the one place it is built.
     *
     * One place rather than two, because the preview and the send used to call this separately: add a
     * fourth part to the report, forget one of the two, and the preview shows something other than what
     * travels. That preview is the whole of what this screen promises, so the two must be the same string
     * by construction rather than by both being kept up to date.
     */
    private fun reportFor(sessionId: String, environment: List<String>): String =
        FeedbackReport.build(
            environment = environment,
            journal = hub.journalTail(sessionId, JOURNAL_ENTRIES, JOURNAL_CHARS),
            events = DiagnosticsLog.getInstance().tail(),
        )

    /**
     * Pick files through the IDE's own dialog rather than the browser's.
     *
     * The panel has no file input anywhere on the desktop, and this is not the place to introduce one: the
     * IDE's dialog already knows this machine, and - more to the point - a native dialog hands back paths
     * to the plugin, while a browser input would hand bytes to the page and make them cross the bridge
     * twice for no reason (see FeedbackSender for why that bridge is avoided).
     */
    fun attach() {
        if (attachments.full()) {
            sendState("The list is full - ${FeedbackAttachments.MAX_FILES} files is the most that can go.")
            return
        }

        ApplicationManager.getApplication().invokeLater {
            // Files only, several at a time, no folders: a folder is not a thing that can be attached, and
            // offering to choose one only produces a refusal a moment later.
            val descriptor = FileChooserDescriptor(true, false, true, true, false, true)
                .withTitle("Attach files to your feedback")

            FileChooser.chooseFiles(descriptor, project, null) { chosen ->
                val paths = chosen.mapNotNull { file -> runCatching { Path.of(file.path) }.getOrNull() }
                sendState(attachments.add(paths))
            }
        }
    }

    fun detach(id: String) {
        attachments.remove(id)
        sendState(null)
    }

    /**
     * Send it.
     *
     * The address is remembered before the request rather than after it: it is what a person typed, and
     * whether the network happened to work has nothing to do with whether they meant it.
     */
    fun send(kind: String, sessionId: String, text: String, email: String, logs: Boolean) {
        ClaudePreferences.feedbackEmail = email

        // Read once and passed on: the sender needs the same lines for the message's own first line, and
        // one of the four costs a process to find out (the CLI's version - see FeedbackEnvironment).
        val environment = FeedbackEnvironment.lines()
        val report = if (logs) reportFor(sessionId, environment) else null
        val outgoing = attachments.readyToSend()

        FeedbackSender.send(
            kind = kind,
            text = text,
            email = email,
            environment = environment.joinToString(" · "),
            report = report,
            files = outgoing.files,
        ) { outcome ->
            if (outcome.ok) {
                // The list goes with the message it was attached to. Leaving it would mean the next piece
                // of feedback quietly carrying the previous one's files.
                attachments.clear()
                sendState(null)
            }

            answer(
                buildJsonObject {
                    put("type", "feedbackSent")
                    put("ok", outcome.ok)
                    outcome.error?.let { put("error", it) }
                    // What did not go, said out loud on the way back: "sent, thank you" over a message
                    // whose main attachment was left behind is worse than an outright failure.
                    if (outcome.ok && outgoing.left.isNotEmpty()) {
                        put("note", "Left behind: " + outgoing.left.joinToString(", ") + ".")
                    }
                }.toString(),
            )
        }
    }

    private fun sendState(note: String?) {
        answer(
            buildJsonObject {
                put("type", "feedbackState")
                put("email", ClaudePreferences.feedbackEmail)
                putJsonArray("attachments") {
                    attachments.list().forEach { file ->
                        add(
                            buildJsonObject {
                                put("id", file.id)
                                put("name", file.name)
                                put("bytes", file.bytes)
                            },
                        )
                    }
                }
                note?.let { put("note", it) }
            }.toString(),
        )
    }

    private companion object {
        /**
         * How much of the journal the report looks at. A few hundred entries is the last several minutes
         * of a conversation, which is where a bug that has just been noticed lives - and the ceiling in
         * characters is there because a handful of entries carrying whole files outweighs a great many
         * small ones.
         */
        const val JOURNAL_ENTRIES = 400
        const val JOURNAL_CHARS = 2L * 1024 * 1024
    }
}

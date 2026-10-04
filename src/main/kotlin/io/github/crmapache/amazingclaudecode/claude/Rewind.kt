package io.github.crmapache.amazingclaudecode.claude

import kotlinx.serialization.json.JsonArray
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.JsonObjectBuilder
import kotlinx.serialization.json.JsonPrimitive
import kotlinx.serialization.json.booleanOrNull
import kotlinx.serialization.json.buildJsonObject
import kotlinx.serialization.json.contentOrNull
import kotlinx.serialization.json.intOrNull
import kotlinx.serialization.json.put
import kotlinx.serialization.json.putJsonArray
import kotlinx.serialization.json.putJsonObject

/**
 * Cutting a conversation back to one of the person's messages - what `/rewind` (Esc Esc) does in a
 * terminal, which is a screen of its own there and does not run in a stream at all.
 *
 * The CLI has two control requests for a thin client, and the panel goes through them rather than through
 * anything of its own. Recorded off live runs on 2.1.280 with the flags the panel launches with:
 *
 * - `rewind_conversation` takes `target_message_uuid` - the message to drop, together with everything
 *   after it - and answers `{rewound: true, prefillText, targetMessageUuid, precedingAssistantUuid}`. The
 *   agent asked afterwards remembers only what came before. Refused, it still answers with success, as
 *   `{rewound: false, reason, error}` (see [Refusal]).
 * - Without `last_seen_user_message_uuid` only the newest message can be the target: anything later than
 *   the target refuses as `stale_target`. With it, a later message the client has seen is fine, and one it
 *   has not is `unseen_later_turn` - which is how a phone's message, sent while the dialog stood open at
 *   the desk, stops a rewind instead of being thrown away unread.
 * - A running turn refuses (`turn_running`) unless `interrupt_if_running` is set; then the turn is stopped
 *   and cut in the same breath, and NO `result` ever comes for it - the stream simply goes quiet. Whoever
 *   asked has to end the turn on its own side (see ClaudeSession.rewind).
 * - It writes `{"type":"last-prompt","leafUuid":…,"rewound":true}` into the transcript and leaves the cut
 *   lines where they are; a later message hangs off the line before the target. The CLI reads the file by
 *   that chain and resumes onto the cut conversation; anything reading it line by line has to be told
 *   (see TranscriptRewinds).
 * - A process raised over the transcript with `--resume` rewinds to messages of the processes before it.
 * - `rewind_files` takes `user_message_id` and puts every file the agent's own file tools touched since
 *   that message back the way it was; with `dry_run` it only says which and how much. It works only when
 *   the process was launched with file checkpointing on (see ClaudeLaunch.environment), and it still works
 *   after the conversation has been cut back past the same message.
 *
 * The message is named by the uuid the panel gave it when it was sent (see ClaudeSession.userMessage) -
 * the CLI takes a client's uuid for its own line - or by the transcript's own uuid for one read off disk.
 * This object only reads and writes the shapes; the conversation does the asking.
 */
internal object Rewind {

    const val CONVERSATION = "rewind_conversation"

    const val FILES = "rewind_files"

    /**
     * Why a rewind did not happen, as the panel words it - several of the CLI's reasons are one thing to a
     * person reading the dialog.
     */
    enum class Refusal(val wire: String) {
        /** Something is still being said: a turn the interrupt could not stop, a message queued inside the CLI. */
        BUSY("busy"),

        /** The CLI does not hold the message any more - a compaction folded it away, or it never got there. */
        GONE("gone"),

        /** The conversation moved on while the person was deciding: a message nobody here has seen yet. */
        MOVED("moved"),

        /** The message sits inside work that cannot be cut in two - a tool call and its answer. */
        MID_CALL("midCall"),

        /** The CLI could not write the cut down, so it did not make it. */
        NOT_SAVED("notSaved"),

        /** The code part was asked for and cannot be done - see [Code]. Nothing was touched. */
        CODE("code"),

        /** This version of Claude Code does not know the request at all. */
        UNSUPPORTED("unsupported"),

        /** There is no process to ask, and none could be raised. */
        NO_PROCESS("noProcess"),

        /**
         * The process went while the rewind was out - stopped, restarted, moved to another account. Whether the
         * CLI got as far as writing the cut down is not known, so the panel cuts nothing and says so.
         */
        ENDED("ended"),

        /** Anything else the CLI said - its own words travel beside it. */
        OTHER("other");

        companion object {
            /** The CLI's reason, out of `{rewound: false, reason}`. */
            fun of(reason: String?): Refusal = when (reason) {
                "turn_running", "prompt_pending", "commands_queued", "state_changed" -> BUSY
                "target_not_found" -> GONE
                "stale_target", "unseen_later_turn" -> MOVED
                "target_splits_tool_call", "poll_tool_result_target", "delivered_poll_events_in_range" -> MID_CALL
                "persist_failed" -> NOT_SAVED
                else -> OTHER
            }

            /**
             * An error answer of the control channel rather than a refusal in the answer's body: a CLI that
             * does not know the subtype says so in words, and a channel with no process says its own.
             */
            fun ofError(message: String): Refusal = when {
                message == SideQuestion.NO_SESSION -> NO_PROCESS
                message == AwaitedControls.PROCESS_ENDED -> ENDED
                message.contains("Unknown", ignoreCase = true) || message.contains("unsupported", ignoreCase = true) -> UNSUPPORTED
                else -> OTHER
            }
        }
    }

    /** How the conversation part came out. */
    sealed interface Cut {
        /** [prefill] is the dropped message's text as the CLI kept it - what a field without chips gets back. */
        data class Done(val prefill: String) : Cut

        data class Refused(val refusal: Refusal, val detail: String) : Cut
    }

    /** The body of a successful `rewind_conversation` answer. */
    fun cutOf(response: JsonObject): Cut {
        if ((response["rewound"] as? JsonPrimitive)?.booleanOrNull == true) {
            return Cut.Done((response["prefillText"] as? JsonPrimitive)?.contentOrNull.orEmpty())
        }

        val reason = (response["reason"] as? JsonPrimitive)?.contentOrNull
        val error = (response["error"] as? JsonPrimitive)?.contentOrNull.orEmpty()
        return Cut.Refused(Refusal.of(reason), error.ifEmpty { reason.orEmpty() })
    }

    /**
     * A cut refused because a message written into the running turn sits unread in the CLI - measured on
     * 2.1.280: until the agent's next step takes it, `rewind_conversation` answers `commands_queued` whether or
     * not it was asked to stop the turn. Stopping the turn first makes the CLI take that message as a turn of
     * its own, which the next attempt stops and cuts with the rest (see ClaudeSession.cut). Said to the person
     * as "busy, try again", it read as a hang - and trying again changed nothing until the agent moved on.
     */
    fun waitsOnUnread(response: JsonObject): Boolean =
        (response["reason"] as? JsonPrimitive)?.contentOrNull in UNREAD_REASONS

    private val UNREAD_REASONS = setOf("commands_queued", "prompt_pending")

    /** What the files since a message come to - what the dialog offers before anything is touched. */
    sealed interface Code {
        /** The files the agent changed since then, and by how much. */
        data class Ready(val files: List<String>, val insertions: Int, val deletions: Int) : Code

        /** Nothing the agent's file tools touched since then. */
        data object None : Code

        /** The setting is off in Claude Code's own settings - the panel does not ask a process at all. */
        data object Off : Code

        /**
         * The process is not keeping copies - it was raised before the setting was on, or by a plugin that
         * did not yet ask for them. A new process over the same conversation keeps them from then on.
         */
        data object NotTracked : Code

        /** The message itself went out while nothing was being kept: an older one, an older conversation. */
        data object NoCheckpoint : Code

        /** The CLI could not answer - [detail] is its own words. */
        data class Unavailable(val detail: String) : Code
    }

    /** A `rewind_files` answer with `dry_run`. */
    fun codeOf(response: JsonObject): Code {
        val can = (response["canRewind"] as? JsonPrimitive)?.booleanOrNull == true
        if (!can) {
            val error = (response["error"] as? JsonPrimitive)?.contentOrNull.orEmpty()
            return when {
                error.startsWith("File rewinding is not enabled") -> Code.NotTracked
                error.startsWith("No file checkpoint found") -> Code.NoCheckpoint
                else -> Code.Unavailable(error)
            }
        }

        val files = (response["filesChanged"] as? JsonArray).orEmpty()
            .mapNotNull { (it as? JsonPrimitive)?.contentOrNull }
            .filter { it.isNotBlank() }
        if (files.isEmpty()) return Code.None

        return Code.Ready(
            files = files,
            insertions = (response["insertions"] as? JsonPrimitive)?.intOrNull ?: 0,
            deletions = (response["deletions"] as? JsonPrimitive)?.intOrNull ?: 0,
        )
    }

    /** An error answer of the control channel to a `rewind_files`, read the way [codeOf] reads a refusal. */
    fun codeOfError(message: String): Code = when (Refusal.ofError(message)) {
        Refusal.UNSUPPORTED -> Code.NotTracked
        else -> Code.Unavailable(message)
    }

    /**
     * Why the code cannot be put back, as the detail of a [Refusal.CODE] - the preview's own state name,
     * so the panel words it the same way the dialog did, or the CLI's words when it said something else.
     */
    fun detailOf(code: Code): String = when (code) {
        is Code.Unavailable -> code.detail
        Code.NotTracked -> "notTracked"
        Code.NoCheckpoint -> "noCheckpoint"
        Code.Off -> "off"
        Code.None -> "none"
        is Code.Ready -> ""
    }

    /**
     * [code] with its files said from [root] when they are inside it, and from `~` when they are elsewhere
     * under [home] - see ClaudeSessionHub.previewRewind. The second is not rare: the agent's memory lives
     * under `~/.claude`, and its notes are written with the same edit tools as the code. Either separator,
     * since on Windows the CLI says its paths with its own.
     *
     * Only the preview: the files read again after a restore need the whole path, and get it from the CLI.
     */
    fun relativeTo(code: Code, root: String?, home: String? = System.getProperty("user.home")): Code {
        if (code !is Code.Ready) return code
        return code.copy(
            files = code.files.map { file ->
                inside(file, root) ?: inside(file, home)?.let { "~" + file[file.length - it.length - 1] + it } ?: file
            },
        )
    }

    /**
     * What is left of [file] past [folder] and the separator after it - null when it is not inside. The two
     * are compared with their separators made one: on Windows the IDE says the project's folder with `/`
     * and the CLI says its files with `\`, and a drive letter may come in either case.
     */
    private fun inside(file: String, folder: String?): String? {
        if (folder.isNullOrEmpty()) return null
        val base = folder.replace('\\', '/').trimEnd('/')
        val plain = file.replace('\\', '/')
        if (base.isEmpty() || plain.length <= base.length + 1 || plain[base.length] != '/') return null
        if (!plain.startsWith(base, ignoreCase = DRIVE.matches(base))) return null
        return file.substring(base.length + 1)
    }

    private val DRIVE = Regex("^[A-Za-z]:.*")

    /** A `rewind_files` answer without `dry_run`: null when the files are back, the CLI's words when not. */
    fun restoredOf(response: JsonObject): String? {
        if ((response["canRewind"] as? JsonPrimitive)?.booleanOrNull == true) return null
        return (response["error"] as? JsonPrimitive)?.contentOrNull?.ifEmpty { null } ?: "not restored"
    }

    /** What the code part of a rewind came to, once the conversation part is settled. */
    enum class Files(val wire: String) {
        /** Not asked for. */
        SKIPPED("skipped"),

        /** Put back. */
        RESTORED("restored"),

        /** Asked for, checked beforehand, and still refused when it came to it - the conversation went anyway. */
        FAILED("failed"),
    }

    /** What the whole rewind came to - the asker's answer (see [outcomeJson]). */
    sealed interface Outcome {
        /**
         * [conversation] - the messages were dropped; [prefill] is the dropped message's text then. [changed]
         * is the files put back, for the IDE to read again.
         */
        data class Done(
            val conversation: Boolean,
            val prefill: String,
            val files: Files,
            val changed: List<String>,
            val filesDetail: String = "",
        ) : Outcome

        data class Refused(val refusal: Refusal, val detail: String) : Outcome
    }

    /**
     * Whether [text] is a uuid in the shape the CLI writes and accepts - the only thing a client may name a
     * message by. Anything else is not passed on: it goes into the process's stdin and the CLI's matching.
     */
    fun isUuid(text: String?): Boolean = text != null && UUID.matches(text)

    private val UUID = Regex("[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}")

    /** The answer to the dialog opening: what restoring the code would put back. */
    fun previewJson(sessionId: String, uuid: String, code: Code): String = buildJsonObject {
        put("type", "rewindPreview")
        put("sessionId", sessionId)
        put("uuid", uuid)
        putJsonObject("code") { writeCode(this, code) }
    }.toString()

    private fun writeCode(builder: JsonObjectBuilder, code: Code) {
        when (code) {
            is Code.Ready -> {
                builder.put("state", "ready")
                builder.putJsonArray("files") { code.files.take(MAX_FILES_LISTED).forEach { add(JsonPrimitive(it)) } }
                builder.put("count", code.files.size)
                builder.put("insertions", code.insertions)
                builder.put("deletions", code.deletions)
            }
            Code.None -> builder.put("state", "none")
            Code.Off -> builder.put("state", "off")
            Code.NotTracked -> builder.put("state", "notTracked")
            Code.NoCheckpoint -> builder.put("state", "noCheckpoint")
            is Code.Unavailable -> {
                builder.put("state", "unavailable")
                builder.put("detail", code.detail)
            }
        }
    }

    /**
     * How many paths the preview carries at most. A rewind over a long turn can touch hundreds, a phone's
     * frame is 256 KB, and the dialog shows a handful with the count beside them anyway.
     */
    const val MAX_FILES_LISTED = 40

    /** The answer to whoever pressed the button - and only to them: the field the message goes back into is theirs. */
    fun outcomeJson(sessionId: String, uuid: String, outcome: Outcome): String = buildJsonObject {
        put("type", "rewindOutcome")
        put("sessionId", sessionId)
        put("uuid", uuid)
        when (outcome) {
            is Outcome.Done -> {
                put("ok", true)
                put("conversation", outcome.conversation)
                put("prefill", outcome.prefill)
                put("files", outcome.files.wire)
                if (outcome.filesDetail.isNotEmpty()) put("detail", outcome.filesDetail)
            }
            is Outcome.Refused -> {
                put("ok", false)
                put("reason", outcome.refusal.wire)
                if (outcome.detail.isNotEmpty()) put("detail", outcome.detail)
            }
        }
    }.toString()

    /**
     * The conversation was cut at [uuid], said to every client and into the journal: each one drops that
     * message and everything after it from its feed, and a feed rebuilt later finds the journal already cut
     * (see ClaudeSessionHub.rewind). [fromSeq] is where the journal's cut began (see SessionJournal.cutFrom):
     * a client without the message that held anything numbered from there on holds only what came after it.
     */
    /**
     * Code a fork was to take along (the dialog's "In a new tab" with both chosen) and could not put back, said
     * into the parent tab's feed as a code the panel words - the dialog is gone by then. `FORK_CODE|reason|detail`
     * (see forkCodeOf in feed/rewind.ts).
     */
    fun forkCodeError(outcome: Outcome.Refused): String = "FORK_CODE|${outcome.refusal.wire}|${outcome.detail}"

    fun rewoundJson(sessionId: String, uuid: String, fromSeq: Long): String = buildJsonObject {
        put("type", "rewound")
        put("sessionId", sessionId)
        put("uuid", uuid)
        put("fromSeq", fromSeq)
    }.toString()
}

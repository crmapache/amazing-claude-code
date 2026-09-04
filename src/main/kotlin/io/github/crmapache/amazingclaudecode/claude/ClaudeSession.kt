package io.github.crmapache.amazingclaudecode.claude

import com.intellij.execution.configurations.GeneralCommandLine
import com.intellij.execution.process.OSProcessHandler
import com.intellij.execution.process.ProcessEvent
import com.intellij.execution.process.ProcessListener
import com.intellij.execution.process.ProcessOutputTypes
import com.intellij.openapi.Disposable
import com.intellij.openapi.diagnostic.thisLogger
import com.intellij.openapi.util.Key
import com.intellij.util.concurrency.AppExecutorUtil
import io.github.crmapache.amazingclaudecode.claude.accounts.ClaudeAccounts
import io.github.crmapache.amazingclaudecode.feedback.DiagnosticsLog
import java.nio.file.Path
import java.util.UUID
import java.util.concurrent.ConcurrentHashMap
import java.util.concurrent.TimeUnit
import kotlinx.serialization.json.Json
import kotlinx.serialization.json.JsonArray
import kotlinx.serialization.json.JsonNull
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.JsonObjectBuilder
import kotlinx.serialization.json.addJsonObject
import kotlinx.serialization.json.buildJsonObject
import kotlinx.serialization.json.contentOrNull
import kotlinx.serialization.json.jsonObject
import kotlinx.serialization.json.jsonPrimitive
import kotlinx.serialization.json.put
import kotlinx.serialization.json.putJsonArray
import kotlinx.serialization.json.putJsonObject

/** An image pasted into the input field from the clipboard: bytes, not a path on disk. */
internal data class ImageAttachment(val mediaType: String, val data: String)

/**
 * One conversation with the agent = one long-lived claude process in streaming mode.
 *
 * The process comes up lazily, on the first prompt: an open panel on its own should start nothing.
 * While the process lives, the conversation's context is kept, so the talk can continue without any
 * session-resuming flags.
 *
 * Besides ordinary messages the process has a control channel: requests such as changing the
 * permission mode or reading the subscription windows travel over the same stream. Without it the mode
 * could only be changed by a restart.
 */
internal class ClaudeSession(
    private val workingDirectory: String?,
    /**
     * The conversation this one branches off. A branch gets the parent's whole transcript and an
     * identifier of its own, so continuing inside it leaves the parent untouched.
     *
     * Readable from outside for one reason: a fork nobody has spoken in yet owes its whole conversation
     * to this parent and to nothing else, so a tab replaced under it - an account chosen, say - has to
     * be raised as a fork again (see ClaudeSessions.switchAllTo).
     */
    val forkFrom: String? = null,
    /** A past conversation being continued: it comes up with its own transcript. */
    resumeFrom: String? = null,
    /**
     * The model and the effort are given to a conversation at launch. They are chosen once, and every
     * new tab should start with the same thing rather than with defaults.
     *
     * var rather than val: the choice is made before the first message too - the process does not exist
     * yet then, and remembering the new value is the conversation's own duty, or it would come up with
     * whatever was chosen at the moment the tab was opened.
     */
    model: String = "",
    effort: String = "",
    permissionMode: String = "",
    /**
     * Which Claude account this conversation runs on. Empty is the CLI's ordinary sign-in.
     *
     * `val`, unlike the model and the effort above, and that is load-bearing rather than tidy: the CLI
     * reads its credentials once, when the process comes up, so this cannot be changed on a running
     * conversation at all. Were it a `var`, [restart] - which happens on its own, after a crash or an
     * MCP reconnect - would raise the new process on whatever account is current NOW, quietly moving a
     * conversation onto another subscription halfway through.
     *
     * Readable from outside for the reason the model is: a fork has to start on what its parent runs on,
     * and the parent's own account lives here rather than in the register - the two disagree the moment
     * the current account is changed while an older tab is still open.
     */
    val accountId: String = "",
    private val onEvent: (String) -> Unit,
    private val onError: (String) -> Unit,
    /**
     * The process said something past the event stream - see [noteDiagnostic]. The feed is not
     * concerned with it, but such a line is how the panel learns, for instance, that the sign-in has
     * stopped working.
     */
    private val onDiagnostic: (String) -> Unit = {},
    private val onFinished: () -> Unit,
    /**
     * The agent asks the panel itself for permission - over the same stream the conversation runs on
     * (see [PermissionChannel]). Until someone answers, the turn stands still.
     */
    private val onToolPermission: (PermissionChannel.ToolPermission) -> Unit = {},
    /**
     * The agent took its question back - see [PermissionChannel.Incoming.Withdrawn]. Whoever drew the
     * card has to stop offering buttons that now answer nobody.
     */
    private val onPermissionWithdrawn: (String) -> Unit = {},
    /** An LLM picked the conversation's name by its first message - see [rememberTitle]. */
    private val onTitle: (String) -> Unit = {},
    /**
     * Whether this conversation still needs a name of its own - see [requestTitle].
     *
     * Asked rather than remembered here, because a name outlives a process: the tab keeps it across a
     * restart, a resume and a reconnect, while this object is built anew every time. Without the
     * question, a conversation opened again would be renamed by whatever message happened to be typed
     * into its middle.
     */
    private val titleWanted: () -> Boolean = { true },
    /**
     * The process died on its own - not because we stopped it. The conversation may have been standing
     * in the middle of a tool at that moment: the cards left "running" would hang there forever if
     * nobody is warned.
     */
    private val onCrashed: (Int) -> Unit = {},
    /**
     * The person's turn has ended - by a result, by the process crashing, or by failing to be sent at
     * all.
     *
     * The panel learns this from the stream as well (the result event travels into the feed), but
     * relying on that alone is not enough: it may never reach the feed, or not be parsed by the
     * interface as the end of a turn. Then "Claude is thinking" with its running counter stays on
     * screen forever while the agent has long been free, and the conversation looks stuck - exactly the
     * breakage this separate signal exists for.
     */
    private val onTurnEnded: () -> Unit = {},
    /**
     * A turn started without a send of ours.
     *
     * That happens exactly where the CLI deferred a message written into a running turn and took it up
     * with the next one: by then the panel has already cleared its work on the previous turn's result
     * and, without a separate signal, would go on standing "free" while the agent answers. The same way
     * the panel learns about a turn the session started by itself, resending a lost message (see
     * [checkDeliveries]).
     */
    private val onTurnStarted: () -> Unit = {},
) : Disposable {

    private var handler: OSProcessHandler? = null

    /**
     * When the process behind this conversation came up.
     *
     * It used to be how a process was told apart from the account it belonged to: raised before a
     * switch, it went on answering about the usage as the previous account. That guess is gone - a
     * conversation now carries its account outright (see [accountId]), which is the honest answer and
     * the only one that works when two accounts run at the same time.
     */
    @Volatile
    var startedAt: Long = 0
        private set

    /**
     * The person's turn is running: a message was sent, there has been no result yet.
     *
     * Needed not for the feed but for the session's own decisions - the delivery check and the spinner
     * above all.
     */
    @Volatile
    private var busy = false

    /** Whether the process's death is our own request rather than a crash. */
    @Volatile
    private var stopRequested = false

    /**
     * The model this conversation runs on.
     *
     * Readable from outside for the same reason the effort below is: a fork has to start on what its
     * parent is running, and the parent's own choice lives here rather than in the saved preference -
     * the two disagree the moment a model is picked in one tab and a fork is made from another (see
     * ClaudeSessions.branchFrom).
     */
    var model: String = model
        private set

    /**
     * The effort this conversation works at.
     *
     * Readable from outside for a reason the model and the mode do not have: those two the CLI reports
     * itself, in every `system/init`, so a client can be told what is by whoever heard it last. About
     * the effort the CLI says nothing at all, ever (see [setEffort]) - this field is the only record of
     * it there is, and a client joining is answered from here (see ClaudeSessionHub.attach).
     */
    var effort: String = effort
        private set

    /**
     * This conversation's permission mode. A live process receives it as a control message, but it has
     * to be remembered before the launch too: a mode chosen on an empty panel would otherwise be lost,
     * and the process would come up with the ordinary one.
     *
     * Readable from outside, because this is the only place that knows the truth about THIS
     * conversation: the saved preference is one for the whole application, and after a plan has been
     * approved in one tab the two deliberately disagree (see ClaudeSessions.setPermissionMode).
     */
    var permissionMode: String? = permissionMode.ifEmpty { null }
        private set

    /** Answers to control requests arrive mixed in with the conversation's events. */
    private val awaitingControl = ConcurrentHashMap<String, Control>()

    private class Control(val onResult: (JsonObject) -> Unit, val onFailure: (String) -> Unit)

    /** What was sent and has left no trace in the conversation yet - see [PromptDeliveries]. */
    private val undelivered = PromptDeliveries()

    /** Threads writing into the process must not collide with each other - see [write]. */
    private val writeLock = Any()

    /**
     * What to answer the agent with while the person is thinking: the question waits its turn whole.
     * Not only the call's arguments - the answer may also carry a "do not ask again" rule, and the CLI
     * offers that inside the question itself (see PermissionChannel).
     */
    private val awaitingPermission = ConcurrentHashMap<String, PermissionChannel.ToolPermission>()

    private val lines = StreamLines(onLine = ::consume)

    /**
     * The last thing the process said past the event stream - see [noteDiagnostic]. We keep a tail
     * rather than one line: an explanation usually takes several.
     */
    private val diagnostics = ArrayDeque<String>()

    val isRunning: Boolean get() = handler?.isProcessTerminated == false

    /**
     * Whether a turn is running right now. This is needed outside for the subscription usage: while a
     * turn runs, the process gets a fresh share with every answer from the server, whereas an idle
     * one's share freezes at whatever came with the last answer - so there is no point in asking it
     * (see ClaudePanel.refreshLimits).
     */
    val isBusy: Boolean get() = isRunning && busy

    /**
     * The conversation's name that last went upwards - we do not send the same one twice (see
     * [rememberTitle]): the CLI itself repeats the `ai-title` event many times over through the file
     * with one and the same value. null right after /clear as well - a conversation that has started
     * over deserves a new name, even if the CLI happens to pick exactly the same string for it.
     */
    private var lastSentTitle: String? = null

    /**
     * The name has already been asked for in this conversation - see [requestTitle]. One question per
     * conversation: the answer is written into the transcript as well, so a second one would spend a
     * model call to arrive at a name the tab is already carrying.
     */
    private var titleAsked = false

    /**
     * How many conversations this process has held. Only /clear moves it: the transcript changes under
     * the same process, and everything asked about the previous conversation stops being about anything
     * (see [requestTitle]). Counted rather than compared by conversation id on purpose - the id of a
     * conversation just started is not known until its first event arrives, and a question asked in
     * that gap would be thrown away for no reason.
     */
    private var conversationEpoch = 0

    fun sendPrompt(text: String, images: List<ImageAttachment> = emptyList()) {
        sendPrompt(text, images, repeat = false)
    }

    /**
     * Whether the message went into the process. Outside this is not needed, but a resend tells by it
     * whether a turn has begun (see [resend]).
     */
    private fun sendPrompt(text: String, images: List<ImageAttachment>, repeat: Boolean): Boolean {
        // The process did not come up (onError has already said so) - the turn did not begin and cannot
        // begin. Not saying so separately means leaving the panel with the spinner it put up on the
        // send: the error message is in the feed while work still looks like it is happening.
        val process = handler ?: start() ?: run { endTurn(); return false }

        // Writing into a running turn is the only thing the CLI loses: an idle process always takes a
        // message, and re-reading the conversation's file for it is pointless (see [checkDeliveries]).
        // A repeat is watched in any case: vanishing twice in a row is no longer the known race, and
        // that will have to be said out loud.
        val watched = (busy || repeat) && PromptDelivery.traceable(text)
        // The time is taken before the write: a record in the conversation cannot turn out to be older
        // than the send itself, and the whole check rests on that.
        val sentAt = System.currentTimeMillis()
        busy = true

        // Registered BEFORE the write rather than after it. A turn ends from the stream's own thread, at
        // any moment, and the check it starts lives from then on by a snapshot of this list (see
        // [scheduleDeliveryCheck]). Registered after the write, a message written into the last instant
        // of a turn is missing from that snapshot: no further turn begins, no later chain ever looks at
        // it, and the loss goes unnoticed forever - which is precisely the moment this whole check
        // exists for.
        val delivery = if (watched) PromptDeliveries.Delivery(text, images, sentAt, repeat) else null
        delivery?.let(undelivered::watch)

        // We only wait for a report on what actually went out: a failed write has already been reported
        // to the panel as an error, and repeating it blindly serves nothing.
        val sent = write(process, userMessage(text, images))
        if (!sent) delivery?.let { undelivered.stopWatching(listOf(it)) }
        if (sent) requestTitle(text)

        return sent
    }

    /**
     * Ask the CLI to name this conversation by what has just been written into it.
     *
     * The name has to be asked for. In the terminal the CLI names a session itself, but that lives in
     * its interactive loop; the panel runs it as a stream (see ClaudeLaunch), and there the naming is a
     * control request nobody was making - which is why every tab here used to be called "new session"
     * until the interface guessed something out of the first line of the message. That guess is a
     * stand-in and reads like one: a whole sentence, or a command with its arguments, cut at sixty
     * characters. The model's answer is what the name is meant to be - a short noun phrase about the
     * subject, in the language the conversation is held in.
     *
     * Sent after the message rather than before it: the answer takes a second or two of a small model's
     * time, and the turn the person is waiting for should not stand behind it.
     *
     * `persist` writes the name into the conversation's own transcript, exactly where the CLI writes
     * its own. That is not a detail: the history list reads names from there (see ClaudeHistory), and a
     * name kept only in the tab would be lost the moment the panel is closed.
     */
    private fun requestTitle(text: String) {
        if (titleAsked || lastSentTitle != null || !titleWanted()) return

        // Nothing worth a name in this message - the next one may well be the one (see SessionTitle).
        val description = SessionTitle.describe(text) ?: return

        titleAsked = true
        // The conversation the question was asked about. A /clear in between makes the answer describe
        // something that no longer exists, and the tab would be renamed after a wiped conversation.
        val asked = conversationEpoch

        control(
            "generate_session_title",
            onResult = { response ->
                val title = response["title"]?.jsonPrimitive?.contentOrNull.orEmpty().trim()
                if (title.isNotEmpty() && asked == conversationEpoch) {
                    lastSentTitle = title
                    onTitle(title)
                }
            },
            onFailure = { message ->
                // Not asked again in this process on purpose: a CLI too old to know the request would
                // otherwise be asked on every single message. A restart of the conversation tries once
                // more, which is enough.
                thisLogger().info("The conversation could not be named: $message")
            },
        ) {
            put("description", description)
            put("persist", true)
        }
    }

    /**
     * Bring a conversation up without sending anything into it.
     *
     * Needed exactly where the panel needs the truth about the conversation rather than about the
     * machine: how much of the context window a resumed conversation occupies is known only to the
     * process that loaded its transcript (see [requestContextUsage]). We bring up the same process the
     * conversation will later continue in, not a second one beside it: two processes on one
     * conversation write into the same transcript and share the queue of its deferred messages.
     */
    fun wake(): Boolean = handler != null || start() != null

    /**
     * The model a conversation opened from the history carries on at (see ClaudeSessions.adoptModel):
     * remembered for the launch flag, and only while there is no process to disagree with - a running
     * conversation changes its model by [setModel], through the agent.
     */
    fun adoptModel(model: String) {
        if (handler != null) return
        this.model = model
    }

    /**
     * How a model change ended. The agent can genuinely say no: a model may be forbidden by an
     * organization or unavailable on a plan, and such a one it will not take. [model] is the one that
     * ends up working: the new one on agreement and the previous one on refusal, so that the panel has
     * something to show without guessing.
     */
    data class ModelChange(val applied: Boolean, val model: String, val error: String = "")

    /**
     * Changing the model. For a live conversation by a control request (`set_model`) rather than a
     * slash command: a command costs a whole turn in the feed and answers it with text about "this
     * session only", although we keep the choice for the future as well.
     *
     * A sleeping conversation has nothing to change: the model will travel as a flag at launch - all
     * that matters is remembering it here, or the process would come up with whatever was chosen when
     * the tab was opened.
     *
     * The outcome is reported upwards, as with the mode change: a rejected model must neither stay in
     * the caption under the panel nor travel as a flag into the next tab - with it the process would
     * not come up at all.
     */
    fun setModel(model: String, onApplied: (ModelChange) -> Unit = {}) {
        // The previous one is kept at hand: on refusal we return to it, or a process restart would
        // bring the conversation up with the one that has already failed.
        val previous = this.model
        this.model = model

        if (handler == null) {
            // There is no process yet: the model will travel as a flag at launch, nothing to change.
            onApplied(ModelChange(applied = true, model = model))
            return
        }

        // "default" is the same name the CLI calls it by: a reset to the default model.
        control(
            "set_model",
            onResult = { onApplied(ModelChange(applied = true, model = model)) },
            onFailure = { message ->
                thisLogger().warn("Agent refused model $model: $message")
                this.model = previous
                onApplied(ModelChange(applied = false, model = previous, error = message))
            },
        ) {
            put("model", model.ifEmpty { "default" })
        }
    }

    /**
     * Changing the effort of THIS conversation - by a control request (`apply_flag_settings`), the same
     * way as the model and the mode.
     *
     * It used to travel as an ordinary turn: the panel wrote `/effort high` into the conversation as
     * though the person had, silenced the agent's reply to it, and while someone else's turn was
     * running held the command back until that turn ended. That is gone, and with it the machinery it
     * needed. Measured on CLI 2.1.247, launched with the panel's own flags: the request is answered at
     * once, works in the middle of a running turn without disturbing it, and overrides the `--effort`
     * the process came up with.
     *
     * Two things this channel does NOT give, and both decide how the rest is built:
     *
     * - **It never says no.** An unknown level, an organization that forbids xhigh, workflows switched
     *   off - all of it is answered with `success` here (the CLI's own explanations for those live on
     *   its Remote Control bridge, which we are not). So there is no refusal to show and nothing to
     *   roll back to, unlike the model and the mode.
     * - **It cannot be read back.** `get_settings` on this version reports the merge of settings files
     *   and nothing about the session; `system/init` carries no effort at all, and no event announces a
     *   change. Hence the effort of a conversation is true only here, in the conversation itself, and
     *   the panel learns it from us (see ClaudeSessionHub.changeEffort).
     *
     * A sleeping conversation has nothing to change: the effort will travel as a flag at launch, and
     * remembering it here is the whole of the work.
     *
     * Nobody waits for the answer, and there is nothing in it to wait for: it carries no payload, and
     * "yes" is the only thing it ever says. What the conversation is set to is decided by the line
     * below, not by the CLI - a failure to write reaches the panel by its own road (see [write]) and
     * would change nothing here anyway, since the next process takes the effort as a flag.
     */
    fun setEffort(effort: String) {
        this.effort = effort
        if (handler == null) return

        control("apply_flag_settings", onFailure = { message ->
            thisLogger().warn("Effort $effort was not applied: $message")
        }) {
            putJsonObject("settings") { effortSettings(effort) }
        }
    }

    /**
     * Both keys, every time, whatever was chosen.
     *
     * The flag settings are a layer the CLI merges rather than replaces, so a key left unsaid keeps the
     * value of the previous choice: pick ultracode and then max, and the orchestration would stay on
     * with nobody having asked for it.
     *
     * `ultracode` is the CLI's own name for "xhigh plus standing dynamic-workflow orchestration", and
     * that is exactly how it is spelled out here; `auto` is the absence of a choice, which this layer
     * writes as null - the model's own default then applies.
     */
    private fun JsonObjectBuilder.effortSettings(effort: String) {
        when (effort) {
            EFFORT_ULTRACODE -> {
                put("effortLevel", EFFORT_XHIGH)
                put("ultracode", true)
            }

            EFFORT_AUTO -> {
                put("effortLevel", JsonNull)
                put("ultracode", false)
            }

            else -> {
                put("effortLevel", effort)
                put("ultracode", false)
            }
        }
    }

    /**
     * The model catalogue - the same one `/model` shows in a terminal: the CLI assembles it by the
     * account, the provider and the organization's policy, so inventing a list on our side is out of
     * the question (see ClaudeModels).
     */
    fun requestModels(onResult: (JsonObject) -> Unit, onFailure: (String) -> Unit = {}) {
        control("list_models", onResult = onResult, onFailure = onFailure)
    }

    /**
     * This conversation's MCP servers: who is connected, who is waiting for a sign-in, who failed and
     * why, where each one came from (project, personal config, claude.ai, a plugin).
     *
     * We ask the conversation itself rather than parse the output of `claude mcp list`: that list holds
     * neither the reason for a refusal nor the fact that a server needs a sign-in - and the servers are
     * connected to the conversation's process anyway, not to some separate "MCP state" on disk.
     */
    fun requestMcpStatus(onResult: (JsonObject) -> Unit, onFailure: (String) -> Unit = {}) {
        control("mcp_status", onResult = onResult, onFailure = onFailure)
    }

    /**
     * Signing in to an MCP server that requires it. The CLI answers with an address for the person to
     * open, and raises a local handler of its own for the browser to come back to with a code - which
     * is why the request has to go into the conversation's live process rather than a one-off one: the
     * handler dies with it.
     */
    fun authenticateMcp(server: String, onResult: (JsonObject) -> Unit, onFailure: (String) -> Unit = {}) {
        control("mcp_authenticate", onResult = onResult, onFailure = onFailure) { put("serverName", server) }
    }

    /** Reconnecting one server - without restarting the conversation. */
    fun reconnectMcp(server: String, onResult: (JsonObject) -> Unit, onFailure: (String) -> Unit = {}) {
        control("mcp_reconnect", onResult = onResult, onFailure = onFailure) { put("serverName", server) }
    }

    /**
     * Kill one of the conversation's tasks - a subagent or a background command - without touching the
     * turn itself: by the same control request the terminal uses for it.
     *
     * A task that is already gone does not alarm the CLI and it answers with success: by the time of
     * the click the task could have finished on its own. Only a real refusal is reported upwards -
     * otherwise the cross would silently do nothing.
     */
    fun stopTask(taskId: String, onFailure: (String) -> Unit = {}) {
        control(
            "stop_task",
            onFailure = { message ->
                thisLogger().warn("Agent refused to stop task $taskId: $message")
                onFailure(message)
            },
        ) { put("task_id", taskId) }
    }

    /**
     * How much of the context window is taken right now - a figure from the CLI itself, the same one
     * `/context` prints. Counting it ourselves from usage is not an option: the window's size depends
     * on the model (with "1M" models it is five times the usual), and what is taken includes things a
     * turn's usage does not show at all.
     */
    fun requestContextUsage(onResult: (JsonObject) -> Unit, onFailure: (String) -> Unit = {}) {
        control("get_context_usage", onResult = onResult, onFailure = onFailure)
    }

    /**
     * How a mode change ended. The agent answers with more than yes or no: it may apply something other
     * than what was asked (a legacy mode name), and it may refuse - the "auto" mode, for instance, is
     * not available on every model.
     */
    data class ModeChange(val applied: Boolean, val mode: String, val error: String = "")

    /**
     * Changing the permission mode on the fly: the agent applies it to the very next tool calls, no
     * process restart needed. The outcome is reported upwards - the panel shows the mode, and what it
     * shows must be the applied one, not the wished-for one.
     */
    fun setPermissionMode(requested: String, onApplied: (ModeChange) -> Unit) {
        // Outside we answer with the same name the CLI understands: the panel shows the applied mode,
        // not what it used to be called in an old conversation.
        val mode = PermissionModes.normalize(requested)

        // The previous mode is kept at hand: on refusal we return to it, or a process restart would
        // bring the conversation up with ordinary permissions.
        val previous = permissionMode
        permissionMode = mode

        if (handler == null) {
            // There is no process yet: the mode will travel as a flag at launch, nothing to change.
            onApplied(ModeChange(applied = true, mode = mode))
            return
        }

        control(
            "set_permission_mode",
            onResult = { response ->
                // We trust the answer rather than our own request: the agent returns what it applied.
                val applied = response["mode"]?.jsonPrimitive?.contentOrNull ?: mode
                permissionMode = applied
                onApplied(ModeChange(applied = true, mode = applied))
            },
            onFailure = { message ->
                thisLogger().warn("Agent refused permission mode $mode: $message")
                permissionMode = previous
                onApplied(ModeChange(applied = false, mode = mode, error = message))
            },
        ) { put("mode", mode) }
    }

    /**
     * Usage is asked for only when the process is already living on its own - control() quietly skips
     * the request anyway when there is no live session. This figure used to bring a process up even
     * without a single message, but that is a full claude launch with all its MCP servers and hooks,
     * competing for resources with a conversation genuinely at work in another tab - a one-off figure
     * is not worth it. Until the first message the panel simply shows nothing.
     */
    fun requestUsage(onUsage: (JsonObject) -> Unit, onFailure: (String) -> Unit = {}) {
        control("get_usage", onResult = onUsage, onFailure = onFailure)
    }

    /**
     * Interrupting a turn. Unlike stopping the process, the conversation stays alive.
     *
     * The agent agreeing to interrupt a turn is not yet "the turn is over": the panel learns that from
     * an ordinary result event in the stream. But if the agent does not confirm even this, that is a
     * clear sign something is wrong with the process, and it is worth offering to kill it by force
     * rather than quietly standing there with a spinning Stop.
     */
    fun interrupt(onTimeout: () -> Unit = {}) {
        // The person asked to stop - so what they wrote into this turn should not be sent again either:
        // that would be work they have just cancelled (see checkDeliveries).
        undelivered.forget()
        control("interrupt", onFailure = { onTimeout() })
    }

    /**
     * Restarting the conversation's process while keeping the transcript.
     *
     * For MCP's sake: there is no other way to reconnect a server - the CLI has no subcommand of its
     * own for it (`claude mcp` can only list/add/remove), and the `/mcp` slash command does not run in
     * streaming mode at all, it exists only for the interactive terminal. At startup, though, the
     * process connects to every server itself, and the conversation comes up under the same
     * conversationId (see ClaudeLaunch) - to a person that looks exactly like reconnecting rather than
     * losing the context.
     *
     * Returns false when there was nothing to bring up: the conversation has not started yet, and the
     * servers will connect by themselves with the first message.
     */
    fun restart(): Boolean {
        if (handler == null) return false

        stop()
        return start() != null
    }

    /** Stopping the conversation entirely: the process is taken down, the context is lost. */
    fun stop() {
        val process = handler ?: return
        stopRequested = true
        handler = null
        busy = false
        // There is nowhere left to deliver what was swallowed, and no reason to: the conversation with
        // its context is about to be gone.
        undelivered.forget()
        lines.reset()
        awaitingControl.clear()
        // There is no longer anyone or anything to answer the hanging questions with: the process that
        // asked them is about to be gone.
        awaitingPermission.clear()
        process.destroyProcess()
    }

    override fun dispose() = stop()

    // --- Control channel ------------------------------------------------------

    private fun control(
        subtype: String,
        onResult: (JsonObject) -> Unit = {},
        onFailure: (String) -> Unit = {},
        request: JsonObjectBuilder.() -> Unit = {},
    ) {
        val process = handler ?: run {
            thisLogger().info("Control request $subtype skipped: no live session")
            onFailure("no live session")
            return
        }

        val id = UUID.randomUUID().toString()
        awaitingControl[id] = Control(onResult, onFailure)

        // Without a timeout of its own a forgotten answer hangs this piece of the panel forever - the
        // same risk we already fixed for permissions, but here it concerns any control request: the
        // usage limits, a mode change, Stop.
        AppExecutorUtil.getAppScheduledExecutorService().schedule(
            { awaitingControl.remove(id)?.onFailure?.invoke("$subtype timed out") },
            CONTROL_TIMEOUT_SECONDS,
            TimeUnit.SECONDS,
        )

        write(
            process,
            buildJsonObject {
                put("request_id", id)
                put("type", "control_request")
                putJsonObject("request") {
                    put("subtype", subtype)
                    request()
                }
            }.toString(),
        )
    }

    /**
     * The control channel's answers are not passed upwards: the panel draws the conversation, and this
     * is internal correspondence with the process.
     */
    private fun consume(line: String) {
        // Not an event, just something said into the shared output: nothing to parse, and the feed has
        // as little use for it as for stderr (see noteDiagnostic).
        if (!line.startsWith("{")) {
            noteDiagnostic(line)
            return
        }

        // An incoming request: not an answer to our own, but the agent's question to the panel - or that
        // same question taken back (see PermissionChannel.Incoming.Withdrawn). Which lines those are is
        // the channel's own knowledge - see PermissionChannel.mayBelong.
        if (PermissionChannel.mayBelong(line)) {
            val payload = runCatching { Json.parseToJsonElement(line).jsonObject }.getOrNull()
            val type = payload?.get("type")?.jsonPrimitive?.contentOrNull

            if (payload != null &&
                (type == PermissionChannel.CONTROL_REQUEST || type == PermissionChannel.CONTROL_CANCEL_REQUEST)
            ) {
                // Whatever it turns out to be goes to askPermission, the unreadable included: a request
                // nobody answers is a turn stopped forever, and the trace it leaves there is the only
                // explanation such a conversation ever gets.
                askPermission(payload)
                return
            }
        }

        if (line.contains("\"control_response\"")) {
            val response = runCatching {
                Json.parseToJsonElement(line).jsonObject["response"] as? JsonObject
            }.getOrNull()

            val id = response?.get("request_id")?.jsonPrimitive?.contentOrNull
            val control = id?.let { awaitingControl.remove(it) } ?: return

            // A slip inside a control answer's handler must not bring down the stream's parsing: it is
            // shared with the conversation's events, and an exception thrown from here takes with it the
            // rest of the output not yet parsed - the panel loses a piece of the feed over a figure in
            // the corner.
            runCatching {
                if (response["subtype"]?.jsonPrimitive?.contentOrNull == "success") {
                    control.onResult(response["response"] as? JsonObject ?: JsonObject(emptyMap()))
                } else {
                    control.onFailure(response["error"]?.jsonPrimitive?.contentOrNull.orEmpty())
                }
            }.onFailure { thisLogger().warn("Control response handler failed", it) }
            return
        }

        // A turn's result is noticed before anything else and reported upwards in every case, whatever
        // becomes of the line itself further on (see onTurnEnded).
        val turnResult = AgentStream.isTurnResult(line)

        // And a turn's start by the very first sign of work: the turn could have begun without a send
        // of ours (see noteTurnActivity).
        if (!turnResult) noteTurnActivity(line)

        try {
            consumeEvent(line)
        } finally {
            if (turnResult) endTurn()
        }
    }

    /** The body of the parsing: everything after which the turn must be closed anyway - see [consume]. */
    private fun consumeEvent(line: String) {
        if (line.contains("\"type\":\"conversation_reset\"")) resetConversation(line)

        rememberTitle(line)
        rememberConversation(line)
        onEvent(line)
    }

    /**
     * The conversation's name, picked by the CLI itself.
     *
     * The event repeats many times over through the file with one and the same value, so it is passed
     * upwards only when it is genuinely new (see [lastSentTitle]).
     */
    private fun rememberTitle(line: String) {
        val title = AgentStream.aiTitle(line) ?: return
        if (title == lastSentTitle) return

        lastSentTitle = title
        onTitle(title)
    }

    /**
     * The conversation was wiped - /clear. The previous conversation is gone, and everything tied to it
     * has nothing to do with the new one.
     *
     * - The name: a conversation that has started over deserves a new one, even if the CLI happens to
     *   pick exactly the same string - otherwise the coincidence looks as though nobody renamed the tab
     *   at all (see [lastSentTitle]).
     * - The undelivered: looking for it in a wiped conversation's journal is meaningless, and failing to
     *   find it, the check would send it again - into an empty chat, without any context. The person has
     *   just wiped the conversation, and work they considered wiped along with it lands on them.
     * - The conversation's identifier: the new one the CLI sends inside this very event. Without it both
     *   the delivery checks would read the previous conversation's journal, and the tab would later
     *   resume the wrong conversation - not the one open in it.
     */
    private fun resetConversation(line: String) {
        lastSentTitle = null
        titleAsked = false
        conversationEpoch += 1
        undelivered.forget()
        // The turn that was asking is gone along with the conversation, so its questions are unanswerable
        // - and a card still counted as "waiting" would swallow what the person writes onto it rather
        // than send it on (see the same reasoning at processTerminated).
        awaitingPermission.clear()
        NEW_CONVERSATION_ID.find(line)?.groupValues?.get(1)?.let {
            conversationId = it
        }
    }

    /** The turn has ended: the panel should clear its work. */
    private fun endTurn() {
        busy = false
        onTurnEnded()

        // The end of a turn is the first moment anything can be said about what was sent: until then an
        // accepted message is indistinguishable from a swallowed one.
        startDeliveryCheck()
    }

    /**
     * A turn started on its own - without a send of ours.
     *
     * The only sign of it is events of a working agent in a session that by our reckoning is free: that
     * is what a turn looks like when the CLI takes up a person's deferred message. Without this signal
     * the panel would stand "free" for the whole of such a turn: no spinner, the counter still, the
     * answer typing itself out of nowhere.
     */
    private fun noteTurnActivity(line: String) {
        if (busy) return
        if (!AgentStream.isTurnActivity(line)) return

        busy = true
        onTurnStarted()
    }

    /**
     * Check whether the sent messages reached the conversation, and resend the lost ones.
     *
     * Why not straight away: the record of an accepted message appears in the conversation not at the
     * moment of sending but when the CLI takes it up - by measurement, a fraction of a second after the
     * previous turn ends. So we ask not once but several times, and give up only after the last
     * attempt.
     *
     * [watched] is a snapshot of what was waiting when the chain began, and from then on the chain
     * lives by it alone. A message sent in the middle of someone else's chain gets a chain of its own -
     * otherwise it would inherit a foreign attempt counter, that is, wait noticeably less than it
     * should for its record in the conversation, and go to the agent a second time simply because the
     * CLI had not managed to write it yet.
     */
    private fun scheduleDeliveryCheck(watched: List<PromptDeliveries.Delivery>, attempt: Int) {
        if (watched.isEmpty()) return

        AppExecutorUtil.getAppScheduledExecutorService().schedule(
            // The tick belongs on the scheduler, the work does not. Reading a conversation's file is
            // tens of megabytes of parsing, while this pool is a handful of threads shared with the Stop
            // button's watchdog, the permission mode switch and the usage polling - and the check runs
            // several times over on every end of a turn. Done here, all of those queue behind it: the
            // Stop looks stuck and the usage rings freeze on a long conversation. So the scheduler only
            // wakes up and hands the work on, the same way the token scan does (see
            // PanelUsage.refreshTodayTokens).
            { AppExecutorUtil.getAppExecutorService().submit { checkDeliveries(watched, attempt) } },
            DELIVERY_CHECK_DELAY_MS * attempt,
            TimeUnit.MILLISECONDS,
        )
    }

    /** A new chain of checks - over everything awaiting confirmation right now. */
    private fun startDeliveryCheck() {
        scheduleDeliveryCheck(undelivered.snapshot(), attempt = 1)
    }

    private fun checkDeliveries(watched: List<PromptDeliveries.Delivery>, attempt: Int) {
        val conversation = conversationId

        val pending = undelivered.stillPending(watched)
        if (pending.isEmpty()) return

        // One pass over the file for the whole list at once: re-reading the conversation once per
        // waiting message is megabytes of reading over nothing.
        val lookup = PromptDelivery
            .arrived(workingDirectory, conversation, pending.map { PromptDelivery.Sent(it.text, it.sentAt) })

        // We could not look into the conversation at all - it is locked, it has just been rotated, or it
        // is not on disk yet. That says nothing about the messages, and treating it as "they are not
        // there" would resend a request that has already run. We look again while attempts remain, and
        // after that stay silent: a doubled `deploy` cannot be taken back, while a message that
        // genuinely vanished the person notices by the silence.
        if (lookup !is PromptDelivery.Lookup.Read) {
            thisLogger().warn("Could not read conversation $conversation to check delivery: not resending")
            if (attempt < DELIVERY_ATTEMPTS) scheduleDeliveryCheck(pending, attempt + 1) else undelivered.stopWatching(pending)
            return
        }

        val missing = undelivered.settle(pending, lookup.found.map { pending[it] })
        if (missing.isEmpty()) return

        // There are attempts left - we wait: the record may simply not have appeared yet.
        if (attempt < DELIVERY_ATTEMPTS) {
            scheduleDeliveryCheck(missing, attempt + 1)
            return
        }

        undelivered.resendLost(missing, isTurnRunning = { busy }, resend = ::resend)
    }

    /**
     * Send anew what the CLI swallowed.
     *
     * Blindly, a second time, we do not: if the repeat went missing too, the matter is not the known
     * race, and staying silent about it is worse than speaking up. At least then the person knows the
     * message was not carried out - rather than "I wrote something and nothing happened".
     */
    private fun resend(lost: PromptDeliveries.Delivery) {
        if (lost.repeat) {
            thisLogger().warn("Claude dropped a message twice: not resending again")
            onError("Claude didn't take your last message - send it again.")

            // The first resend declared a turn started (see below), and now nobody is going to end it:
            // the repeat vanished the same way the original did, so no result event will ever come.
            // Without this the panel keeps a spinner and a running counter until the IDE is restarted.
            endTurn()
            return
        }

        thisLogger().info("Claude dropped a message mid-turn: sending it again")

        // The turn begins not by a press in the panel but from here - the panel will not guess it by
        // itself and would go on standing free. But only if the message did go out: a process that
        // failed to come up and a broken channel start no turn, while the panel would be left with a
        // spinner and a running counter over the text of the error, and there would be nothing left to
        // clear them with.
        if (!sendPrompt(lost.text, lost.images, repeat = true)) return
        onTurnStarted()

        // The repeat gets a chain of checks of its own right away rather than waiting for the end of a
        // turn (see [endTurn]) that may never begin. A repeat swallowed just like the original starts
        // nothing and ends nothing: this chain is the only thing that will ever notice it.
        startDeliveryCheck()
    }

    /**
     * The agent asks permission for a tool call. We hand the question upwards and wait for the person:
     * answering is our duty, or the turn stands until the very end of the conversation.
     */
    private fun askPermission(payload: JsonObject) {
        when (val incoming = PermissionChannel.parse(payload)) {
            is PermissionChannel.Incoming.Permission -> {
                awaitingPermission[incoming.request.requestId] = incoming.request
                onToolPermission(incoming.request)
            }

            is PermissionChannel.Incoming.Withdrawn -> {
                // Nothing is written back: an answer to a question that has been taken back the CLI
                // discards, and the card that sent it would meanwhile have drawn a decision nobody acted
                // on. Forgetting it here is what lets the panel take the card off the screen - and what
                // lets a remark typed onto a plan afterwards travel as an ordinary message rather than
                // into a request that no longer exists (see SessionPermissions.awaited).
                awaitingPermission.remove(incoming.requestId)
                onPermissionWithdrawn(incoming.requestId)
            }

            is PermissionChannel.Incoming.Unsupported -> {
                // What we do not understand we refuse at once and out loud: silence here is not "missed
                // it" but a turn stopped forever.
                thisLogger().info("Unsupported control request from claude: ${incoming.subtype}")
                answerPermission(
                    incoming.requestId,
                    allow = false,
                    message = "The panel does not handle '${incoming.subtype}' requests.",
                )
            }

            // Neither a request number nor a request: there is literally nowhere to answer, and the
            // turn, if it was waiting for one, will go on waiting. The one useful thing to do here is
            // leave a trace: otherwise a conversation frozen for this reason looks stuck with no
            // explanation.
            null -> thisLogger().warn("Unanswerable control request from claude: $payload")
        }
    }

    /**
     * The person's answer to the agent: the conversation stands on this spot until it arrives.
     *
     * [extraInput] is appended to the call's arguments - that is how answers to a question with options
     * come back: the CLI expects them in the same `updatedInput`, in the `answers` field (see
     * ClaudeLaunch.ASK_TOOL).
     *
     * [remember] is "Always allow": along with the permission a rule travels, after which the CLI will
     * not ask about such a command again - neither the panel nor the terminal.
     */
    fun answerPermission(
        requestId: String,
        allow: Boolean,
        message: String = "",
        extraInput: JsonObject? = null,
        remember: Boolean = false,
    ) {
        val process = handler ?: return
        val request = awaitingPermission.remove(requestId)
        val input = request?.input ?: JsonObject(emptyMap())
        val updated = if (extraInput == null) input else JsonObject(input + extraInput)

        write(
            process,
            if (allow) {
                val rules = if (remember && request != null) {
                    PermissionChannel.rememberRules(request)
                } else {
                    JsonArray(emptyList())
                }
                PermissionChannel.allow(requestId, updated, rules)
            } else {
                PermissionChannel.deny(requestId, message)
            },
        )
    }

    /** Whether this conversation is waiting for an answer to such a request - otherwise there is nobody to answer. */
    fun isAwaitingPermission(requestId: String): Boolean = awaitingPermission.containsKey(requestId)

    /**
     * A line into the process's input stream. False means the write did not go through.
     *
     * Under a lock: several threads may write here at once - the interface one (a person's message),
     * the process one (an answer to a permission) and a background one (a resend of something lost, see
     * [resend]). Two lines that collide the CLI will not parse at all.
     *
     * Handling the failure, though, happens outside the lock, and that is no detail: [endTurn] reaches
     * both upwards, into the panel, and downwards, into the list of undelivered messages - and that list
     * may at the same moment be holding its own lock and waiting for a write (see
     * [PromptDeliveries.claim]). Two locks taken in different orders is a panel jammed for good, not
     * just an unlucky send.
     */
    private fun write(process: OSProcessHandler, payload: String): Boolean {
        val written = synchronized(writeLock) {
            runCatching {
                process.processInput.write((payload + "\n").toByteArray())
                process.processInput.flush()
            }
        }

        written.onFailure {
            onError("Failed to talk to claude: ${it.message}")
            // The write into the process did not go through - so there will be no answer from it
            // either: neither this turn nor its result. Without this the panel would be left with an
            // eternal "Claude is thinking" beside the message about the breakage itself.
            endTurn()
        }

        return written.isSuccess
    }

    // --- Process diagnostics --------------------------------------------------

    /**
     * The process said something past the event stream: either stderr, or a stdout line that does not
     * parse as an event.
     *
     * Such things do not go into the feed. The CLI writes its libraries' warnings there too - about the
     * MCP token storage, about deprecated Node features and the like - while the conversation carries on
     * as if nothing happened. Showing them as an error means frightening a person with something they
     * did not break and cannot fix.
     *
     * But losing them is not an option either: if the process does die after all, these lines are the
     * only explanation of why. So we keep a tail and show it exactly at the moment it means something
     * (see [start]).
     */
    private fun noteDiagnostic(text: String) {
        val line = text.trim()
        if (line.isEmpty()) return

        thisLogger().info("claude said: $line")
        // Kept for a debug report too (see DiagnosticsLog): when the process does die, these lines are
        // the only account of why, and they are worth standing in the same column as everything else that
        // happened around them.
        DiagnosticsLog.note(DiagnosticsLog.STDERR, line)
        onDiagnostic(line)

        synchronized(diagnostics) {
            diagnostics.addLast(line)
            while (diagnostics.size > DIAGNOSTICS_KEPT) diagnostics.removeFirst()
        }
    }

    private fun diagnosticsTail(): String =
        synchronized(diagnostics) { diagnostics.joinToString("\n") }

    // --- Process --------------------------------------------------------------

    private fun start(): OSProcessHandler? {
        stopRequested = false
        // What this launch is asking to continue - checked against what actually comes up (see
        // [rememberConversation]).
        continuing = conversationId
        // The previous process may have said things of its own before dying - that has nothing to do
        // with the new one, and explaining its future crash with someone else's words is dishonest.
        synchronized(diagnostics) { diagnostics.clear() }
        val executable = ClaudeExecutable.find()

        if (executable == null) {
            DiagnosticsLog.note(DiagnosticsLog.AGENT, "the claude executable was not found")
            onError("CLAUDE_NOT_FOUND")
            return null
        }

        // Which account pays for this conversation travels in the environment and nowhere else - never
        // in an argument, so the no-newline, no-quote rule ClaudeLaunch enforces is untouched.
        //
        // A refusal stops the launch. There is deliberately no fallback to the ordinary sign-in here: a
        // conversation that started on somebody else's subscription would run, answer and be billed
        // without anything looking wrong, and that is the one failure this must not have.
        val environment = ClaudeAccounts.getInstance().variablesFor(accountId, workingDirectory)

        if (environment == null) {
            DiagnosticsLog.note(DiagnosticsLog.ACCOUNTS, "a conversation was not started: its account would not resolve")
            onError("ACCOUNT_UNAVAILABLE")
            return null
        }

        val commandLine = GeneralCommandLine(executable.absolutePath)
            .withParameters(
                ClaudeLaunch.arguments(
                    model = model,
                    effort = effort,
                    permissionMode = permissionMode,
                    conversationId = conversationId,
                    forkFrom = forkFrom,
                    allowBypassSwitch = ClaudeExecutable.supportsFlag(
                        executable,
                        ClaudeLaunch.ALLOW_BYPASS_FLAG,
                    ),
                ),
            )
            .withWorkingDirectory(workingDirectory?.let { Path.of(it) })
            .withEnvironment(environment)
            .withCharset(Charsets.UTF_8)

        val process = runCatching { OSProcessHandler(commandLine) }
            .onFailure {
                thisLogger().warn("Failed to start claude", it)
                DiagnosticsLog.note(DiagnosticsLog.AGENT, "claude would not start: ${it.message}")
                onError("Failed to start claude: ${it.message}")
            }
            .getOrNull() ?: return null

        process.addProcessListener(
            object : ProcessListener {
                override fun onTextAvailable(event: ProcessEvent, outputType: Key<*>) {
                    when (outputType) {
                        ProcessOutputTypes.STDOUT -> lines.append(event.text)
                        ProcessOutputTypes.STDERR -> noteDiagnostic(event.text)
                    }
                }

                override fun processTerminated(event: ProcessEvent) {
                    handler = null
                    busy = false
                    // What was undelivered went missing along with the process: raising a new one for
                    // its sake is not what anyone expects from a conversation that has just crashed.
                    // About the crash itself the panel is told separately, below.
                    undelivered.forget()
                    // The questions it was asking died with it. Said out loud, because whoever answers a
                    // plan or a question card asks first whether the conversation is still waiting (see
                    // PanelPermissions.awaited): left as "waiting", a remark typed onto a card after the
                    // crash would be written into a process that is gone instead of being sent as an
                    // ordinary message - that is, silently lost.
                    awaitingPermission.clear()
                    // We stopped it ourselves - this is not a crash, there is nothing to explain to the
                    // user. But if the process died on its own, any card that was "running" at that
                    // moment would otherwise hang like that forever.
                    if (!stopRequested) {
                        // Now everything the process said past the stream has become an error: the
                        // conversation is gone, and there is nothing else left to explain it with.
                        diagnosticsTail().takeIf { it.isNotEmpty() }?.let(onError)
                        DiagnosticsLog.note(DiagnosticsLog.AGENT, "claude exited on its own (code ${event.exitCode})")
                        onCrashed(event.exitCode)
                    }
                    onFinished()
                }
            },
        )

        process.startNotify()
        startedAt = System.currentTimeMillis()
        handler = process
        return process
    }

    /** The conversation's identifier: without it there is no resuming it after a restart. */
    var conversationId: String? = resumeFrom
        private set

    /**
     * The conversation this process was asked to continue, until it has said which one it came up with.
     *
     * Only a plain continuation is watched: a branch is asked to fork off its parent and is supposed to
     * come back with an identifier of its own (see [rememberConversation]).
     */
    @Volatile
    private var continuing: String? = null

    /**
     * The agent sends the conversation's identifier in a system event. Parsing the whole stream for one
     * field is pointless - noticing it in the line is enough.
     *
     * The identifier it comes up with is also the only place the panel can catch a continuation that did
     * not happen. Asked to resume, the CLI either continues that very conversation or refuses to start
     * at all - so a process that comes up under a different identifier means the request never reached
     * it, whatever ate it on the way (a launch through a Windows batch wrapper did once, see
     * ClaudeLaunch.oneLine). Nothing about that is visible from the panel: the feed holds the replay it
     * drew itself, and only the agent knows it remembers none of it. So it is said out loud at least
     * into the diagnostics, which travel in a bug report.
     */
    private fun rememberConversation(line: String) {
        if (conversationId != null && !line.contains("\"subtype\":\"init\"")) return

        val match = SESSION_ID.find(line) ?: return
        val started = match.groupValues[1]

        // Said once per process: the identifier arrives in every event, and the answer will not change.
        continuing?.takeIf { it != started }?.let {
            DiagnosticsLog.note(
                DiagnosticsLog.AGENT,
                "asked to continue a past conversation, but the CLI came up with a new one: " +
                    "its context is gone even though the feed shows it",
            )
        }
        continuing = null

        conversationId = started
    }

    private fun userMessage(text: String, images: List<ImageAttachment>): String = buildJsonObject {
        put("type", "user")
        putJsonObject("message") {
            put("role", "user")
            putJsonArray("content") {
                addJsonObject {
                    put("type", "text")
                    put("text", text)
                }
                // The order is the CLI's own: the text with its [Image #N] placeholders comes first, and
                // after it the images' bytes in the order they were pasted in.
                for (image in images) {
                    addJsonObject {
                        put("type", "image")
                        putJsonObject("source") {
                            put("type", "base64")
                            put("media_type", image.mediaType)
                            put("data", image.data)
                        }
                    }
                }
            }
        }
    }.toString()

    private companion object {
        val SESSION_ID = Regex("\"session_id\"\\s*:\\s*\"([^\"]+)\"")
        val NEW_CONVERSATION_ID = Regex("\"new_conversation_id\"\\s*:\\s*\"([^\"]+)\"")

        /**
         * The two effort names that are not levels: one asks for the model's own default, the other for
         * a level plus something besides it (see [effortSettings]). Everything else the panel offers is
         * the level itself, spelled as the CLI spells it.
         */
        const val EFFORT_AUTO = "auto"
        const val EFFORT_ULTRACODE = "ultracode"
        const val EFFORT_XHIGH = "xhigh"

        /** How long any control request is waited for before we give up ourselves. */
        const val CONTROL_TIMEOUT_SECONDS = 20L

        /**
         * The step between delivery checks: the first after one such interval, the following ones
         * further apart (see [scheduleDeliveryCheck]). By measurement, the record of an accepted message
         * appeared in the conversation in under a second after the turn ended, so there is room to
         * spare here - and only a genuinely lost message pays for it.
         */
        const val DELIVERY_CHECK_DELAY_MS = 700L

        /** How many times we ask before considering a message lost. */
        const val DELIVERY_ATTEMPTS = 3

        /**
         * How many last diagnostic lines are kept. The reason a process died is its last words, not the
         * whole conversation with it: dumping a long conversation's full stderr into the feed serves
         * nothing.
         */
        const val DIAGNOSTICS_KEPT = 20
    }
}

package io.github.crmapache.amazingclaudecode.claude

import com.intellij.openapi.diagnostic.thisLogger
import io.github.crmapache.amazingclaudecode.claude.ClaudeSessions.Companion.MAIN_SESSION
import io.github.crmapache.amazingclaudecode.remote.RemoteAgent
import io.github.crmapache.amazingclaudecode.remote.RemoteCommands
import io.github.crmapache.amazingclaudecode.remote.RemoteLimits
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.booleanOrNull
import kotlinx.serialization.json.contentOrNull
import kotlinx.serialization.json.jsonArray
import kotlinx.serialization.json.jsonObject
import kotlinx.serialization.json.jsonPrimitive
import kotlinx.serialization.json.longOrNull

/**
 * The one door a request from a client goes through.
 *
 * Until now this was a `when` inside the panel over forty-odd kinds of message, and while the browser
 * was the only client that was fine: whatever could reach it was already inside the IDE. It stops
 * being fine the moment a second client may sit on a phone across the city, because the difference
 * between "read the feed" and "run a shell command" then becomes the difference between watching and
 * remote code execution.
 *
 * So execution moves out of the panel and behind a single entrance. The panel calls it directly - it
 * is the IDE, and what it may do the person at the keyboard may do. Anything arriving over a network
 * will be filtered before it gets here (phase 2), and having one entrance is what makes that filter
 * possible to write at all: a second path around it would be a hole nobody would notice.
 *
 * What stays with the panel is what only an IDE window can do: the file chooser, the clipboard, the
 * cursor, the sounds, the dock. Those are not commands about a conversation, and a phone has no
 * business asking for them.
 */
internal class SessionCommands(private val hub: ClaudeSessionHub) {

    /** How often a client that is not this IDE may ask for things - see RemoteLimits. */
    private val limits = RemoteLimits()

    /**
     * Handle a message from [clientId]. False means it is not about the conversations at all - the
     * caller deals with it itself.
     *
     * [asker] is who is doing the asking, when that is somebody narrower than the client itself: behind
     * the relay's single client sit all the phones paired with this IDE, and counting their requests
     * together means one of them running out of allowance stops the others (see RemoteLimits).
     */
    fun handle(clientId: String, payload: JsonObject, asker: String = clientId): Boolean {
        val field = { name: String -> payload[name]?.jsonPrimitive?.contentOrNull.orEmpty() }
        val sessionId = field("sessionId").ifEmpty { MAIN_SESSION }
        val type = field("type")
        val local = hub.isLocal(clientId)

        /**
         * The lock on the single door. Everything that is not this IDE plays by the list (see
         * RemoteCommands), including a message type nobody has heard of - that is what keeps a new
         * protocol message from becoming remotely reachable just because this file was not updated.
         */
        if (!local && !RemoteCommands.allows(type)) {
            thisLogger().warn("A client that is not this IDE asked for something it may not: $type ($clientId)")
            return true
        }

        // And how often. The list above answers "may it", this answers "may it again" - a phone in
        // somebody else's hands is allowed the same things as one in yours, just not a thousand times a
        // minute (see RemoteLimits).
        if (!local && !limits.allow(asker, type)) {
            thisLogger().warn("A client is going too fast: $type ($asker)")
            return true
        }

        when (type) {
            /**
             * The client has mounted and says what it already has. The panel answers this one itself
             * (it has a window's worth of its own to send along with it); a browser page over the local
             * channel comes through here.
             */
            "ready" -> hub.attach(clientId, seen(payload))

            "prompt" -> hub.prompt(sessionId, field("text"), images(payload), echo = echo(payload))

            // A command through "!" - the panel's bash mode.
            "bash" -> hub.catalog.runShellCommand(clientId, sessionId, field("id"), field("command"))

            "stop" -> hub.interrupt(sessionId)

            "kill" -> hub.kill(sessionId)

            // The cross on a chip: we kill one task - a subagent or a background command - while the
            // turn carries on. No answer of our own is needed: about the task's end the CLI reports
            // with an ordinary notification.
            "stopTask" -> hub.stopTask(sessionId, field("taskId"))

            "newSession" -> hub.openSession(
                id = sessionId,
                // A branch inherits the transcript of the conversation it was opened from.
                parentId = if (field("kind") == "branch") field("parentId").ifEmpty { MAIN_SESSION } else null,
                title = field("title"),
                quote = field("quote"),
                // Chosen in the request rather than taken from the settings - which is what a client
                // with no selectors of its own has to do (see SessionLaunch). The panel sends none of
                // these and behaves exactly as it did.
                launch = SessionLaunch(
                    model = field("model"),
                    effort = field("effort"),
                    mode = PermissionModes.normalize(field("mode")).takeIf { it in PermissionModes.KNOWN }.orEmpty(),
                ),
            )

            "closeSession" -> hub.closeSession(sessionId)

            /**
             * The name the interface guessed from the first message. It is worked out there rather than
             * here on purpose: the rule already exists in the interface, both clients have to use the
             * same one, and a copy of it in another language would drift.
             */
            "renameSession" -> hub.renameSession(sessionId, field("title"))

            "reorderGroups" -> hub.reorderGroups(field("groupId"), field("beforeGroupId").ifEmpty { null })

            // "Always" from a distance is served as a "once": it would otherwise write a permanent rule
            // into this machine's settings, which is a different act from unblocking one step.
            "permissionDecision" -> hub.permissions.decide(
                field("id"),
                if (local) field("decision") else RemoteCommands.soften(type, field("decision")),
            )

            "planDecision" -> hub.permissions.decidePlan(
                sessionId,
                itemId = field("id"),
                decision = field("decision"),
                message = field("message"),
                local = local,
            )

            "askAnswer" -> hub.permissions.answerAsk(
                sessionId,
                itemId = field("id"),
                answers = payload["answers"]?.jsonObject ?: JsonObject(emptyMap()),
                fallbackText = field("text"),
            )

            "askDismiss" -> hub.permissions.dismissAsk(field("id"))

            "setMode" -> hub.changeMode(sessionId, field("mode"))

            /**
             * What new tabs start in - the only thing that writes the saved mode. Deliberately apart
             * from "setMode": that one answers "how do I work in this tab right now", and a person who
             * wants one tab out of ten in plan mode is not saying anything about the other nine.
             *
             * No conversation is touched here, not even the open one: changing the default is a
             * decision about the future, and reaching into a running turn to apply it would be the very
             * surprise this separation exists to remove.
             */
            "setDefaultMode" -> ClaudePreferences.mode = PermissionModes.normalize(field("mode"))

            // Another model's context window has a size of its own - we ask for it again without
            // waiting for the next turn to end.
            "setModel" -> hub.changeModel(sessionId, field("model"))

            "setEffort" -> hub.conversations.setEffort(sessionId, field("effort"))

            "refreshUsage" -> hub.usage.refreshAll()

            /**
             * Remote access, turned on and off by hand. The connection follows immediately rather than
             * at the next start: a person who has just switched it on is looking at the screen.
             */
            "setRemoteEnabled" -> {
                ClaudePreferences.remoteEnabled = payload["enabled"]?.jsonPrimitive?.booleanOrNull == true
                RemoteAgent.getInstance().refresh()
                hub.broadcastRemoteState()
            }

            /**
             * Pairing, from the panel and only from the panel. A device asking to start one would be a
             * device asking to be trusted, which is the one question it cannot be allowed to answer.
             */
            "startPairing" -> {
                RemoteAgent.getInstance().offerPairing()
                hub.broadcastRemoteState()
            }

            "cancelPairing" -> {
                RemoteAgent.getInstance().cancelPairing()
                hub.broadcastRemoteState()
            }

            "approvePairing" -> RemoteAgent.getInstance().approvePairing()

            "refusePairing" -> RemoteAgent.getInstance().refusePairing()

            "revokeDevice" -> RemoteAgent.getInstance().revoke(field("deviceId"))

            "revokeAllDevices" -> RemoteAgent.getInstance().revokeAll()

            "setRelayUrl" -> {
                ClaudePreferences.remoteRelayUrl = field("url")
                // The address changed under a live connection: it has to be dropped and raised again,
                // or the switch would appear to do nothing until the next restart.
                RemoteAgent.getInstance().stop()
                RemoteAgent.getInstance().refresh()
                hub.broadcastRemoteState()
            }

            "login" -> hub.auth.login()

            "logout" -> hub.auth.logout()

            "checkAuth" -> hub.auth.check()

            "history" -> hub.catalog.sendHistory(clientId)

            // A page further back than what the journal's own catch-up handed over - see
            // ClaudeHistory.page. "before" absent asks for the transcript's own last page.
            "historyPage" -> hub.catalog.sendHistoryPage(clientId, sessionId, field("before").ifEmpty { null })

            "resumeSession" -> hub.resumeConversation(sessionId, field("conversationId"))

            // The automatic search missed - the person pointed at the file themselves.
            "setExecutablePath" -> {
                ClaudePreferences.executablePath = field("path").trim()
                hub.auth.check()
            }

            "mcpList" -> hub.catalog.refreshMcp(sessionId)

            "mcpAdd" -> hub.catalog.addMcp(
                sessionId,
                name = field("name"),
                command = field("command"),
                transport = field("transport").ifBlank { null },
            )

            "mcpReconnect" -> hub.catalog.reconnectMcp(sessionId, field("name"))

            "mcpAuthenticate" -> hub.catalog.authenticateMcp(sessionId, field("name"))

            "mcpRemove" -> hub.catalog.removeMcp(sessionId, field("name"))

            "pluginList" -> hub.catalog.listPlugins()

            "pluginInstall" -> hub.catalog.pluginAction(field("plugin"), ClaudePlugin::install)

            "pluginUninstall" -> hub.catalog.pluginAction(field("plugin"), ClaudePlugin::uninstall)

            "pluginEnable" -> hub.catalog.pluginAction(field("plugin"), ClaudePlugin::enable)

            "pluginDisable" -> hub.catalog.pluginAction(field("plugin"), ClaudePlugin::disable)

            "marketplaceList" -> hub.catalog.listMarketplaces()

            "marketplaceAdd" -> hub.catalog.marketplaceAction(field("source"), ClaudePlugin::addMarketplace)

            "marketplaceRemove" -> hub.catalog.marketplaceAction(field("name"), ClaudePlugin::removeMarketplace)

            else -> return false
        }

        return true
    }

    /**
     * The parts of the message the feed draws it from, taken out of the request as they are. We do not
     * look inside: it is the interface that knows what a chip or a quote is, and a copy of that
     * knowledge here would be a second thing to keep in step with it.
     */
    private fun echo(payload: JsonObject): JsonObject? {
        val fields = ECHOED.mapNotNull { name -> payload[name]?.let { name to it } }
        return if (fields.isEmpty()) null else JsonObject(fields.toMap())
    }

    /** What the client says it already has, by conversation - see ClaudeSessionHub.attach. */
    private fun seen(payload: JsonObject): Map<String, Long> =
        payload["since"]?.jsonObject.orEmpty()
            .mapNotNull { (sessionId, value) -> value.jsonPrimitive.longOrNull?.let { sessionId to it } }
            .toMap()

    private fun images(payload: JsonObject): List<ImageAttachment> =
        payload["images"]?.jsonArray.orEmpty().mapNotNull { element ->
            val image = element as? JsonObject ?: return@mapNotNull null
            val mediaType = image["mediaType"]?.jsonPrimitive?.contentOrNull ?: return@mapNotNull null
            val data = image["data"]?.jsonPrimitive?.contentOrNull ?: return@mapNotNull null
            ImageAttachment(mediaType, data)
        }

    private companion object {
        /** What a message's echo carries besides its text - see [echo]. */
        val ECHOED = listOf("id", "tokens", "quotes", "steering")
    }
}

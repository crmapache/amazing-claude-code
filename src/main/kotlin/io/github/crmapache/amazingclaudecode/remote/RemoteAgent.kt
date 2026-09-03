package io.github.crmapache.amazingclaudecode.remote

import com.intellij.ide.RecentProjectsManager
import com.intellij.ide.ReopenProjectAction
import com.intellij.ide.impl.ProjectUtil
import com.intellij.openapi.Disposable
import com.intellij.openapi.application.ApplicationManager
import com.intellij.openapi.components.Service
import com.intellij.openapi.components.service
import com.intellij.openapi.diagnostic.thisLogger
import com.intellij.openapi.project.Project
import com.intellij.openapi.project.ProjectManager
import com.intellij.openapi.util.Disposer
import com.intellij.util.concurrency.AppExecutorUtil
import io.github.crmapache.amazingclaudecode.claude.ClaudePreferences
import io.github.crmapache.amazingclaudecode.claude.ClaudeSessionHub
import io.github.crmapache.amazingclaudecode.claude.SessionClient
import io.github.crmapache.amazingclaudecode.claude.SessionLaunch
import io.github.crmapache.amazingclaudecode.stats.StatsLedger
import io.github.crmapache.amazingclaudecode.net.IdeHttp
import java.net.http.HttpClient
import java.nio.charset.StandardCharsets
import java.nio.file.Path
import java.util.concurrent.ConcurrentHashMap
import java.util.concurrent.TimeUnit
import kotlinx.serialization.json.Json
import kotlinx.serialization.json.JsonArray
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.addJsonObject
import kotlinx.serialization.json.buildJsonObject
import kotlinx.serialization.json.contentOrNull
import kotlinx.serialization.json.jsonObject
import kotlinx.serialization.json.jsonPrimitive
import kotlinx.serialization.json.longOrNull
import kotlinx.serialization.json.put
import kotlinx.serialization.json.putJsonArray
import kotlinx.serialization.json.putJsonObject

/**
 * This IDE process as seen from outside: one connection to the relay, every open project inside it.
 *
 * One per process rather than per project, because the thing on the other end is a phone rather than a
 * window: what it wants is "everything this machine is working on", and a connection for each window
 * would multiply the reconnects by however many happen to be open.
 *
 * Off unless it has been turned on. What this opens is not "a view of the feed" but a channel that can
 * send messages to an agent with a shell on this machine, and that is not something anyone should
 * acquire by installing a plugin. What arrives over it goes through the same single entrance the panel
 * uses (see SessionCommands) with the remote list applied - so a message type nobody has thought about
 * is refused rather than executed.
 */
@Service(Service.Level.APP)
internal class RemoteAgent : Disposable {

    private val projects = ConcurrentHashMap<String, Attachment>()

    private val outbox = RemoteOutbox()

    private val state = RemoteState.getInstance()

    @Volatile
    private var link: RelayLink? = null

    /**
     * One conversation's worth of a phone's attention. The phone says which project and session it is
     * watching; everything else is queued rather than sent - a device reading one tab does not need
     * the other five.
     */
    private data class Subscription(val projectKey: String, val sessionId: String, val since: Long)

    /** When each device last said anything - what decides between sending and ringing. */
    private val lastHeard = ConcurrentHashMap<String, Long>()

    /** A push of the inventory is already scheduled - see [scheduleInventory]. */
    private val inventoryDue = java.util.concurrent.atomic.AtomicBoolean(false)

    /** When each device was last told its keys are stale - see [askForNewSession]. */
    private val resyncAsked = ConcurrentHashMap<String, Long>()

    /**
     * The handshake each device is currently on: what it offered, and what was answered.
     *
     * Kept because the same request genuinely arrives more than once. A phone that asked while this IDE
     * was shut sits in the relay's buffer, and the whole buffer lands at once the moment the IDE comes
     * back - three or four copies of "let us resume". Answering each with fresh keys leaves this side on
     * the last of them and the phone on the first, and from then on nothing either sends can be opened
     * by the other. Nothing says so, either: frames that will not open are dropped in silence, so it
     * looks exactly like a feature that does not work.
     */
    private val handshakes = ConcurrentHashMap<String, Handshake>()

    private class Handshake(val devicePub: String, val agentPub: String)

    /**
     * Where the closed projects offered to a phone actually are, by the key they travel under.
     *
     * The paths live here and are never sent (see [recentProjects]). It doubles as the list of what may
     * be opened from outside: a key nobody was offered opens nothing, so a request cannot name a
     * directory of its own.
     */
    private val recents = ConcurrentHashMap<String, String>()

    private val subscriptions = ConcurrentHashMap<String, Subscription>()

    /** The live cryptographic state per paired device - keys, counters, what has been seen. */
    private val sessions = DeviceSessions()

    /**
     * The pairing on offer right now, if any. In memory alone: a secret that only has to survive three
     * minutes has no business being written down.
     */
    @Volatile
    private var offer: Pairing.Offer? = null

    /**
     * A device that has proved it saw the QR code and is waiting for a person to say yes in the IDE.
     *
     * The proof is not enough by itself, and the gap it leaves is a human one rather than a
     * cryptographic one: someone who photographed the screen, or saw it in a recording, and scanned it
     * before you did. One press closes that, and it costs a person two seconds.
     */
    @Volatile
    private var awaitingApproval: PendingDevice? = null

    private class PendingDevice(
        val deviceId: String,
        val label: String,
        val fingerprint: String,
        val session: Pairing.Session,
        val agentEphemeralPub: String,
        val proof: ByteArray,
        val address: ByteArray,
    )

    private class Attachment(val project: Project, val hub: ClaudeSessionHub, val client: RelayClient)

    // --- Projects ------------------------------------------------------------------

    /**
     * A project has opened. Nothing goes over the network for this: the agent takes note, and the
     * connection is raised only when the feature is on and there is something to carry.
     */
    fun attach(project: Project) {
        if (project.isDisposed) return

        val key = projectKey(project)
        if (projects.containsKey(key)) return

        val hub = ClaudeSessionHub.getInstance(project)
        val client = RelayClient(key)

        projects[key] = Attachment(project, hub, client)
        hub.register(client)
        // The hub knows what happened and what it means; this side knows who is asleep and how to
        // reach them. Neither could do the other's half.
        hub.onNotification { sessionId, reason, target -> notify(sessionId, reason, target) }
        // And the list a phone draws: it is not sent the messages of conversations it is not watching,
        // so nothing else would tell it that one of them has started working.
        hub.onInventoryChanged { scheduleInventory() }

        // The project's conversations outlive the panel but not the project: when it closes, this goes
        // with it.
        Disposer.register(hub) { detach(key) }

        if (enabled()) start()
    }

    private fun detach(key: String) {
        val attachment = projects.remove(key) ?: return
        runCatching { attachment.hub.detach(attachment.client.id) }
        if (projects.isEmpty()) stop()
    }

    /**
     * Every project already open.
     *
     * Needed because turning the feature on happens in the middle of a working day, long after every
     * open project's startup activity has run and been forgotten. Without this, switching it on would
     * light up nothing until the next window was opened.
     */
    fun attachOpenProjects() {
        for (project in ProjectManager.getInstance().openProjects) attach(project)
    }

    // --- The connection -------------------------------------------------------------

    /**
     * Whether this IDE may be reached from outside.
     *
     * The system property is for a sandbox run and nothing else - it is how the whole chain (relay,
     * agent, phone) gets exercised without clicking through the panel first. In an ordinary IDE it is
     * unset, and then the only thing that turns this on is a person deciding to.
     */
    fun enabled(): Boolean =
        ClaudePreferences.remoteEnabled || System.getProperty(RELAY_PROPERTY).orEmpty().isNotEmpty()

    fun relayUrl(): String =
        System.getProperty(RELAY_PROPERTY).orEmpty()
            .ifEmpty { ClaudePreferences.remoteRelayUrl }
            .ifEmpty { DEFAULT_RELAY }

    /**
     * Raise the connection if it is wanted and not already up.
     *
     * The address is only allowed to be a secure one, and not out of strictness: a browser hands a page
     * `crypto.subtle` only in a secure context, so a relay over plain HTTP does not weaken the
     * encryption of phase 3 - it removes it. Loopback is the exception, because a browser treats it as
     * secure and it is where this gets developed.
     */
    @Synchronized
    fun start() {
        if (!enabled() || link != null) return

        val url = relayUrl()
        if (!isSecure(url)) {
            thisLogger().warn("The relay address must be wss:// (or ws:// on localhost): $url")
            return
        }

        val started = RelayLink(
            address = state.address(),
            relayUrl = url,
            outbox = outbox,
            onFrame = ::receive,
            onState = ::announce,
            clientOf = ::httpClient,
        )

        // The slot is claimed before the projects are attached, and the order is the whole point:
        // attach() finishes by calling this method again, and @Synchronized does not stop it - a JVM
        // monitor is reentrant, so the same thread walks straight back in. With the assignment after
        // the attaching, both passes found link still null and built a link each. Two connections from
        // one IDE means the relay displaces the first with the second (close 4009), and a displacement
        // is fatal by design - so switching the feature on refused itself twenty milliseconds later.
        link = started
        attachOpenProjects()
        started.start()

        // Both a heartbeat and a drain: the queue is emptied from one place, because the JDK's client
        // refuses a second send before the first has finished.
        val beat = AppExecutorUtil.getAppScheduledExecutorService().scheduleWithFixedDelay(
            {
                started.checkAlive(System.currentTimeMillis())
                started.flush(::resyncFrames)
            },
            BEAT_SECONDS,
            BEAT_SECONDS,
            TimeUnit.SECONDS,
        )

        Disposer.register(this) { beat.cancel(false) }
    }

    @Synchronized
    fun stop() {
        link?.stop()
        link = null
        outbox.clear()
        subscriptions.clear()
    }

    /** Turned on or off by a person - the connection follows immediately rather than at the next start. */
    fun refresh() {
        if (enabled()) start() else stop()
    }

    fun state(): RelayLink.State = link?.state ?: RelayLink.State.IDLE

    /** The way out this machine has - the proxy and the certificates the IDE itself uses (see IdeHttp). */
    private fun httpClient(): HttpClient = IdeHttp.client()

    // --- Frames ---------------------------------------------------------------------

    /**
     * A frame from the other side.
     *
     * In phase 2 the body is plain JSON. In phase 3 it is sealed, and this is the one place that
     * changes: everything below reads an application frame, and where it came from is not its business.
     */
    private fun receive(envelope: Frame.Envelope) {
        if (envelope.type == Frame.TYPE_CONTROL) {
            // The relay's own word, and the only one it ever says. Advice, never content: it means the
            // buffer broke, so whoever is watching should ask again from their last number.
            thisLogger().info("The relay reported a break - the device will resynchronise")
            return
        }

        val deviceId = Frame.encodeAddress(envelope.from)
        lastHeard[deviceId] = System.currentTimeMillis()

        // A paired device: the body is sealed, and opening it is also what proves who sent it. A frame
        // that does not open is one from a revoked device or one altered on the way, and both are
        // answered the same way - by dropping it.
        if (sessions.isOpen(deviceId)) {
            val opened = sessions.open(deviceId, envelope)

            if (opened != null) {
                handle(envelope.from, deviceId, parse(opened) ?: return)
                return
            }

            // It did not open. Usually that means a revoked device or an altered frame, and dropping it
            // is the whole answer. But it is also what a reconnect looks like: the device's socket
            // dropped, its session keys went with it, and it is asking for new ones in the open. That
            // request is the one thing worth reading here - and reading it costs nothing, because it
            // still has to prove itself with the key from pairing.
            val reopening = parse(envelope.body)
            if (reopening?.get("k")?.jsonPrimitive?.contentOrNull == "sessionInit") {
                sessionInit(envelope.from, reopening)
                return
            }

            // Sealed with something this side cannot open, and not a request to start again. The
            // honest reading is that the two halves have drifted apart, and the only thing that gets
            // them back is somebody saying so: dropped in silence, this looks to a person like a
            // button that does nothing.
            askForNewSession(envelope.from, deviceId)

            return
        }

        // Nobody paired: the only thing worth reading is an offer to pair, and it cannot be sealed -
        // there is no key yet. Everything else from an unknown address is ignored without an answer.
        val payload = parse(envelope.body) ?: return

        when (payload["k"]?.jsonPrimitive?.contentOrNull) {
            "pairInit" -> pairInit(envelope.from, deviceId, payload)
            "sessionInit" -> sessionInit(envelope.from, payload)
            else -> thisLogger().info("A frame from an address this agent has never paired with - dropped")
        }
    }

    private fun parse(body: ByteArray): JsonObject? = runCatching {
        Json.parseToJsonElement(String(body, StandardCharsets.UTF_8)).jsonObject
    }.getOrNull()

    private fun handle(address: ByteArray, deviceId: String, payload: JsonObject) {
        when (payload["k"]?.jsonPrimitive?.contentOrNull) {
            "subscribe" -> subscribe(address, payload)
            "cmd" -> command(address, payload)
            "inventory" -> sendInventory(address)
            "openProject" -> openProject(address, payload)
            else -> thisLogger().info("A frame of a kind this agent does not know from $deviceId")
        }
    }

    /**
     * A device that paired earlier is back.
     *
     * No QR code, and no long-lived key doing any encrypting either: both sides bring fresh ephemeral
     * keys and the long-lived one only proves who they are. That is what makes a recording of today's
     * traffic worthless to someone who steals a key next year - this connection's keys are already
     * gone.
     *
     * The device names itself, and being wrong about that costs nothing: a device whose long-lived key
     * is not the one this agent stored derives different session keys, and everything it sends after
     * this simply fails to open.
     */
    private fun sessionInit(address: ByteArray, payload: JsonObject) {
        // Who it is comes from the address it connected with, not from a field it filled in. The relay
        // refuses a frame whose sender is not the address the socket was opened as, so the address
        // cannot be claimed - a name inside the body can.
        val deviceId = Frame.encodeAddress(address)
        val devicePub = payload["ephemeralPub"]?.jsonPrimitive?.contentOrNull.orEmpty()
        if (devicePub.isEmpty()) return

        val auth = RemoteKeys.deviceSecret(state.agentId(), deviceId) ?: run {
            // Not a device this agent knows - or one that has been revoked. Either way there is nothing
            // to answer with, and answering would only tell a stranger which addresses are real.
            thisLogger().info("A device asked to resume that this agent has not paired with")
            return
        }

        // The same offer as last time: the copy of a request that has already been answered. It gets the
        // answer it got before rather than a new one, which is what keeps both sides on one set of keys.
        val repeated = handshakes[deviceId]
        if (repeated != null && repeated.devicePub == devicePub && sessions.isOpen(deviceId)) {
            thisLogger().info("A device asked to resume with an offer already answered - the same answer goes back")
            sendPlain(
                address,
                buildJsonObject {
                    put("p", PROTOCOL_VERSION)
                    put("k", "sessionAck")
                    put("ephemeralPub", repeated.agentPub)
                    put("for", devicePub)
                },
            )
            return
        }

        val deviceEphemeral = RemoteKeys.decodePublic(devicePub) ?: return
        val ephemeral = RemoteKeys.generate()
        val agentPub = RemoteKeys.encodePublic(ephemeral.public)

        val session = Pairing.resume(
            auth = auth,
            ephemeralSecret = RemoteKeys.agree(ephemeral.private, deviceEphemeral),
            agentId = state.agentId(),
            deviceId = deviceId,
            agentEphemeralPub = agentPub,
            deviceEphemeralPub = devicePub,
        )

        sessions.open(deviceId, session)
        handshakes[deviceId] = Handshake(devicePub, agentPub)

        // In the open, because the device has no key for this connection yet - this frame is what gives
        // it one. Nothing secret is in it: an eavesdropper learns two ephemeral public keys and cannot
        // derive anything from them without one of the private halves.
        sendPlain(
            address,
            buildJsonObject {
                put("p", PROTOCOL_VERSION)
                put("k", "sessionAck")
                put("ephemeralPub", agentPub)
                // Which offer this answers. The device has usually made only one, but not always: a
                // request sent while this IDE was shut waits in the relay and lands beside a newer one
                // when it starts. Saying which is which is what lets the device ignore the answer to an
                // offer it has already moved on from - and ignoring it is the difference between a
                // connection that works and two halves holding different keys in silence.
                put("for", devicePub)
            },
        )

        state.devices().firstOrNull { it.id == deviceId }?.let { device ->
            device.lastSeenAt = System.currentTimeMillis()
            state.remember(device)
        }

        announceRemoteState()
    }

    // --- Pairing ---------------------------------------------------------------------

    /**
     * Start offering a pairing. The code is worth something for three minutes and once - and it only
     * exists while this screen is open, because a secret nobody is looking at is a secret waiting to be
     * used by somebody else.
     */
    /** The offer on the table right now, if there is one - the address and when it stops being worth anything. */
    fun pairingOffer(): Pair<String, Long>? {
        val live = offer ?: return null
        if (live.used || System.currentTimeMillis() > live.expiresAt) return null

        return offerUrl to live.expiresAt
    }

    /**
     * What this IDE calls itself: the product and the machine, as a person would name it.
     *
     * Made here rather than asked of the person: a phone with two pairings needs to tell them apart on
     * day one, and "WebStorm on max-mbp" does that without anybody being asked to invent a name.
     */
    fun label(): String {
        val product = com.intellij.openapi.application.ApplicationInfo.getInstance().versionName
        val machine = runCatching { java.net.InetAddress.getLocalHost().hostName }
            .getOrNull()
            ?.substringBefore('.')
            .orEmpty()

        return if (machine.isEmpty()) product else "$product on $machine"
    }

    /** This IDE's own fingerprint - what a phone shows back so a person can compare the two. */
    fun fingerprint(): String? = RemoteKeys.identity(state.agentId())?.let { Pairing.fingerprintOf(it) }

    fun offerPairing(): String? {
        val identity = RemoteKeys.identity(state.agentId()) ?: return null
        val secret = Pairing.newSecret()

        offer = Pairing.Offer(secret, System.currentTimeMillis() + Pairing.OFFER_LIFETIME_MS)
        offerUrl = Pairing.offerUrl(
            relayUrl = relayUrl(),
            agentId = state.agentId(),
            secret = secret,
            fingerprint = Pairing.fingerprintOf(identity),
        )

        announceRemoteState()
        return offerUrl
    }

    /**
     * The address behind the QR code. Kept beside the offer rather than rebuilt on demand: it contains
     * the secret, and building it twice would mean handling that secret twice for no reason.
     */
    @Volatile
    private var offerUrl: String = ""

    fun cancelPairing() {
        offer = null
        awaitingApproval = null
    }

    /** What the IDE is waiting for a person to confirm, if anything - see [approvePairing]. */
    fun pendingPairing(): Triple<String, String, String>? =
        awaitingApproval?.let { Triple(it.deviceId, it.label, it.fingerprint) }

    /**
     * A device says it saw the code.
     *
     * The proof is checked before anything else happens and in constant time: a wrong answer must not
     * tell anybody how nearly right it was. A wrong one does not burn the code either - noise on a
     * public relay should not cost a person their pairing - but a run of them does.
     */
    private fun pairInit(address: ByteArray, deviceId: String, payload: JsonObject) {
        val live = offer

        if (live == null || live.used || System.currentTimeMillis() > live.expiresAt) {
            thisLogger().info("A pairing arrived with no code on offer")
            return
        }

        val text = { name: String -> payload[name]?.jsonPrimitive?.contentOrNull.orEmpty() }
        val deviceStatic = text("staticPub")
        val deviceEphemeral = text("ephemeralPub")
        val proof = runCatching { java.util.Base64.getDecoder().decode(text("proof")) }.getOrNull()

        if (deviceStatic.isEmpty() || deviceEphemeral.isEmpty() || proof == null) return

        val expected = Pairing.deviceProof(live.secret, state.agentId(), deviceStatic, deviceEphemeral, deviceId)

        if (!Sealing.sameBytes(expected, proof)) {
            val attempts = live.attempts + 1
            thisLogger().warn("A pairing proof did not check out (attempt $attempts)")
            offer = if (attempts >= Pairing.MAX_ATTEMPTS) null else live.copy(attempts = attempts)
            return
        }

        val identity = RemoteKeys.identity(state.agentId()) ?: return
        val deviceStaticKey = RemoteKeys.decodePublic(deviceStatic) ?: return
        val deviceEphemeralKey = RemoteKeys.decodePublic(deviceEphemeral) ?: return

        val ephemeral = RemoteKeys.generate()
        val agentEphemeralPub = RemoteKeys.encodePublic(ephemeral.public)

        val session = Pairing.derive(
            staticSecret = RemoteKeys.agree(identity.private, deviceStaticKey),
            ephemeralSecret = RemoteKeys.agree(ephemeral.private, deviceEphemeralKey),
            qrSecret = live.secret,
            agentId = state.agentId(),
            deviceId = deviceId,
            agentEphemeralPub = agentEphemeralPub,
            deviceEphemeralPub = deviceEphemeral,
        )

        // The code is spent on the first proof that checks out, whatever the person decides next: a
        // code that survived a refusal could be used again by whoever was refused.
        offer = live.copy(used = true)

        awaitingApproval = PendingDevice(
            deviceId = deviceId,
            label = text("label").ifEmpty { "A device" },
            fingerprint = Sealing.fingerprint(deviceStaticKey.encoded),
            session = session,
            agentEphemeralPub = agentEphemeralPub,
            proof = Pairing.agentProof(
                live.secret,
                state.agentId(),
                deviceId,
                RemoteKeys.encodePublic(identity.public),
                agentEphemeralPub,
            ),
            address = address,
        )

        announceRemoteState()
    }

    /**
     * The person said yes. Only now does the device learn the agent's key, and only now can anything
     * be sealed to it.
     */
    fun approvePairing() {
        val pending = awaitingApproval ?: return
        val identity = RemoteKeys.identity(state.agentId()) ?: return

        sessions.open(pending.deviceId, pending.session)
        RemoteKeys.rememberDevice(state.agentId(), pending.deviceId, pending.session.auth)

        state.remember(
            RemoteState.Device().apply {
                id = pending.deviceId
                label = pending.label
                fingerprint = pending.fingerprint
                pairedAt = System.currentTimeMillis()
                lastSeenAt = System.currentTimeMillis()
            },
        )

        // Sent in the open, because the device has no key yet - it is this frame that gives it one. The
        // proof inside is what stops a relay having written it.
        sendPlain(
            pending.address,
            buildJsonObject {
                put("p", PROTOCOL_VERSION)
                put("k", "pairAck")
                put("agentId", state.agentId())
                // What to call this IDE in the phone's own list. Without it a phone would list its
                // pairings by 22 characters of base64, which tells nobody which laptop is which.
                put("label", label())
                put("staticPub", RemoteKeys.encodePublic(identity.public))
                put("ephemeralPub", pending.agentEphemeralPub)
                put("proof", java.util.Base64.getEncoder().encodeToString(pending.proof))
            },
        )

        awaitingApproval = null
        offer = null

        // A phone paired is an achievement of its own - the one thing here the statistics count.
        runCatching { StatsLedger.getInstance().notePaired() }

        // Written out now rather than at the next shutdown. The platform would save it eventually, but
        // "eventually" includes crashing first - and a pairing lost that way is a person scanning a QR
        // code again with no idea why.
        runCatching { ApplicationManager.getApplication().saveSettings() }

        announceRemoteState()
    }

    fun refusePairing() {
        awaitingApproval = null
        offer = null
        announceRemoteState()
    }

    /**
     * Forget a device.
     *
     * Local and immediate, which is the whole point: with the secret gone its frames no longer open, so
     * nothing has to reach the phone and the relay has to be told nothing. It therefore works while the
     * phone is switched off - which is exactly when someone is most likely to want it.
     */
    fun revoke(deviceId: String) {
        sessions.close(deviceId)
        handshakes.remove(deviceId)
        resyncAsked.remove(deviceId)
        RemoteKeys.forgetDevice(state.agentId(), deviceId)
        state.forget(deviceId)
        subscriptions.remove(deviceId)
        countWatchers()
        announceRemoteState()
    }

    fun revokeAll() {
        for (device in state.devices()) revoke(device.id)
    }

    /** Tell every project's panel how many devices are watching it - see ClaudeSessionHub. */
    private fun countWatchers() {
        for ((key, attachment) in projects) {
            attachment.hub.noteRemoteWatchers(subscriptions.values.count { it.projectKey == key })
        }
    }

    /** Everything the remote access screen draws, to every panel attached to this IDE. */
    private fun announceRemoteState() {
        for (attachment in projects.values) attachment.hub.broadcastRemoteState()
    }

    /**
     * Tell a device its keys are no longer ours, so it offers new ones.
     *
     * In the open, because there is by definition no key both sides agree on - and nothing secret is
     * said: it carries no more than "start again". Rate limited per device, so that a stream of
     * rubbish from anywhere cannot turn into a stream of these.
     */
    private fun askForNewSession(device: ByteArray, deviceId: String) {
        val now = System.currentTimeMillis()
        val asked = resyncAsked[deviceId] ?: 0
        if (now - asked < RESYNC_INTERVAL_MS) return

        resyncAsked[deviceId] = now
        thisLogger().info("A frame from $deviceId would not open - asking it to start a new session")

        sendPlain(
            device,
            buildJsonObject {
                put("p", PROTOCOL_VERSION)
                put("k", "sessionStale")
            },
        )
    }

    private fun sendPlain(device: ByteArray, body: JsonObject) {
        outbox.offer(
            Frame.build(
                type = Frame.TYPE_SEALED,
                to = device,
                from = state.address(),
                counter = 0,
                body = body.toString().toByteArray(StandardCharsets.UTF_8),
            ),
        )

        link?.flush(::resyncFrames)
    }

    private fun subscribe(device: ByteArray, payload: JsonObject) {
        val projectKey = payload["pj"]?.jsonPrimitive?.contentOrNull.orEmpty()
        val sessionId = payload["s"]?.jsonPrimitive?.contentOrNull.orEmpty()
        val since = payload["q"]?.jsonPrimitive?.longOrNull ?: 0

        if (projectKey.isEmpty() || sessionId.isEmpty()) return

        subscriptions[Frame.encodeAddress(device)] = Subscription(projectKey, sessionId, since)
        countWatchers()
        thisLogger().info("A device is now watching $sessionId from $since")

        val attachment = projects[projectKey] ?: return
        attachment.client.catchUp(attachment.hub, sessionId, since)
    }

    /**
     * Something the device asked for. It goes through the same door the panel's own requests go
     * through, with the remote list applied there - this is not the place that decides what is allowed,
     * because a second such place is a second thing to get wrong.
     */
    private fun command(device: ByteArray, payload: JsonObject) {
        val projectKey = payload["pj"]?.jsonPrimitive?.contentOrNull.orEmpty()
        val message = payload["b"] as? JsonObject ?: return
        val attachment = projects[projectKey] ?: return

        // Named as the device rather than as this client: how fast anyone may ask is a question about
        // one phone, and every phone paired with this IDE arrives through the same client.
        attachment.hub.commands.handle(attachment.client.id, message, asker = Frame.encodeAddress(device))
    }

    /**
     * Open a project this IDE remembers, and start a conversation in it.
     *
     * The one thing here that a phone cannot already do through an open project, and it is deliberate
     * rather than convenient: an IDE that has been restarted has no project open at all, and a phone
     * that can only reach what is already on screen is useless at exactly the moment it is picked up.
     *
     * Two things bound it. The project must be one the platform's own Recent Projects list already
     * offers - a key that was never sent opens nothing, so no request can name a directory of its own.
     * And the window opens on the work machine in plain sight: this is not a way to run something on
     * somebody's computer quietly.
     */
    private fun openProject(device: ByteArray, payload: JsonObject) {
        val key = payload["pj"]?.jsonPrimitive?.contentOrNull.orEmpty()
        val sessionId = payload["s"]?.jsonPrimitive?.contentOrNull.orEmpty()
        val path = recents[key]

        if (sessionId.isEmpty() || path == null) {
            // A stale list on a phone is the ordinary cause: the project has since been opened at the
            // desk, or dropped out of the recent list. Saying so is what lets the phone ask again.
            thisLogger().info("A device asked for a project this agent is not offering")
            answerOpen(device, sessionId, error = "That project is no longer on this IDE's list.")
            return
        }

        val title = payload["title"]?.jsonPrimitive?.contentOrNull.orEmpty()
        val launch = payload["launch"] as? JsonObject

        // Off the frame-reading thread: opening a project loads a whole IDE window, and the socket has
        // frames to carry in the meantime.
        ApplicationManager.getApplication().executeOnPooledThread {
            val opened = runCatching { ProjectUtil.openOrImport(Path.of(path), null, false) }
                .onFailure { thisLogger().warn("The project at $path could not be opened", it) }
                .getOrNull()

            if (opened == null || opened.isDisposed) {
                answerOpen(device, sessionId, error = "The IDE could not open that project.")
                return@executeOnPooledThread
            }

            // The startup activity does this too, and getting there first costs nothing: attaching an
            // already attached project returns at once. Waiting for it instead would mean answering the
            // phone before there is anything to answer with.
            attach(opened)

            val attachment = projects[projectKey(opened)]

            if (attachment == null) {
                answerOpen(device, sessionId, error = "The project opened but this IDE did not pick it up.")
                return@executeOnPooledThread
            }

            attachment.hub.openSession(
                id = sessionId,
                parentId = null,
                title = title,
                quote = "",
                launch = SessionLaunch(
                    model = launch?.get("model")?.jsonPrimitive?.contentOrNull.orEmpty(),
                    effort = launch?.get("effort")?.jsonPrimitive?.contentOrNull.orEmpty(),
                    mode = launch?.get("mode")?.jsonPrimitive?.contentOrNull.orEmpty(),
                ),
            )

            // Its key now that it is open - which is what the phone subscribes with. The key it asked
            // under names a project on the recent list and is of no use once it is open.
            answerOpen(device, sessionId, projectKey = projectKey(opened))
        }
    }

    /**
     * How a request to open a project ended.
     *
     * Answered rather than left to the inventory that follows: the phone has a screen waiting on this
     * and a refusal it cannot work out for itself - a list a few seconds out of date looks exactly like
     * an IDE that failed to open something.
     */
    private fun answerOpen(device: ByteArray, sessionId: String, projectKey: String = "", error: String = "") {
        send(
            device,
            buildJsonObject {
                put("p", PROTOCOL_VERSION)
                put("k", "projectOpened")
                put("s", sessionId)
                put("ok", error.isEmpty())
                if (projectKey.isNotEmpty()) put("pj", projectKey)
                if (error.isNotEmpty()) put("error", error)
            },
        )
    }

    /**
     * What this machine has: every open project and its conversations, with enough about each for a
     * list to be drawn - which of them is running, and which is stopped waiting for a person.
     *
     * It travels inside the sealed body like everything else. An "efficient" plain inventory for the
     * relay to route by would hand it every project name on the machine, which is precisely the sort of
     * convenience the privacy claim dies of.
     */
    private fun sendInventory(device: ByteArray) {
        send(device, inventoryBody())
    }

    /**
     * The same list, to everyone holding a phone, because something in it has moved.
     *
     * Debounced: a turn's start, a permission and its answer arrive within milliseconds of each other,
     * and a frame for each of them would be three frames saying the same thing to a device on mobile
     * data. Waiting a fifth of a second collapses them into one and is imperceptible next to the
     * network the frame then crosses.
     */
    private fun scheduleInventory() {
        if (link == null) return
        if (!inventoryDue.compareAndSet(false, true)) return

        AppExecutorUtil.getAppScheduledExecutorService().schedule(
            {
                inventoryDue.set(false)
                runCatching { broadcastInventory() }
                    .onFailure { thisLogger().warn("The inventory could not be sent", it) }
            },
            INVENTORY_DEBOUNCE_MS,
            TimeUnit.MILLISECONDS,
        )
    }

    private fun broadcastInventory() {
        if (link == null) return

        val now = System.currentTimeMillis()
        val awake = sessions.openDevices().filter { now - (lastHeard[it] ?: 0) < AWAKE_MS }
        if (awake.isEmpty()) return

        val body = inventoryBody()

        for (deviceId in awake) {
            val address = runCatching { Frame.decodeAddress(deviceId) }.getOrNull() ?: continue
            send(address, body)
        }
    }

    private fun inventoryBody(): JsonObject {
        val closed = recentProjects()

        val body = buildJsonObject {
            put("p", PROTOCOL_VERSION)
            put("k", "inventory")
            // What time it is on this machine, so a phone can count a running turn against this clock
            // rather than against its own.
            //
            // Everything the feed measures time from is stamped here (see JournalMarks in the panel's
            // protocol), and the two clocks disagree by however much they disagree: a phone subtracting
            // one from the other showed a turn that had just begun as having begun in the future, and
            // wrote the seconds under "Claude is thinking" with a minus in front of them.
            //
            // The inventory carries it rather than the journal's own entries, because those say when
            // something happened rather than what time it is now: a conversation caught up from its
            // journal is a pile of moments hours old, and a clock set by them would be hours slow. This
            // one is written as it is sent - and it is sent whenever a conversation's state changes and
            // every half minute regardless (see the phone's probe), so it is never stale for long.
            put("at", System.currentTimeMillis())
            // The catalogue of models, so a conversation started from a phone can be started on a
            // chosen one. It belongs to the machine rather than to a project - it is what this
            // installation of the CLI offers, bans by an organization included - so it is asked of
            // whichever project has already learned it and sent once (see ProjectUsage.sendModels).
            models()?.let { put("models", it) }
            // And what is chosen at the desk, so that a phone offering the same choice can start from
            // it rather than from an invention of its own. Empty fields travel as they are: empty means
            // "however Claude Code is configured here", which is a real answer and not a missing one.
            putJsonObject("prefs") {
                val preferences = ClaudePreferences.snapshot()
                put("model", preferences.model)
                put("effort", preferences.effort)
                put("mode", preferences.mode)
            }
            putJsonArray("projects") {
                for ((key, attachment) in projects) {
                    if (attachment.project.isDisposed) continue

                    addJsonObject {
                        put("key", key)
                        put("name", attachment.project.name)
                        putJsonArray("sessions") {
                            for (tab in attachment.hub.tabs.tabs()) {
                                val snapshot = attachment.hub.snapshotOf(tab.id)
                                addJsonObject {
                                    put("id", tab.id)
                                    put("title", tab.title)
                                    // Whether that name means anything yet. A phone writing the first
                                    // message into a tab has to name it, exactly as the panel does -
                                    // and this is what tells it the tab is still called "new session"
                                    // rather than something a person would recognise.
                                    put("titleSource", tab.titleSource)
                                    put("status", snapshot.status)
                                    put("awaitsYou", snapshot.awaitsYou)
                                    // The other two states the panel's own dot has, so that one mark
                                    // means the same thing on both screens: work that is done, and a
                                    // conversation whose process died under it. Neither can be worked
                                    // out from status and awaitsYou - see SessionSnapshot.worked.
                                    put("worked", snapshot.worked)
                                    put("crashed", snapshot.crashed)
                                    // Which conversation stands behind the tab - so that a past one
                                    // picked in the history opens the tab it is already in rather than a
                                    // second one just like it (see tabHolding in feed/resume.ts). Known
                                    // from the first second for a resumed conversation and only once the
                                    // process has said so for a fresh one, which is the honest answer in
                                    // both cases: a conversation with no name yet is in no tab.
                                    attachment.hub.conversations.conversationIdOf(tab.id)?.let { put("conversation", it) }
                                    put("q", attachment.hub.lastSeq(tab.id))
                                }
                            }
                        }
                    }
                }
            }
            // Projects this IDE has open elsewhere in its history rather than on screen. A phone is
            // opened to start something as often as to answer something, and "the project I worked on
            // yesterday" is not on the list of open windows.
            putJsonArray("recents") {
                for ((key, recent) in closed) {
                    addJsonObject {
                        put("key", key)
                        put("name", recent.name)
                    }
                }
            }
        }

        return body
    }

    /**
     * The model catalogue, from whichever project has one.
     *
     * The first that answers rather than a merge: the list comes from the CLI on this machine and is
     * the same wherever it is asked from. A project that has never had a conversation has not asked
     * for it, which is why the search runs at all rather than taking the first project.
     */
    private fun models(): JsonArray? {
        for (attachment in projects.values) {
            if (attachment.project.isDisposed) continue

            val message = attachment.hub.projectFact("models") ?: continue
            val models = runCatching { Json.parseToJsonElement(message).jsonObject["models"] }
                .getOrNull() as? JsonArray ?: continue

            if (models.isNotEmpty()) return models
        }

        return null
    }

    /**
     * The projects this IDE remembers and does not have open, newest first.
     *
     * By an opaque key rather than by a path, exactly as an open project travels (see [projectKey]).
     * A phone has no use for where a project sits on disk, and a list of everything on somebody's
     * machine is precisely the sort of thing that must not leave it - not even inside a sealed body
     * that only their own phone can open. The paths stay here, in [recents], and the key is what comes
     * back in a request to open one.
     *
     * The list is what the platform's own "Recent Projects" shows, so nothing is reachable this way
     * that is not already one click away in the IDE.
     */
    private fun recentProjects(): Map<String, RecentProject> {
        val manager = RecentProjectsManager.getInstance()
        val open = projects.values.mapNotNull { it.project.basePath }.toSet()

        val found = LinkedHashMap<String, RecentProject>()

        // Deprecated, and used knowingly: what replaced it (RecentProjectsManagerBase.getRecentPaths) sits
        // in a class closed to plugins, and the marketplace refuses a version that calls into one. A
        // deprecated public method is the supported way to ask this question - see the verifier's
        // settings in build.gradle.kts.
        for (action in runCatching { manager.getRecentProjectsActions(false) }.getOrDefault(emptyArray())) {
            val reopen = action as? ReopenProjectAction ?: continue
            val path = reopen.projectPath
            if (path.isEmpty() || path in open) continue

            // The platform can leave the name out - what it calls the project is then the folder it sits
            // in, which is what the Recent Projects list shows in that case too.
            val name = reopen.projectName?.takeIf { it.isNotBlank() }
                ?: Path.of(path).fileName?.toString().orEmpty()

            found[recentKey(path)] = RecentProject(path = path, name = name)
        }

        recents.clear()
        recents.putAll(found.mapValues { it.value.path })

        return found
    }

    private class RecentProject(val path: String, val name: String)

    /**
     * A closed project's name on the wire: the same path always gives the same key, and the key gives
     * nothing away about the path.
     */
    private fun recentKey(path: String): String {
        val digest = java.security.MessageDigest.getInstance("SHA-256").digest(path.toByteArray(StandardCharsets.UTF_8))

        return "r-" + java.util.Base64.getUrlEncoder().withoutPadding().encodeToString(digest).take(22)
    }

    /**
     * Send something to a paired device, sealed.
     *
     * Everything after pairing goes this way - the feed, the inventory, the answers. The one exception
     * is the pairing acknowledgement itself (see [sendPlain]), which cannot be sealed because it is
     * what hands the device the key.
     */
    private fun send(device: ByteArray, body: JsonObject) {
        val deviceId = Frame.encodeAddress(device)
        val sealed = sessions.seal(
            deviceId,
            to = device,
            from = state.address(),
            body = body.toString().toByteArray(StandardCharsets.UTF_8),
        )

        if (sealed == null) {
            // Not paired, or revoked while this was being prepared. Dropping it is the whole of the
            // handling: there is nobody to tell.
            thisLogger().info("Nothing to seal with for $deviceId - frame dropped")
            return
        }

        outbox.offer(sealed)
        link?.flush(::resyncFrames)
    }

    /** The marker a collapsed queue is replaced by - see RemoteOutbox. */
    /**
     * "Whatever was on its way to you is gone - ask again from the number you have."
     *
     * Sent when the outgoing queue collapsed (see RemoteOutbox): everything waiting was thrown away on
     * purpose, and a device that is not told simply sits there. It used to be one frame addressed to
     * nobody - sixteen zero bytes - which the relay routed to an address no one holds, so it reached
     * no phone and none of them ever asked. That is what a conversation opened on a phone and left
     * blank looked like from this side: the journal was handed over, the queue gave up on it, and the
     * only word about that went into a hole.
     *
     * One frame per paired device, sealed like anything else: a device whose session keys are not open
     * gets nothing here - it has a handshake to finish first, and that ends in a fresh subscription
     * anyway.
     */
    private fun resyncFrames(): List<ByteArray> =
        state.devices().mapNotNull { device ->
            val address = runCatching { Frame.decodeAddress(device.id) }.getOrNull() ?: return@mapNotNull null

            sessions.seal(
                device.id,
                to = address,
                from = state.address(),
                body = """{"p":$PROTOCOL_VERSION,"k":"resync"}""".toByteArray(StandardCharsets.UTF_8),
            )
        }

    private fun announce(linkState: RelayLink.State) {
        thisLogger().info("The relay connection is now $linkState")

        // The whole state rather than this one field. A remoteState message is read as the complete
        // picture - the panel replaces what it holds with what arrives - so a message carrying only the
        // connection's state blanked the switch, the fingerprint, the paired devices and any pairing
        // half-done. On screen that was a panel saying "Connected" with the switch off and no way to
        // pair, which is how this was found.
        //
        // Reading it from the hub also settles which link speaks: broadcastRemoteState asks the agent
        // for its current one, so a link that has been superseded cannot announce its own death over a
        // healthy connection.
        announceRemoteState()
    }

    /**
     * One project's feed, as it goes to a phone.
     *
     * A device is sent what it asked for and nothing else: the conversation it is watching. The rest is
     * dropped here rather than queued - a phone reading one tab has no use for the other five, and
     * paying mobile data for them would be rude.
     */
    private inner class RelayClient(private val projectKey: String) : SessionClient {
        override val id = "${ClaudeSessionHub.RELAY_PREFIX}$projectKey"

        /**
         * Whether what is passing through [deliver] right now is a catch-up batch this client asked for
         * - see [catchUp]. On the thread doing the handing over, because that is exactly how far it
         * reaches: the hub builds the batch and delivers it in the same call.
         */
        private val catchingUp = ThreadLocal.withInitial { false }

        /**
         * A fingerprint of the last of each project fact that genuinely went out, per device.
         *
         * The file list is refreshed once a minute and is four thousand paths long; the branch is
         * re-read as often and changes on the days one switches it. Sending either again unchanged is
         * a hundred and sixty kilobytes of somebody's mobile data per minute for no news at all.
         *
         * Per device rather than per project, which is what this was first and which was wrong in the
         * only case that matters: the facts reach a phone when it opens a conversation, so a second
         * phone joining after the first would have found them all "already sent" and drawn a composer
         * with no branch, no limits and no files.
         *
         * A fingerprint rather than the message: keeping four thousand paths per device per project
         * costs megabytes to save the same megabytes. Length together with the hash, so that two
         * different lists collide only by accident of both at once - and a collision costs a minute of
         * a stale branch, not a wrong one.
         */
        private val sentFacts = ConcurrentHashMap<String, Long>()

        override fun deliver(messages: List<String>) {
            if (link == null) return

            val live = !catchingUp.get()

            // Opening a past conversation puts its whole transcript through here, line by line, as it is
            // read off the disk - tens of thousands of them for a long one. The panel wants exactly that
            // and is on the same machine; a phone wants the conversation, not the reading of it, and
            // sending every line meant megabytes of mobile data to draw a screen that the end alone
            // would have drawn. So a replay travels no further than the journal, and when it is over the
            // phone is handed the result (see below).
            val sendable = if (live) messages.filterNot(RemoteFeed::isReplayLine) else messages

            val facts = sendable.mapNotNull { message ->
                RemoteFeed.projectFact(message)?.let { type -> type to message }
            }

            for ((address, subscription) in subscriptions) {
                if (subscription.projectKey != projectKey) continue

                val wanted = newFacts(address, facts) +
                    sendable.filter { RemoteFeed.wantedBy(it, subscription.sessionId) }
                if (wanted.isEmpty()) continue

                queue(address, wanted)
            }

            link?.flush(::resyncFrames)

            if (live) handOverReplayed(messages)
        }

        /**
         * Which of the project's facts this device has not already been sent unchanged.
         *
         * They go to every device watching something in this project rather than to whoever asked:
         * nobody asked - they arrive by themselves, exactly as they do for the panel, and a phone
         * cannot draw its composer without them.
         */
        private fun newFacts(address: String, facts: List<Pair<String, String>>): List<String> =
            facts.mapNotNull { (type, message) ->
                val fingerprint = message.length.toLong() shl 32 or (message.hashCode().toLong() and 0xffffffffL)
                if (sentFacts.put("$address\u0000$type", fingerprint) == fingerprint) {
                    null
                } else {
                    RemoteFeed.forPhone(type, message)
                }
            }

        /**
         * An answer goes to every paired device rather than to whoever is watching what.
         *
         * It is asked for by one of them and belongs to no conversation - the list of a project's past
         * conversations, for instance - so the rule that decides the feed leaves it with no address at
         * all: a phone that asked for that list without already watching something in the project was
         * handed nothing, and its screen waited for a list that had been built and thrown away.
         *
         * Which device asked cannot be known here in any honest way: the answer is put together on a
         * pool thread, long after the request was read. Every device is the truthful address instead -
         * they are all paired with this IDE, all of them may ask this themselves, and one that did not
         * ask ignores it.
         */
        override fun answer(messages: List<String>) {
            if (link == null) return

            for (device in state.devices()) queue(device.id, messages)

            link?.flush(::resyncFrames)
        }

        /**
         * To the one device that asked. Every other client is one device and takes the default.
         *
         * [asker] is the address a command arrived from (see the call to SessionCommands.handle), so an
         * answer that belongs to whoever asked has somewhere narrower to go than "everybody paired with
         * this project" - which for a minted Deepgram token is the difference between answering a
         * question and interrupting somebody else's sentence.
         */
        override fun answerOne(asker: String, messages: List<String>) {
            if (link == null) return
            if (state.devices().none { it.id == asker }) return

            queue(asker, messages)
            link?.flush(::resyncFrames)
        }

        /** Seal these messages for one device and put them in the queue out. */
        private fun queue(deviceId: String, messages: List<String>) {
            if (messages.isEmpty()) return
            val device = runCatching { Frame.decodeAddress(deviceId) }.getOrNull() ?: return

            for (message in messages) {
                val sealed = sessions.seal(
                    deviceId,
                    to = device,
                    from = state.address(),
                    body = """{"p":$PROTOCOL_VERSION,"k":"event","pj":"$projectKey","b":$message}"""
                        .toByteArray(StandardCharsets.UTF_8),
                ) ?: continue

                outbox.offer(sealed)
            }
        }

        /**
         * Hand a device the end of one conversation, as the journal has it.
         *
         * Deliberately not the whole of it: what leaves here waits in a bounded queue, and a queue that
         * overflows is thrown away entire - which is how a long conversation opened on a phone used to
         * come up blank and stay blank (see ClaudeSessionHub.CatchUp and RemoteOutbox).
         */
        fun catchUp(hub: ClaudeSessionHub, sessionId: String, since: Long) {
            catchingUp.set(true)
            try {
                hub.attach(id, mapOf(sessionId to since), ClaudeSessionHub.CatchUp.tailOf(sessionId))
            } finally {
                catchingUp.set(false)
            }
        }

        /**
         * A past conversation has finished replaying into a tab somebody's phone is watching: now there
         * is something to show, and it is handed over whole rather than as the thousands of lines it was
         * built from. From zero, because a resumed tab holds a different conversation than it did a
         * second ago - the screen has to be replaced rather than added to.
         */
        private fun handOverReplayed(messages: List<String>) {
            val hub = projects[projectKey]?.hub ?: return
            val watched = subscriptions.values.filter { it.projectKey == projectKey }.map { it.sessionId }

            for (sessionId in RemoteFeed.replayed(messages, watched)) catchUp(hub, sessionId, since = 0)
        }
    }

    /**
     * Ring the phones that are not watching.
     *
     * The decision is made here rather than on the phone for two reasons, and the first is decisive:
     * the phone is asleep - that is the entire point of a notification. The second is that the text is
     * sealed here, so a relay that decided what was worth ringing about would be a relay that knew
     * what had happened.
     *
     * A device that is connected and reading gets nothing: it is already looking at the thing being
     * notified about, and a buzz for something on screen is how people learn to switch notifications
     * off.
     */
    private fun notify(sessionId: String, reason: String, target: String) {
        if (reason !in NotificationReasons.DEFAULT_ON) return

        val paired = state.devices()
        if (paired.isEmpty()) return

        val now = System.currentTimeMillis()
        val asleep = paired.filter { now - (lastHeard[it.id] ?: 0) > AWAKE_MS }
        if (asleep.isEmpty()) return

        val attachment = projects.values.firstOrNull { it.hub.tabs.contains(sessionId) } ?: return
        val title = NotificationReasons.title(reason, attachment.project.name, target)

        for (device in asleep) {
            val address = runCatching { Frame.decodeAddress(device.id) }.getOrNull() ?: continue

            val body = buildJsonObject {
                put("reason", reason)
                put("title", title)
                put("project", attachment.project.name)
                put("agentId", state.agentId())
                put("sessionId", sessionId)
            }

            val sealed = sessions.seal(
                device.id,
                to = address,
                from = state.address(),
                body = body.toString().toByteArray(StandardCharsets.UTF_8),
            ) ?: continue

            // The push frame carries the same sealed body under a type of its own, so the relay knows
            // to hand it to a push service rather than to a socket - without being able to read it.
            val envelope = Frame.parse(sealed, RelayLink.MAX_FRAME_BYTES)
            outbox.offerUrgent(
                Frame.build(Frame.TYPE_PUSH, envelope.to, envelope.from, envelope.counter, envelope.body),
            )
        }

        link?.flush(::resyncFrames)
    }

    override fun dispose() {
        stop()
        projects.clear()
    }

    companion object {
        fun getInstance(): RemoteAgent = service()

        /**
         * The application protocol's version, agreed in the handshake. It moves only for a change that
         * breaks the other side: a new optional field or a new kind of frame that can be ignored does
         * not. Left to grow with every release it would be a number nobody could act on.
         */
        const val PROTOCOL_VERSION = 1

        /** Where the relay lives unless someone points this at their own. */
        const val DEFAULT_RELAY = "wss://relay.mzpizote.com"

        /** -Dacc.remote.relay=ws://localhost:8080 on a sandbox run - see [enabled]. */
        const val RELAY_PROPERTY = "acc.remote.relay"

        private const val BEAT_SECONDS = 20L

        /**
         * How long a change waits for the ones that follow it. A turn's start, a permission and its
         * answer land within milliseconds of each other, and the phone only needs the result of all
         * three.
         */
        private const val INVENTORY_DEBOUNCE_MS = 200L

        /** How often a device may be told to start a new session - see [askForNewSession]. */
        private const val RESYNC_INTERVAL_MS = 5_000L

        /**
         * The one answer that belongs to the project rather than to a conversation: its past ones.
         *
         * A device is otherwise sent only what it asked to watch (see RelayClient.deliver), and this
         * carries no session id to be matched against - so it would be filtered out on the way to the
         * very device that asked for it. It goes to every device watching this project, which in
         * practice is the one that asked: a list of a project's own conversations is not private from a
         * second phone that is already reading them.
         */


        /**
         * How recently a device must have said something to count as watching. Longer than the phone's
         * own heartbeat, so a moment of silence is not mistaken for a phone in a pocket.
         */
        private const val AWAKE_MS = 45_000L

        /**
         * A project's key as the relay-facing side names it. The platform's own location hash: stable
         * across restarts and not a path, so a project's place on disk does not travel even inside the
         * sealed body.
         */
        fun projectKey(project: Project): String = project.locationHash

        /**
         * Whether this address may be used at all.
         *
         * The host is parsed rather than matched as a prefix, and that is not fussiness: "ws://
         * localhost.example.com" starts with "ws://localhost" and belongs to somebody else entirely.
         * That shape of mistake reads as harmless and hands a third party the traffic.
         */
        fun isSecure(url: String): Boolean {
            val uri = runCatching { java.net.URI(url) }.getOrNull() ?: return false
            val host = uri.host ?: return false

            return when (uri.scheme) {
                "wss" -> true
                "ws" -> host == "localhost" || host == "127.0.0.1" || host == "::1"
                else -> false
            }
        }
    }
}

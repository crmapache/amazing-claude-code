import {
  agentProof,
  agree,
  base64,
  base64url,
  deriveSession,
  deviceProof,
  exportPublic,
  fingerprint,
  generateKeyPair,
  importPublic,
  resumeSession,
  sameBytes,
  seal,
  unbase64,
  unbase64url,
  unseal,
  type SessionKeys,
} from '../core/crypto'
import { buildFrame, FRAME_CONTROL, FRAME_SEALED, headerOf, parseFrame } from '../core/frame'
import { rememberAgent, writeSetting, type PairedAgent } from './storage'

/**
 * The phone's end of the line: one socket to the relay, everything sealed inside it.
 *
 * What travels is what the IDE's own panel receives, unchanged - the same messages, the same feed
 * (see ShellMessage in protocol.ts). That is deliberate: the parsing, the cards and the rules for what
 * a conversation looks like are one implementation used by both screens, not two that have to be kept
 * saying the same thing.
 */

export interface LinkEvents {
  onMessage: (message: unknown, projectKey: string) => void
  onInventory: (inventory: unknown) => void
  onState: (state: LinkState) => void
  /** How a request to open a closed project ended - see [openProject]. */
  onProjectOpened?: (result: { sessionId: string; ok: boolean; projectKey?: string; error?: string }) => void
  /**
   * The IDE gave up on what it had queued for this device and says so: ask again.
   *
   * It happens when a phone is out of reach long enough for the queue on that side to fill, and it
   * happened on nothing more exotic than opening a long conversation - the journal alone was more than
   * the queue held. Either way the cure is the same and it belongs to whoever knows what this phone is
   * looking at: subscribe again from the number it has (see RemoteAgent.resyncFrames).
   */
  onResync?: () => void
}

/**
 * How this phone is doing at reaching one IDE.
 *
 * `connected` means the IDE itself has answered, not that the relay took the socket. The two used to
 * be one state and it read as a lie in the case that matters most: with the laptop shut, the socket to
 * the relay opens perfectly well, so the app said "connected" over an empty list - which is
 * indistinguishable from a machine where nothing is happening. `asleep` is that case named.
 */
export type LinkState = 'connecting' | 'connected' | 'asleep' | 'elsewhere' | 'reconnecting' | 'offline'

/**
 * What a conversation started from this phone is to begin on - the shell's SessionLaunch, on the wire.
 *
 * It travels with the request rather than being read from the machine's settings, because the phone is
 * where the choice is made: the selectors that would hold it live in the panel at the desk. It applies
 * to that conversation and changes nothing on the machine.
 */
export interface SessionLaunch {
  model: string
  effort: string
  mode: string
}

const PROTOCOL_VERSION = 1

/** How often the line is knocked on. Comfortably inside the shortest NAT timeouts worth surviving. */
const BEAT_MS = 25_000

/** Past this much silence the line is dead rather than quiet - two knocks have gone unanswered. */
const SILENCE_MS = 70_000

/**
 * The same, for a line the IDE has never answered on.
 *
 * Longer on purpose. With keys in hand, silence means something is wrong - every knock is answered.
 * Without them, silence is the ordinary state of a machine that is switched off, and tearing the socket
 * down every minute to ask again achieves nothing except a list that never stops saying "reconnecting".
 */
const IDLE_SILENCE_MS = 180_000

/**
 * How long the IDE has to answer the handshake before the phone says it is not there.
 *
 * Generously more than a round trip through the relay and less than anybody's patience: the answer
 * comes back in tens of milliseconds when the machine is awake, and when it is not, no amount of
 * waiting produces one.
 */
const AGENT_SILENCE_MS = 6_000

/**
 * How often the handshake is offered again while the IDE has not answered it.
 *
 * The same offer each time rather than a new one - the agent recognises a repeat and answers it with
 * the answer it gave before, so nothing drifts (see RemoteAgent.sessionInit). Without the repeat, an
 * IDE that starts a minute from now is not noticed until the socket is torn down for silence.
 */
const HANDSHAKE_RETRY_MS = 15_000

/**
 * The relay closed this socket because the same device connected somewhere else - another tab, or the
 * installed app beside the browser. One address, one connection (see the relay's Hub).
 */
const CLOSE_DISPLACED = 4009

/** How long the displaced side waits before taking the connection back. */
const DISPLACED_PAUSE_MS = 3_000

export class Link {
  private socket: WebSocket | null = null

  private keys: SessionKeys | null = null

  private counter = 0n

  /** The highest counter seen from the agent, and the window below it - see the plugin's ReplayWindow. */
  private highest = -1n

  private seenBelow = 0n

  private attempts = 0

  private closed = false

  /**
   * When the agent last said anything, and the timer that checks it.
   *
   * A socket that dies quietly is the ordinary case on a phone - a tunnel, a switch from wifi to
   * cellular, a screen locked for an hour - and the browser is under no obligation to notice. Without
   * this the app sits showing a list from twenty minutes ago and calling itself connected, which is
   * indistinguishable from a quiet morning. The plugin has had the same check from the start; this is
   * the phone's half of it.
   */
  private lastHeard = 0

  private beat: number | null = null

  /** The wait for the IDE's half of the handshake - what tells a sleeping machine from a slow one. */
  private answering: number | null = null

  /** The pending reconnect, kept so that waking up can overtake a backoff rather than race it. */
  private retry: number | null = null

  /** What is still going out, so that frames leave in the order they were asked for - see [send]. */
  private outgoing: Promise<void> = Promise.resolve()

  constructor(
    private readonly agent: PairedAgent,
    private readonly events: LinkEvents,
  ) {}

  async connect(): Promise<void> {
    this.closed = false

    // Whatever was scheduled is now happening: a second socket alongside this one would leave an
    // orphan whose own close would schedule yet another.
    if (this.retry !== null) {
      window.clearTimeout(this.retry)
      this.retry = null
    }

    // And whatever is still open goes first, silently.
    //
    // Two sockets from one device is not a waste - it is a loop that cannot end: the relay allows one
    // connection per address and closes the older one, whose close then asks for a reconnect, which
    // displaces the newer one, whose close asks for a reconnect. That is the "it just keeps
    // reconnecting" this exists to prevent, and the handlers are dropped before the close so that the
    // old socket's death says nothing about the new socket's life.
    this.abandon()

    this.events.onState(this.attempts === 0 ? 'connecting' : 'reconnecting')

    const address = base64url(unbase64url(this.agent.deviceId))
    const socket = new WebSocket(`${relayAddress(this.agent.relay)}/v1/device?id=${address}`)
    socket.binaryType = 'arraybuffer'
    this.socket = socket

    // Every handler below asks first whether this is still the socket in use. A browser delivers events
    // from a socket that has been replaced, and without the question they would wipe the state of the
    // one that replaced it - which reads, from the outside, as a connection that never settles.
    socket.onopen = () => {
      if (this.socket !== socket) return

      this.attempts = 0
      this.lastHeard = Date.now()
      this.startBeat()
      // Not "connected" yet: this is the relay taking the socket, and the relay is up whether or not
      // the machine with the IDE on it is. What answers that is the handshake below.
      this.events.onState('connecting')
      void this.resume()
    }

    socket.onmessage = (event) => {
      if (this.socket !== socket) return
      void this.receive(new Uint8Array(event.data as ArrayBuffer))
    }

    socket.onclose = (event) => {
      if (this.socket !== socket) return

      this.socket = null
      this.keys = null
      this.stopBeat()
      this.stopWaitingForAgent()
      if (this.closed) return

      const displaced = event.code === CLOSE_DISPLACED
      if (!displaced) this.attempts += 1

      this.events.onState(displaced ? 'elsewhere' : 'reconnecting')

      const wait = reconnectAfter(event.code, document.visibilityState === 'visible', this.attempts)
      if (wait === null) return

      this.retry = window.setTimeout(() => {
        this.retry = null
        void this.connect()
      }, wait)
    }

    socket.onerror = () => {
      if (this.socket !== socket) return
      this.events.onState('offline')
    }
  }

  /**
   * Let go of the socket in hand without hearing anything more from it.
   *
   * The handlers come off first: a close that arrives afterwards belongs to a connection nobody is
   * using, and the only thing it could do is undo the state of the one that took its place.
   */
  private abandon(): void {
    const socket = this.socket
    if (!socket) return

    this.socket = null
    this.keys = null
    this.stopBeat()
    this.stopWaitingForAgent()

    socket.onopen = null
    socket.onmessage = null
    socket.onclose = null
    socket.onerror = null

    if (socket.readyState === WebSocket.OPEN || socket.readyState === WebSocket.CONNECTING) socket.close()
  }

  close(): void {
    this.closed = true

    if (this.retry !== null) {
      window.clearTimeout(this.retry)
      this.retry = null
    }

    this.abandon()
  }

  /**
   * The phone is back in a hand: find out now whether the line is real.
   *
   * The plugin does the same when its window is focused, and for the same reason - after a sleep the
   * socket is usually dead and nothing has said so. Waiting out a backoff of up to half a minute for
   * something a person is looking at right now is the difference between "it works" and "it is broken".
   */
  wake(): void {
    if (this.closed) return

    const socket = this.socket

    // Already on its way, or already there: leave it be. Starting another one here is what used to turn
    // a moment of doubt into two sockets fighting over one address.
    if (socket?.readyState === WebSocket.CONNECTING) return

    if (socket?.readyState === WebSocket.OPEN) {
      this.probe()
      return
    }

    // Nothing open. That includes the case of having been displaced by another tab: this is the one
    // being looked at now, so this is the one that takes the connection.
    this.attempts = 0
    void this.connect()
  }

  /**
   * Ask for the inventory, and treat a long silence as a death.
   *
   * The inventory is used as the knock rather than a heartbeat of its own: the agent already answers
   * it, it is already on the list of things a device may ask for, and a reply is what proves the line
   * is alive. A frame each way every half minute is also what keeps a NAT from quietly dropping the
   * connection between two people who have nothing to say to each other.
   */
  private probe(): void {
    const socket = this.socket
    if (!socket || socket.readyState !== WebSocket.OPEN) return

    const patience = this.keys ? SILENCE_MS : IDLE_SILENCE_MS
    if (this.lastHeard > 0 && Date.now() - this.lastHeard > patience) {
      // Quiet is normal; this much quiet is not. Closing it is what starts the reconnect.
      socket.close()
      return
    }

    if (this.keys) {
      this.send({ p: PROTOCOL_VERSION, k: 'inventory' })
      return
    }

    // Still no answer to the handshake. The same offer goes again - the same one, not a new one: the
    // agent recognises a repeat and replies with the reply it already gave, so an IDE that starts in a
    // minute is picked up in seconds without the two sides ending up on different keys.
    if (Date.now() - this.offeredAt >= HANDSHAKE_RETRY_MS) this.offerHandshake()
  }

  private startBeat(): void {
    this.stopBeat()
    this.beat = window.setInterval(() => this.probe(), BEAT_MS)
  }

  private stopBeat(): void {
    if (this.beat === null) return
    window.clearInterval(this.beat)
    this.beat = null
  }

  /**
   * Reconnecting without another QR code: fresh ephemeral keys on both sides, vouched for by the
   * long-lived key from pairing. The session keys are new every time, so recording today's traffic and
   * stealing a key later opens nothing.
   */
  private async resume(): Promise<void> {
    const ephemeral = await generateKeyPair(true)
    const ephemeralPub = await exportPublic(ephemeral.publicKey)

    this.pendingResume = { ephemeral, ephemeralPub }
    this.offerHandshake()
  }

  /**
   * Put the current offer on the wire - the first time and every repeat.
   *
   * The keys are made once per connection and re-offered as they are. A repeat carrying fresh keys
   * would be a different offer, and an IDE catching up on a buffer full of those would answer each one
   * and end up on the last while this side kept the first.
   */
  private offerHandshake(): void {
    const pending = this.pendingResume
    if (!pending) return

    this.offeredAt = Date.now()
    this.waitForAgent()

    this.sendPlain({
      p: PROTOCOL_VERSION,
      k: 'sessionInit',
      deviceId: this.agent.deviceId,
      ephemeralPub: pending.ephemeralPub,
    })
  }

  private pendingResume: { ephemeral: CryptoKeyPair; ephemeralPub: string } | null = null

  /** When the offer above last went out - what paces the repeats (see HANDSHAKE_RETRY_MS). */
  private offeredAt = 0

  private async receive(raw: Uint8Array): Promise<void> {
    // Anything at all counts as a sign of life, before it is opened or judged: a frame that turns out
    // to be a replay still proves the line carried it.
    this.lastHeard = Date.now()

    const envelope = parseFrame(raw)

    if (envelope.type === FRAME_CONTROL) {
      // The relay's own word, and the only one it says: there was a break, ask again. Advice, never
      // content - which is why it arrives as a different kind of frame rather than as a message.
      void this.resume()
      return
    }

    if (!this.keys) {
      // Nothing is sealed yet: the only frame worth reading is the agent's half of the handshake.
      const opening = this.parse(envelope.body)
      if (opening && (opening as { k?: string }).k === 'sessionAck') {
        await this.finishResume(opening as { ephemeralPub: string; for?: string })
      }
      return
    }

    // Two frames arrive in the open even while this side has keys, and both say the same thing: what we
    // hold is not what the IDE holds. Answering them is what turns a conversation that has quietly
    // stopped working back into one that works.
    //
    // Looked for before the replay window rather than after, because they are sent with a counter of
    // zero and would be refused as "seen that one" - and cheaply: a sealed body is ciphertext, and an
    // opening brace is one byte to rule almost all of it out.
    if (envelope.body[0] === OPEN_BRACE) {
      const plain = this.parse(envelope.body) as { k?: string; ephemeralPub?: string; for?: string } | null

      if (plain?.k === 'sessionStale') {
        this.keys = null
        void this.resume()
        return
      }

      if (plain?.k === 'sessionAck' && plain.ephemeralPub) {
        await this.finishResume(plain as { ephemeralPub: string; for?: string })
        return
      }
    }

    if (!this.accept(envelope.counter)) return

    const header = headerOf(FRAME_SEALED, envelope.to, envelope.from, envelope.counter)
    const opened = await unseal(this.keys.fromAgent, this.keys.noncePrefixFromAgent, envelope.counter, header, envelope.body)
    if (!opened) return

    const payload = this.parse(opened) as { k?: string; pj?: string; b?: unknown } | null
    if (!payload) return

    if (payload.k === 'event' && payload.b) this.events.onMessage(payload.b, payload.pj ?? '')
    if (payload.k === 'inventory') this.events.onInventory(payload)
    if (payload.k === 'resync') this.events.onResync?.()

    if (payload.k === 'projectOpened') {
      const answer = payload as unknown as { s?: string; ok?: boolean; pj?: string; error?: string }
      this.events.onProjectOpened?.({
        sessionId: answer.s ?? '',
        ok: answer.ok === true,
        projectKey: answer.pj,
        error: answer.error,
      })
    }
  }

  /**
   * The IDE's half of the handshake.
   *
   * Every one of them is honoured rather than only the first. The same offer can be answered more than
   * once - a copy of it waited in the relay while the IDE was shut - and taking only the first answer
   * left this side on keys the IDE had already moved on from. Since the answers arrive in the order
   * they were sent, honouring each of them ends on the same one the IDE ended on.
   */
  private async finishResume(ack: { ephemeralPub: string; for?: string }): Promise<void> {
    const pending = this.pendingResume
    if (!pending) return

    // The answer to an offer this side has already moved past - one that waited in the relay while the
    // IDE was shut. Taking it would leave this half on keys the IDE no longer holds, and nothing would
    // say so: frames that will not open are dropped in silence. Older agents do not say which offer
    // they are answering, and their answer is taken as before.
    if (ack.for && ack.for !== pending.ephemeralPub) return

    const agentEphemeral = await importPublic(ack.ephemeralPub)

    this.keys = await resumeSession(
      this.agent.auth,
      await agree(pending.ephemeral.privateKey, agentEphemeral),
      this.agent.agentId,
      this.agent.deviceId,
      ack.ephemeralPub,
      pending.ephemeralPub,
    )

    // The worker that shows a notification while this app is closed needs the same keys, and cannot
    // ask this code for them - it runs in a different context entirely. So they are put where both can
    // reach them, as handles the browser will use and never hand back as bytes.
    void writeSetting('pushKeys', {
      fromAgent: this.keys.fromAgent,
      noncePrefixFromAgent: this.keys.noncePrefixFromAgent,
    })

    // Counters start again with the keys, which is precisely why they may: a fresh key never meets an
    // old counter.
    this.counter = 0n
    this.highest = -1n
    this.seenBelow = 0n

    // The IDE has spoken: this is the moment the machine is genuinely reachable, and the only honest
    // moment to say so.
    this.stopWaitingForAgent()
    this.events.onState('connected')

    this.send({ p: PROTOCOL_VERSION, k: 'inventory' })
  }

  /**
   * Give the IDE a moment to answer, and say so plainly if it does not.
   *
   * The socket stays open either way - the machine may be opened at any second, and the answer then
   * arrives on this very connection with nothing to reconnect.
   */
  private waitForAgent(): void {
    this.stopWaitingForAgent()

    this.answering = window.setTimeout(() => {
      this.answering = null
      if (!this.keys && !this.closed) this.events.onState('asleep')
    }, AGENT_SILENCE_MS)
  }

  private stopWaitingForAgent(): void {
    if (this.answering === null) return
    window.clearTimeout(this.answering)
    this.answering = null
  }

  /** Ask to watch one conversation, from the number this device already has. */
  watch(projectKey: string, sessionId: string, since: number): void {
    this.send({ p: PROTOCOL_VERSION, k: 'subscribe', pj: projectKey, s: sessionId, q: since })
  }

  /**
   * Ask for the list again, now.
   *
   * The IDE pushes it whenever it changes, so this is not how the screen keeps up - it is for the
   * moment of walking back onto the list, where a frame in flight and a frame not yet sent look the
   * same and neither is worth a person's doubt.
   */
  refreshInventory(): void {
    this.send({ p: PROTOCOL_VERSION, k: 'inventory' })
  }

  /**
   * Open a project this IDE has closed, and start a conversation in it.
   *
   * The project is named by the opaque key the inventory offered rather than by a path: where a
   * project sits on disk never leaves the machine (see RemoteAgent.recentProjects).
   */
  openProject(projectKey: string, sessionId: string, title: string, launch: SessionLaunch): void {
    this.send({ p: PROTOCOL_VERSION, k: 'openProject', pj: projectKey, s: sessionId, title, launch })
  }

  /** Anything the person does: a message, an answer, a stop. The agent decides what it will accept. */
  command(projectKey: string, message: unknown): void {
    this.send({ p: PROTOCOL_VERSION, k: 'cmd', pj: projectKey, b: message })
  }

  /**
   * Send something to the IDE, sealed - and after everything already asked for.
   *
   * The queue is the point. Sealing is asynchronous, so two frames sent one line apart used to race
   * each other to the socket and could arrive the wrong way round. Most of the time that is harmless,
   * but not always: "open a conversation" followed by "watch it" arriving in the other order leaves the
   * IDE watching something that does not exist yet, and the screen that was opened stays empty with
   * nothing anywhere saying why.
   */
  private send(body: unknown): void {
    const socket = this.socket
    const keys = this.keys
    if (!socket || !keys || socket.readyState !== WebSocket.OPEN) return

    // Taken here rather than inside the queue, so the numbers follow the order the frames were asked
    // for - which is the order they now go out in.
    this.counter += 1n
    const counter = this.counter

    this.outgoing = this.outgoing
      .then(async () => {
        if (socket.readyState !== WebSocket.OPEN) return

        const to = unbase64url(this.agent.agentId)
        const from = unbase64url(this.agent.deviceId)
        const header = headerOf(FRAME_SEALED, to, from, counter)
        const sealed = await seal(keys.toAgent, keys.noncePrefixToAgent, counter, header, encode(body))

        socket.send(buildFrame(FRAME_SEALED, to, from, counter, sealed) as BufferSource)
      })
      // One frame that could not be sealed must not stop every frame after it.
      .catch(() => undefined)
  }

  /** Only the handshake goes in the open - there is no key yet, and it is what produces one. */
  private sendPlain(body: unknown): void {
    const socket = this.socket
    if (!socket || socket.readyState !== WebSocket.OPEN) return

    const to = unbase64url(this.agent.agentId)
    const from = unbase64url(this.agent.deviceId)
    socket.send(buildFrame(FRAME_SEALED, to, from, 0n, encode(body)) as BufferSource)
  }

  private parse(body: Uint8Array): unknown {
    try {
      return JSON.parse(new TextDecoder().decode(body))
    } catch {
      return null
    }
  }

  /**
   * Whether this frame has been seen. A replayed "the permission was answered" is harmless; a replayed
   * command is not, and the same window guards both directions for the same reason.
   */
  private accept(counter: bigint): boolean {
    if (this.highest < 0n) {
      this.highest = counter
      this.seenBelow = 1n
      return true
    }

    if (counter > this.highest) {
      const step = counter - this.highest
      this.seenBelow = step >= 64n ? 1n : (this.seenBelow << step) | 1n
      this.highest = counter
      return true
    }

    const behind = this.highest - counter
    if (behind >= 64n) return false

    const bit = 1n << behind
    if ((this.seenBelow & bit) !== 0n) return false

    this.seenBelow |= bit
    return true
  }
}

const encode = (body: unknown): Uint8Array => new TextEncoder().encode(JSON.stringify(body))

/** What a frame sent in the open begins with - see the note in receive. */
const OPEN_BRACE = 0x7b

/**
 * How long to wait before connecting again, or null for "do not".
 *
 * The whole rule in one place, because getting it wrong is not a small bug: every wrong answer here is
 * a loop. Being displaced while out of sight is the one that has to answer "do not" - the relay allows
 * one connection per device, so a copy in the background that reconnects takes the line from the copy
 * being looked at, which takes it back, forever. An ordinary break is the opposite case: reconnect, and
 * back off so that a relay which is genuinely down is not hammered by a phone in somebody's pocket.
 */
export const reconnectAfter = (code: number, visible: boolean, attempts: number): number | null => {
  if (code === CLOSE_DISPLACED) return visible ? DISPLACED_PAUSE_MS : null

  return Math.min(1000 * 2 ** attempts, 30_000)
}

/**
 * Where the relay is.
 *
 * Wherever this app was served from, because the relay is what serves it - the two are the same host
 * by construction. Deliberately not the address written down when the pairing was made: a relay that
 * moves to another home would otherwise take every paired phone with it, since each of them would go
 * on dialling an address that no longer answers, and pairing again is a QR code and two confirmations.
 *
 * `?relay=` overrides it for development, where the client runs on a Vite server and the relay does
 * not. [known] is the last resort - the address a pairing was made against - for a client served from
 * somewhere other than its relay.
 */
export const relayAddress = (known = ''): string => {
  const override = new URLSearchParams(window.location.search).get('relay')
  if (override) return override.replace(/\/$/, '')

  const origin = window.location.origin.replace(/^https:/, 'wss:').replace(/^http:/, 'ws:')

  return (origin || known).replace(/\/$/, '')
}

/**
 * Pairing with an IDE, from what the QR code carried.
 *
 * The secret lives in the fragment of the address - the part browsers never send to a server - so it
 * cannot reach the relay's logs even in principle. It is read here, used, and never written down.
 */
export const pair = async (
  relay: string,
  agentId: string,
  secret: Uint8Array,
  expectedFingerprint: string,
  label: string,
  /**
   * This device's own fingerprint, the moment it exists.
   *
   * The IDE shows it and asks a person to compare, so the phone has to show the same number - and it
   * has to show it while the IDE is still asking, not after. It is known as soon as the key pair is
   * made, well before anything is sent.
   */
  onIdentity?: (own: string) => void,
): Promise<PairedAgent> => {
  // One pair, and its private half is unextractable. The public half can still be exported - in
  // WebCrypto that flag applies to the private key alone - so nothing is lost by keeping it that way,
  // and the private key's bytes never exist anywhere JavaScript can reach them.
  const deviceStatic = await generateKeyPair(false)
  const ephemeral = await generateKeyPair(true)

  const staticPublic = await exportPublic(deviceStatic.publicKey)
  const ephemeralPub = await exportPublic(ephemeral.publicKey)

  onIdentity?.(await fingerprint(staticPublic))
  const deviceId = base64url(crypto.getRandomValues(new Uint8Array(16)))

  const proof = await deviceProof(secret, agentId, staticPublic, ephemeralPub, deviceId)

  const socket = new WebSocket(`${relay.replace(/\/$/, '')}/v1/device?id=${deviceId}`)
  socket.binaryType = 'arraybuffer'

  return new Promise<PairedAgent>((resolve, reject) => {
    const give = window.setTimeout(() => {
      socket.close()
      reject(new Error('the IDE did not answer'))
    }, 90_000)

    socket.onopen = () => {
      socket.send(
        buildFrame(
          FRAME_SEALED,
          unbase64url(agentId),
          unbase64url(deviceId),
          0n,
          encode({
            p: PROTOCOL_VERSION,
            k: 'pairInit',
            deviceId,
            label,
            staticPub: staticPublic,
            ephemeralPub,
            proof: base64(proof),
          }),
        ) as BufferSource,
      )
    }

    socket.onmessage = async (event) => {
      const envelope = parseFrame(new Uint8Array(event.data as ArrayBuffer))
      const payload = JSON.parse(new TextDecoder().decode(envelope.body)) as {
        k?: string
        staticPub?: string
        ephemeralPub?: string
        proof?: string
        label?: string
      }

      if (payload.k !== 'pairAck' || !payload.staticPub || !payload.ephemeralPub || !payload.proof) return

      // Two checks, either of which alone closes the substitution: the proof could only be made by
      // someone who saw the code, and the fingerprint could only match the IDE the code came from.
      const shown = await fingerprint(payload.staticPub)
      if (shown.replace(/ /g, '') !== expectedFingerprint.replace(/ /g, '')) {
        window.clearTimeout(give)
        socket.close()
        reject(new Error('the IDE that answered is not the one on the screen'))
        return
      }

      const expected = await agentProof(secret, agentId, deviceId, payload.staticPub, payload.ephemeralPub)
      if (!sameBytes(expected, unbase64(payload.proof))) {
        window.clearTimeout(give)
        socket.close()
        reject(new Error('the answer did not prove it saw the code'))
        return
      }

      const session = await deriveSession(
        await agree(deviceStatic.privateKey, await importPublic(payload.staticPub)),
        await agree(ephemeral.privateKey, await importPublic(payload.ephemeralPub)),
        secret,
        agentId,
        deviceId,
        payload.ephemeralPub,
        ephemeralPub,
      )

      const paired: PairedAgent = {
        agentId,
        // What the IDE calls itself - "WebStorm on max-mbp". The name this device gave itself went the
        // other way, in pairInit, and belongs in the IDE's list rather than in this one.
        label: payload.label || label,
        relay,
        auth: session.auth,
        staticPrivate: deviceStatic.privateKey,
        staticPublic,
        deviceId,
        agentStaticPublic: payload.staticPub,
        pairedAt: Date.now(),
      }

      await rememberAgent(paired)
      window.clearTimeout(give)
      socket.close()
      resolve(paired)
    }

    socket.onerror = () => {
      window.clearTimeout(give)
      reject(new Error('the relay could not be reached'))
    }
  })
}

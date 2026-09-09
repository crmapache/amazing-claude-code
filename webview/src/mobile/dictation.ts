/**
 * Dictating from a phone: the microphone in the browser, straight to Deepgram.
 *
 * The audio deliberately does not travel to the IDE and out from there. It would cross the relay -
 * a server built so that it can carry nothing but sealed envelopes it cannot read - and it would arrive
 * late, having gone twice as far. So the phone records with its own microphone (which is in a hand,
 * inches from a mouth, rather than across a room) and opens its own socket.
 *
 * What it does not have is the key. The IDE mints a token that lasts a minute and transcribes only (see
 * VoiceGrant on the plugin's side), and the token travels as a websocket subprotocol rather than as a
 * header - a page cannot set headers on a websocket handshake at all, and `bearer` is the form Deepgram
 * accepts a temporary token in. The documented `token` form is for the permanent key and answers 401 to
 * this one.
 *
 * Recording starts before the token arrives, and the chunks wait. The round trip to the IDE and back is
 * half a second on a good network, which is the half second somebody has already started talking in.
 */

export interface Dictation {
  /** The token came back - open the socket and hand it everything recorded so far. */
  authorise: (grant: { token: string; language: string; model: string }) => void
  /** Speech is over: ask Deepgram for the tail, then close. */
  finish: () => void
  /** Thrown away - no words wanted, nothing waited for. */
  cancel: () => void
}

export interface DictationHandlers {
  /** The phrase as it is being said - replaced by the next one, never kept. */
  onInterim: (text: string) => void
  /** A phrase Deepgram settled on. This is what reaches the draft. */
  onFinal: (text: string) => void
  /** One of the codes the panel knows: `mic`, `key`, `network`, `deepgram`. */
  onError: (code: string) => void
  /** Nothing more is coming, whichever way it ended. */
  onEnded: () => void
}

/**
 * The same conversation with Deepgram the desk holds, written a second time.
 *
 * It cannot be written once: one side of it is Kotlin inside the IDE and this side is a page in
 * somebody's hand, and there is no code between them. So it is the case of Frame.kt and frame.ts (see
 * CLAUDE.md) - the query parameters, the shape of an answer, and the three numbers below are the same on
 * both sides by discipline alone, and a change made to one of them has to be made to
 * voice/DeepgramStream.kt as well. Nothing fails if it is not: the phone simply transcribes a little
 * differently from the desk, which is the sort of difference nobody reports and nobody finds.
 */

/** Measured next door in notastream: the tail after Finalize lands in about 135 ms. */
const TAIL_MS = 1_500
const QUIET_MS = 150
/**
 * How long a release waits for a socket that has not opened yet - the token's round trip plus a
 * handshake, on a network having a bad day. Past it there is nothing left to wait for.
 */
const OPENING_CEILING_MS = 6_000
/** About six seconds of speech at 16 kHz - far more than the wait for a token ever is. */
const QUEUE_LIMIT = 200_000

/**
 * How long a dictation waits for its token before giving up on it.
 *
 * The queue above holds the first six seconds of speech; past this nothing more is kept, and a microphone
 * open with no socket behind it is a red button that writes nothing - which is exactly how a lost request
 * used to look. Long enough for a slow relay, short enough that the person sees an error while they still
 * remember what they said.
 */
const GRANT_CEILING_MS = 8_000

/**
 * How long a track may stay muted before the dictation is called off.
 *
 * iOS hands over a track that is muted for a moment after the microphone opens and unmutes it a little
 * later; one that stays muted is a microphone somebody else holds, or a stream the system never fed, and
 * recording it is recording silence. Either way the words are not coming, and the button says so.
 */
const MUTED_CEILING_MS = 3_000

/**
 * What the words go out at.
 *
 * The same rate the desk asks its device for first (see RATES in Microphone.kt), and for the same
 * reason: it is what the model wants, and everything above it is bytes paid for and thrown away. A phone
 * hands over 48 kHz by default, which is three times the traffic for a transcription that comes back
 * identical - and a phone is the one client on somebody's mobile data.
 *
 * Resampled in the worklet rather than asked of the context. The context used to be opened at this rate
 * and closed after every dictation, and on iOS that is the shape of trouble: a context is a hardware
 * session, the system reconfigures the audio path to the rate it is asked for, and one opened and
 * closed several times in a row comes up silent or does not come up at all - a red button that writes
 * nothing. Now there is one context for the page, at the device's own rate (see [obtainAudio]), and the
 * arithmetic that brings it down to sixteen is ours.
 */
const TARGET_RATE = 16_000

/**
 * How much speech goes across the thread at a time - the same fifty milliseconds the desk reads in.
 *
 * Small enough that the words arrive as they are spoken, large enough that a socket is not woken several
 * hundred times a second.
 */
const CHUNK_MS = 50

/**
 * The one audio context of this page, with the worklet already in it.
 *
 * Made on the first press and kept for the rest of the page's life. A context per dictation was the
 * natural shape and the wrong one on a phone: on iOS a context is a hardware session, the system counts
 * them, closing one takes a moment, and the third or fourth press in a row was refused or came up silent
 * (see TARGET_RATE). Suspended between dictations rather than closed, so the hardware is let go of and
 * the next press only has to resume it - which it does inside the press, where iOS allows it.
 *
 * Opened at the device's own rate: the resampling is the worklet's (see WORKLET). A context whose module
 * failed to load is dropped so the next press tries afresh rather than inheriting a broken one.
 */
interface Audio {
  context: AudioContext
  ready: Promise<void>
}

let shared: Audio | null = null

/** How many dictations are on the context right now - it is suspended when the last one lets go. */
let holding = 0

const obtainAudio = (): Audio => {
  if (shared && shared.context.state !== 'closed') return shared

  const context = new AudioContext()
  // Handed back as soon as the worklet has been read: a blob URL is a reference the browser keeps until
  // it is told otherwise, and neither closing nor suspending the context releases it.
  const worklet = URL.createObjectURL(new Blob([WORKLET], { type: 'text/javascript' }))
  const ready = context.audioWorklet.addModule(worklet).finally(() => URL.revokeObjectURL(worklet))

  const audio: Audio = { context, ready }
  ready.catch(() => {
    if (shared === audio) shared = null
    void context.close().catch(() => undefined)
  })

  shared = audio
  return audio
}

/**
 * The worklet, as source rather than as a file.
 *
 * It has to be a separate module by the API's design, and shipping it as one would mean a second asset
 * with its own path, its own cache and its own way of being missing after a deploy. A blob is the same
 * code with none of that.
 *
 * It does two things and no more: brings the device's rate down to [TARGET_RATE], and gathers the result
 * into fifty-millisecond pieces. The conversion to 16-bit happens on the main thread, where the socket
 * is, because a worklet posting a typed array copies it either way.
 *
 * The resampling is a box filter - every output sample is the mean of the input samples it covers, a
 * fractional share at each edge when the ratio is not whole (44.1 kHz gives 2.75625). Crude next to a
 * windowed sinc and more than enough for speech going to a recogniser: what it costs is a little of the
 * top of the band, which speech does not live in. A device already at or below sixteen is passed through.
 *
 * Gathered into fifty-millisecond pieces rather than posted a quantum at a time. A quantum is 128 frames
 * - about 375 of them a second - and every one of them was a message across the thread, a typed array
 * allocated and thrown away, and a websocket frame whose header was a seventh of what it carried. Fifty
 * milliseconds is what the desk settled on for exactly this (see CHUNK_MS in Microphone.kt) and it is
 * still far below anything a person hears as delay.
 */
export const WORKLET = `
const OUT_RATE = ${TARGET_RATE}
const ratio = sampleRate > OUT_RATE ? sampleRate / OUT_RATE : 1
const CHUNK = Math.round(Math.min(sampleRate, OUT_RATE) * ${CHUNK_MS} / 1000)

class AccTap extends AudioWorkletProcessor {
  constructor() {
    super()
    this.held = new Float32Array(CHUNK)
    this.filled = 0
    this.done = false
    // The box filter's state: the running sum of the output sample being built, and how much of it is
    // built, in input samples.
    this.sum = 0
    this.have = 0

    // The speech is over: hand back what is still held - the end of the last word, and up to a whole
    // chunk of it - and stop. What the graph carries after this is silence from a microphone that has
    // already been switched off, and sending it would have Deepgram transcribing the pause.
    this.port.onmessage = () => {
      if (this.filled > 0) this.port.postMessage(this.held.slice(0, this.filled))
      this.done = true
    }
  }

  out(sample) {
    this.held[this.filled] = sample
    this.filled += 1

    if (this.filled === CHUNK) {
      this.port.postMessage(this.held)
      this.held = new Float32Array(CHUNK)
      this.filled = 0
    }
  }

  process(inputs) {
    if (this.done) return false

    const channel = inputs[0] && inputs[0][0]
    if (!channel) return true

    if (ratio === 1) {
      for (let i = 0; i < channel.length; i += 1) this.out(channel[i])
      return true
    }

    for (let i = 0; i < channel.length; i += 1) {
      const x = channel[i]
      const room = ratio - this.have

      if (room > 1) {
        this.sum += x
        this.have += 1
        continue
      }

      // This sample straddles the edge: \`room\` of it closes the output sample, the rest opens the next.
      this.sum += x * room
      this.out(this.sum / ratio)
      this.sum = x * (1 - room)
      this.have = 1 - room
    }

    return true
  }
}
registerProcessor('acc-tap', AccTap)
`

/**
 * Opens the microphone and starts recording. The socket follows once [Dictation.authorise] is called.
 *
 * Returns null when it could not start - refused permission, a browser with no microphone, a worklet that
 * would not load - having already said so through `onError`. Nothing between "the microphone opened" and
 * "recording" is allowed to throw its way out: a rejection here used to leave the button red with nothing
 * behind it, until the two-minute ceiling let go of it.
 */
export const startDictation = async (handlers: DictationHandlers): Promise<Dictation | null> => {
  if (
    !navigator.mediaDevices?.getUserMedia ||
    typeof AudioContext === 'undefined' ||
    typeof AudioWorkletNode === 'undefined'
  ) {
    handlers.onError('mic')
    return null
  }

  // Both inside the press, before the first await: iOS lets a page start or resume audio in a gesture
  // and nowhere else, and the permission dialog that follows is the end of the gesture.
  const audio = obtainAudio()
  void audio.context.resume().catch(() => undefined)

  let stream: MediaStream
  try {
    stream = await navigator.mediaDevices.getUserMedia({
      // What a phone held at arm's length needs, and what every other application asks for too.
      audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true },
    })
  } catch {
    handlers.onError('mic')
    return null
  }

  const { context } = audio
  const track = stream.getAudioTracks()[0]

  let socket: WebSocket | null = null
  let queued: Int16Array<ArrayBuffer>[] = []
  let queuedBytes = 0
  let finishing = false
  let dead = false
  let tailTimer: ReturnType<typeof setTimeout> | undefined
  let quietTimer: ReturnType<typeof setTimeout> | undefined
  let grantTimer: ReturnType<typeof setTimeout> | undefined
  let mutedTimer: ReturnType<typeof setTimeout> | undefined
  let source: MediaStreamAudioSourceNode | null = null
  let tap: AudioWorkletNode | null = null
  let mute: GainNode | null = null

  const stopTracks = (): void => {
    // The track is what the phone's own recording indicator watches: leaving it live means a dot in the
    // status bar for the rest of the day.
    for (const one of stream.getTracks()) one.stop()
  }

  const release = (): void => {
    clearTimeout(tailTimer)
    clearTimeout(quietTimer)
    clearTimeout(grantTimer)
    clearTimeout(mutedTimer)
    queued = []
    queuedBytes = 0
    stopTracks()

    try {
      source?.disconnect()
      tap?.disconnect()
      mute?.disconnect()
    } catch {
      // Never connected, or already taken apart.
    }

    // The context stays for the next press (see obtainAudio); the hardware is let go of when nobody is
    // on it. Best effort: a context that will not suspend is a context that goes on idling, no worse.
    if (tap !== null) {
      holding = Math.max(0, holding - 1)
      if (holding === 0) void context.suspend().catch(() => undefined)
    }
  }

  const end = (): void => {
    if (dead) return
    dead = true
    release()
    handlers.onEnded()
  }

  const die = (code: string): void => {
    if (dead) return
    dead = true
    release()
    try {
      socket?.close()
    } catch {
      // Already closed, or never opened - nothing to hold on to.
    }
    handlers.onError(code)
    handlers.onEnded()
  }

  const close = (): void => {
    if (dead) return

    /*
     * The goodbye and the hanging up are two separate attempts, and that is the point.
     *
     * A socket still in CONNECTING throws on send, and sharing one `try` meant the throw skipped the
     * close on the next line - so a stalled handshake went on connecting after the dictation was over,
     * and idled until Deepgram gave up on it. That is precisely the state the opening ceiling fires in.
     */
    if (socket?.readyState === WebSocket.OPEN) {
      try {
        socket.send(JSON.stringify({ type: 'CloseStream' }))
      } catch {
        // It died between the check and the send; the words already in the draft are the words we have.
      }
    }

    try {
      socket?.close()
    } catch {
      // Already closed, or never opened.
    }

    end()
  }

  try {
    await audio.ready

    source = context.createMediaStreamSource(stream)
    tap = new AudioWorkletNode(context, 'acc-tap')
    holding += 1

    tap.port.onmessage = (event: MessageEvent<Float32Array>) => {
      // Not `finishing` as well: exactly one piece arrives after that - the tail the worklet was holding
      // when the speech ended - and it is the end of the last word (see WORKLET). The worklet stops
      // itself straight after it, so there is no stream of silence behind it.
      if (dead) return

      const samples = toPcm16(event.data)

      if (socket?.readyState === WebSocket.OPEN) {
        socket.send(samples)
        return
      }

      // Still waiting for the token. The first words are worth keeping - they are usually the sentence.
      if (queuedBytes < QUEUE_LIMIT) {
        queued.push(samples)
        queuedBytes += samples.byteLength
      }
    }

    source.connect(tap)
    // Connected to the destination because Chrome stops pulling from a worklet that leads nowhere; the
    // gain is zero, so nothing of it is heard.
    mute = context.createGain()
    mute.gain.value = 0
    tap.connect(mute).connect(context.destination)
  } catch {
    // The worklet would not load, or the graph would not build - a context in a state this page cannot
    // mend. Said and let go of, rather than left as a button that records into nothing.
    release()
    handlers.onError('mic')
    return null
  }

  /*
   * A track that is not delivering.
   *
   * Muted is a state the system puts a track in, and iOS does it to every freshly opened microphone for
   * a moment; one that stays that way is not going to speak (see MUTED_CEILING_MS). Ended is the system
   * taking the microphone away - a call coming in, another app claiming it - and a recording of what is
   * no longer there is worth ending out loud.
   */
  if (track) {
    const muted = (): void => {
      clearTimeout(mutedTimer)
      mutedTimer = setTimeout(() => {
        if (!finishing) die('mic')
      }, MUTED_CEILING_MS)
    }
    track.addEventListener('mute', muted)
    track.addEventListener('unmute', () => clearTimeout(mutedTimer))
    track.addEventListener('ended', () => {
      if (!finishing) die('mic')
    })
    if (track.muted) muted()
  }

  // The token that never comes (see GRANT_CEILING_MS): a request lost to a socket that had quietly
  // died, or an IDE that never answered. Without this the words went into the queue and then nowhere.
  grantTimer = setTimeout(() => {
    if (socket === null) die('network')
  }, GRANT_CEILING_MS)

  /** What Deepgram is told: the worklet's output rate, never the device's (see WORKLET). */
  const outRate = Math.min(context.sampleRate, TARGET_RATE)

  return {
    authorise: ({ token, language, model }) => {
      // A second grant for the same dictation is an answer to a request that has already been
      // answered - a press let go and made again while the first token was in flight. Opening a
      // socket for it would leave the first one orphaned on Deepgram's side with the opening of the
      // phrase already inside it, and split one sentence across two transcriptions.
      if (dead || socket) return

      clearTimeout(grantTimer)

      const url = new URL('wss://api.deepgram.com/v1/listen')
      url.searchParams.set('model', model)
      url.searchParams.set('language', language)
      url.searchParams.set('encoding', 'linear16')
      // The rate the words actually go out at: claiming one we are not sending is chipmunk noise.
      url.searchParams.set('sample_rate', String(Math.round(outRate)))
      url.searchParams.set('channels', '1')
      url.searchParams.set('smart_format', 'true')
      url.searchParams.set('interim_results', 'true')

      try {
        socket = new WebSocket(url.toString(), ['bearer', token])
      } catch {
        die('network')
        return
      }

      socket.binaryType = 'arraybuffer'

      socket.onopen = () => {
        if (dead) return

        for (const chunk of queued) socket?.send(chunk)
        queued = []
        queuedBytes = 0

        // Let go before the socket was up: the Finalize was waiting for this moment, and so was the
        // clock. Counting the tail from the release instead would end the dictation while the
        // handshake was still in flight - the whole phrase dropped, silently, on exactly the slow
        // network this waiting exists for.
        if (finishing) {
          socket?.send(JSON.stringify({ type: 'Finalize' }))
          clearTimeout(tailTimer)
          tailTimer = setTimeout(close, TAIL_MS)
        }
      }

      socket.onmessage = (event) => {
        if (typeof event.data !== 'string') return

        let payload: {
          type?: string
          is_final?: boolean
          channel?: { alternatives?: { transcript?: string }[] }
          description?: string
        }

        try {
          payload = JSON.parse(event.data)
        } catch {
          return
        }

        if (payload.type === 'Error') {
          die('deepgram')
          return
        }

        if (payload.type !== 'Results') return

        const transcript = payload.channel?.alternatives?.[0]?.transcript ?? ''

        if (!payload.is_final) {
          handlers.onInterim(transcript)
          return
        }

        // A final piece can be empty - a pause Deepgram decided was the end of a phrase. There is
        // nothing to put in the draft, but the grey tail it replaces has to go.
        handlers.onInterim('')
        if (transcript.trim() !== '') handlers.onFinal(transcript)

        // Past Finalize this is the tail: give it a moment for a second piece and then shut.
        if (finishing) {
          clearTimeout(quietTimer)
          quietTimer = setTimeout(close, QUIET_MS)
        }
      }

      socket.onerror = () => die('network')

      socket.onclose = (event) => {
        if (dead) return
        // 1008/4008-style refusals mean the token was not accepted; anything else mid-dictation is the
        // network. A close we asked for lands in `close` above and never gets here.
        if (finishing) end()
        else die(event.code === 1008 ? 'key' : 'network')
      }
    },

    finish: () => {
      if (dead || finishing) return
      finishing = true

      // The microphone stops here rather than after the tail: what it records from now on is silence
      // nobody asked for, and the indicator should go out when the speaking does.
      stopTracks()

      // And the worklet hands back what it was still holding. It arrives a moment after Finalize below,
      // which is allowed: Finalize settles what Deepgram has and leaves the stream open, so the tail
      // comes back as one more final piece - which this already expects more than one of.
      tap?.port.postMessage('flush')

      if (socket?.readyState === WebSocket.OPEN) {
        try {
          socket.send(JSON.stringify({ type: 'Finalize' }))
        } catch {
          close()
          return
        }

        tailTimer = setTimeout(close, TAIL_MS)
        return
      }

      /*
       * Still opening, or not opened at all - the token has not come back yet.
       *
       * The tail cannot be counted from here: there is nothing on the other end to count it against,
       * and onopen will start that clock properly. What this ceiling covers is the other ending - a
       * token that never arrives, or a handshake that never completes - which would otherwise leave the
       * microphone open and the button waiting on an answer nobody is going to send.
       */
      tailTimer = setTimeout(close, OPENING_CEILING_MS)
    },

    cancel: () => {
      if (dead) return
      dead = true
      release()
      try {
        socket?.close()
      } catch {
        // Nothing to close.
      }
      handlers.onEnded()
    },
  }
}

/**
 * What the microphone gives (floats between -1 and 1) into what Deepgram is being told to expect
 * (`linear16`: signed 16-bit, little-endian, which is what a browser's own byte order already is on
 * every platform this runs on).
 */
const toPcm16 = (samples: Float32Array): Int16Array<ArrayBuffer> => {
  // Backed by a plain ArrayBuffer rather than by whatever the input was: a websocket takes bytes it can
  // own, and a view over a shared buffer is not that.
  const out = new Int16Array(new ArrayBuffer(samples.length * 2))

  for (let i = 0; i < samples.length; i += 1) {
    const sample = Math.max(-1, Math.min(1, samples[i] ?? 0))
    out[i] = sample < 0 ? sample * 0x8000 : sample * 0x7fff
  }

  return out
}

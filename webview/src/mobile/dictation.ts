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
/** About two seconds of speech at 48 kHz - far more than the wait for a token ever is. */
const QUEUE_LIMIT = 200_000

/**
 * What we ask the browser to resample the microphone to.
 *
 * The same rate the desk asks its device for first (see RATES in Microphone.kt), and for the same
 * reason: it is what the model wants, and everything above it is bytes paid for and thrown away. A phone
 * hands over 48 kHz by default, which is three times the traffic for a transcription that comes back
 * identical - and a phone is the one client on somebody's mobile data.
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
 * The graph the microphone is read through.
 *
 * Asked for at [TARGET_RATE] and taken as it comes if the browser will not have it: a context is not
 * obliged to open at a rate that is not the device's, and a dictation that works at 48 kHz is worth more
 * than one that saves bytes by not starting. Whatever it settles on is what Deepgram is told (see the
 * `sample_rate` parameter) - claiming a rate we are not sending is chipmunk noise.
 */
const openContext = (): AudioContext => {
  try {
    return new AudioContext({ sampleRate: TARGET_RATE })
  } catch {
    return new AudioContext()
  }
}

/**
 * The worklet, as source rather than as a file.
 *
 * It has to be a separate module by the API's design, and shipping it as one would mean a second asset
 * with its own path, its own cache and its own way of being missing after a deploy. A blob is the same
 * code with none of that.
 *
 * It does nothing but gather and forward: the conversion to 16-bit happens on the main thread, where the
 * socket is, because a worklet posting a typed array copies it either way.
 *
 * Gathered into fifty-millisecond pieces rather than posted a quantum at a time. A quantum is 128 frames
 * - about 375 of them a second - and every one of them was a message across the thread, a typed array
 * allocated and thrown away, and a websocket frame whose header was a seventh of what it carried. Fifty
 * milliseconds is what the desk settled on for exactly this (see CHUNK_MS in Microphone.kt) and it is
 * still far below anything a person hears as delay.
 */
const WORKLET = `
const CHUNK = Math.round(sampleRate * ${CHUNK_MS} / 1000)

class AccTap extends AudioWorkletProcessor {
  constructor() {
    super()
    this.held = new Float32Array(CHUNK)
    this.filled = 0
    this.done = false

    // The speech is over: hand back what is still held - the end of the last word, and up to a whole
    // chunk of it - and stop. What the graph carries after this is silence from a microphone that has
    // already been switched off, and sending it would have Deepgram transcribing the pause.
    this.port.onmessage = () => {
      if (this.filled > 0) this.port.postMessage(this.held.slice(0, this.filled))
      this.done = true
    }
  }

  process(inputs) {
    if (this.done) return false

    const channel = inputs[0] && inputs[0][0]
    if (!channel) return true

    let read = 0
    while (read < channel.length) {
      const room = CHUNK - this.filled
      const take = Math.min(room, channel.length - read)

      this.held.set(channel.subarray(read, read + take), this.filled)
      this.filled += take
      read += take

      if (this.filled === CHUNK) {
        this.port.postMessage(this.held)
        this.held = new Float32Array(CHUNK)
        this.filled = 0
      }
    }

    return true
  }
}
registerProcessor('acc-tap', AccTap)
`

/**
 * Opens the microphone and starts recording. The socket follows once [Dictation.authorise] is called.
 *
 * Returns null when the microphone would not open - refused permission, or a browser that has none -
 * having already said so through `onError`.
 */
export const startDictation = async (handlers: DictationHandlers): Promise<Dictation | null> => {
  if (!navigator.mediaDevices?.getUserMedia || typeof AudioContext === 'undefined') {
    handlers.onError('mic')
    return null
  }

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

  const context = openContext()
  // Safari suspends a context created outside a gesture; this one is created inside the press, and
  // resuming is free when it was never suspended.
  await context.resume().catch(() => undefined)

  let socket: WebSocket | null = null
  let queued: Int16Array<ArrayBuffer>[] = []
  let queuedBytes = 0
  let finishing = false
  let dead = false
  let tailTimer: ReturnType<typeof setTimeout> | undefined
  let quietTimer: ReturnType<typeof setTimeout> | undefined

  const release = (): void => {
    clearTimeout(tailTimer)
    clearTimeout(quietTimer)
    queued = []
    queuedBytes = 0
    // The track is what the phone's own recording indicator watches: leaving it live means a dot in the
    // status bar for the rest of the day.
    for (const track of stream.getTracks()) track.stop()
    void context.close().catch(() => undefined)
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

  // Handed back as soon as the worklet has been read: a blob URL is a reference the browser keeps until
  // it is told otherwise, and closing the audio context does not release it. A phone left open all day
  // dictates dozens of times, and every one of them used to leave a copy of the worklet behind.
  const worklet = URL.createObjectURL(new Blob([WORKLET], { type: 'text/javascript' }))

  try {
    await context.audioWorklet.addModule(worklet)
  } catch {
    die('mic')
    return null
  } finally {
    URL.revokeObjectURL(worklet)
  }

  const source = context.createMediaStreamSource(stream)
  const tap = new AudioWorkletNode(context, 'acc-tap')

  tap.port.onmessage = (event: MessageEvent<Float32Array>) => {
    // Not `finishing` as well: exactly one piece arrives after that - the tail the worklet was holding
    // when the speech ended - and it is the end of the last word (see WORKLET). The worklet stops itself
    // straight after it, so there is no stream of silence behind it.
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
  const mute = context.createGain()
  mute.gain.value = 0
  tap.connect(mute).connect(context.destination)

  return {
    authorise: ({ token, language, model }) => {
      // A second grant for the same dictation is an answer to a request that has already been
      // answered - a press let go and made again while the first token was in flight. Opening a
      // socket for it would leave the first one orphaned on Deepgram's side with the opening of the
      // phrase already inside it, and split one sentence across two transcriptions.
      if (dead || socket) return

      const url = new URL('wss://api.deepgram.com/v1/listen')
      url.searchParams.set('model', model)
      url.searchParams.set('language', language)
      url.searchParams.set('encoding', 'linear16')
      // The rate the device actually gave us: asking for 16 kHz and being handed 48 would send the
      // words at three times the speed, which Deepgram transcribes as chipmunk noise.
      url.searchParams.set('sample_rate', String(Math.round(context.sampleRate)))
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
      for (const track of stream.getTracks()) track.stop()

      // And the worklet hands back what it was still holding. It arrives a moment after Finalize below,
      // which is allowed: Finalize settles what Deepgram has and leaves the stream open, so the tail
      // comes back as one more final piece - which this already expects more than one of.
      tap.port.postMessage('flush')

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

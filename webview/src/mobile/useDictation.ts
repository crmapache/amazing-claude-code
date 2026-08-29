import { useCallback, useRef, useState } from 'react'
import type { ShellMessage } from '../protocol'
import { startDictation, type Dictation } from './dictation'

/**
 * Dictation on the phone, from the press to the words in the field.
 *
 * The order of things here is the whole point. The microphone opens on the press and starts recording
 * at once, while the request for a token is still crossing the relay - a round trip to the IDE is half
 * a second on a good network, and that is the half second people begin talking in. The chunks wait in
 * dictation.ts until the socket is up and then go in one go.
 *
 * The words land through a callback the composer registers rather than through state: the draft belongs
 * to the field (see mobile/screens/Composer), and a phrase has to join it wherever the caret is.
 */
export type DictationPhase = 'idle' | 'listening' | 'finishing'

export interface PhoneDictation {
  phase: DictationPhase
  /** The phrase being said, shown in grey under the field until it settles. */
  interim: string
  /** A code the screen turns into a sentence (see feed/voice.ts): `mic`, `key`, `network`, `off`… */
  error: string
  start: () => void
  stop: () => void
  cancel: () => void
  /** The composer hands over "put this phrase into the draft"; null when it goes away. */
  registerInsert: (insert: ((phrase: string) => void) | null) => void
  /** The IDE's answer to the request for a token - see VoiceGrant. */
  grant: (message: Extract<ShellMessage, { type: 'voiceGrant' }>) => void
}

export const useDictation = ({ requestToken }: { requestToken: (id: string) => void }): PhoneDictation => {
  const [phase, setPhase] = useState<DictationPhase>('idle')
  const [interim, setInterim] = useState('')
  const [error, setError] = useState('')

  const live = useRef<Dictation | null>(null)
  const insert = useRef<((phrase: string) => void) | null>(null)
  /**
   * Which press a token belongs to.
   *
   * A grant that arrives after its dictation has been cancelled - a press let go while the request was
   * in flight - must not open a socket for nobody. The counter is the cheapest way to say "this answer
   * is about something that is over".
   */
  const attempt = useRef(0)

  /**
   * The name this press asked for its token under.
   *
   * A grant carries it back, and a grant that does not carry it belongs to something else: a press that
   * has already been let go of, or another phone entirely - the answer travels down a channel that every
   * device paired with this project listens on. Both used to be acted on, and both ended a dictation
   * somebody was in the middle of, with an error from a press they never made.
   */
  const asked = useRef('')

  /**
   * A token that arrived before the microphone was ready.
   *
   * Perfectly ordinary: the request goes out in the same breath as `getUserMedia`, and on a phone that
   * has already granted permission the network can win that race. Without this the token would be
   * dropped and the dictation would record into a socket that never opened.
   */
  const waiting = useRef<{ token: string; language: string; model: string } | null>(null)

  /**
   * The ceiling on one dictation.
   *
   * The desk has the same two minutes (see VoiceDictation) and needs them for a key released in
   * another application; a phone needs them for a plainer reason - a tap latches the recording on, and
   * a pocket is where phones go next. Without this the microphone stays open, the audio keeps going to
   * Deepgram, and the account keeps paying, until the tab is killed.
   */
  const ceiling = useRef<ReturnType<typeof setTimeout> | undefined>(undefined)

  const registerInsert = useCallback((next: ((phrase: string) => void) | null) => {
    insert.current = next
  }, [])

  /** The ceiling above fires into this - it is armed before `stop` exists to be closed over. */
  const stopRef = useRef<() => void>(() => undefined)

  const start = useCallback(() => {
    if (live.current) return

    attempt.current += 1
    const mine = attempt.current
    asked.current = `${page}-${mine}`

    setError('')
    setInterim('')
    setPhase('listening')
    waiting.current = null

    clearTimeout(ceiling.current)
    ceiling.current = setTimeout(() => stopRef.current(), MAX_MS)

    // Asked for in parallel with opening the microphone rather than after it: the two waits are
    // independent, and doing them one after the other would add up to the delay this avoids.
    requestToken(asked.current)

    void startDictation({
      onInterim: (text) => {
        if (attempt.current === mine) setInterim(text)
      },
      onFinal: (text) => {
        if (attempt.current === mine) insert.current?.(text)
      },
      onError: (code) => {
        if (attempt.current !== mine) return
        setError(code)
        setInterim('')
      },
      onEnded: () => {
        if (attempt.current !== mine) return
        clearTimeout(ceiling.current)
        live.current = null
        setInterim('')
        setPhase('idle')
      },
    }).then((started) => {
      // Cancelled while the permission dialog was up: shut it down rather than record into nothing.
      if (attempt.current !== mine) {
        started?.cancel()
        return
      }

      if (!started) {
        // Refused permission, or a browser with no microphone at all: nothing is running, so the
        // ceiling has nothing left to cut short.
        clearTimeout(ceiling.current)
        setPhase('idle')
        return
      }

      live.current = started

      const early = waiting.current
      waiting.current = null
      if (early) started.authorise(early)
    })
  }, [requestToken])

  const stop = useCallback(() => {
    clearTimeout(ceiling.current)

    const running = live.current
    if (!running) {
      // The press ended before the microphone was ready - there is nothing to finalise, only to forget.
      attempt.current += 1
      asked.current = ''
      setPhase('idle')
      return
    }

    setPhase('finishing')
    running.finish()
  }, [])

  const cancel = useCallback(() => {
    clearTimeout(ceiling.current)
    attempt.current += 1
    asked.current = ''
    waiting.current = null
    live.current?.cancel()
    live.current = null
    setInterim('')
    setPhase('idle')
  }, [])

  const grant = useCallback((message: Extract<ShellMessage, { type: 'voiceGrant' }>) => {
    // Not this press's answer - see [asked].
    if (!message.id || message.id !== asked.current) return

    if (message.error || !message.token) {
      // The IDE refused: voice input off at the desk, no key, or Deepgram would not have it. The
      // microphone is already open by now, so it is closed again with nothing recorded going anywhere -
      // which is throwing the dictation away and is written as exactly that. Spelled out a second time,
      // it had already lost one of cancel's lines and left an early token behind for the next press.
      cancel()
      setError(message.error || 'network')
      return
    }

    const granted = {
      token: message.token,
      language: message.language || 'en',
      model: message.model || 'nova-3',
    }

    if (live.current) live.current.authorise(granted)
    else waiting.current = granted
  }, [cancel])

  stopRef.current = stop

  return { phase, interim, error, start, stop, cancel, registerInsert, grant }
}

/** Two minutes, the same as at the desk - far longer than anybody talks, far shorter than a pocket. */
const MAX_MS = 120_000

/**
 * This page's own name for itself, in front of every request it makes.
 *
 * A counter alone would not do: two phones watching one project both call their first press "1", and the
 * whole point of naming a request is telling one phone's from another's.
 */
const page = Math.random().toString(36).slice(2, 10)

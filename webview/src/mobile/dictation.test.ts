import { describe, expect, it } from 'vitest'
import { WORKLET } from './dictation'

/**
 * The worklet runs in a thread of the browser's and cannot be imported here, so it is run the way the
 * browser runs it: its source evaluated with the two globals the API gives it, `sampleRate` and
 * `registerProcessor`, and a stand-in for the class it extends.
 */
interface Tap {
  process: (inputs: Float32Array[][]) => boolean
  port: { onmessage: ((event: { data: Float32Array }) => void) | null; postMessage: (data: Float32Array) => void }
}

const tapAt = (sampleRate: number): { tap: Tap; out: Float32Array[] } => {
  const out: Float32Array[] = []

  class AudioWorkletProcessor {
    port = {
      onmessage: null as Tap['port']['onmessage'],
      postMessage: (data: Float32Array) => {
        out.push(Float32Array.from(data))
      },
    }
  }

  let registered: (new () => Tap) | null = null

  // eslint-disable-next-line @typescript-eslint/no-implied-eval
  const run = new Function('sampleRate', 'AudioWorkletProcessor', 'registerProcessor', WORKLET)
  run(sampleRate, AudioWorkletProcessor, (_name: string, cls: new () => Tap) => {
    registered = cls
  })

  if (!registered) throw new Error('the worklet registered nothing')

  return { tap: new (registered as new () => Tap)(), out }
}

/** A second of a tone, sliced the way the browser slices it - 128 frames at a time. */
const feed = (tap: Tap, rate: number, hz: number, seconds = 1): void => {
  const total = Math.round(rate * seconds)
  for (let at = 0; at < total; at += 128) {
    const quantum = new Float32Array(128)
    for (let i = 0; i < 128; i += 1) quantum[i] = Math.sin((2 * Math.PI * hz * (at + i)) / rate)
    tap.process([[quantum]])
  }
}

describe('the dictation worklet', () => {
  it('brings 48 kHz down to 16 kHz in fifty-millisecond pieces', () => {
    const { tap, out } = tapAt(48_000)
    feed(tap, 48_000, 440)

    // One second in: 16 000 samples out, in pieces of 800 (fifty milliseconds at sixteen).
    const samples = out.reduce((sum, piece) => sum + piece.length, 0)
    expect(out.every((piece) => piece.length === 800)).toBe(true)
    expect(samples).toBeGreaterThanOrEqual(15_200)
    expect(samples).toBeLessThanOrEqual(16_000)

    // And the tone survives: a 440 Hz sine resampled is still a sine of the same amplitude - the box
    // filter costs it almost nothing this far below the cut.
    const peak = Math.max(...out.flatMap((piece) => Array.from(piece)))
    expect(peak).toBeGreaterThan(0.95)
  })

  it('takes a rate that is not a whole multiple - 44.1 kHz - down to sixteen as well', () => {
    const { tap, out } = tapAt(44_100)
    feed(tap, 44_100, 300)

    const samples = out.reduce((sum, piece) => sum + piece.length, 0)
    expect(samples).toBeGreaterThanOrEqual(15_200)
    expect(samples).toBeLessThanOrEqual(16_000)
    expect(out.every((piece) => piece.length === 800)).toBe(true)
  })

  it('passes a device already at sixteen through untouched', () => {
    const { tap, out } = tapAt(16_000)
    feed(tap, 16_000, 300, 0.1)

    expect(out.reduce((sum, piece) => sum + piece.length, 0)).toBe(1_600)
    expect(out[0]?.[1]).toBeCloseTo(Math.sin((2 * Math.PI * 300) / 16_000), 6)
  })

  it('hands back what it was holding when told to flush, and stops', () => {
    const { tap, out } = tapAt(48_000)
    // 384 frames: exactly 128 output samples, well short of a piece of 800.
    feed(tap, 48_000, 300, 384 / 48_000)
    expect(out).toHaveLength(0)

    tap.port.onmessage?.({ data: new Float32Array(0) })
    expect(out).toHaveLength(1)
    expect(out[0]?.length).toBe(128)

    // Dead after the flush: the graph goes on carrying silence, and none of it is wanted.
    expect(tap.process([[new Float32Array(128)]])).toBe(false)
  })
})

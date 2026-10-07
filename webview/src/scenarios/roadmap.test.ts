import { describe, expect, it } from 'vitest'
import type { ScenarioRoadmapStop, ScenarioRun, ScenarioStepState } from '../protocol'
import { ROAD, bandOf, endOf, hereOf, roadLayout, roadOf, roadWidth, widthOf, windowed, type RoadItem } from './roadmap'

const stop = (state: ScenarioStepState, stage = 1): ScenarioRoadmapStop => ({ state, stage, pass: 1, title: state })

/** The road as a line of text: a number per stop, `+n` per fold - what a person would read off it. */
const read = (items: RoadItem[]): string =>
  items.map((item) => (item.kind === 'stop' ? String(item.index + 1) : `+${item.to - item.from + 1}`)).join(' ')

describe('the road on the card of a going run', () => {
  it('is on the first stop that is not over, and on the last when every one is', () => {
    expect(hereOf([stop('done'), stop('skipped'), stop('judging'), stop('waiting')])).toBe(2)
    // Between two cards nothing works, and the run stands at the head of the next one.
    expect(hereOf([stop('done'), stop('waiting')])).toBe(1)
    expect(hereOf([stop('done'), stop('failed')])).toBe(1)
  })

  it('tints the stage the run is in, but only where the tint says something', () => {
    const road = [stop('done', 1), stop('done', 2), stop('running', 2), stop('waiting', 3)]
    expect(bandOf(road, 2)).toEqual({ from: 1, to: 2 })
    // A stage of one card: the lit stop says it already.
    expect(bandOf(road, 3)).toBeNull()
    // One stage for the whole scenario: everything is in it.
    expect(bandOf([stop('done'), stop('running')], 1)).toBeNull()
  })

  it('draws every stop when there is room, evenly', () => {
    expect(read(roadLayout(5, 2, 600))).toBe('1 2 3 4 5')
    // Exactly as wide as five stops and four links of one length: nothing stretches.
    expect(widthOf(roadLayout(5, 2, 600))).toBe(5 * ROAD.stop + 4 * ROAD.link)
  })

  /*
   * Twenty stops in a narrow card: the first and the last stay, a window leans forward from the present,
   * the rest folds into counts. The last number is the size of the run - what "7/20 cards" used to say.
   */
  it('folds the past and the future around the present, never the present', () => {
    const items = roadLayout(20, 9, 260)
    const text = read(items)

    expect(text.startsWith('1 +')).toBe(true)
    expect(text.endsWith(' 20')).toBe(true)
    expect(text).toContain('10')
    expect(widthOf(items)).toBeLessThanOrEqual(260)
  })

  it('leans forward: a little of what is done, more of what is left', () => {
    expect(read(windowed(20, 9, 7))).toBe('1 +6 8 9 10 11 12 13 14 +5 20')
  })

  it('draws a fold of one as the stop itself', () => {
    // Stop 2 alone between the first and the window: a pill would be wider than the stop it hides.
    expect(read(windowed(12, 3, 4))).toBe('1 2 3 4 5 6 +5 12')
  })

  it('keeps the window inside the road at either end', () => {
    expect(read(windowed(20, 0, 5))).toBe('1 2 3 4 5 +14 20')
    expect(read(windowed(20, 19, 5))).toBe('1 +14 16 17 18 19 20')
  })

  it('still draws the present when there is room for almost nothing', () => {
    const items = roadLayout(30, 14, 20)
    expect(items.some((item) => item.kind === 'stop' && item.index === 14)).toBe(true)
  })

  it('is empty for a run with nothing planned', () => {
    expect(roadLayout(0, 0, 300)).toEqual([])
  })

  /*
   * The run's own screen has the whole record rather than the summary, and draws the same road out of it:
   * the stage counted from one, in the order of the scenario's stages.
   */
  it('is read off a whole run the way the summary carries it', () => {
    const run = {
      snapshot: { stages: [{ id: 'a' }, { id: 'b' }] },
      steps: [
        { stageId: 'a', pass: 1, title: 'Plan', state: 'done' },
        { stageId: 'b', pass: 2, title: 'Fix', state: 'running' },
      ],
    } as unknown as ScenarioRun

    expect(roadOf(run)).toEqual([
      { state: 'done', stage: 1, pass: 1, title: 'Plan' },
      { state: 'running', stage: 2, pass: 2, title: 'Fix' },
    ])
  })

  it('looks at a finished road from the card it ended on', () => {
    expect(endOf([stop('done'), stop('failed'), stop('skipped'), stop('skipped')])).toBe(1)
    expect(endOf([stop('done'), stop('done')])).toBe(1)
    expect(endOf([stop('skipped')])).toBe(0)
  })

  it('asks for exactly the room of the whole road, nothing folded', () => {
    expect(roadWidth(6)).toBe(widthOf(roadLayout(6, 0, 10_000)))
    expect(roadWidth(0)).toBe(0)
    expect(roadWidth(1)).toBe(ROAD.stop)
  })

  /*
   * The strip gives the road exactly roadWidth, and an IDE at 90% on a retina screen measures that box back
   * snapped to the device grid - 147.99 of 148. That folded six stops into "+2" with room to spare.
   */
  it('does not fold for the hair a fractional zoom takes off the room it was given', () => {
    expect(read(roadLayout(6, 1, roadWidth(6) - 0.01))).toBe('1 2 3 4 5 6')
    expect(read(roadLayout(6, 1, roadWidth(6) - 0.9))).toBe('1 2 3 4 5 6')
    // A stop's worth short is short, and the road folds.
    expect(read(roadLayout(6, 1, roadWidth(6) - ROAD.stop))).not.toBe('1 2 3 4 5 6')
  })
})

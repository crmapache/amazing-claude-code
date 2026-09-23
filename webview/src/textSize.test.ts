import { describe, expect, it } from 'vitest'
import {
  TEXT_SIZE_FOLLOW,
  TEXT_SIZE_MAX,
  TEXT_SIZE_MIN,
  drawnSize,
  formatPoints,
  normalizeTextSize,
  ownTextSize,
  stepTextSize,
} from './textSize'

describe('normalizeTextSize', () => {
  it('keeps a whole size within the bounds', () => {
    expect(normalizeTextSize(14)).toBe(14)
    expect(normalizeTextSize(TEXT_SIZE_MIN)).toBe(TEXT_SIZE_MIN)
    expect(normalizeTextSize(TEXT_SIZE_MAX)).toBe(TEXT_SIZE_MAX)
  })

  /* The IDE refuses these too and reads them back as "follows" - the page must not show otherwise. */
  it('reads anything the IDE would not keep as following the console', () => {
    expect(normalizeTextSize(13.5)).toBe(TEXT_SIZE_FOLLOW)
    expect(normalizeTextSize(TEXT_SIZE_MAX + 1)).toBe(TEXT_SIZE_FOLLOW)
    expect(normalizeTextSize(undefined)).toBe(TEXT_SIZE_FOLLOW)
    expect(normalizeTextSize('14')).toBe(TEXT_SIZE_FOLLOW)
  })
})

describe('stepTextSize', () => {
  it('moves a whole point from a size of its own', () => {
    expect(stepTextSize({ chosen: 14, console: 13 }, 1)).toBe(15)
    expect(stepTextSize({ chosen: 14, console: 13 }, -1)).toBe(13)
  })

  it('starts from the console size while it is followed', () => {
    expect(stepTextSize({ chosen: TEXT_SIZE_FOLLOW, console: 13 }, 1)).toBe(14)
    expect(stepTextSize({ chosen: TEXT_SIZE_FOLLOW, console: 13 }, -1)).toBe(12)
  })

  /* 13.5 is a size the IDE allows: the neighbours are 14 and 13, not 14.5 or 15. */
  it('lands on the next whole point from a fractional console size', () => {
    expect(stepTextSize({ chosen: TEXT_SIZE_FOLLOW, console: 13.5 }, 1)).toBe(14)
    expect(stepTextSize({ chosen: TEXT_SIZE_FOLLOW, console: 13.5 }, -1)).toBe(13)
  })

  it('stops at the bounds', () => {
    expect(stepTextSize({ chosen: TEXT_SIZE_MAX, console: 13 }, 1)).toBe(TEXT_SIZE_MAX)
    expect(stepTextSize({ chosen: TEXT_SIZE_MIN, console: 13 }, -1)).toBe(TEXT_SIZE_MIN)
  })
})

describe('ownTextSize', () => {
  /* Choosing to stop following changes nothing on the screen - only what the IDE may change later. */
  it('pins what is drawn when the console is followed', () => {
    expect(ownTextSize({ chosen: TEXT_SIZE_FOLLOW, console: 15 })).toBe(15)
    expect(ownTextSize({ chosen: TEXT_SIZE_FOLLOW, console: 4 })).toBe(TEXT_SIZE_MIN)
  })

  it('keeps a size already set', () => {
    expect(ownTextSize({ chosen: 18, console: 13 })).toBe(18)
  })
})

describe('drawnSize and formatPoints', () => {
  it('writes the size drawn, a fraction only when there is one', () => {
    expect(formatPoints(drawnSize({ chosen: TEXT_SIZE_FOLLOW, console: 13 }))).toBe('13 pt')
    expect(formatPoints(drawnSize({ chosen: TEXT_SIZE_FOLLOW, console: 13.5 }))).toBe('13.5 pt')
    expect(formatPoints(drawnSize({ chosen: 16, console: 13.5 }))).toBe('16 pt')
  })
})

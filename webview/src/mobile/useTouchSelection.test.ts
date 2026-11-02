import { describe, expect, it } from 'vitest'
import { placeOf } from './useTouchSelection'

/**
 * Where the quote button stands over the feed. Worth a test because the wrong answer is invisible on a
 * screenshot of the usual case and ruins the usual case on a phone: the answer just written is the last
 * thing on screen, and the button at the bottom stood right on the words selected in it.
 */
describe('the place of the quote button', () => {
  const feed = { top: 200, bottom: 800 }

  it('stands at the bottom while the selected words are clear of it', () => {
    expect(placeOf({ top: 300, bottom: 360 }, feed)).toBe('bottom')
  })

  it('goes to the top when the words are in the last lines on screen', () => {
    expect(placeOf({ top: 700, bottom: 780 }, feed)).toBe('top')
  })

  it('stays at the bottom when the words fill the screen from the top as well - nowhere is clear', () => {
    expect(placeOf({ top: 210, bottom: 790 }, feed)).toBe('bottom')
  })
})

import { describe, expect, it } from 'vitest'
import { THANKS_LINKS, THANKS_MENU, thanksUrl } from './Thanks'

describe('the thanks menu', () => {
  it('has an address behind every entry - an entry that opens nothing is a dead button', () => {
    for (const option of THANKS_MENU.options) {
      expect(thanksUrl(option.id)).toMatch(/^https:\/\//)
    }
  })

  it('lists an entry for every address - an address nothing opens is dead in the other direction', () => {
    expect(THANKS_MENU.options.map((option) => option.id).sort()).toEqual(Object.keys(THANKS_LINKS).sort())
  })

  it('opens nothing for an id from nowhere', () => {
    expect(thanksUrl('sponsor')).toBeUndefined()
  })
})

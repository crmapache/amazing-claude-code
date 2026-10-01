import { en } from '../i18n/en'
import { describe, expect, it } from 'vitest'
import { countsAsThanks, SHARE, shareText, THANKS_LINKS, thanksMenu, thanksUrl, TIP } from './Thanks'

const MENU = thanksMenu(en, false)

describe('the thanks menu', () => {
  it('has something behind every entry - an entry that does nothing is a dead button', () => {
    for (const option of MENU.options) {
      expect(thanksUrl(option.id) ?? (option.id === SHARE ? shareText(en) : undefined)).toBeTruthy()
    }
  })

  it('lists an entry for every address - an address nothing opens is dead in the other direction', () => {
    const opening = MENU.options.map((option) => option.id).filter((id) => id !== SHARE)
    expect(opening.sort()).toEqual(Object.keys(THANKS_LINKS).sort())
  })

  it('opens nothing for an id from nowhere', () => {
    expect(thanksUrl('sponsor')).toBeUndefined()
    // Including the one that copies: it is not an address, and asking for it as one must come back empty.
    expect(thanksUrl(SHARE)).toBeUndefined()
  })

  it('shares the plugin page rather than a corner of it, and says what it is', () => {
    expect(shareText(en)).toContain('https://plugins.jetbrains.com/plugin/33255-amazing-claude-code')
    expect(shareText(en)).not.toContain('/reviews')
    expect(shareText(en).length).toBeLessThan(200)
  })

  it('counts the free ways towards the achievement and never the tip', () => {
    // The ladder in Achievements.kt has one line per free way: a tip counted there would let a purchase
    // finish it, and a press on the entry is not even a payment.
    expect(MENU.options.map((option) => option.id).filter(countsAsThanks).sort()).toEqual(['github', 'rate', SHARE])
    expect(countsAsThanks(TIP)).toBe(false)
    expect(countsAsThanks('sponsor')).toBe(false)
  })

  it('puts the tip first and sends it to a Ko-fi page', () => {
    expect(MENU.options[0]?.id).toBe(TIP)
    expect(thanksUrl(TIP)).toMatch(/^https:\/\/ko-fi\.com\/[^/]+$/)
  })

  it('answers a press on the entry that copies, because nothing else will', () => {
    const before = thanksMenu(en, false).options.find((option) => option.id === SHARE)
    const after = thanksMenu(en, true).options.find((option) => option.id === SHARE)

    expect(after?.sub).not.toBe(before?.sub)
    expect(after?.sub).toMatch(/copied/i)
  })
})

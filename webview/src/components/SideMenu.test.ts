import { describe, expect, it } from 'vitest'
import { leadsBack } from './SideMenu'

describe('a step back between the screens of the menu', () => {
  it('is the way back from a screen to the list it was opened from', () => {
    expect(leadsBack('indicators', 'settings')).toBe(true)
    expect(leadsBack('remoteAbout', 'remote')).toBe(true)
  })

  it('reaches past a parent to any screen on the way to the root', () => {
    expect(leadsBack('voiceLanguage', 'voice')).toBe(true)
    expect(leadsBack('voiceLanguage', 'settings')).toBe(true)
    expect(leadsBack('newChatModel', 'settings')).toBe(true)
  })

  it('is not a step in - the screen below opens fresh, at its top', () => {
    expect(leadsBack('settings', 'indicators')).toBe(false)
    expect(leadsBack('menu', 'settings')).toBe(false)
  })

  it('is not a jump sideways to a screen of another branch', () => {
    expect(leadsBack('indicators', 'sounds')).toBe(false)
    expect(leadsBack('remoteAbout', 'settings')).toBe(false)
  })
})

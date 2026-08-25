import { describe, expect, it } from 'vitest'
import { atQueryInText, matchFiles } from './files'

describe('matchFiles', () => {
  const files = [
    'webview/src/components/Feed.tsx',
    'webview/src/components/Composer.tsx',
    'webview/src/feed/compact.ts',
    'src/main/kotlin/remote/RemoteAgent.kt',
  ]

  it('puts matches on the file name before matches anywhere else in the path', () => {
    expect(matchFiles(files, 'comp')).toEqual([
      'webview/src/components/Composer.tsx',
      'webview/src/feed/compact.ts',
      // Only its directory says "components" - it is a match, but the weaker kind.
      'webview/src/components/Feed.tsx',
    ])
  })

  it('ignores case, as a person typing a path does', () => {
    expect(matchFiles(files, 'REMOTEAGENT')).toEqual(['src/main/kotlin/remote/RemoteAgent.kt'])
  })

  it('offers the beginning of the list when nothing has been typed yet', () => {
    expect(matchFiles(files, '', 2)).toEqual(files.slice(0, 2))
  })
})

/**
 * The "@" hint reads plain text on a phone and the DOM in the panel (see atQueryAt in composerDom).
 * Two readers, one rule about what counts as a mention - so the rule is tested where it is written.
 */
describe('atQueryInText', () => {
  it('finds a mention at the very start of the field', () => {
    expect(atQueryInText('@Comp', 5)).toEqual({ query: 'Comp', start: 0 })
  })

  it('finds one mid-sentence, as in a terminal', () => {
    const text = 'look at @Comp'
    expect(atQueryInText(text, text.length)).toEqual({ query: 'Comp', start: 8 })
  })

  it('opens on a bare "@" - the whole list is the useful answer to it', () => {
    expect(atQueryInText('@', 1)).toEqual({ query: '', start: 0 })
  })

  it('reads from the caret rather than from the end of the line', () => {
    // The caret sits after "Comp"; the rest was typed before and is none of the mention's business.
    expect(atQueryInText('@Comp and the rest', 5)).toEqual({ query: 'Comp', start: 0 })
  })

  it('is not a mention when the "@" is glued to a word - that is an address, not a file', () => {
    expect(atQueryInText('max@example', 11)).toBeNull()
  })

  it('ends at a space: a finished mention is no longer being typed', () => {
    expect(atQueryInText('@Composer.tsx and', 17)).toBeNull()
  })
})

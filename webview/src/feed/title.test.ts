import { describe, expect, it } from 'vitest'
import { deriveSessionTitle } from './title'

describe('deriveSessionTitle', () => {
  it('glues a short first line to its continuation', () => {
    expect(deriveSessionTitle('Let us\nmake a pretty dialog with buttons')).toBe(
      'Let us make a pretty dialog with buttons',
    )
  })

  it('cuts an inline image tag out of the middle of a phrase', () => {
    expect(deriveSessionTitle('look [Image #1] here, what is wrong')).toBe('look here, what is wrong')
  })

  it('skips the lines with a quote and a file mention', () => {
    expect(deriveSessionTitle('> old text\n@src/App.tsx\nfix this here')).toBe('fix this here')
  })

  it('takes the last original line if nothing is left after the clean-up', () => {
    expect(deriveSessionTitle('@src/App.tsx\n[Image #1]')).toBe('[Image #1]')
  })

  it('does not let bash-mode command output become a tab title', () => {
    const text =
      '<bash-input>git pull</bash-input>\n<bash-stdout>Already up to date.\nvia origin/main</bash-stdout>\n\nLet us move on to this task'

    expect(deriveSessionTitle(text)).toBe('Let us move on to this task')
  })

  it('clips long text at a word boundary with an ellipsis', () => {
    const text = 'please work through this very long and detailed statement of the task in full'
    const title = deriveSessionTitle(text, 40)

    expect(title.length).toBeLessThanOrEqual(41)
    expect(title.endsWith('…')).toBe(true)
    expect(text.startsWith(title.slice(0, -1))).toBe(true)
  })

  it('leaves short text alone', () => {
    expect(deriveSessionTitle('go on')).toBe('go on')
  })
})

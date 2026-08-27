import { describe, expect, it } from 'vitest'
import {
  FEEDBACK_KINDS,
  MAX_ATTACHMENTS,
  MAX_MESSAGE_CHARS,
  MAX_TOTAL_BYTES,
  emptyFeedback,
  feedbackLogs,
  feedbackProblem,
  humanBytes,
  shortName,
  shortTitle,
} from './Feedback'
import type { FeedbackAttachment } from '../protocol'

const draftWith = (change: Partial<ReturnType<typeof emptyFeedback>>) => ({ ...emptyFeedback(), ...change })

const files = (count: number, bytes: number): FeedbackAttachment[] =>
  Array.from({ length: count }, (_, index) => ({ id: `a${index}`, name: `f${index}.txt`, bytes }))

describe('what the send button obeys', () => {
  it('will not send an empty message - there would be nothing to read', () => {
    expect(feedbackProblem(emptyFeedback())).toBeTruthy()
    expect(feedbackProblem(draftWith({ text: '   \n  ' }))).toBeTruthy()
  })

  it('sends a message with words in it, with or without an address', () => {
    expect(feedbackProblem(draftWith({ text: 'the panel hangs on reopening a tab' }))).toBeNull()
  })

  it('refuses a message longer than Telegram would carry', () => {
    expect(feedbackProblem(draftWith({ text: 'x'.repeat(MAX_MESSAGE_CHARS + 1) }))).toBeTruthy()
  })

  it('refuses more files than the IDE would send', () => {
    const draft = draftWith({ text: 'here you go', attachments: files(MAX_ATTACHMENTS + 1, 10) })
    expect(feedbackProblem(draft)).toBeTruthy()
  })

  it('refuses files that add up past the total, even when each one fits', () => {
    const draft = draftWith({ text: 'here you go', attachments: files(3, MAX_TOTAL_BYTES / 2) })
    expect(feedbackProblem(draft)).toBeTruthy()
  })
})

describe('the words on the screen', () => {
  it('asks for something different for each kind - a bug report and a hello are not the same request', () => {
    const placeholders = new Set(FEEDBACK_KINDS.map((kind) => kind.placeholder))
    expect(placeholders.size).toBe(FEEDBACK_KINDS.length)
  })

  it('starts on the bug, because that is what a person opens this for', () => {
    expect(emptyFeedback().kind).toBe('bug')
  })

  it('starts with the logs on, because a bug without them is usually unanswerable', () => {
    expect(emptyFeedback().logs).toBe(true)
  })
})

describe('the report goes with a bug and nothing else', () => {
  it('sends it with a bug when the switch is on', () => {
    expect(feedbackLogs(draftWith({ kind: 'bug', logs: true }))).toBe(true)
  })

  it('leaves it behind on an idea and on a hello, switch or no switch', () => {
    expect(feedbackLogs(draftWith({ kind: 'idea', logs: true }))).toBe(false)
    expect(feedbackLogs(draftWith({ kind: 'hello', logs: true }))).toBe(false)
  })

  it('remembers the choice made on the bug instead of forcing it back on', () => {
    const off = draftWith({ kind: 'bug', logs: false })
    expect(feedbackLogs({ ...off, kind: 'idea' })).toBe(false)
    expect(feedbackLogs(off)).toBe(false)
  })
})

describe('sizes as a person reads them', () => {
  it('never says 0.0 of anything', () => {
    expect(humanBytes(0)).toBe('0 B')
    expect(humanBytes(900)).toBe('900 B')
    expect(humanBytes(2048)).toBe('2 KB')
  })

  it('does not put a decimal on a round number of megabytes', () => {
    expect(humanBytes(10 * 1024 * 1024)).toBe('10 MB')
    expect(humanBytes(20 * 1024 * 1024)).toBe('20 MB')
  })

  it('keeps a decimal where it says something', () => {
    expect(humanBytes(1.5 * 1024 * 1024)).toBe('1.5 MB')
    expect(humanBytes(4.2 * 1024 * 1024)).toBe('4.2 MB')
  })
})

describe('a file name that has to fit', () => {
  it('leaves a short name alone', () => {
    expect(shortName('screenshot.png')).toBe('screenshot.png')
  })

  it('cuts the middle and keeps the extension - the end is what one is checking', () => {
    const cut = shortName('a-very-long-recording-of-the-whole-thing.mov')

    expect(cut.length).toBeLessThanOrEqual(30)
    expect(cut).toContain('…')
    expect(cut.endsWith('.mov')).toBe(true)
    expect(cut.startsWith('a-very')).toBe(true)
  })
})

describe('naming the tab the report is about', () => {
  it('leaves a short name alone', () => {
    expect(shortTitle('Fix the composer')).toBe('Fix the composer')
  })

  it('cuts the end, because a tab is recognised by how it begins', () => {
    const cut = shortTitle('Why does the panel hang when a tab is reopened from history')

    expect(cut.length).toBeLessThanOrEqual(34)
    expect(cut.startsWith('Why does the panel')).toBe(true)
    expect(cut.endsWith('…')).toBe(true)
  })

  it('does not leave a space hanging before the ellipsis', () => {
    expect(shortTitle('aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa bbbb')).toBe('aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa…')
  })
})

describe('an address the person cleared on purpose', () => {
  it('starts out as nobody having touched the field', () => {
    expect(emptyFeedback().emailTouched).toBe(false)
  })

  it('is what the screen keeps, rather than the remembered one', () => {
    // The state the IDE sends carries the remembered address with every update. What decides is the flag,
    // not whether the field happens to be empty - an empty field is a decision too.
    const cleared = { ...emptyFeedback(), email: '', emailTouched: true }
    const merged = { ...cleared, email: cleared.emailTouched ? cleared.email : 'you@example.com' }

    expect(merged.email).toBe('')
  })

  it('is filled in from what was remembered while the field is untouched', () => {
    const fresh = emptyFeedback()
    const merged = { ...fresh, email: fresh.emailTouched ? fresh.email : 'you@example.com' }

    expect(merged.email).toBe('you@example.com')
  })
})

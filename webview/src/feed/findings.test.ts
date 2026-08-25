import { describe, expect, it } from 'vitest'
import { findingPlace, findingsSummary, readReview } from './findings'

/** The shape `/code-review` answers with in streaming mode: a line of preamble and a fenced json block. */
const report = (findings: unknown): string =>
  `I've completed the review. Here are the findings.\n\n\`\`\`json\n${JSON.stringify(findings, null, 2)}\n\`\`\``

const finding = {
  file: 'lib/sync/metrics.ts',
  line: 66,
  summary: '`metrics.phone_calls` is not selectable on the `customer` report.',
  failure_scenario: 'The account-level request is rejected by Google and every container lands unread.',
}

describe('readReview', () => {
  it('takes the findings out of the block and leaves the preamble as it was', () => {
    const review = readReview(report([finding]))

    expect(review?.intro).toBe("I've completed the review. Here are the findings.")
    expect(review?.findings).toEqual([
      {
        file: 'lib/sync/metrics.ts',
        line: 66,
        summary: '`metrics.phone_calls` is not selectable on the `customer` report.',
        failureScenario: 'The account-level request is rejected by Google and every container lands unread.',
      },
    ])
  })

  it('keeps the optional fields the review sent', () => {
    const review = readReview(
      report([{ ...finding, category: 'correctness', verdict: 'PLAUSIBLE', outcome: 'fixed', short_summary: 'not selectable' }]),
    )

    expect(review?.findings[0]).toMatchObject({
      category: 'correctness',
      verdict: 'PLAUSIBLE',
      outcome: 'fixed',
      shortSummary: 'not selectable',
    })
  })

  // A value outside the tool's own set says nothing to the card: it would end up drawn as a tag nobody
  // can read, and the finding itself is perfectly readable without it.
  it('drops a verdict and an outcome it does not know', () => {
    const review = readReview(report([{ ...finding, verdict: 'MAYBE', outcome: 'pondered' }]))

    expect(review?.findings[0]?.verdict).toBeUndefined()
    expect(review?.findings[0]?.outcome).toBeUndefined()
  })

  // The short label exists to put something shorter than the summary in the row's head. The same string
  // twice is not that, and it would be shown twice - once in the head and once in the body.
  it('ignores a short label equal to the summary', () => {
    const review = readReview(report([{ ...finding, short_summary: finding.summary }]))

    expect(review?.findings[0]?.shortSummary).toBeUndefined()
  })

  // A finding without its evidence is not a finding by the tool's own contract - and a list of objects
  // with a file and a sentence in them is far too ordinary a thing to claim as a review.
  it('is not a review when a finding is missing its required fields', () => {
    expect(readReview(report([{ file: 'a.ts', summary: 'looks wrong' }]))).toBeNull()
    expect(readReview(report([finding, { file: 'b.ts' }]))).toBeNull()
  })

  it('is not a review when the block holds anything else', () => {
    expect(readReview(report([]))).toBeNull()
    expect(readReview('```json\n{"file": "a.ts"}\n```')).toBeNull()
    expect(readReview('```json\n[1, 2, 3]\n```')).toBeNull()
    expect(readReview('```json\n[{"file":\n```')).toBeNull()
    expect(readReview('An ordinary answer about a `/code-review` run, with no block at all.')).toBeNull()
  })

  // The block is not always tagged `json`, and there may be other blocks around it - a snippet of the
  // code the review is about, for instance.
  it('finds the findings among other blocks', () => {
    const text = `Here is the line:\n\n\`\`\`ts\nconst a = 1\n\`\`\`\n\n\`\`\`\n${JSON.stringify([finding])}\n\`\`\``
    const review = readReview(text)

    expect(review?.findings).toHaveLength(1)
    expect(review?.intro).toContain('const a = 1')
  })
})

describe('findingPlace', () => {
  it('is the file name and the line', () => {
    expect(findingPlace({ file: 'lib/sync/metrics.ts', line: 66, summary: 'x', failureScenario: 'y' })).toBe(
      'metrics.ts:66',
    )
  })

  it('is the file name alone when there is no line', () => {
    expect(findingPlace({ file: 'lib/sync/metrics.ts', summary: 'x', failureScenario: 'y' })).toBe('metrics.ts')
  })
})

describe('findingsSummary', () => {
  it('counts in words', () => {
    const one = { file: 'a.ts', summary: 'x', failureScenario: 'y' }

    expect(findingsSummary([one])).toBe('1 finding')
    expect(findingsSummary([one, one])).toBe('2 findings')
  })
})

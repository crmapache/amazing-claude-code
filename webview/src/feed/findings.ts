import type { Finding } from './types'

/**
 * The findings of a code review, out of the answer they arrive inside.
 *
 * `/code-review` is not a message to the model but a command the CLI runs itself, and in streaming mode
 * its whole outcome comes back as one ordinary answer: a line of preamble and a fenced `json` block
 * holding the findings. In a terminal that same outcome is caught by a screen of its own and drawn as a
 * list; here there was nobody to catch it, so the panel showed what it was given - a wall of raw JSON in
 * the middle of the conversation, in which neither the count of the findings nor a single file was
 * readable without scrolling through the whole thing.
 *
 * Recognised by the shape of the data rather than by the preamble around it: the wording of that line is
 * the CLI's to change, while the fields are the review tool's contract (see ReportFindings). Anything
 * that does not match it stays an ordinary answer - a wrong guess here would swallow a piece of the
 * agent's text into a card it does not belong in.
 */
export interface ReviewReport {
  /** What was said around the block - the preamble stays in the feed as the answer it was. */
  intro: string
  findings: Finding[]
}

/** A fenced block, `json` or unmarked: the language tag is the CLI's habit rather than a promise. */
const FENCED = /```[a-zA-Z]*\s*\n([\s\S]*?)```/g

const str = (value: unknown): string => (typeof value === 'string' ? value.trim() : '')

const asRecord = (value: unknown): Record<string, unknown> | null =>
  typeof value === 'object' && value !== null && !Array.isArray(value) ? (value as Record<string, unknown>) : null

const VERDICTS = new Set(['CONFIRMED', 'PLAUSIBLE'])
const OUTCOMES = new Set(['fixed', 'skipped', 'no_change_needed'])

/**
 * All three fields are required by the review tool itself, and all three are demanded here. A looser
 * check ("a file and a summary") would catch any list of objects the agent happened to print - a plan
 * for a refactor, a table of files - and hide it inside a card of findings.
 */
const readFinding = (value: unknown): Finding | null => {
  const data = asRecord(value)
  if (!data) return null

  const file = str(data.file)
  const summary = str(data.summary)
  const failureScenario = str(data.failure_scenario)
  if (!file || !summary || !failureScenario) return null

  const line = typeof data.line === 'number' && Number.isFinite(data.line) ? data.line : undefined
  const verdict = str(data.verdict)
  const outcome = str(data.outcome)
  const shortSummary = str(data.short_summary)

  return {
    file,
    ...(line === undefined ? {} : { line }),
    summary,
    failureScenario,
    ...(shortSummary && shortSummary !== summary ? { shortSummary } : {}),
    ...(str(data.category) ? { category: str(data.category) } : {}),
    ...(VERDICTS.has(verdict) ? { verdict: verdict as Finding['verdict'] } : {}),
    ...(OUTCOMES.has(outcome) ? { outcome: outcome as Finding['outcome'] } : {}),
  }
}

/**
 * The report inside an answer, or null when this answer is not one.
 *
 * An empty list is deliberately not a report: `[]` in a fenced block is too ordinary a thing to claim as
 * a review, and a review that found nothing says so in its own words anyway - which is exactly what the
 * preamble is for.
 */
export const readReview = (text: string): ReviewReport | null => {
  for (const match of text.matchAll(FENCED)) {
    const body = match[1]
    if (!body || !body.trimStart().startsWith('[')) continue

    let parsed: unknown
    try {
      parsed = JSON.parse(body)
    } catch {
      continue
    }

    if (!Array.isArray(parsed) || parsed.length === 0) continue

    const findings = parsed.map(readFinding)
    if (findings.some((finding) => finding === null)) continue

    return {
      intro: text.replace(match[0], '').trim(),
      findings: findings as Finding[],
    }
  }

  return null
}

/** Where the finding is, as one word for the head of its row: the file's name and the line in it. */
export const findingPlace = (finding: Finding): string => {
  const name = finding.file.split('/').pop() || finding.file
  return finding.line === undefined ? name : `${name}:${finding.line}`
}

/** What such a card is captioned by: the count is the first thing one wants out of a review. */
export const findingsSummary = (findings: Finding[]): string =>
  `${findings.length} ${findings.length === 1 ? 'finding' : 'findings'}`

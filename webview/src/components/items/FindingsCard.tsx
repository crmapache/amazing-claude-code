import { findingPlace, findingsSummary } from '../../feed/findings'
import type { Finding, FindingsItem } from '../../feed/types'
import s from '../feed.module.css'
import { Caret } from './Caret'
import { Inline } from './Markdown'
import { useT } from '../../i18n'
import type { Dict } from '../../i18n/en'

interface FindingsCardProps {
  item: FindingsItem
  isOpen: (id: string) => boolean
  onToggle: (id: string) => void
  onOpenLink: (url: string) => void
}

/**
 * A code review's findings.
 *
 * They arrive as raw JSON inside an ordinary answer (see readReview), and as JSON they were unreadable in
 * the feed: a dozen findings became a screen and a half of braces in which neither the count nor a single
 * file could be seen without scrolling the whole block. What one wants from a review is the opposite
 * order - how many, where, and only then why - so the card answers those three in that order: the count in
 * the head, the place and the claim on every row, the evidence behind a click.
 *
 * Closed rather than open by default, all of them: the evidence is the longest part of a finding, and a
 * review that found ten would otherwise bury the rest of the conversation under itself. The order is the
 * review's own - it ranks them most severe first, and re-sorting here would throw that away.
 */
export const FindingsCard = ({ item, isOpen, onToggle, onOpenLink }: FindingsCardProps) => {
  const t = useT()

  return (
  <div className={s.findings}>
    <div className={s.findingsHead}>
      <span className={s.findingsLabel}>{t.feed.findings.label}</span>
      <span className={s.findingsCount}>{findingsSummary(item.findings)}</span>
      <div className={s.spacer} />
    </div>

    <div className={s.findingsBody}>
      {item.findings.map((finding, index) => (
        <FindingRow
          key={`${item.id}-${index}`}
          finding={finding}
          open={isOpen(`${item.id}-${index}`)}
          onToggle={() => onToggle(`${item.id}-${index}`)}
          onOpenLink={onOpenLink}
        />
      ))}
    </div>
  </div>
  )
}

/** How a finding ended, when the review was re-sent after the fixes - the one thing worth a colour here. */
const outcomes = (t: Dict): Record<NonNullable<Finding['outcome']>, { label: string; className: string }> => ({
  fixed: { label: t.feed.findings.fixed, className: s.findingFixed ?? '' },
  skipped: { label: t.feed.findings.skipped, className: s.findingSkipped ?? '' },
  no_change_needed: { label: t.feed.findings.noChange, className: s.findingSkipped ?? '' },
})

const FindingRow = ({
  finding,
  open,
  onToggle,
  onOpenLink,
}: {
  finding: Finding
  open: boolean
  onToggle: () => void
  onOpenLink: (url: string) => void
}) => {
  const t = useT()
  const outcome = finding.outcome ? outcomes(t)[finding.outcome] : undefined
  /**
   * The head carries the short label when the review sent one, and the summary itself otherwise. Both are
   * the same sentence at different lengths, so showing them one under the other would read as a repeat -
   * the full one goes into the body only when it is genuinely a different string (see readReview).
   */
  const head = finding.shortSummary ?? finding.summary

  return (
    <div className={s.finding}>
      <button type="button" className={s.findingHead} onClick={onToggle}>
        <Caret open={open} />
        <span className={s.findingPlace}>{findingPlace(finding)}</span>
        {finding.category ? <span className={s.findingTag}>{finding.category}</span> : null}
        {/* PLAUSIBLE is the one verdict worth saying out loud: it means the check could not confirm the
            finding, and reading it as settled fact is exactly the mistake to avoid. A confirmed one adds
            nothing to a row that is already a confirmed finding. */}
        {finding.verdict === 'PLAUSIBLE' ? <span className={s.findingMaybe}>{t.feed.findings.unconfirmed}</span> : null}
        {outcome ? <span className={`${s.findingTag} ${outcome.className}`}>{outcome.label}</span> : null}
        <div className={s.spacer} />
      </button>

      <div className={s.findingSummary}>
        <Inline text={head} onOpenLink={onOpenLink} />
      </div>

      {open ? (
        <div className={s.findingBody}>
          {/* The whole path, not just the file's name: the row's head shortens it to fit beside the tags,
              and two files of the same name in different folders are told apart only here. */}
          <div className={s.findingFile}>
            {finding.line === undefined ? finding.file : `${finding.file}:${finding.line}`}
          </div>

          {finding.shortSummary ? (
            <p className={s.findingText}>
              <Inline text={finding.summary} onOpenLink={onOpenLink} />
            </p>
          ) : null}

          <p className={s.findingText}>
            <Inline text={finding.failureScenario} onOpenLink={onOpenLink} />
          </p>
        </div>
      ) : null}
    </div>
  )
}

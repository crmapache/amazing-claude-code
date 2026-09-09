import { useMemo } from 'react'
import type { AgentEvent, ScenarioRunStep } from '../../protocol'
import { Feed } from '../../components/Feed'
import { logItems, stepFacts } from '../../components/scenarios/StepLog'
import { useCardState } from '../../hooks/useCardState'
import { useT } from '../../i18n'
import { Back } from './Back'
import m from '../mobile.module.css'

/**
 * What one step actually said, on a screen of its own.
 *
 * The last thing the phone could not do. A step of a scenario is an ordinary Claude Code conversation, so
 * the honest way to show it is the way a conversation is shown - the same feed, built by the same
 * reducer, drawn by the same component the thread on this phone draws. What comes over the wire is the
 * END of it, cut to a frame (see RemoteFeed.trimmedLog): a card that walked a repository leaves
 * megabytes, and how it finished is the half anybody reads at three in the morning.
 *
 * The verdict stands above the conversation rather than at the foot of it. It is the main thread's
 * judgement rather than anything the card said, and it is the answer somebody opened this for.
 */
export const ScenarioStep = ({
  step,
  log,
  onOpenLink,
  onBack,
}: {
  /** The step out of the run's own record - null when the run itself has not arrived yet. */
  step: ScenarioRunStep | null
  /** null while the answer is on its way; the events once it lands. */
  log: { found: boolean; truncated: boolean; events: AgentEvent[] } | null
  onOpenLink: (url: string) => void
  onBack: () => void
}) => {
  const t = useT()
  const cards = useCardState()
  const items = useMemo(() => logItems(log?.events ?? null), [log])

  const facts = step ? stepFacts(step.startedAt, step.finishedAt, step.tokens, step.cost) : ''

  return (
    <>
      <header className={m.threadHeader}>
        <div className={m.threadHeadRow}>
          <Back onClick={onBack} />
          <span className={m.threadTitles}>
            <span className={m.threadTitle}>{step?.title ?? t.scenarios.log.step}</span>
            <span className={m.threadWhere}>{facts}</span>
          </span>
        </div>
      </header>

      <div className={m.pageList}>
        {step?.verdictReason || step?.error ? (
          <div className={`${m.card} ${m.stepVerdictCard}`}>
            <span className={m.stepVerdictLabel}>{t.mobile.scenarios.step.verdict}</span>
            <span className={step.verdict === 'undone' || step.error ? m.stepVerdictBad : m.stepVerdict}>
              {step.verdictReason || step.error}
            </span>
          </div>
        ) : null}

        {/*
          What the step was told stands here only when the log below does not begin with it: a step is an
          ordinary conversation, and what it was told is its first message. A tail handed over without its
          head is the exception, and there this is the only copy of it left.
        */}
        {log?.truncated && step?.prompt ? (
          <>
            <div className={`${m.card} ${m.stepPrompt}`}>{step.prompt}</div>
            <p className={m.formNote}>{t.scenarios.log.truncated}</p>
          </>
        ) : null}

        {log === null ? (
          <p className={m.empty}>{t.scenarios.log.loading}</p>
        ) : !log.found || items.length === 0 ? (
          <p className={m.empty}>{t.scenarios.log.missing}</p>
        ) : (
          /*
            Every "something is happening" prop is empty, and that is the whole difference between this
            feed and a live one: the status line speaks about work under way, and a word there under a
            conversation that ended last night reads as one still going.
          */
          <Feed
            items={items}
            streamingText=""
            streamingId=""
            streamingThinking=""
            streaming={false}
            streamStatus=""
            statusStalled={false}
            cards={cards}
            onPlanDecision={() => undefined}
            onDismissError={() => undefined}
            onOpenLink={onOpenLink}
          />
        )}
      </div>
    </>
  )
}

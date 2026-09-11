import type { ScenarioRunStep } from '../../protocol'
import { Feed } from '../../components/Feed'
import { stepFacts } from '../../components/scenarios/StepLog'
import type { FeedItem } from '../../feed/types'
import { useCardState } from '../../hooks/useCardState'
import { useT } from '../../i18n'
import { Back } from './Back'
import m from '../mobile.module.css'

/**
 * What one step actually said, on a screen of its own.
 *
 * The last thing the phone could not do. A step of a scenario is an ordinary Claude Code conversation, so
 * the honest way to show it is the way a conversation is shown - the same feed, built by the same
 * reducer, drawn by the same component the thread on this phone draws. Including how it is READ: the end
 * of the log arrives first and the way back up is fetched a page at a time, each page sized to what a
 * relay frame carries (see ScenarioDesk.sendLog, and useEarlierPages, which serves both screens).
 *
 * The verdict stands above the conversation rather than at the foot of it, and it STAYS there while the
 * log scrolls under it. It is the main thread's judgement rather than anything the card said, it is the
 * answer somebody opened this for, and it is short by construction - the wire cuts it at a couple of
 * hundred characters on the way here (see RemoteFeed.stepBody).
 */
export const ScenarioStep = ({
  step,
  log,
  onLoadEarlier,
  onOpenLink,
  onBack,
}: {
  /** The step out of the run's own record - null when the run itself has not arrived yet. */
  step: ScenarioRunStep | null
  /** null before the screen was even opened; `loaded` is what says the answer has arrived. */
  log: { found: boolean; loaded: boolean; earlierPages: number; items: FeedItem[] } | null
  /** Ask for the page above what is on screen; absent while there is nothing left to ask for. */
  onLoadEarlier?: () => void
  onOpenLink: (url: string) => void
  onBack: () => void
}) => {
  const t = useT()
  const cards = useCardState()
  const items = log?.items ?? []

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

      <div className={m.stepBody}>
        {step?.verdictReason || step?.error ? (
          <div className={m.stepVerdictBand}>
            <div className={`${m.card} ${m.stepVerdictCard}`}>
              <span className={m.stepVerdictLabel}>{t.mobile.scenarios.step.verdict}</span>
              <span className={step.verdict === 'undone' || step.error ? m.stepVerdictBad : m.stepVerdict}>
                {step.verdictReason || step.error}
              </span>
            </div>
          </div>
        ) : null}

        {/*
          What the step was told is not repeated above the feed, because the feed has it: a step is an
          ordinary conversation, and what it was told is its first message. There used to be a band here
          for the one case where that was untrue - a tail handed over without its head - and it is gone
          with the reason for it: the beginning is reachable now, a page at a time.
        */}
        {!log?.loaded ? (
          <p className={m.empty}>{t.scenarios.log.loading}</p>
        ) : !log.found || items.length === 0 ? (
          <p className={m.empty}>{t.scenarios.log.missing}</p>
        ) : (
          /*
            Every "something is happening" prop is empty, and that is the whole difference between this
            feed and a live one: the status line speaks about work under way, and a word there under a
            conversation that ended last night reads as one still going.

            userLabel is the other one: nothing on this screen can be typed into, so what stands on the
            "you" side was said by the run's main thread rather than by whoever is reading it.
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
            userLabel={t.scenarios.log.main}
            onLoadEarlier={onLoadEarlier}
            earlierPages={log.earlierPages}
            onPlanDecision={() => undefined}
            onDismissError={() => undefined}
            onOpenLink={onOpenLink}
          />
        )}
      </div>
    </>
  )
}

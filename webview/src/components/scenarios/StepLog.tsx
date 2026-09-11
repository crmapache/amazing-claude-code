import { formatTokens } from '../../feed/build'
import { formatDuration } from '../../feed/tools'
import type { FeedItem } from '../../feed/types'
import { useCardState } from '../../hooks/useCardState'
import { useT } from '../../i18n'
import { Feed } from '../Feed'
import s from './scenarios.module.css'

/**
 * One step's whole log, as a conversation rather than as a summary.
 *
 * A step of a scenario is an ordinary Claude Code conversation, so the honest way to show what it did is
 * the way a conversation is shown: the same feed, the same cards, the same folds. Nothing here is a
 * second rendering of the same thing - the events are put through the very reducer a live tab uses, and
 * what comes out is drawn by the very component a live tab draws. That extends to how it is READ: the
 * end of the log arrives first and the rest is fetched by the mark over the feed, exactly as in a chat
 * opened from the history (see historyPage in feed/build.ts, and useEarlierPages, which serves both).
 *
 * The whole tab rather than a window over the timeline. A step that read half a repository is pages
 * long, and a window inset from the edges gives that text less room than the panel has while covering
 * the one thing it covers; the way back is the same chevron the editor has, in the same corner.
 */
export interface StepLogProps {
  /** What kind of log this is - a step of the round, or the head that ran it. */
  kind: 'step' | 'head'
  title: string
  /** The line on the right: how long it took, how many tokens went through, what it cost. */
  facts: string
  /**
   * The feed itself, built where the pages are kept (see the scenarioLog case in App.tsx).
   *
   * Rows rather than events, because a log is no longer one snapshot: the end arrives first and the older
   * pages go in above it, and putting a page in is the reducer's own business (`historyPage` in
   * feed/build.ts) rather than something to redo here on every draw.
   */
  items: FeedItem[]
  found: boolean
  /**
   * Whether the answer has arrived at all.
   *
   * Apart from `found` on purpose: an empty feed means "still reading" before the answer and "there is no
   * record of this step" after it, and without this the two are the same screen.
   */
  loaded: boolean
  /** How many pages of the way up have gone in - the feed holds the reading position by it (see Feed). */
  earlierPages: number
  /** Ask for the page above what is on screen; absent while there is nothing left to ask for. */
  onLoadEarlier?: () => void
  /** A link in the agent's answer, opened in the system browser - the feed asks for it by contract. */
  onOpenLink: (url: string) => void
  onBack: () => void
}

export const StepLog = ({
  kind,
  title,
  facts,
  items,
  found,
  loaded,
  earlierPages,
  onLoadEarlier,
  onOpenLink,
  onBack,
}: StepLogProps) => {
  const t = useT()
  const cards = useCardState()

  return (
    <div className={s.root}>
      <div className={s.head}>
        <button type="button" className={s.headBack} aria-label={t.common.back} onClick={onBack}>
          ‹
        </button>
        <div className={s.headTitles}>
          <span className={s.title}>{kind === 'head' ? t.scenarios.log.head : t.scenarios.log.step}</span>
          <span className={s.hint}>{title}</span>
        </div>
        <span className={s.headSpace} />
        {facts ? <span className={s.logFacts}>{facts}</span> : null}
      </div>

      <div className={s.logBody}>
        {/*
          What the step was told is not repeated above the feed, because the feed has it.

          A step of a scenario is an ordinary conversation, and what it was told is its first message -
          so the conversation below shows it already, in its own card, laid out and with the buttons that
          card has. There used to be a band here for the one case where that was untrue: a long log was
          handed over by its tail and its head was gone for good, so the prompt was printed above a note
          saying the beginning is not shown. Both are gone with the reason for them - the beginning is
          reachable now, a page at a time, exactly as in a conversation opened from the history.
        */}
        {!loaded ? (
          <div className={s.logEmpty}>{t.scenarios.log.loading}</div>
        ) : !found || items.length === 0 ? (
          <div className={s.logEmpty}>{t.scenarios.log.missing}</div>
        ) : (
          /*
            Every "something is happening" prop is empty, and that is the whole difference between this
            feed and a live one: the status line speaks about work under way, and a word there under a
            conversation that ended last night reads as one still going.

            userLabel is the other one. There is no field under this feed, so nothing in it was ever
            typed by a person: what stands on the "you" side was said by the run's main thread, and the
            label says so rather than claiming the reader said it (see UserCard.userLabel).
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
            earlierPages={earlierPages}
            onPlanDecision={() => undefined}
            onDismissError={() => undefined}
            onOpenLink={onOpenLink}
          />
        )}
      </div>
    </div>
  )
}

/**
 * The line beside a step's name: how long it worked, how many tokens went through it, what it cost.
 *
 * In that order, and it is the order the panel already reads these in (see the facts under a workflow's
 * agent): time first because it is what somebody is looking for, then the size of the work, then the
 * money it came to.
 */
export const stepFacts = (startedAt: number, finishedAt: number, tokens: number, cost: number): string =>
  [
    startedAt > 0 && finishedAt > 0 ? formatDuration(finishedAt - startedAt) : '',
    tokens > 0 ? formatTokens(tokens) : '',
    cost > 0 ? `$${cost.toFixed(2)}` : '',
  ]
    .filter(Boolean)
    .join(' · ')

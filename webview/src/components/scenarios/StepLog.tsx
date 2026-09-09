import { useMemo } from 'react'
import type { AgentEvent } from '../../protocol'
import { formatTokens, initialPanelState, reducePanel } from '../../feed/build'
import { formatDuration } from '../../feed/tools'
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
 * what comes out is drawn by the very component a live tab draws.
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
   * What the step's session was actually told, with the inputs and the slots written in.
   *
   * Drawn only over a log handed over by its tail: in a whole one it is the first card of the feed, and
   * printing it twice is a screenful spent saying the same thing.
   */
  prompt: string
  events: AgentEvent[] | null
  found: boolean
  /** Whether the beginning is missing: a long conversation is handed over by its tail. */
  truncated: boolean
  /** A link in the agent's answer, opened in the system browser - the feed asks for it by contract. */
  onOpenLink: (url: string) => void
  onBack: () => void
}

/**
 * The events of a step's own conversation, put through the reducer a live tab uses.
 *
 * Exported because the phone draws the same log on a screen of its own: one way of turning a transcript
 * into a feed, so the two screens cannot come to disagree about what a step said.
 *
 * Marked as a replay, which is what it is: everything in it has already happened, and the panel treats
 * the two differently on purpose - a replayed turn sets no spinner going and does not count towards how
 * full a context window is (see feed/build.ts).
 *
 * Nothing else is touched on the way out. The "you" side of this conversation is the engine's rather than
 * a person's, and it used to be drawn as markdown for that reason - headings, lists and bold lines - which
 * made the log read as a different, larger text than the same conversation opened as a chat. It is the
 * same feed, and it is drawn the same way: as typed.
 */
export const logItems = (events: AgentEvent[] | null) =>
  (events ?? [])
    .reduce((panel, event) => reducePanel(panel, { kind: 'agent', event, replay: true }), initialPanelState)
    .items

export const StepLog = ({
  kind,
  title,
  facts,
  prompt,
  events,
  found,
  truncated,
  onOpenLink,
  onBack,
}: StepLogProps) => {
  const t = useT()
  const cards = useCardState()

  const items = useMemo(() => logItems(events), [events])

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
          What the step was told stands here only when the log below does not begin with it.

          A step of a scenario is an ordinary conversation, and what it was told is its first message -
          so the feed under this shows it already, in its own card, laid out and with the buttons that
          card has. A band above the conversation repeating the same paragraphs word for word took a
          third of the screen off the one thing this tab is opened for: what the step did with them.

          A tail handed over without its head is the exception, and there this is the only copy left of
          it (see truncated) - said above the note that explains why, because the note is about a text
          that is no longer there and this is that text.
        */}
        {truncated ? (
          <>
            {prompt ? <div className={s.logPrompt}>{prompt}</div> : null}
            <div className={s.logNote}>{t.scenarios.log.truncated}</div>
          </>
        ) : null}

        {events === null ? (
          <div className={s.logEmpty}>{t.scenarios.log.loading}</div>
        ) : !found || items.length === 0 ? (
          <div className={s.logEmpty}>{t.scenarios.log.missing}</div>
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

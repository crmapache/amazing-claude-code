import { useState } from 'react'
import { modeShortLabel } from '../../catalog'
import type { CardState } from '../../hooks/useCardState'
import type { PanelState } from '../../feed/panelState'
import { awaiting } from '../../feed/streamStatus'
import type { AskItem, AskQuestion, FeedItem, PermItem, PlanItem, TextItem } from '../../feed/types'
import { useT } from '../../i18n'
import { Back } from './Back'
import m from '../mobile.module.css'

interface DecisionProps {
  feed: PanelState
  /** Which plans have been decided and which questions answered - kept by the application, see mobile/App. */
  cards: CardState
  title: string
  project: string
  onDecide: (id: string, decision: 'once' | 'deny') => void
  onPlan: (id: string, decision: 'approve' | 'keepPlanning') => void
  onAsk: (id: string, answers: Record<string, string>, text: string) => void
  onOpenThread: () => void
  onBack: () => void
}

/**
 * The screen the whole feature exists for: unblocking an agent with two taps from a sofa.
 *
 * What it shows and in what order is the design. Big at the top: the verb and the target - what is
 * about to happen and to what. Below it: the command itself, and one line of what the agent has been
 * doing, which is what saves a person from having to read the conversation. The buttons sit in a fixed
 * footer at thumb height, stacked and spaced, because a mistap here answers a question about someone's
 * files.
 *
 * "Always allow" is deliberately absent. It writes a permanent rule into the machine's settings, and
 * granting that from a sofa is a different act from unblocking one step - the plugin refuses it over
 * the wire as well (see RemoteCommands.soften).
 */
export const Decision = ({
  feed,
  cards,
  title,
  project,
  onDecide,
  onPlan,
  onAsk,
  onOpenThread,
  onBack,
}: DecisionProps) => {
  const t = useT()
  const [expanded, setExpanded] = useState(false)

  /**
   * The answers gathered so far, by the question they answer.
   *
   * A call may carry several questions, and they are answered one after another rather than all at once:
   * a phone has room for one question's options at thumb size and no more. The answer travels only when
   * the last of them has been picked - the agent is given one reply to its call, exactly as at the desk.
   */
  const [answers, setAnswers] = useState<Record<string, string>>({})

  /**
   * What is holding the turn, by the shared rule rather than "the last one of its kind in the feed".
   *
   * Taken from the pending items alone: a plan decided half an hour ago, or a question already answered,
   * stays in the feed forever, and picking by kind meant that the first plan a conversation ever showed
   * masked every question that came after it - this screen offered "Approve & run" over a plan nobody
   * was being asked about, and the live question could not be reached at all.
   */
  const waiting = awaiting(feed.items, cards)
  const permission: PermItem | undefined = waiting?.kind === 'perm' ? waiting : undefined
  const plan: PlanItem | undefined = waiting?.kind === 'plan' ? waiting : undefined
  const ask: AskItem | undefined = waiting?.kind === 'ask' ? waiting : undefined

  const question: AskQuestion | undefined = ask?.questions.find((one) => answers[one.title] === undefined)

  const doing = lastWords(feed.items)

  /** One question answered. The whole call is answered once nothing is left unanswered. */
  const pick = (item: AskItem, one: AskQuestion, label: string) => {
    const gathered = { ...answers, [one.title]: label }
    setAnswers(gathered)

    if (item.questions.some((other) => gathered[other.title] === undefined)) return

    cards.answerAsk(item.id)
    onAsk(item.id, gathered, Object.values(gathered).join(', '))
  }

  return (
    <>
      <header className={m.header}>
        <Back onClick={onBack} />
        <span className={m.headerTitle}>{title}</span>
      </header>

      <div className={m.decisionBody}>
        <span className={m.decisionContext}>{project}</span>

        {permission && (
          <>
            <h1 className={m.decisionVerb}>{t.permission.underMode(modeShortLabel(t, permission.mode))}</h1>
            <p className={m.decisionTarget}>{permission.target}</p>

            {permission.command && (
              <pre
                className={`${m.decisionCommand} ${expanded ? m.decisionCommandOpen : ''}`}
                onClick={() => setExpanded((open) => !open)}
              >
                {permission.command}
              </pre>
            )}

            {permission.reason && <p className={m.decisionReason}>{permission.reason}</p>}
          </>
        )}

        {plan && <h1 className={m.decisionVerb}>{t.mobile.decision.planWaiting}</h1>}

        {/* The question in full rather than its heading alone: what an option means is in the line under
            it, and choosing between two labels without them is guessing. When a call asks several, the
            count says how far along this is - the footer only ever holds one question's options. */}
        {ask && question && (
          <>
            <h1 className={m.decisionVerb}>{question.title}</h1>
            {question.hint && <p className={m.decisionTarget}>{question.hint}</p>}
            {ask.questions.length > 1 && (
              <p className={m.decisionContext}>
                {t.mobile.decision.questionOf(
                  ask.questions.findIndex((one) => one.title === question.title) + 1,
                  ask.questions.length,
                )}
              </p>
            )}
          </>
        )}

        {!waiting && (
          <p className={m.empty}>{t.mobile.decision.nothingWaiting}</p>
        )}

        {/* One line of what the agent was doing. This is what makes reading the conversation optional
            rather than necessary, which is the difference between two taps and two minutes. */}
        {doing && <p className={m.decisionDoing}>{doing}</p>}

        <button type="button" className={m.decisionLink} onClick={onOpenThread}>
          {t.mobile.decision.openConversation}
        </button>
      </div>

      <footer className={m.decisionFooter}>
        {permission && (
          <>
            <button type="button" className={m.buttonPrimary} onClick={() => onDecide(permission.id, 'once')}>
              {t.mobile.decision.allowOnce}
            </button>
            <button type="button" className={m.buttonDanger} onClick={() => onDecide(permission.id, 'deny')}>
              {t.mobile.decision.deny}
            </button>
          </>
        )}

        {plan && (
          <>
            <button type="button" className={m.buttonPrimary} onClick={() => onPlan(plan.id, 'approve')}>
              {t.feed.plan.approve}
            </button>
            <button type="button" className={m.buttonSecondary} onClick={() => onPlan(plan.id, 'keepPlanning')}>
              {t.feed.plan.keepPlanning}
            </button>
          </>
        )}

        {ask && question && (
          <>
            {question.options.map((option) => (
              <button
                key={option.label}
                type="button"
                className={m.buttonOption}
                onClick={() => pick(ask, question, option.label)}
              >
                <span className={m.buttonOptionLabel}>{option.label}</span>
                {option.sub && <span className={m.buttonOptionHint}>{option.sub}</span>}
              </button>
            ))}
          </>
        )}
      </footer>
    </>
  )
}

/**
 * The first sentence of the last thing the agent said, shortened.
 *
 * Not the whole card: what is wanted is "it was fixing the failing test", not three paragraphs about
 * how. Anyone who wants the rest has the conversation one tap away.
 */
const lastWords = (items: FeedItem[]): string => {
  const text = [...items].reverse().find((item): item is TextItem => item.kind === 'text')
  if (!text) return ''

  const sentence = text.source.split(/(?<=[.!?])\s/)[0] ?? text.source
  return sentence.length > 140 ? `${sentence.slice(0, 140)}…` : sentence
}

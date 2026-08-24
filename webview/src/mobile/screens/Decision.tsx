import { useState } from 'react'
import type { PanelState } from '../../feed/panelState'
import type { AskItem, FeedItem, PermItem, PlanItem, TextItem } from '../../feed/types'
import { Back } from './Back'
import m from '../mobile.module.css'

interface DecisionProps {
  feed: PanelState
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
export const Decision = ({ feed, title, project, onDecide, onPlan, onAsk, onOpenThread, onBack }: DecisionProps) => {
  const [expanded, setExpanded] = useState(false)

  const permission = [...feed.items].reverse().find(
    (item): item is PermItem => item.kind === 'perm' && item.decision === null,
  )
  const plan = [...feed.items].reverse().find((item): item is PlanItem => item.kind === 'plan')
  const ask = [...feed.items].reverse().find((item): item is AskItem => item.kind === 'ask')

  const doing = lastWords(feed.items)

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
            <h1 className={m.decisionVerb}>{permission.meta}</h1>
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

        {!permission && plan && <h1 className={m.decisionVerb}>A plan is waiting</h1>}
        {!permission && !plan && ask && <h1 className={m.decisionVerb}>{ask.questions[0]?.title}</h1>}

        {!permission && !plan && !ask && (
          <p className={m.empty}>Nothing is waiting for you here any more.</p>
        )}

        {/* One line of what the agent was doing. This is what makes reading the conversation optional
            rather than necessary, which is the difference between two taps and two minutes. */}
        {doing && <p className={m.decisionDoing}>{doing}</p>}

        <button type="button" className={m.decisionLink} onClick={onOpenThread}>
          Open the conversation
        </button>
      </div>

      <footer className={m.decisionFooter}>
        {permission && (
          <>
            <button type="button" className={m.buttonPrimary} onClick={() => onDecide(permission.id, 'once')}>
              Allow once
            </button>
            <button type="button" className={m.buttonDanger} onClick={() => onDecide(permission.id, 'deny')}>
              Deny
            </button>
          </>
        )}

        {!permission && plan && (
          <>
            <button type="button" className={m.buttonPrimary} onClick={() => onPlan(plan.id, 'approve')}>
              Approve &amp; run
            </button>
            <button type="button" className={m.buttonSecondary} onClick={() => onPlan(plan.id, 'keepPlanning')}>
              Keep planning
            </button>
          </>
        )}

        {!permission && !plan && ask && (
          <>
            {(ask.questions[0]?.options ?? []).map((option) => (
              <button
                key={option.label}
                type="button"
                className={m.buttonPrimary}
                onClick={() =>
                  onAsk(ask.id, { [ask.questions[0]?.title ?? '']: option.label }, option.label)
                }
              >
                {option.label}
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

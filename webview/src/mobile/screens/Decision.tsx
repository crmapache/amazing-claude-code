import { useRef, useState } from 'react'
import { modeShortLabel } from '../../catalog'
import type { CardState } from '../../hooks/useCardState'
import { answersOf, askReply } from '../../feed/askDraft'
import type { PanelState } from '../../feed/panelState'
import { awaiting } from '../../feed/streamStatus'
import type { AskItem, AskQuestion, FeedItem, PermItem, PlanItem, TextItem } from '../../feed/types'
import { useT } from '../../i18n'
import {
  canMoveOn,
  EMPTY_PHONE_ASK,
  finished,
  moveOn,
  onScreen,
  openOwn,
  pickOption,
  writeOwn,
  type PhoneAsk,
} from '../askSteps'
import { Back } from './Back'
import m from '../mobile.module.css'

interface DecisionProps {
  feed: PanelState
  /** Which plans have been decided and which questions answered - kept by the application, see mobile/App. */
  cards: CardState
  title: string
  project: string
  /**
   * What has been picked and written so far, by the call that asked - kept by the application as well,
   * and for the same reason (see mobile/App.askDrafts): this screen is taken down by a step back into
   * the conversation, and five answers out of six went with it.
   */
  answers: Record<string, PhoneAsk>
  onAnswers: (next: (held: Record<string, PhoneAsk>) => Record<string, PhoneAsk>) => void
  onDecide: (id: string, decision: 'once' | 'deny') => void
  onPlan: (id: string, decision: 'approve' | 'keepPlanning') => void
  onAsk: (id: string, answers: Record<string, string>, text: string) => void
  /**
   * Close the question without picking anything: the person will say it in the conversation. The desk's
   * cross over the same card, with the same word to the agent (see SessionPermissions.dismissAsk).
   */
  onDismissAsk: (id: string) => void
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
  answers: gathering,
  onAnswers,
  onDecide,
  onPlan,
  onAsk,
  onDismissAsk,
  onOpenThread,
  onBack,
}: DecisionProps) => {
  const t = useT()
  const [expanded, setExpanded] = useState(false)
  /**
   * The fields of one's own opened by a tap on this screen - the only ones that bring the keyboard up.
   * One restored out of what was gathered must not: coming back from reading the conversation is not a
   * request to type, and a keyboard over half the screen hides the very options being returned to.
   */
  const openedHere = useRef(new Set<string>())

  /**
   * A call may carry several questions, and they are answered one after another rather than all at once:
   * a phone has room for one question's options at thumb size and no more. The answer travels only when
   * the last of them is done with - the agent is given one reply to its call, exactly as at the desk.
   *
   * Which is exactly why what has been gathered is not kept here: the screen goes away every time
   * somebody steps back to read the conversation, and the questions started over.
   */

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

  /** What has been gathered for the call on screen - the rest of the application holds it by call. */
  const held = (ask ? gathering[ask.id] : undefined) ?? EMPTY_PHONE_ASK

  const question: AskQuestion | undefined = ask ? onScreen(ask.questions, held) : undefined
  /** Whether the question on screen is the call's last: what its button says - and whether a tap sends. */
  const last =
    ask !== undefined &&
    question !== undefined &&
    ask.questions.filter((one) => !held.done.includes(one.id)).length === 1

  const doing = lastWords(feed.items)

  /**
   * A step through the call. The answer travels once every question is done with - in the desk's own
   * shape, pairs and text alike (see askReply).
   */
  const step = (item: AskItem, next: PhoneAsk) => {
    onAnswers((all) => ({ ...all, [item.id]: next }))
    if (!finished(item.questions, next)) return

    const reply = askReply(answersOf(item.questions, next.draft))
    cards.answerAsk(item.id)
    onAsk(item.id, reply.answers, reply.text)
  }

  const openOwnAnswer = (item: AskItem, one: AskQuestion) => {
    // By the call as well as the question: every call numbers its questions from q-0.
    openedHere.current.add(`${item.id}:${one.id}`)
    step(item, openOwn(held, one))
  }

  return (
    <>
      <header className={m.threadHeader}>
        <div className={m.threadHeadRow}>
          <Back onClick={onBack} />
          <span className={m.threadTitles}>
            <span className={m.threadTitle}>{title}</span>
            <span className={m.threadWhere}>{project}</span>
          </span>
        </div>
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
                  ask.questions.findIndex((one) => one.id === question.id) + 1,
                  ask.questions.length,
                )}
              </p>
            )}
            {/* Said, because the buttons below look the same either way: a question that takes several
                does not move on with the first tap, and without this the screen reads as stuck. */}
            {question.multiSelect && <p className={m.decisionContext}>{t.feed.ask.pickAny}</p>}
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

        {/* The desk's cross over the same card. Writing in the conversation closes the question too (see
            SessionPermissions.answeredInChat), but a way out has to be on the screen that holds the
            question rather than known about - the report this came from had none. */}
        {ask && (
          <button type="button" className={m.decisionLink} onClick={() => onDismissAsk(ask.id)}>
            {t.feed.ask.dismissHint}
          </button>
        )}
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
            {question.options.map((option) => {
              const on = (held.draft.picks[question.id] ?? []).includes(option.id)

              return (
                <button
                  key={option.id}
                  type="button"
                  className={`${m.buttonOption} ${on ? m.buttonOptionOn : ''}`}
                  aria-pressed={question.multiSelect ? on : undefined}
                  onClick={() => step(ask, pickOption(held, question, option.id))}
                >
                  <span className={m.buttonOptionLabel}>{option.label}</span>
                  {option.sub && <span className={m.buttonOptionHint}>{option.sub}</span>}
                </button>
              )
            })}

            {/* Other is one more option rather than a form off to the side, as at the desk: the tool
                promises it itself, so the screen adds it rather than the agent. Pressed, it becomes the
                field it stands for. */}
            {held.draft.custom[question.id] === undefined ? (
              <button type="button" className={m.buttonOption} onClick={() => openOwnAnswer(ask, question)}>
                <span className={m.buttonOptionLabel}>{t.feed.ask.other}</span>
              </button>
            ) : (
              <textarea
                className={`${m.input} ${m.ownAnswer}`}
                value={held.draft.custom[question.id]}
                placeholder={t.feed.ask.ownAnswer}
                autoCapitalize="sentences"
                autoFocus={openedHere.current.has(`${ask.id}:${question.id}`)}
                onChange={(event) => step(ask, writeOwn(held, question, event.target.value))}
              />
            )}

            {/* Moving on is a press of its own wherever one tap is not the whole answer: ticks, of which
                there may be several, and words, which are never done by themselves. An ordinary option
                needs no such press - the tap is the answer. */}
            {(question.multiSelect || held.draft.custom[question.id] !== undefined) && (
              <button
                type="button"
                className={m.buttonPrimary}
                disabled={!canMoveOn(held, question)}
                onClick={() => step(ask, moveOn(held, question))}
              >
                {!canMoveOn(held, question)
                  ? t.feed.ask.pickToContinue
                  : last
                    ? t.feed.ask.send
                    : t.mobile.decision.nextQuestion}
              </button>
            )}
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

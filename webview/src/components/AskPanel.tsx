import { useCallback, useEffect, useRef, useState } from 'react'
import type { AskItem, AskQuestion } from '../feed/types'
import { MAX_DIGIT_HOTKEYS, useDigitHotkey } from '../hooks/useDigitHotkey'
import s from './composer.module.css'

/** Whether typing is happening right now in a field that does not belong to this panel. */
const typedOutside = (target: HTMLElement | null, panel: HTMLElement | null): boolean => {
  if (!target || (target.tagName !== 'INPUT' && target.tagName !== 'TEXTAREA')) return false
  return !panel?.contains(target)
}

interface AskPanelProps {
  /** The last question the agent asked that has not been answered yet - or nothing. */
  item: AskItem | undefined
  /** Whether the message field is empty: who gets a pressed digit depends on it. */
  composerEmpty: boolean
  /** False when the digits are taken by the permission panel - it holds the turn more firmly. */
  hotkeys: boolean
  /**
   * The answers together with the questions themselves: the agent recognises its question by its text
   * rather than by position (see protocol, the askAnswer message).
   */
  onSubmit: (itemId: string, answers: { question: string; answer: string }[]) => void
  /**
   * Close the question without answering its options: the person will say it in their own words in the
   * input field. The agent gets a refusal of its call and carries on - otherwise it would stand there
   * waiting for a choice nobody is going to make.
   */
  onDismiss: (itemId: string) => void
}

/**
 * A pinned panel above the input field - after the pattern of TaskListPanel/Queue. A question blocks the
 * turn, so it must not get lost somewhere in the middle of the feed: it disappears as soon as the answer
 * is sent rather than hanging there inactive.
 */
export const AskPanel = ({ item, composerEmpty, hotkeys, onSubmit, onDismiss }: AskPanelProps) => {
  /** The options picked per question: no more than one for an ordinary question, any number for multiSelect. */
  const [picks, setPicks] = useState<Record<string, string[]>>({})
  const [custom, setCustom] = useState<Record<string, string>>({})
  /**
   * Which question the digits belong to. One call may hold up to six of them, and without this it would
   * be unclear what a pressed "2" picks. It walks the list from top to bottom: an ordinary question lets
   * it move on by itself as soon as it has been answered, while one with several options (multiSelect)
   * keeps it until Enter is pressed - otherwise a second tick could no longer be set with a hotkey.
   */
  const [activeIndex, setActiveIndex] = useState(0)
  /** The panel itself: by it we tell our own "your answer" field from someone else's form on the page. */
  const panel = useRef<HTMLDivElement>(null)

  const questions = item?.questions ?? []
  const active = questions[activeIndex]

  const toggle = useCallback((question: AskQuestion, optionId: string) => {
    setPicks((current) => {
      const selected = current[question.id] ?? []

      if (!question.multiSelect) return { ...current, [question.id]: [optionId] }

      const next = selected.includes(optionId)
        ? selected.filter((id) => id !== optionId)
        : [...selected, optionId]
      return { ...current, [question.id]: next }
    })

    // An ordinary option is not "your answer": if the Other row was switched on before, its text no
    // longer has the right to be the answer to a single-choice question. In multiSelect, Other is a tick
    // like any other, so it lives alongside ordinary options and is not cleared.
    if (!question.multiSelect) {
      setCustom((current) => {
        if (current[question.id] === undefined) return current
        const next = { ...current }
        delete next[question.id]
        return next
      })
    }
  }, [])

  /* Other is not a separate form off to the side but an option in the same row: AskUserQuestion promises
     it itself (see the tool's description), so the panel adds it rather than the calling agent. Pressing
     it opens an input field in its place - the digit and the highlight behave like an ordinary option's,
     only instead of a ready caption the circle carries one's own text. */
  const pickOther = useCallback((question: AskQuestion) => {
    setCustom((current) => (current[question.id] !== undefined ? current : { ...current, [question.id]: '' }))
    if (!question.multiSelect) {
      setPicks((current) => ({ ...current, [question.id]: [] }))
    }
  }, [])

  const answerFor = useCallback(
    (question: AskQuestion): string => {
      const typed = custom[question.id]?.trim()
      if (typed) return typed

      const selected = picks[question.id] ?? []
      const labels = selected
        .map((optionId) => question.options.find((candidate) => candidate.id === optionId)?.label)
        .filter((label): label is string => Boolean(label))
      return labels.join(', ')
    },
    [custom, picks],
  )

  const answers = questions.map((question) => ({ question: question.title, answer: answerFor(question) }))
  const answered = answers.length > 0 && answers.every((entry) => entry.answer.length > 0)

  /** Further down the list - to the first question still waiting for an answer. */
  const advance = useCallback(() => {
    setActiveIndex((current) => {
      const next = questions.findIndex((question, index) => index > current && answerFor(question).length === 0)
      return next < 0 ? current : next
    })
  }, [questions, answerFor])

  const pick = useCallback(
    (index: number) => {
      if (!active) return

      // Other is the last option in the count, on the digit after all the real ones. It opens an input
      // field and stops there: there is nothing to answer with until text is typed - advance() would move
      // on with an empty answer.
      if (index === active.options.length) {
        pickOther(active)
        return
      }

      const option = active.options[index]
      if (!option) return

      toggle(active, option.id)
      // An ordinary question is closed by this very press - the digits move on to the next one.
      if (!active.multiSelect) advance()
    },
    [active, toggle, advance, pickOther],
  )

  useDigitHotkey(Math.min(active ? active.options.length + 1 : 0, MAX_DIGIT_HOTKEYS), pick, {
    enabled: hotkeys && Boolean(item),
    composerEmpty,
  })

  /**
   * What Enter does lives in a ref rather than in the dependencies of the effect below.
   *
   * The answers are reassembled on every repaint (a map over the questions computes them), and the panel
   * repaints on every chunk of the agent's printing answer and on every tick of the stopwatch. Were they
   * in the dependencies, the window listener would be removed and added again several times a second for
   * nothing.
   */
  const respond = useRef(() => {})
  respond.current = () => {
    if (!item) return
    if (answered) onSubmit(item.id, answers)
    else advance()
  }

  /**
   * Enter sends the answers when everything has been answered, and moves to the next question while it
   * has not: the same "done" gesture as in a terminal. While the focus is in the message field, Enter
   * belongs to it - there it sends the message.
   */
  useEffect(() => {
    if (!item || !hotkeys) return

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== 'Enter' || event.shiftKey || event.metaKey || event.ctrlKey) return

      const target = event.target as HTMLElement | null
      // A started message is sent by the message field's own Enter.
      if (target?.isContentEditable && !composerEmpty) return
      // Someone else's input field owns Enter entirely: it confirms what was typed into it - a
      // marketplace's address, an MCP server's command. The question panel meanwhile keeps hanging over
      // the field with its listener alive, so without this check Enter in a foreign form would answer the
      // agent with a half-picked option while the form itself did nothing at all. The Other field is the
      // exception: it is part of this very panel.
      if (typedOutside(target, panel.current)) return

      event.preventDefault()
      respond.current()
    }

    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [item, hotkeys, composerEmpty])

  if (!item) return null

  return (
    <div className={s.ask} ref={panel}>
      <div className={s.askHead}>
        <span className={s.askLabel}>CLAUDE ASKS</span>
        <span className={s.askMeta}>{item.meta}</span>
        <div className={s.spacer} />
        <button
          type="button"
          className={s.askDismiss}
          data-tooltip="Close and answer in your own words"
          aria-label="Close the question"
          onClick={() => onDismiss(item.id)}
        >
          ×
        </button>
      </div>

      <div className={s.askBody}>
        {item.questions.map((question, questionIndex) => {
          const selected = picks[question.id] ?? []
          // The digits pick an option in one question at a time - in the rest they are dimmed, so as not
          // to promise a press that would go elsewhere.
          const keyed = hotkeys && questionIndex === activeIndex

          return (
            <div key={question.id} className={s.question}>
              <div className={s.questionHead}>
                <span className={s.questionTitle}>{question.title}</span>
                <span className={s.questionHint}>{question.hint}</span>
                {question.multiSelect ? <span className={s.questionMulti}>pick any</span> : null}
              </div>

              <div className={s.options}>
                {question.options.map((option, index) => {
                  const on = selected.includes(option.id)
                  // The tenth option and beyond got no digit - the circle stays empty, so that the
                  // captions do not drift apart on the left edge.
                  const digit = index < MAX_DIGIT_HOTKEYS ? String(index + 1) : ''

                  return (
                    <button
                      key={option.id}
                      type="button"
                      className={`${s.option} ${on ? s.optionOn : ''}`}
                      onClick={() => {
                        setActiveIndex(questionIndex)
                        toggle(question, option.id)
                      }}
                    >
                      {question.multiSelect ? (
                        <span className={`${s.optionCheck} ${on ? s.optionCheckOn : ''} ${keyed ? '' : s.optionKeyIdle}`}>
                          {on ? '✓' : digit}
                        </span>
                      ) : (
                        <span className={`${s.optionKey} ${on ? s.optionKeyOn : ''} ${keyed ? '' : s.optionKeyIdle}`}>
                          {digit}
                        </span>
                      )}
                      <div>
                        <div className={`${s.optionLabel} ${on ? s.optionLabelOn : ''}`}>{option.label}</div>
                        {option.sub ? <div className={s.optionSub}>{option.sub}</div> : null}
                      </div>
                    </button>
                  )
                })}

                {(() => {
                  const otherOn = custom[question.id] !== undefined
                  // It continues the same numbering as the real options above - Other reads as one more
                  // of them rather than a separate thing.
                  const otherDigit = question.options.length < MAX_DIGIT_HOTKEYS ? String(question.options.length + 1) : ''

                  if (otherOn) {
                    return (
                      <div className={`${s.option} ${s.optionOn} ${s.optionOther}`}>
                        <span className={`${s.optionKey} ${s.optionKeyOn} ${keyed ? '' : s.optionKeyIdle}`}>✓</span>
                        <input
                          className={s.otherInput}
                          autoFocus
                          placeholder="type your own answer…"
                          value={custom[question.id] ?? ''}
                          onFocus={() => setActiveIndex(questionIndex)}
                          onChange={(event) =>
                            setCustom((current) => ({ ...current, [question.id]: event.target.value }))
                          }
                        />
                      </div>
                    )
                  }

                  return (
                    <button
                      type="button"
                      className={`${s.option} ${s.optionOther}`}
                      onClick={() => {
                        setActiveIndex(questionIndex)
                        pickOther(question)
                      }}
                    >
                      <span className={`${s.optionKey} ${keyed ? '' : s.optionKeyIdle}`}>{otherDigit}</span>
                      <div className={s.optionLabel}>Other</div>
                    </button>
                  )
                })()}
              </div>
            </div>
          )
        })}
      </div>

      <div className={s.askFoot}>
        <button
          type="button"
          className={`${s.primary} ${answered ? s.primaryBranch : s.primaryOff}`}
          disabled={!answered}
          onClick={() => onSubmit(item.id, answers)}
        >
          {answered ? 'Send answers' : 'Pick to continue'}
        </button>
        <div className={s.spacer} />
        <span className={s.askNote}>the run continues right where it asked</span>
      </div>
    </div>
  )
}

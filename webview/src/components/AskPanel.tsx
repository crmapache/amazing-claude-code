import { useCallback, useEffect, useRef, useState } from 'react'
import type { AskItem, AskQuestion } from '../feed/types'
import { Chevron } from './Chevron'
import { MAX_DIGIT_HOTKEYS, useDigitHotkey } from '../hooks/useDigitHotkey'
import { savePastedFiles } from '../pasted'
import s from './composer.module.css'
import { useT } from '../i18n'
import { useFieldHistory } from '../hooks/useFieldHistory'
import type { ClipboardEvent } from 'react'

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
  const t = useT()
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
  /** Hides the body and the foot, leaving only the head - a temporary "out of my way", not a decision. */
  const [collapsed, setCollapsed] = useState(false)
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
    enabled: hotkeys && Boolean(item) && !collapsed,
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
    if (!item || !hotkeys || collapsed) return

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== 'Enter' || event.shiftKey || event.metaKey || event.ctrlKey) return
      // An input method confirms its candidate with the same Enter, and that is not an answer to anything.
      // Today the draft below usually holds this back on its own (a half-typed word is a draft, and a
      // draft owns Enter), but only for as long as the field keeps reporting the unfinished characters -
      // too thin a thread to hang the agent's answer on.
      if (event.isComposing) return

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
  }, [item, hotkeys, composerEmpty, collapsed])

  if (!item) return null

  return (
    /* data-shrinks: of the whole stack above the input field this is the card that gives up its height when
       the panel runs short of it - the list of questions inside has a scroll to put the difference into
       (see .dock and .askBody in composer.module.css). */
    <div className={s.ask} ref={panel} data-shrinks="">
      {/* The card grows upwards - the input field below it stays where it is - so folded it points up:
          the arrow shows where the questions will come back from rather than which way the head will
          move. One drawing at two angles, and the turn itself says that the two states are one thing. */}
      <button
        type="button"
        className={s.askCollapse}
        aria-label={collapsed ? t.feed.ask.expand : t.feed.ask.collapse}
        onClick={() => setCollapsed((current) => !current)}
      >
        <Chevron className={`${s.askCaret} ${collapsed ? s.askCaretUp : ''}`} />
      </button>

      <div className={`${s.askHead} ${collapsed ? s.askHeadAlone : ''}`}>
        {/* The label and the count go in a group of their own: the cross keeps the middle of the row,
            while text of two different sizes lines up on the baseline (as in TaskListPanel). */}
        <span className={s.askTitle}>
          <span className={s.askLabel}>{t.feed.ask.label}</span>
          <span className={s.askMeta}>{t.feed.ask.blocks(item.questions.length)}</span>
        </span>
        <div className={s.spacer} />
        <button
          type="button"
          className={s.askDismiss}
          data-tooltip={t.feed.ask.dismissHint}
          aria-label={t.feed.ask.dismiss}
          onClick={() => onDismiss(item.id)}
        >
          ×
        </button>
      </div>

      {!collapsed && (
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
                  {question.multiSelect ? <span className={s.questionMulti}>{t.feed.ask.pickAny}</span> : null}
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
                          <OwnAnswer
                            value={custom[question.id] ?? ''}
                            onFocus={() => setActiveIndex(questionIndex)}
                            onChange={(value) => setCustom((current) => ({ ...current, [question.id]: value }))}
                            /**
                             * A screenshot or a document pasted into the answer.
                             *
                             * The answer travels to the agent as text and nothing else, so what goes in
                             * here is the path: the shell keeps the bytes as a file (see savePastedFiles)
                             * and the agent reads it as it would any other file named in a message.
                             * Before this a paste of anything but text simply did nothing - the field is
                             * an ordinary input, and bytes have nowhere to go in one.
                             */
                            onPaste={(event) => {
                              const files = Array.from(event.clipboardData?.files ?? [])
                              if (files.length === 0) return

                              event.preventDefault()
                              const field = event.currentTarget
                              const at = field.selectionStart ?? field.value.length
                              const to = field.selectionEnd ?? at

                              void savePastedFiles(files).then((paths) => {
                                if (paths.length === 0) return

                                setCustom((current) => {
                                  const value = current[question.id] ?? ''
                                  // Where the caret was when the paste happened - the answer may well be
                                  // half written, and appending to its end would put the file after words
                                  // it has nothing to do with.
                                  const head = value.slice(0, Math.min(at, value.length))
                                  const tail = value.slice(Math.min(to, value.length))
                                  const inserted = joinPaths(head, paths, tail)

                                  return { ...current, [question.id]: inserted }
                                })
                              })
                            }}
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
                        <div className={s.optionLabel}>{t.feed.ask.other}</div>
                      </button>
                    )
                  })()}
                </div>
              </div>
            )
          })}
        </div>
      )}

      {!collapsed && (
        <div className={s.askFoot}>
          <button
            type="button"
            className={`${s.primary} ${answered ? s.primaryBranch : s.primaryOff}`}
            disabled={!answered}
            onClick={() => onSubmit(item.id, answers)}
          >
            {answered ? t.feed.ask.send : t.feed.ask.pickToContinue}
          </button>
          <div className={s.spacer} />
          <span className={s.askNote}>{t.feed.ask.note}</span>
        </div>
      )}
    </div>
  )
}

/**
 * The pasted paths put into an answer that is being written, without gluing them to the words around
 * them: a path stuck to the end of a sentence is a path nothing can open.
 */
const joinPaths = (head: string, paths: string[], tail: string): string => {
  const body = paths.join(' ')
  const before = head && !/\s$/.test(head) ? `${head} ` : head
  const after = tail && !/^\s/.test(tail) ? ` ${tail}` : tail

  return `${before}${body}${after}`
}

/**
 * The field of an answer in one's own words. A component of its own for the sake of one hook: the word
 * before the caret and the undo history the browser inside the IDE does not give a plain field (see
 * useFieldHistory), and a hook cannot be called from inside the list of questions.
 */
const OwnAnswer = ({
  value,
  onChange,
  onFocus,
  onPaste,
}: {
  value: string
  onChange: (value: string) => void
  onFocus: () => void
  onPaste: (event: ClipboardEvent<HTMLInputElement>) => void
}) => {
  const t = useT()
  const keys = useFieldHistory(value, onChange)

  return (
    <input
      className={s.otherInput}
      autoFocus
      placeholder={t.feed.ask.ownAnswer}
      value={value}
      onFocus={onFocus}
      onChange={keys.onChange}
      onKeyDown={keys.onKeyDown}
      onPaste={onPaste}
    />
  )
}

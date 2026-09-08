import { useCallback, useEffect, useRef, useState } from 'react'
import type { AskItem, AskQuestion } from '../feed/types'
import {
  answersOf,
  askAnswered,
  firstUnanswered,
  openOwnAnswer,
  pasteIntoOwnAnswer,
  togglePick,
  writeOwnAnswer,
  type AskDraft,
} from '../feed/askDraft'
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
  /**
   * What has been ticked and written into this very question so far - held outside the card (see
   * feed/askDraft and App.askDrafts).
   *
   * Kept inside, it went with the card, and the card is taken down by ordinary things: a look at the
   * next tab, the composer changing its layout under a window that came back a different height. The
   * answers a person had already assembled disappeared with it.
   */
  draft: AskDraft
  onDraft: (next: AskDraft) => void
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
export const AskPanel = ({ item, draft, onDraft, composerEmpty, hotkeys, onSubmit, onDismiss }: AskPanelProps) => {
  const t = useT()
  const questions = item?.questions ?? []
  /**
   * Which question the digits belong to. One call may hold up to six of them, and without this it would
   * be unclear what a pressed "2" picks. It walks the list from top to bottom: an ordinary question lets
   * it move on by itself as soon as it has been answered, while one with several options (multiSelect)
   * keeps it until Enter is pressed - otherwise a second tick could no longer be set with a hotkey.
   *
   * It starts wherever the draft left off rather than at the top: a card built again over answers already
   * given (another tab was looked at, the layout moved the whole stack of cards) would otherwise point
   * the digits at a question that has been answered.
   */
  const [activeIndex, setActiveIndex] = useState(() => Math.max(firstUnanswered(questions, draft), 0))
  /** Hides the body and the foot, leaving only the head - a temporary "out of my way", not a decision. */
  const [collapsed, setCollapsed] = useState(false)
  /** The panel itself: by it we tell our own "your answer" field from someone else's form on the page. */
  const panel = useRef<HTMLDivElement>(null)
  /**
   * The Other rows opened by hand in this life of the card - the only ones whose field takes the focus.
   *
   * A row restored out of the draft must not: the card is built again when somebody comes back to the
   * tab, and a field that grabs the focus then takes it away from the message field they were heading
   * for.
   */
  const openedByHand = useRef(new Set<string>())

  const active = questions[activeIndex]

  /**
   * The draft as it stands right now.
   *
   * Written down here as well as sent out, and that is the whole point of the ref: a change is built out
   * of the previous draft, while the new one comes back from the parent only with the next repaint. Two
   * presses inside one frame - and they happen, a digit held down, a click landing while a pasted file is
   * being written in - would both be built on the draft from before the first, and the first would be
   * gone without a trace of it anywhere.
   */
  const held = useRef(draft)
  held.current = draft

  /** A change to the draft: kept here at once, and handed to whoever owns it. */
  const write = useCallback(
    (next: AskDraft) => {
      held.current = next
      onDraft(next)
    },
    [onDraft],
  )

  const toggle = useCallback(
    (question: AskQuestion, optionId: string) => write(togglePick(held.current, question, optionId)),
    [write],
  )

  /* Other is not a separate form off to the side but an option in the same row: AskUserQuestion promises
     it itself (see the tool's description), so the panel adds it rather than the calling agent. Pressing
     it opens an input field in its place - the digit and the highlight behave like an ordinary option's,
     only instead of a ready caption the circle carries one's own text. */
  const pickOther = useCallback(
    (question: AskQuestion) => {
      openedByHand.current.add(question.id)
      write(openOwnAnswer(held.current, question))
    },
    [write],
  )

  const answers = answersOf(questions, draft)
  const answered = askAnswered(questions, draft)

  /** Further down the list - to the first question still waiting for an answer. */
  const advance = useCallback(() => {
    setActiveIndex((current) => {
      const next = firstUnanswered(questions, held.current, current)
      return next < 0 ? current : next
    })
  }, [questions])

  const pick = useCallback(
    (index: number) => {
      if (!active) return

      // Other is the last option in the count, on the digit after all the real ones. It opens an input
      // field and stops there: there is nothing to answer with until text is typed - moving on would
      // leave an empty answer behind.
      if (index === active.options.length) {
        pickOther(active)
        return
      }

      const option = active.options[index]
      if (!option) return

      // Where the digits go next is decided by the draft this very press makes rather than by the one on
      // screen: the new one comes back from the parent a repaint later.
      const next = togglePick(held.current, active, option.id)
      write(next)

      // An ordinary question is closed by this very press - the digits move on to the next one.
      if (active.multiSelect) return

      setActiveIndex((current) => {
        const ahead = firstUnanswered(questions, next, current)
        return ahead < 0 ? current : ahead
      })
    },
    [active, write, pickOther, questions],
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
            const selected = draft.picks[question.id] ?? []
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
                    const otherOn = draft.custom[question.id] !== undefined
                    // It continues the same numbering as the real options above - Other reads as one more
                    // of them rather than a separate thing.
                    const otherDigit = question.options.length < MAX_DIGIT_HOTKEYS ? String(question.options.length + 1) : ''

                    if (otherOn) {
                      return (
                        <div className={`${s.option} ${s.optionOn} ${s.optionOther}`}>
                          <span className={`${s.optionKey} ${s.optionKeyOn} ${keyed ? '' : s.optionKeyIdle}`}>✓</span>
                          <OwnAnswer
                            value={draft.custom[question.id] ?? ''}
                            // Only a row just opened by hand takes the focus - see openedByHand.
                            grabFocus={openedByHand.current.has(question.id)}
                            onFocus={() => setActiveIndex(questionIndex)}
                            onChange={(value) => write(writeOwnAnswer(held.current, question, value))}
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
                              // Where the caret was when the paste happened - the answer may well be half
                              // written, and appending to its end would put the file after words it has
                              // nothing to do with (see pasteIntoOwnAnswer).
                              const at = field.selectionStart ?? field.value.length
                              const to = field.selectionEnd ?? at

                              void savePastedFiles(files).then((paths) => {
                                if (paths.length === 0) return

                                write(pasteIntoOwnAnswer(held.current, question, paths, at, to))
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
 * The field of an answer in one's own words. A component of its own for the sake of one hook: the word
 * before the caret and the undo history the browser inside the IDE does not give a plain field (see
 * useFieldHistory), and a hook cannot be called from inside the list of questions.
 */
const OwnAnswer = ({
  value,
  grabFocus,
  onChange,
  onFocus,
  onPaste,
}: {
  value: string
  /**
   * Whether the field takes the focus as it appears. True for a row just opened by hand - that press was
   * a request to write something. False for a row restored out of a draft: the card is built again when
   * somebody comes back to the tab, and grabbing the focus then takes it away from wherever they were
   * heading.
   */
  grabFocus: boolean
  onChange: (value: string) => void
  onFocus: () => void
  onPaste: (event: ClipboardEvent<HTMLInputElement>) => void
}) => {
  const t = useT()
  const keys = useFieldHistory(value, onChange)

  return (
    <input
      className={s.otherInput}
      autoFocus={grabFocus}
      placeholder={t.feed.ask.ownAnswer}
      value={value}
      onFocus={onFocus}
      onChange={keys.onChange}
      onKeyDown={keys.onKeyDown}
      onPaste={onPaste}
    />
  )
}

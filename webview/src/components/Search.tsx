import { useEffect, useLayoutEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { describeWhen } from '../feed/when'
import { groupByChat, snippetPieces, type SearchGroup } from '../feed/search'
import type { SearchHit, SearchProgressStep, SearchScope } from '../protocol'
import { useHoverTarget } from '../hooks/useHoverTarget'
import { useWheelScroll } from '../hooks/useWheelScroll'
import { useFieldHistory } from '../hooks/useFieldHistory'
import { useT } from '../i18n'
import type { Dict } from '../i18n/en'
import s from './search.module.css'
import { Magnifier } from './SearchCapsule'

/** The three tabs: the two scopes of a typed search, and the model's. */
export type SearchTab = SearchScope | 'ai'

const SEARCH_TABS: readonly SearchTab[] = ['chat', 'project', 'ai']

/** One and the same empty list, so the selection is not reset on every render that shows nothing. */
const NO_HITS: readonly SearchHit[] = []

/** How many of the model's steps stand under the spinner - the older ones say nothing any more. */
const STEPS_SHOWN = 4

/** How tall the description stands empty and how tall it may grow on its own, in lines - past that it scrolls. */
const AI_LINES_MIN = 2
const AI_LINES_MAX = 6

export interface SearchProps {
  tab: SearchTab
  onTab: (tab: SearchTab) => void
  /** The typed query - one for both scopes: switching the tab changes where it looks, not what for. */
  query: string
  onQuery: (query: string) => void
  /** The field's two switches - Match case and Whole words, the pair Find in Files has. */
  matchCase: boolean
  wholeWords: boolean
  onMatchCase: (on: boolean) => void
  onWholeWords: (on: boolean) => void
  hits: readonly SearchHit[]
  /**
   * The scope `hits` were found for. Switching the tab asks the same query again over the other scope,
   * and until that answer comes the hits on hand are the other tab's: drawn under "this chat" they were
   * five other conversations' rows without their headings, under a count that promised another number,
   * and a press on one opened a conversation nobody had asked for. Empty while nothing has been asked.
   */
  answerScope: SearchScope | ''
  /** How many matched in each scope, whichever one is on screen - the numbers on the tabs. */
  counts: { chat: number; project: number; conversations: number }
  /** How many matched in the scope shown: `hits` may hold only the best of them. */
  total: number
  /** A typed query is out and unanswered. */
  loading: boolean
  /** Whether the list holds an answer to a typed query - what tells "nothing found" from "not answered yet". */
  answered: boolean
  error: string
  /** The description for the model, and its run. */
  aiQuery: string
  onAiQuery: (query: string) => void
  aiHits: readonly SearchHit[]
  aiRunning: boolean
  aiError: string
  /** Whether the model has answered the description on screen - what tells "nothing found" from "not asked". */
  aiAnswered: boolean
  /** What the model has done so far, oldest first - the last one is what it is doing now. */
  aiSteps: readonly SearchProgressStep[]
  /** How long the model's run has been going, in seconds - counted by whoever owns the request. */
  aiSeconds: number
  onRunAi: () => void
  onCancelAi: () => void
  /** Whether the tab on screen holds a conversation at all - without one, "this chat" has nothing to search. */
  hasChat: boolean
  onPick: (hit: SearchHit) => void
  /** The cross: the search is over - the window, the capsule, the fields and the answers with it. */
  onClose: () => void
  /** Escape and a click beside the window: the window is put away, and everything in it is kept. */
  onDismiss: () => void
}

/**
 * The search window: one typed query over this chat or over every chat of the project, and a described
 * one for a model to answer (see SearchDesk on the IDE's side for all three).
 *
 * A layer over the whole panel rather than a floating dialog - the panel is often 350 pixels wide, and
 * a dialog inside it would be the panel with a frame around it. In a wide panel it is a window of
 * ordinary width in the middle.
 *
 * Four bands, top to bottom: the tabs with what each one found, the field, the results, and a foot
 * saying which keys do what. The rules that decide what a hit is and where it stands are not here: they
 * live in feed/search.ts, where a test can hold them.
 */
export const Search = ({
  tab,
  onTab,
  query,
  onQuery,
  matchCase,
  wholeWords,
  onMatchCase,
  onWholeWords,
  hits,
  answerScope,
  counts,
  total,
  loading,
  answered,
  error,
  aiQuery,
  onAiQuery,
  aiHits,
  aiRunning,
  aiError,
  aiAnswered,
  aiSteps,
  aiSeconds,
  onRunAi,
  onCancelAi,
  hasChat,
  onPick,
  onClose,
  onDismiss,
}: SearchProps) => {
  const t = useT()
  const window_ = useRef<HTMLDivElement | null>(null)
  const list = useRef<HTMLDivElement | null>(null)
  const input = useRef<HTMLInputElement | null>(null)
  const area = useRef<HTMLTextAreaElement | null>(null)

  useHoverTarget(window_)
  useWheelScroll(list)

  // The keys the browser inside the IDE does not give a plain field - the word before the caret, undo and
  // redo - lent to both fields the way the composer has them (see useFieldHistory).
  const queryKeys = useFieldHistory(query, onQuery)
  const aiKeys = useFieldHistory(aiQuery, onAiQuery)

  // Only an answer to this tab's own scope is a list here - the other tab's is nothing yet, see answerScope.
  const fits = tab === 'ai' || answerScope === tab
  const shown = tab === 'ai' ? aiHits : fits ? hits : NO_HITS
  /** The hit the keys stand on; -1 for none. Reset whenever the list changes under it. */
  const [selected, setSelected] = useState(-1)
  useEffect(() => setSelected(-1), [shown])

  /** Which hits are unfolded to their whole text, by uuid - a list, not one: two may be compared. */
  const [unfolded, setUnfolded] = useState<ReadonlySet<string>>(new Set())

  const unfold = (uuid: string, open?: boolean) =>
    setUnfolded((current) => {
      const next = new Set(current)
      if (open ?? !next.has(uuid)) next.add(uuid)
      else next.delete(uuid)
      return next
    })

  // The field takes the keyboard as the window opens, and again as the tabs change: a search is typed.
  useEffect(() => {
    const target = tab === 'ai' ? area.current : input.current
    target?.focus()
  }, [tab])

  /*
   * The description grows with what is typed, from two lines to six, and scrolls past that. Fixed at two
   * it showed a scrollbar on the third line of a question that was meant to be a paragraph, and a drag
   * handle inside a window that has a height of its own would be two things arguing over one edge - so
   * the field measures itself instead, before the paint, at every change.
   */
  useLayoutEffect(() => {
    const field = area.current
    if (!field) return
    const line = parseFloat(getComputedStyle(field).lineHeight) || 21
    field.style.height = '0px'
    field.style.height = `${Math.min(line * AI_LINES_MAX, Math.max(line * AI_LINES_MIN, field.scrollHeight))}px`
  }, [aiQuery, tab])

  /*
   * The keys the window answers to. Escape puts the window away and nothing else - in the
   * capture phase, ahead of the panel's own handler that would stop the agent, exactly as the confirm
   * dialog does it; what was typed and found stays for the capsule to bring back, unlike the cross (see
   * onClose). The rest walk the list without the hands leaving the keyboard: the arrows step, the right
   * arrow unfolds a message and the left one folds it back, Enter opens what is selected.
   */
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.isComposing) return

      if (event.key === 'Escape') {
        event.preventDefault()
        event.stopPropagation()
        onDismiss()
        return
      }

      // The field's two switches, by the keys Find in Files gives them: Alt+Cmd+C and Alt+Cmd+W (Ctrl
      // for Cmd off a Mac). By the key's code, not its character - with Alt held a Mac types "ç" for C.
      if (tab !== 'ai' && event.altKey && (event.metaKey || event.ctrlKey) && !event.shiftKey) {
        if (event.code === 'KeyC') {
          event.preventDefault()
          event.stopPropagation()
          onMatchCase(!matchCase)
          return
        }
        if (event.code === 'KeyW') {
          event.preventDefault()
          event.stopPropagation()
          onWholeWords(!wholeWords)
          return
        }
      }

      const pick = selected >= 0 ? shown[selected] : undefined

      if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
        if (shown.length === 0) return
        // In the description the arrows move the caret between its lines - the field grows to six of
        // them, and a line above the last could otherwise be reached only by mouse. The one-line field
        // has no line for the caret to go to, so there the arrows walk the list as in any search box.
        if (event.target instanceof HTMLTextAreaElement && event.target.value.length > 0) return
        event.preventDefault()
        event.stopPropagation()
        setSelected((current) => {
          const next = event.key === 'ArrowDown' ? current + 1 : current - 1
          return Math.max(0, Math.min(shown.length - 1, next))
        })
        return
      }

      if ((event.key === 'ArrowRight' || event.key === 'ArrowLeft') && pick) {
        // Only when the caret has nothing to do with the arrow itself - in a field it moves the caret,
        // which is what the person means by it there.
        const typing = event.target instanceof HTMLInputElement || event.target instanceof HTMLTextAreaElement
        const caretBusy = typing && (event.target as HTMLInputElement).value.length > 0
        if (caretBusy) return

        event.preventDefault()
        event.stopPropagation()
        unfold(pick.uuid, event.key === 'ArrowRight')
        return
      }

      if (event.key === 'Enter') {
        if (tab === 'ai') {
          // In the description Enter sends, the way it does in the field under the feed: a question for
          // the model is a message like any other. A new line is Shift+Enter, or Cmd/Ctrl+Enter - the
          // latter put in by hand, because a textarea does nothing with it on its own. Outside the field
          // Enter opens the selected hit.
          if (event.target === area.current) {
            if (event.shiftKey) return
            event.preventDefault()
            event.stopPropagation()
            if (event.metaKey || event.ctrlKey) {
              document.execCommand('insertText', false, '\n')
              return
            }
            if (!aiRunning) onRunAi()
            return
          }
          if (!pick) return
          event.preventDefault()
          event.stopPropagation()
          onPick(pick)
          return
        }

        if (pick) {
          event.preventDefault()
          event.stopPropagation()
          onPick(pick)
        }
      }
    }

    window.addEventListener('keydown', onKeyDown, true)
    return () => window.removeEventListener('keydown', onKeyDown, true)
  }, [onDismiss, onPick, onRunAi, shown, selected, tab, aiRunning, matchCase, wholeWords, onMatchCase, onWholeWords])

  // The selected hit follows the keys into view.
  useEffect(() => {
    if (selected < 0) return
    list.current?.querySelector<HTMLElement>(`[data-acc-hit="${selected}"]`)?.scrollIntoView({ block: 'nearest' })
  }, [selected])

  /**
   * The results as the list draws them: grouped by conversation wherever more than one can appear, and a
   * plain run of rows inside this chat, where the group would be one heading over everything.
   */
  const groups = useMemo<SearchGroup[]>(
    () => (tab === 'chat' ? [{ conversationId: '', title: '', at: 0, messages: 0, hits: [...shown] }] : groupByChat(shown)),
    [tab, shown],
  )

  const message = tab === 'ai' ? aiError : error
  const showList = tab !== 'ai' || !aiRunning

  return (
    <>
      <div className={s.scrim} onClick={onDismiss} />
      <div className={s.window} ref={window_} role="dialog" aria-modal="true" aria-label={t.search.title}>
        <div className={s.tabs} role="tablist">
          {SEARCH_TABS.map((one) => (
            <button
              key={one}
              type="button"
              role="tab"
              aria-selected={one === tab}
              className={`${s.tab} ${one === tab ? s.tabOn : ''} ${one === 'ai' ? s.tabAi : ''}`}
              onClick={() => onTab(one)}
            >
              {one === 'ai' ? <AiMark busy={aiRunning} /> : null}
              <span className={s.tabLabel}>{t.search.tabs[one]}</span>
              <TabCount tab={one} counts={counts} aiHits={aiHits.length} />
            </button>
          ))}
          <span className={s.tabsFill} />
          <button type="button" className={s.close} onClick={onClose} aria-label={t.common.close}>
            ×
          </button>
        </div>

        {tab === 'ai' ? (
          <div className={s.ask}>
            <div className={`${s.field} ${s.fieldAi} ${aiRunning ? s.fieldQuiet : ''}`}>
              <textarea
                ref={area}
                className={s.area}
                value={aiQuery}
                placeholder={t.search.aiPlaceholder}
                rows={AI_LINES_MIN}
                readOnly={aiRunning}
                onChange={aiKeys.onChange}
                onKeyDown={aiKeys.onKeyDown}
              />
              {aiQuery && !aiRunning ? (
                <ClearButton
                  className={s.clearAi}
                  onClick={() => {
                    if (area.current) aiKeys.replace(area.current, '')
                    area.current?.focus()
                  }}
                />
              ) : null}
              {aiRunning ? (
                <button type="button" className={s.cancel} onClick={onCancelAi}>
                  <SteadyWord word={t.search.cancel} other={t.search.find} />
                </button>
              ) : (
                <button type="button" className={s.run} onClick={onRunAi} disabled={!aiQuery.trim()}>
                  <SteadyWord word={t.search.find} other={t.search.cancel} />
                </button>
              )}
            </div>
            {aiRunning ? null : <span className={s.askNote}>{t.search.aiNote}</span>}
          </div>
        ) : (
          <div className={s.fieldRow}>
            <div className={`${s.field} ${query.trim() ? s.fieldLive : ''}`}>
              <Magnifier size={15} />
              <input
                ref={input}
                className={s.input}
                value={query}
                placeholder={t.search.placeholder}
                spellCheck={false}
                onChange={queryKeys.onChange}
                onKeyDown={queryKeys.onKeyDown}
              />
              {loading ? <span className={s.spinner} aria-hidden="true" /> : null}
              {query ? (
                <ClearButton
                  onClick={() => {
                    if (input.current) queryKeys.replace(input.current, '')
                    input.current?.focus()
                  }}
                />
              ) : null}
              <span className={s.switches}>
                <FieldSwitch on={matchCase} label={t.search.matchCase} onToggle={() => onMatchCase(!matchCase)}>
                  Cc
                </FieldSwitch>
                <FieldSwitch on={wholeWords} label={t.search.wholeWords} onToggle={() => onWholeWords(!wholeWords)}>
                  W
                </FieldSwitch>
              </span>
            </div>
          </div>
        )}

        {message ? (
          <div className={s.error}>
            <span className={s.errorLabel}>{t.search.failedLabel}</span>
            <span className={s.errorText}>{message}</span>
            <button type="button" className={s.errorRetry} onClick={tab === 'ai' ? onRunAi : () => onQuery(query)}>
              {t.search.retry}
            </button>
          </div>
        ) : null}

        {!showList ? (
          <Progress steps={aiSteps} seconds={aiSeconds} />
        ) : (
          <div className={s.list} ref={list}>
            {shown.length === 0 ? (
              <p className={s.empty}>{emptyLine(t, tab, { query, hasChat, answered: answered && fits, aiAnswered })}</p>
            ) : (
              groups.map((group) => (
                <div key={group.conversationId || 'here'} className={s.group}>
                  {group.title ? (
                    <div className={s.groupHead}>
                      <span className={s.groupTitle}>{group.title}</span>
                      <span className={s.groupMeta}>
                        {describeWhen(group.at)} · {t.history.messages(group.messages)}
                      </span>
                      <span className={s.groupRule} />
                    </div>
                  ) : null}

                  {group.hits.map((hit) => {
                    const index = shown.indexOf(hit)
                    return (
                      <HitRow
                        key={`${hit.conversationId}:${hit.uuid}`}
                        hit={hit}
                        index={index}
                        selected={index === selected}
                        withTime={tab === 'chat'}
                        unfolded={unfolded.has(hit.uuid)}
                        onUnfold={() => unfold(hit.uuid)}
                        onPick={() => onPick(hit)}
                      />
                    )
                  })}
                </div>
              ))
            )}
          </div>
        )}

        {/* The count and nothing else. A row of key caps stood here first - "⏎ open in chat", "→ whole
            message" - and was taken out on request: the keys work without being announced, and a line
            that lists them under every list read as clutter rather than help. */}
        <div className={s.foot}>
          <span className={s.tabsFill} />
          <span className={s.footStatus}>
            {footStatus(t, tab, { shown: shown.length, total, conversations: counts.conversations })}
          </span>
        </div>
      </div>
    </>
  )
}

/** What the model has done so far, while it is still doing it (see SearchProgressStep). */
const Progress = ({ steps, seconds }: { steps: readonly SearchProgressStep[]; seconds: number }) => {
  const t = useT()
  const tail = steps.slice(-STEPS_SHOWN)
  const hidden = steps.length - tail.length

  return (
    <div className={s.progress}>
      <div className={s.progressHead}>
        <span className={s.progressRing} aria-hidden="true" />
        <span className={s.progressText}>{t.search.aiSearching}</span>
        <span className={s.tabsFill} />
        <span className={s.progressMeta}>
          {t.search.steps.count(steps.length)} · {seconds}s
        </span>
      </div>

      <div className={s.steps}>
        {hidden > 0 ? <span className={s.stepPast}>+ {hidden}</span> : null}
        {tail.map((step, index) => {
          const current = index === tail.length - 1
          return (
            <span key={`${index}-${step.subject}`} className={current ? s.stepNow : s.stepDone}>
              <span className={s.stepMark}>{current ? '…' : '✓'}</span>
              {stepText(t, step)}
            </span>
          )
        })}
      </div>
    </div>
  )
}

const stepText = (t: Dict, step: SearchProgressStep): string => {
  if (step.kind === 'grep') return t.search.steps.grep(step.subject)
  if (step.kind === 'read') return t.search.steps.read(step.subject)
  if (step.kind === 'list') return t.search.steps.list
  return t.search.steps.other
}

/**
 * The number on a tab: what that scope found. Always there, at zero before anything was asked: a
 * badge that appears with the first answer widens its tab and pushes the next one along, and a row of
 * tabs that moves while somebody is typing into it reads as broken. Zero is dim; a find is lit.
 */
const TabCount = ({ tab, counts, aiHits }: { tab: SearchTab; counts: { chat: number; project: number }; aiHits: number }) => {
  const count = tab === 'ai' ? aiHits : counts[tab]
  return <span className={`${s.tabCount} ${count > 0 ? s.tabCountLive : ''}`}>{count}</span>
}

interface HitRowProps {
  hit: SearchHit
  index: number
  selected: boolean
  /** Inside one chat the time stands on the row; across chats it stands in the group's heading. */
  withTime: boolean
  unfolded: boolean
  onUnfold: () => void
  onPick: () => void
}

/**
 * One hit: who said it, the words that matched painted where they stand, and the way into it.
 *
 * Folded, the whole row is the button - pressing anywhere in it opens that message in its conversation,
 * and the pill on the right says so rather than being a second thing to aim at. Unfolded, the row stops
 * being a button and becomes text one can select, with the two actions written out under it: the words
 * are the point of unfolding, and a click that opens a conversation while somebody is dragging over a
 * sentence is a click nobody asked for.
 */
const HitRow = ({ hit, index, selected, withTime, unfolded, onUnfold, onPick }: HitRowProps) => {
  const t = useT()
  const pieces = useMemo(() => snippetPieces(hit.snippet, hit.spans), [hit])
  const speaker = hit.speaker === 'you' ? t.search.you : CLAUDE_LABEL

  // Under the words rather than beside them: unfolded, the message is as wide as the row, and a pair of
  // buttons on its right would either squeeze it or float away from what they act on.
  const actions = unfolded ? (
    <span className={s.hitActions}>
      <button type="button" className={s.openButton} onClick={onPick}>
        {t.search.openInChat}
        <Arrow />
      </button>
      <CopyText text={hit.text} />
    </span>
  ) : null

  const body = (
    <>
      <span className={hit.speaker === 'you' ? `${s.speaker} ${s.speakerYou}` : s.speaker}>{speaker}</span>
      <span className={s.hitText}>
        {unfolded ? (
          <>
            <span className={s.whole}>{hit.text}</span>
            <span className={s.hitMeta}>
              {hit.truncated ? <span>{t.search.chars(hit.text.length, hit.length)}</span> : null}
              {hit.truncated && hit.at > 0 ? <span className={s.metaDot}>·</span> : null}
              {hit.at > 0 ? <span>{describeWhen(hit.at)}</span> : null}
            </span>
          </>
        ) : (
          <>
            <span className={s.snippet}>
              {pieces.map((piece, at) => (piece.hit ? <mark key={at}>{piece.text}</mark> : <span key={at}>{piece.text}</span>))}
            </span>
            {withTime && hit.at > 0 ? <span className={s.hitMeta}>{describeWhen(hit.at)}</span> : null}
          </>
        )}
        {hit.reason ? (
          <span className={s.reason}>
            <Spark className={s.reasonMark} />
            {hit.reason}
          </span>
        ) : null}
        {actions}
      </span>
    </>
  )

  return (
    <div className={`${s.hit} ${selected ? s.hitSelected : ''} ${unfolded ? s.hitOpen : ''}`} data-acc-hit={index}>
      {unfolded ? (
        <div className={s.hitBody}>{body}</div>
      ) : (
        <button type="button" className={s.hitBody} onClick={onPick}>
          {body}
          <span className={s.openPill} aria-hidden="true">
            {t.search.openInChat}
            <Arrow />
          </span>
        </button>
      )}

      <button
        type="button"
        className={`${s.unfold} ${unfolded ? s.unfoldOpen : ''}`}
        onClick={onUnfold}
        aria-label={unfolded ? t.search.less : t.search.more}
        data-tooltip={unfolded ? t.search.less : t.search.more}
        data-tooltip-at="left"
      >
        <Chevron />
      </button>
    </div>
  )
}

/** The whole message into the clipboard - the one thing an unfolded hit offers besides opening it. */
const CopyText = ({ text }: { text: string }) => {
  const t = useT()
  const [copied, setCopied] = useState(false)

  useEffect(() => {
    if (!copied) return
    const timer = setTimeout(() => setCopied(false), 1400)
    return () => clearTimeout(timer)
  }, [copied])

  return (
    <button
      type="button"
      className={`${s.copyButton} ${copied ? s.copyDone : ''}`}
      onClick={() => {
        void navigator.clipboard?.writeText(text)
        setCopied(true)
      }}
    >
      {copied ? t.feed.copy.copied : t.search.copy}
    </button>
  )
}

/**
 * The × that empties a field, there only while there is something to empty. It takes the press without
 * taking the keyboard: a click first moves the focus onto the button, and handing it back afterwards is
 * a visible blink of the ring around the field.
 */
const ClearButton = ({ className, onClick }: { className?: string; onClick: () => void }) => {
  const t = useT()

  return (
    <button
      type="button"
      className={`${s.clear} ${className ?? ''}`}
      onMouseDown={(event) => event.preventDefault()}
      onClick={onClick}
      aria-label={t.search.clear}
      data-tooltip={t.search.clear}
      data-tooltip-at="bottom"
    >
      ×
    </button>
  )
}

/**
 * Find and Cancel are one press in two states, so they keep one width: the word that is not showing
 * stands in the button invisibly and holds the place. The two words differ in length in every language,
 * and the button changed size at the very moment it was pressed - a twitch under the finger, on the one
 * press the window has.
 */
const SteadyWord = ({ word, other }: { word: string; other: string }) => (
  <span className={s.steady}>
    <span>{word}</span>
    <span className={s.steadyGhost} aria-hidden="true">
      {other}
    </span>
  </span>
)

/**
 * One of the field's two switches - Match case and Whole words, the pair Find in Files has, lettered
 * the way it letters them. "Cc" and "W" are not words and are not translated; the tooltip says what
 * they do. The press does not take the keyboard from the field, like the × beside them.
 */
const FieldSwitch = ({ on, label, onToggle, children }: { on: boolean; label: string; onToggle: () => void; children: ReactNode }) => (
  <button
    type="button"
    className={`${s.switch} ${on ? s.switchOn : ''}`}
    aria-pressed={on}
    aria-label={label}
    data-tooltip={label}
    data-tooltip-at="bottom"
    onMouseDown={(event) => event.preventDefault()}
    onClick={onToggle}
  >
    {children}
  </button>
)

/** The other speaker, by name - a name is not translated and so does not live in the dictionaries. */
const CLAUDE_LABEL = 'Claude'

/** A four-pointed spark - the sign the panel uses for the model doing something of its own. */
const Spark = ({ className, busy = false }: { className?: string; busy?: boolean }) => (
  <svg
    className={`${className ?? ''} ${busy ? s.sparkBusy : ''}`}
    viewBox="0 0 16 16"
    width="12"
    height="12"
    aria-hidden="true"
    fill="currentColor"
  >
    <path d="M8 1.5q.9 4.6 5 5.5-4.1.9-5 5.5-.9-4.6-5-5.5 4.1-.9 5-5.5Z" />
    <path d="M12.8 10.2q.4 2 2.2 2.4-1.8.4-2.2 2.4-.4-2-2.2-2.4 1.8-.4 2.2-2.4Z" />
  </svg>
)

const AiMark = ({ busy }: { busy: boolean }) => <Spark className={s.tabMark} busy={busy} />

const Arrow = () => (
  <svg viewBox="0 0 16 16" width="11" height="11" aria-hidden="true" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M3.5 8h9M9 4.5 12.5 8 9 11.5" />
  </svg>
)

const Chevron = () => (
  <svg viewBox="0 0 16 16" width="12" height="12" aria-hidden="true" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round">
    <path d="M4 6l4 4 4-4" />
  </svg>
)

/**
 * What the list says when there is nothing in it - and there are five different reasons for that.
 *
 * Nothing about a query still out. The list shows the last answer while the next one is on its way, and
 * this line goes with the list: said while typing, "searching" swapped places with "nothing found" on
 * every keystroke, and the ring in the field already says a query is out. Before the first answer the
 * line is the one from before the typing - it is still true.
 */
const emptyLine = (
  t: Dict,
  tab: SearchTab,
  state: { query: string; hasChat: boolean; answered: boolean; aiAnswered: boolean },
): string => {
  if (tab === 'ai') return state.aiAnswered ? t.search.aiNothing : t.search.aiEmpty
  if (tab === 'chat' && !state.hasChat) return t.search.noChat
  if (!state.query.trim() || !state.answered) return t.search.typeToSearch
  return tab === 'chat' ? t.search.nothingHere : t.search.nothing
}

/** What the foot says: how much was found, or what pressing a result will do. */
const footStatus = (
  t: Dict,
  tab: SearchTab,
  state: { shown: number; total: number; conversations: number },
): string => {
  if (state.shown === 0) return ''
  if (tab === 'ai') return t.search.places(state.shown)
  if (state.total > state.shown) return t.search.showing(state.shown, state.total)

  // Across the project, in how many conversations they stand as well - the one number nothing else in
  // the window says. The counts themselves are on the tabs already.
  if (tab === 'project') return t.search.inChats(state.total, state.conversations)
  return t.search.results(state.total)
}

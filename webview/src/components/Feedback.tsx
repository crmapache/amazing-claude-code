import { useEffect, useRef } from 'react'
import type { FeedbackAttachment, FeedbackKind } from '../protocol'
import s from './sideMenu.module.css'
import shell from './shell.module.css'
import { useT } from '../i18n'
import type { Dict } from '../i18n/en'
import { useFieldHistory } from '../hooks/useFieldHistory'

/**
 * Telling the author something: a speech bubble beside the heart, and behind it a screen in the side menu
 * with a message, an address to answer to, files, and the debug report.
 *
 * Why it is a screen of the menu rather than a popup of its own: what belongs here is a form - several
 * fields, a list of files and a second level for the report - and the panel already has one place where a
 * form of that size fits and looks like the rest of the plugin (see Mcp, Remote). A dropdown sized for the
 * heart's two errands would have had to grow into a dialog nobody else in this panel uses.
 *
 * The promise this screen makes, and the reason the report has a preview at all: what gets attached is
 * technical only - versions, timings, the shape of what happened - with no text of the conversation, no
 * paths and no file names in it. That is not a policy written on a page; it is the whole string, shown
 * before it is sent, and the same string that travels (see FeedbackReport on the plugin's side).
 */

/** What each kind of feedback calls itself on the screen, and what it asks for. */
export const FEEDBACK_KINDS: { id: FeedbackKind; word: keyof Dict['feedback']['kinds'] }[] = [
  { id: 'bug', word: 'bug' },
  { id: 'idea', word: 'idea' },
  { id: 'hello', word: 'hello' },
]

/** How many files may go, how big each may be, and how much of it altogether. Checked again in the IDE. */
export const MAX_ATTACHMENTS = 10
export const MAX_ATTACHMENT_BYTES = 10 * 1024 * 1024
export const MAX_TOTAL_BYTES = 20 * 1024 * 1024

/** The longest message the screen accepts - past this it is no longer a note, and Telegram would cut it. */
export const MAX_MESSAGE_CHARS = 4000

/** Sizes as a person reads them: never "0.04 MB", and never "10.0 MB" for a round ten either. */
export const humanBytes = (bytes: number): string => {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`

  const megabytes = bytes / (1024 * 1024)
  return `${megabytes < 10 || megabytes % 1 >= 0.05 ? megabytes.toFixed(1) : Math.round(megabytes)} MB`
}

/**
 * A file name that has to fit a 350px panel. Cut in the middle rather than at the end: the beginning says
 * which file it is and the end says what kind, and an ellipsis that eats the extension leaves a row that
 * could be anything.
 */
export const shortName = (name: string, limit = 30): string =>
  name.length <= limit ? name : `${name.slice(0, limit - 13)}…${name.slice(-12)}`

/** A conversation's name beside a label: cut at the end, because a tab is recognised by how it begins. */
export const shortTitle = (title: string, limit = 34): string =>
  title.length <= limit ? title : `${title.slice(0, limit - 1).trimEnd()}…`

/** What the panel holds while the screen is open - it lives above the screen so that stepping into the
 *  report's preview and back does not throw away a half-written message (the screens are unmounted while
 *  they are not looked at, see App). */
export interface FeedbackDraft {
  kind: FeedbackKind
  text: string
  email: string
  /**
   * Whether the address in the field is the person's doing in this visit.
   *
   * Without this, an empty field is indistinguishable from a field nobody has filled in yet - and the IDE
   * sends the remembered address along with every update of the screen's state (picking a file, for one).
   * Somebody who deliberately cleared the field to write in anonymously would have it quietly refilled
   * behind them, and sent.
   */
  emailTouched: boolean
  /** Whether the report goes along. On by default: a bug without one is usually unanswerable. */
  logs: boolean
  attachments: FeedbackAttachment[]
  /** A word from the IDE about the last pick - a file too big, or too many of them. */
  note: string | null
  /** The report itself, once it has been asked for. Null means "not fetched yet". */
  report: string | null
  sending: boolean
  /** How the last attempt went - see [FeedbackOutcome]. */
  message: FeedbackOutcome | null
}

/**
 * What happened to the last report, as what happened rather than as a sentence about it.
 *
 * The sentence is put together where it is drawn (see [outcomeText]). It cannot be put together where
 * this is set: that handler is subscribed once for the panel's whole life, so a sentence built inside it
 * is built with the dictionary of the very first render - English, always, because the language arrives
 * after it. The same rule the voice errors follow (see feed/voice.ts).
 */
export type FeedbackOutcome =
  | { kind: 'sent' }
  /** It went, but something was left behind, and the IDE says what. */
  | { kind: 'partly'; note: string }
  /** It did not go. [said] is the IDE's own account of why, when it had one. */
  | { kind: 'failed'; said?: string }

export const outcomeText = (t: Dict, outcome: FeedbackOutcome): string => {
  switch (outcome.kind) {
    case 'sent':
      return t.feedback.sent
    case 'partly':
      return t.feedback.sentPartly(outcome.note)
    default:
      return outcome.said || t.feedback.notSent
  }
}

export const emptyFeedback = (): FeedbackDraft => ({
  kind: 'bug',
  text: '',
  email: '',
  emailTouched: false,
  logs: true,
  attachments: [],
  note: null,
  report: null,
  sending: false,
  message: null,
})

/** Whether this draft may be sent, and why not when it may not. */
export const feedbackProblem = (t: Dict, draft: FeedbackDraft): string | null => {
  if (!draft.text.trim()) return t.feedback.problems.empty
  if (draft.text.length > MAX_MESSAGE_CHARS) return t.feedback.problems.tooLong(MAX_MESSAGE_CHARS)
  if (draft.attachments.length > MAX_ATTACHMENTS) return t.feedback.problems.tooMany(MAX_ATTACHMENTS)
  if (totalBytes(draft.attachments) > MAX_TOTAL_BYTES) {
    return t.feedback.problems.tooHeavy(humanBytes(MAX_TOTAL_BYTES))
  }
  return null
}

const totalBytes = (attachments: FeedbackAttachment[]): number =>
  attachments.reduce((sum, file) => sum + file.bytes, 0)

/**
 * Whether the debug report has anything to describe for this kind of message.
 *
 * A bug only. The report is an account of what went wrong in the tab that is open - versions, timings,
 * failures - and an idea or a hello has no such moment behind it: what would travel is a technical dump
 * of a conversation that was working fine, sent for nothing. So the switch is held off and out of reach
 * on those two kinds rather than merely starting off, which would still let it through for anybody who
 * turned it on while writing a bug and then changed their mind about what they were writing.
 */
export const logsFit = (kind: FeedbackKind): boolean => kind === 'bug'

/** What actually goes along: the switch, but only where the report means something (see logsFit). */
export const feedbackLogs = (draft: FeedbackDraft): boolean => draft.logs && logsFit(draft.kind)

interface FeedbackButtonProps {
  /** The side rail's variant: no frame of its own, like the heart's (see Thanks.tsx). */
  rail?: boolean
  /**
   * Compact's variant: level with the selectors it shares a row with, exactly as the heart beside it is
   * (see ThanksButton.withSelectors).
   *
   * It used to stand a row below, among the paperclip and the slash, because compact's row of selectors
   * could not give up the width for it. It can now: the MODE button stopped spelling out "PERMISSION
   * MODE" and gave back more room than this button takes.
   */
  withSelectors?: boolean
  onOpen: () => void
}

export const FeedbackButton = ({ rail = false, withSelectors = false, onOpen }: FeedbackButtonProps) => {
  const t = useT()

  return (
  <button
    type="button"
    className={`${shell.feedback} ${rail ? shell.feedbackRail : ''} ${withSelectors ? shell.feedbackLevel : ''}`}
    /* The panel's own tooltip rather than a title, unlike the heart beside it: this button opens the side
       menu rather than a popup above itself, so there is nothing for the hint to cover. */
    data-tooltip={t.feedback.button}
    data-tooltip-at="top"
    aria-label={t.feedback.button}
    onClick={onOpen}
  >
    <Bubble />
  </button>
  )
}

/** An outlined bubble rather than a solid one: beside a solid heart, a second filled shape would read as a
 *  pair of indicators rather than as two different errands. */
const Bubble = () => (
  <svg className={shell.feedbackIcon} viewBox="0 0 16 16" aria-hidden="true">
    <path
      d="M3.2 3.2h9.6a1.6 1.6 0 0 1 1.6 1.6v4.8a1.6 1.6 0 0 1-1.6 1.6H6.6l-2.7 2.2v-2.2h-.7A1.6 1.6 0 0 1 1.6 9.6V4.8a1.6 1.6 0 0 1 1.6-1.6z"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.3"
      strokeLinejoin="round"
    />
  </svg>
)

interface FeedbackProps {
  draft: FeedbackDraft
  /**
   * What the tab the report will describe is called.
   *
   * Named on the screen rather than left to be assumed: the report is about one conversation - the one
   * open right now - and "attach debug logs" says nothing about which. Somebody who hit a bug in one tab,
   * opened another to look something up, and then wrote in would have attached the wrong one and never
   * known.
   */
  conversation: string
  onChange: (change: Partial<FeedbackDraft>) => void
  onAttach: () => void
  onDetach: (id: string) => void
  onPreview: () => void
  onSend: () => void
}

export const Feedback = ({ draft, conversation, onChange, onAttach, onDetach, onPreview, onSend }: FeedbackProps) => {
  const t = useT()
  const kind = FEEDBACK_KINDS.find((option) => option.id === draft.kind) ?? FEEDBACK_KINDS[0]
  const logsHere = logsFit(draft.kind)
  const logsOn = feedbackLogs(draft)
  const total = totalBytes(draft.attachments)
  const overflowing = draft.attachments.length > MAX_ATTACHMENTS || total > MAX_TOTAL_BYTES
  const problem = feedbackProblem(t, draft)

  const emailKeys = useFieldHistory(draft.email, (email) => onChange({ email, emailTouched: true }))

  return (
    <div className={s.screen}>
      {draft.message ? (
        <div
          className={
            draft.message.kind === 'sent' ? `${s.message} ${s.messageOk}` : `${s.message} ${s.messageBad}`
          }
        >
          {outcomeText(t, draft.message)}
        </div>
      ) : null}

      <div className={s.tabs}>
        {FEEDBACK_KINDS.map((option) => (
          <button
            key={option.id}
            type="button"
            className={`${s.tab} ${draft.kind === option.id ? s.tabOn : ''}`}
            onClick={() => onChange({ kind: option.id, message: null })}
          >
            {t.feedback.kinds[option.word].label}
          </button>
        ))}
      </div>

      <div className={s.field}>
        <Grower
          className={s.textarea}
          value={draft.text}
          placeholder={t.feedback.kinds[kind.word].placeholder}
          maxLength={MAX_MESSAGE_CHARS}
          onChange={(text) => onChange({ text, message: null })}
        />
      </div>

      <div className={s.field}>
        <span className={s.screenLabel}>{t.feedback.email}</span>
        <input
          className={s.input}
          type="email"
          spellCheck={false}
          placeholder={t.feedback.emailOptional}
          value={draft.email}
          onChange={emailKeys.onChange}
          onKeyDown={emailKeys.onKeyDown}
        />
        <span className={s.screenNote}>
          Only so there is somewhere to answer. Leave it empty and the message still arrives - it just ends
          the conversation there.
        </span>
      </div>

      <div className={s.field}>
        <div className={s.screenGroup}>
          <span className={s.screenLabel}>{t.feedback.attachments}</span>
          <span className={s.screenGroupHint}>
            up to {MAX_ATTACHMENTS} files · {humanBytes(MAX_ATTACHMENT_BYTES)} each
          </span>
        </div>

        {draft.attachments.map((file) => (
          <div key={file.id} className={s.attachRow}>
            <span className={s.attachName} title={file.name}>
              {shortName(file.name)}
            </span>
            <span className={s.attachSize}>{humanBytes(file.bytes)}</span>
            <button
              type="button"
              className={s.attachDrop}
              aria-label={t.feedback.removeFile(file.name)}
              onClick={() => onDetach(file.id)}
            >
              ×
            </button>
          </div>
        ))}

        {draft.note ? <span className={`${s.screenNote} ${s.attachNote}`}>{draft.note}</span> : null}

        <div className={s.attachFoot}>
          <button
            type="button"
            className={s.button}
            disabled={draft.attachments.length >= MAX_ATTACHMENTS}
            onClick={onAttach}
          >
            {t.feedback.addFiles}
          </button>
          {draft.attachments.length > 0 ? (
            <span className={`${s.attachTotal} ${overflowing ? s.attachTotalBad : ''}`}>
              {t.feedback.attachTotal(
                draft.attachments.length,
                MAX_ATTACHMENTS,
                humanBytes(total),
                humanBytes(MAX_TOTAL_BYTES),
              )}
            </span>
          ) : null}
        </div>
      </div>

      {/*
        * Left standing, off and unclickable, on an idea or a hello rather than taken off the screen: the
        * row is also where the promise about the report is written, and a promise that disappears on two
        * of the three kinds has to be found again to be believed. Its state is derived rather than
        * stored, so coming back to the bug brings back whatever the person had chosen there.
        */}
      <button
        type="button"
        className={`${s.switchRow} ${logsHere ? '' : s.switchRowMoot}`}
        aria-pressed={logsOn}
        disabled={!logsHere}
        onClick={() => onChange({ logs: !draft.logs })}
      >
        <span className={s.switchText}>
          <span className={s.switchLabel}>{t.feedback.logs}</span>
          <span className={s.switchHint}>
            {logsHere ? (
              <>
                {conversation ? (
                  <>
                    {t.feedback.logsFromTab('')}
                    <span className={s.switchTab}>{shortTitle(conversation)}</span> -{' '}
                  </>
                ) : (
                  t.feedback.logsFromOpenTab
                )}
                {t.feedback.logsWhat}
              </>
            ) : (
              t.feedback.logsOnlyBug
            )}
          </span>
        </span>
        <span className={`${s.switchTrack} ${logsOn ? s.switchTrackOn : ''}`}>
          <span className={`${s.switchKnob} ${logsOn ? s.switchKnobOn : ''}`} />
        </span>
      </button>

      {logsOn ? (
        <button type="button" className={s.linkRow} onClick={onPreview}>
          {t.feedback.seeWhat}
        </button>
      ) : null}

      <div className={s.formActions}>
        {/*
         * The hint hangs on the wrapper rather than on the button, and that is the whole reason the
         * wrapper exists: a disabled button fires no pointer events at all, so the panel's tooltips never
         * see it and a greyed-out Send would sit there with no explanation - which reads as broken. The
         * wrapper is not disabled, so the pointer reaches it either way.
         */}
        <span className={s.tooltipHost} data-tooltip={problem ?? undefined} data-tooltip-at="top">
          <button
            type="button"
            className={`${s.button} ${s.buttonPrimary}`}
            disabled={draft.sending || problem !== null}
            onClick={onSend}
          >
            {draft.sending ? t.feedback.sending : t.feedback.send}
          </button>
        </span>
      </div>
    </div>
  )
}

/**
 * The message field. A real textarea - the first one in this panel, where the input is a contentEditable
 * that carries chips (see Composer): nothing here needs chips, and a native field brings line breaks and
 * selection with it rather than having them written again. The word before the caret and the undo history
 * it does not bring inside the IDE - those are lent by useFieldHistory, as to every plain field here.
 *
 * It grows with what is typed instead of scrolling inside a fixed box: this is a form one fills in and
 * looks over, and a five-line window over a twenty-line message hides the half already written.
 */
const Grower = ({
  className,
  value,
  placeholder,
  maxLength,
  onChange,
}: {
  className: string
  value: string
  placeholder: string
  maxLength: number
  onChange: (value: string) => void
}) => {
  const field = useRef<HTMLTextAreaElement>(null)

  useEffect(() => {
    const node = field.current
    if (!node) return

    // Reset first: the height has to be able to shrink again when text is deleted, and scrollHeight of an
    // already-tall box never reports less than it is.
    node.style.height = 'auto'
    node.style.height = `${node.scrollHeight}px`
  }, [value])

  const keys = useFieldHistory(value, onChange)

  return (
    <textarea
      ref={field}
      className={className}
      value={value}
      placeholder={placeholder}
      maxLength={maxLength}
      spellCheck
      rows={4}
      onChange={keys.onChange}
      onKeyDown={keys.onKeyDown}
    />
  )
}

/**
 * The report, in full, before it goes anywhere.
 *
 * Plain text in the mono font and nothing else: any prettier a rendering would invite the question of what
 * it left out, and the whole worth of this screen is that it left out nothing.
 */
export const FeedbackLog = ({
  text,
  conversation,
  onCopy,
}: {
  text: string | null
  conversation: string
  onCopy: () => void
}) => {
  const t = useT()

  return (
  <div className={s.screen}>
    <span className={s.screenNote}>{t.feedback.reportNote(conversation)}</span>

    {text === null ? (
      <div className={s.screenEmpty}>{t.feedback.building}</div>
    ) : (
      <>
        <pre className={s.logText}>{text}</pre>
        <div className={s.formActions}>
          <button type="button" className={s.button} onClick={onCopy}>
            {t.feedback.copy}
          </button>
        </div>
      </>
    )}
  </div>  )
}

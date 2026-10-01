import { useEffect, useMemo, useRef } from 'react'
import { parseParagraphs } from '../feed/markdown'
import type { SideExchange, SideThread } from '../feed/side'
import { formatDuration } from '../feed/tools'
import { useTicking } from '../hooks/useTicking'
import { useT } from '../i18n'
import { CopyButton } from './items/CopyButton'
import { Markdown } from './items/Markdown'
import f from './feed.module.css'
import c from './sideQuestion.module.css'

interface SideQuestionCardProps {
  thread: SideThread
  onCancel: (id: string) => void
  /** Asks the same question again in its own place - for one that ended without an answer. */
  onAskAgain: (exchange: SideExchange) => void
  /** Puts the question into the field as an ordinary message, where Claude has its tools. */
  onAskInChat: (question: string) => void
  onClose: () => void
  onOpenLink: (url: string) => void
}

/**
 * The side questions of one tab - `/btw` - in a card over the field (see feed/side).
 *
 * Over the field rather than in the feed, and on purpose: the agent never sees these exchanges and the
 * CLI writes none of them into the transcript, so drawn as messages they would claim a place in a
 * conversation they are not part of - and the feed, still growing under a turn at work, would push them
 * out of sight a second after they arrived. Here the card stays put while the work goes on above it.
 *
 * Its frame says the same thing in words: the title, "Claude doesn't see this" beside it, "Not saved to
 * the chat" under it. A way into the conversation proper is one press away - the question moved into the
 * field as an ordinary message, for the cases where the answer is "that needs a look at the files".
 */
export const SideQuestionCard = ({ thread, onCancel, onAskAgain, onAskInChat, onClose, onOpenLink }: SideQuestionCardProps) => {
  const t = useT()
  const body = useRef<HTMLDivElement>(null)
  const last = thread.exchanges.at(-1)

  // A new question and a new answer both land at the bottom, and that is where the eye goes: the newest
  // exchange is the one being read. Keyed on what changed there rather than on every render, so reading
  // back up the thread is not yanked down by a second ticking past.
  const lastMark = last ? `${last.id}:${last.state}` : ''
  useEffect(() => {
    const node = body.current
    if (node) node.scrollTop = node.scrollHeight
  }, [lastMark, thread.open])

  if (!thread.open) return null

  return (
    <section className={c.card} aria-label={t.side.title}>
      <div className={c.head}>
        <span className={c.label}>{t.side.title}</span>
        <span className={c.unseen}>{t.side.unseen}</span>
        <div className={c.spacer} />
        <button type="button" className={c.close} onClick={onClose} aria-label={t.side.close} data-tooltip={t.side.close}>
          ✕
        </button>
      </div>

      <div className={c.body} ref={body}>
        {thread.exchanges.length === 0 ? (
          <p className={c.hint}>{t.side.hint}</p>
        ) : (
          thread.exchanges.map((exchange) => (
            <Exchange
              key={exchange.id}
              exchange={exchange}
              onCancel={onCancel}
              onAskAgain={onAskAgain}
              onOpenLink={onOpenLink}
            />
          ))
        )}
      </div>

      {last ? (
        <div className={c.foot}>
          <span className={c.notSaved}>{t.side.notSaved}</span>
          <div className={c.spacer} />
          <button
            type="button"
            className={c.link}
            onClick={() => onAskInChat(last.question)}
            data-tooltip={t.side.askInChatHint}
            data-tooltip-at="top"
          >
            {t.side.askInChat}
          </button>
        </div>
      ) : null}
    </section>
  )
}

const Exchange = ({
  exchange,
  onCancel,
  onAskAgain,
  onOpenLink,
}: {
  exchange: SideExchange
  onCancel: (id: string) => void
  onAskAgain: (exchange: SideExchange) => void
  onOpenLink: (url: string) => void
}) => {
  const t = useT()
  const answered = exchange.state === 'answered' && exchange.text ? exchange.text : null
  const paragraphs = useMemo(() => (answered ? parseParagraphs(answered) : []), [answered])

  return (
    <div className={c.exchange}>
      <div className={c.question}>
        <span className={c.mark} aria-hidden="true">
          ›
        </span>
        <span className={c.questionText}>{exchange.question}</span>
        {answered ? <CopyButton text={answered} className={f.textAction} title={t.side.copy} /> : null}
      </div>

      {exchange.state === 'asking' ? <Asking exchange={exchange} onCancel={onCancel} /> : null}

      {answered ? (
        <div className={c.answer}>
          <Markdown paragraphs={paragraphs} onOpenLink={onOpenLink} />
          {exchange.notice ? <p className={c.notice}>{exchange.notice}</p> : null}
        </div>
      ) : null}

      {exchange.state !== 'asking' && !answered ? <Unanswered exchange={exchange} onAskAgain={onAskAgain} /> : null}
    </div>
  )
}

/** Still coming: how long it has been, or the CLI's retry when the API is failing, and a way to give up. */
const Asking = ({ exchange, onCancel }: { exchange: SideExchange; onCancel: (id: string) => void }) => {
  const t = useT()
  const now = useTicking(true)
  const { retry } = exchange

  const line = retry
    ? t.side.retrying(retry.attempt, retry.maxRetries, Math.max(0, Math.ceil((retry.at + retry.delayMs - now) / 1000)))
    : `${t.side.thinking} · ${formatDuration(now - exchange.askedAt).replace(/\.\ds$/, 's')}`

  return (
    <div className={c.asking} role="status">
      <span className={retry ? `${c.pulse} ${c.pulseWarn}` : c.pulse} aria-hidden="true" />
      <span className={c.askingText}>{line}</span>
      <button type="button" className={c.link} onClick={() => onCancel(exchange.id)}>
        {t.side.cancel}
      </button>
    </div>
  )
}

/** Ended without an answer of the model's - why, in a line, and the same question asked again. */
const Unanswered = ({ exchange, onAskAgain }: { exchange: SideExchange; onAskAgain: (exchange: SideExchange) => void }) => {
  const t = useT()

  const headline =
    exchange.state === 'cancelled'
      ? t.side.cancelled
      : exchange.state === 'empty'
        ? t.side.empty
        : t.side.failed[exchange.reason ?? 'refused']
  // What the CLI itself said, when it said something: its placeholder for `empty`, its error for a refusal.
  // English, as the CLI writes it - one line under ours rather than instead of it.
  const detail = exchange.state === 'empty' ? exchange.text : exchange.reason === 'refused' ? exchange.message : undefined

  return (
    <div className={exchange.state === 'cancelled' ? c.unanswered : `${c.unanswered} ${c.unansweredBad}`}>
      <div className={c.unansweredText}>
        <span>{headline}</span>
        {detail ? <span className={c.detail}>{detail}</span> : null}
      </div>
      <button type="button" className={c.link} onClick={() => onAskAgain(exchange)}>
        {t.side.askAgain}
      </button>
    </div>
  )
}

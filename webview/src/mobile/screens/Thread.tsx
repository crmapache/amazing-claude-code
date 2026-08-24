import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import { AgentStreamView } from '../../components/AgentStreamView'
import { Feed } from '../../components/Feed'
import { StreamSwitcher } from '../../components/StreamSwitcher'
import { useCardState } from '../../hooks/useCardState'
import type { PanelState } from '../../feed/panelState'
import { buildAgentTabs, mainStatusOf, streamStatus } from '../../feed/streamStatus'
import type { TaskItem } from '../../feed/types'
import { Back } from './Back'
import m from '../mobile.module.css'

/** Mobile has no "clear finished agents" action, so every task the session ever ran stays on the strip. */
const NO_HIDDEN_TASKS: ReadonlySet<string> = new Set()

interface ThreadProps {
  feed: PanelState
  title: string
  project: string
  connected: boolean
  /** Nothing about this conversation has arrived yet - see MobileFeed.loaded. */
  loading: boolean
  onSend: (text: string) => void
  onStop: () => void
  onStopTask: (taskId: string) => void
  /** A page further back than the EARLIER placeholder reaches - absent once there is nothing further. */
  onLoadEarlier?: () => void
  onDecide: () => void
  onBack: () => void
}

/**
 * One conversation, read on a phone.
 *
 * The feed is the panel's own component with the panel's own cards - not a mobile rendition of them.
 * The plainest reason is the best one: a phone showing a conversation that reads differently from the
 * one on the desk is worse than a phone showing nothing at all.
 *
 * The input is a textarea rather than the panel's editable field. Everything the editable one buys -
 * chips woven into the text that the caret steps over - is an affordance of a keyboard with arrow keys,
 * and a phone has neither.
 */
export const Thread = ({
  feed,
  title,
  project,
  connected,
  loading,
  onSend,
  onStop,
  onStopTask,
  onLoadEarlier,
  onDecide,
  onBack,
}: ThreadProps) => {
  const [draft, setDraft] = useState('')
  const [loadingEarlier, setLoadingEarlier] = useState(false)
  const [activeStream, setActiveStream] = useState('main')
  const [queue, setQueue] = useState<{ id: string; text: string }[]>([])
  const bottom = useRef<HTMLDivElement>(null)
  const field = useRef<HTMLTextAreaElement>(null)

  /**
   * The queue works itself through the same way the panel's does: one message at a time, each one only
   * once the turn before it has genuinely ended. `sent` marks that this screen has already handed the
   * front of the queue to onSend and is waiting for the run to confirm it started - without it, a status
   * that takes a moment to flip back to "running" would let this effect fire again on the next render and
   * hand over a second message before the first has even begun.
   */
  const sent = useRef(false)
  useEffect(() => {
    if (feed.status === 'running') {
      sent.current = false
      return
    }
    if (sent.current || queue.length === 0) return

    sent.current = true
    setQueue((current) => current.slice(1))
    onSend(queue[0]!.text)
  }, [feed.status, queue, onSend])

  /**
   * The field grows with what is in it.
   *
   * A textarea does not do this by itself: `rows` is a starting height and nothing more, so a second
   * line was written into a box the size of one and the first line scrolled out of sight - a person
   * typing could not see the beginning of their own message. Measured before the paint rather than
   * after it, or the wrong height is on screen for a frame on every keystroke.
   */
  useLayoutEffect(() => {
    const node = field.current
    if (!node) return

    // Back to nothing first: scrollHeight of an element already tall enough for its text is that
    // height, so without this the field could only ever grow.
    node.style.height = 'auto'
    node.style.height = `${node.scrollHeight}px`
  }, [draft])

  // A page just loaded further up the conversation counts as an items-length change too, and jumping to
  // the bottom over it would undo the very thing tapping the placeholder was for - reading what came
  // before. This runs in the same commit as the scroll effect below, on its same trigger, and clears the
  // flag before that effect's own guard is read on the render after this one.
  useEffect(() => {
    if (loadingEarlier) setLoadingEarlier(false)
  }, [feed.items.length])

  // Following the answer as it arrives is the ordinary case on a phone: it is being watched rather than
  // worked in.
  useEffect(() => {
    if (loadingEarlier) return
    bottom.current?.scrollIntoView({ block: 'end' })
  }, [feed.items.length, feed.streamingText])

  /** The panel's own card state - what is expanded, which plans have been answered on this screen. */
  const cards = useCardState()

  const waiting = feed.items.some((item) => item.kind === 'perm' && item.decision === null)

  /**
   * The same chip strip as the panel's - which subagents and background commands are alive right now,
   * kept above the feed rather than only visible by scrolling to wherever they happen to sit in it (see
   * StreamSwitcher.tsx). Built from the exact same shared feed state, so a phone reads it identically to
   * the desk - see feed/streamStatus.ts.
   */
  const agentTabs = useMemo(
    () => buildAgentTabs(feed, cards.answeredAsks, NO_HIDDEN_TASKS),
    [feed, cards.answeredAsks],
  )
  const mainStatus = useMemo(() => mainStatusOf(feed, cards.answeredAsks), [feed, cards.answeredAsks])
  const activeTask = feed.items.find((item): item is TaskItem => item.kind === 'task' && item.id === activeStream)
  const resolvedStream = activeStream === 'main' || activeTask ? activeStream : 'main'

  return (
    <>
      <header className={m.header}>
        <Back onClick={onBack} />
        <span className={m.headerTitle}>{title}</span>
        <span className={m.headerMeta}>{project}</span>
      </header>

      {waiting && (
        <button type="button" className={m.waitingBanner} onClick={onDecide}>
          Waiting for you - answer it
        </button>
      )}

      <StreamSwitcher
        tabs={agentTabs}
        background={feed.background}
        mainStatus={mainStatus}
        active={resolvedStream}
        onPick={setActiveStream}
        onStop={(task) => {
          if (window.confirm(`Stop ${task.subject || task.title}?`)) onStopTask(task.id)
        }}
      />

      <div className={m.thread}>
        {resolvedStream !== 'main' ? (
          <AgentStreamView item={activeTask} />
        ) : loading && feed.items.length === 0 ? (
          <p className={m.empty}>Loading the conversation…</p>
        ) : (
          <Feed
            items={feed.items}
            streamingText={feed.streamingText}
            streamingId={feed.streamingId}
            streamingThinking={feed.streamingThinking}
            streaming={feed.status === 'running'}
            streamStatus={streamStatus(feed, cards)}
            statusStalled={feed.retry !== undefined}
            cards={cards}
            // Answering a plan happens on the decision screen, where the buttons are the size of a thumb.
            onPlanDecision={() => onDecide()}
            onDismissError={() => {}}
            // A link from the agent's answer opens here rather than on the machine with the IDE: asking
            // that machine to open a URL is a small primitive of remote control, and it is refused over
            // the wire anyway (see RemoteCommands).
            onOpenLink={(url) => window.open(url, '_blank', 'noopener,noreferrer')}
            onLoadEarlier={
              onLoadEarlier && !loadingEarlier
                ? () => {
                    setLoadingEarlier(true)
                    onLoadEarlier()
                  }
                : undefined
            }
          />
        )}
        <div ref={bottom} />
      </div>

      {/* Above the field, like the panel's own Queue - what will fire, in order, once the run in
          progress ends. */}
      {queue.length > 0 && (
        <div className={m.queueList}>
          {queue.map((item) => (
            <div key={item.id} className={m.queueRow}>
              <span className={m.queueText}>{item.text}</span>
              <button
                type="button"
                className={m.queueRemove}
                aria-label="Remove from the queue"
                onClick={() => setQueue((current) => current.filter((one) => one.id !== item.id))}
              >
                ×
              </button>
            </div>
          ))}
        </div>
      )}

      <footer className={m.composer}>
        <textarea
          ref={field}
          className={m.composerInput}
          value={draft}
          rows={1}
          placeholder={connected ? 'Say something…' : 'Reconnecting…'}
          enterKeyHint="send"
          onChange={(event) => setDraft(event.target.value)}
        />

        {feed.status === 'running' ? (
          <>
            {/* Send itself stays for the current turn alone - steering it mid-run from a phone is not
                offered, only waiting a turn out or stopping it. */}
            <button
              type="button"
              className={m.buttonPrimary}
              disabled={!draft.trim() || !connected}
              onClick={() => {
                setQueue((current) => [...current, { id: `q-${Date.now()}`, text: draft.trim() }])
                setDraft('')
              }}
            >
              Queue
            </button>
            <button type="button" className={m.buttonSecondary} onClick={onStop}>
              Stop
            </button>
          </>
        ) : (
          <button
            type="button"
            className={m.buttonPrimary}
            disabled={!draft.trim() || !connected}
            onClick={() => {
              onSend(draft.trim())
              setDraft('')
            }}
          >
            Send
          </button>
        )}
      </footer>
    </>
  )
}

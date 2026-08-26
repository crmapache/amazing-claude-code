import { useEffect, useMemo, useState } from 'react'
import { AgentStreamView } from '../../components/AgentStreamView'
import { Feed } from '../../components/Feed'
import { StreamSwitcher } from '../../components/StreamSwitcher'
import { useCardState } from '../../hooks/useCardState'
import { useNow } from '../../hooks/useNow'
import { contextOf } from '../../feed/build'
import type { PanelState } from '../../feed/panelState'
import { buildAgentTabs, mainStatusOf, streamStatus } from '../../feed/streamStatus'
import { countSessionImages } from '../../feed/tokens'
import type { TaskItem } from '../../feed/types'
import type { ProjectFacts } from '../facts'
import { Back } from './Back'
import { Composer, type OutgoingPrompt } from './Composer'
import m from '../mobile.module.css'

/** Mobile has no "clear finished agents" action, so every task the session ever ran stays on the strip. */
const NO_HIDDEN_TASKS: ReadonlySet<string> = new Set()

/** One message waiting its turn - the phone's own copy of the panel's Queue. */
interface Queued extends OutgoingPrompt {
  id: string
}

interface ThreadProps {
  feed: PanelState
  title: string
  project: string
  /** What this phone knows about the project the conversation is in - see mobile/facts. */
  facts: ProjectFacts
  connected: boolean
  /** Nothing about this conversation has arrived yet - see MobileFeed.loaded. */
  loading: boolean
  onSend: (prompt: OutgoingPrompt) => void
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
 * Everything below the feed lives in Composer, which is where the difference between the two screens
 * genuinely is - a thumb, no hover, and a keyboard that owns the bottom third of the screen.
 */
export const Thread = ({
  feed,
  title,
  project,
  facts,
  connected,
  loading,
  onSend,
  onStop,
  onStopTask,
  onLoadEarlier,
  onDecide,
  onBack,
}: ThreadProps) => {
  /**
   * The IDE's clock rather than this device's - the counter beside "Claude is thinking" counts from a
   * moment that machine stamped (see mobile/clock.ts and hooks/useNow).
   */
  const now = useNow()

  const [loadingEarlier, setLoadingEarlier] = useState(false)
  const [activeStream, setActiveStream] = useState('main')
  const [queue, setQueue] = useState<Queued[]>([])

  /**
   * The queue works itself through the same way the panel's does: one message at a time, each one only
   * once the turn before it has genuinely ended. `sent` marks that this screen has already handed the
   * front of the queue to onSend and is waiting for the run to confirm it started - without it, a status
   * that takes a moment to flip back to "running" would let this effect fire again on the next render and
   * hand over a second message before the first has even begun.
   */
  const [sent, setSent] = useState(false)
  useEffect(() => {
    if (feed.status === 'running') {
      if (sent) setSent(false)
      return
    }
    if (sent || queue.length === 0) return

    setSent(true)
    setQueue((current) => current.slice(1))
    onSend(queue[0]!)
  }, [feed.status, queue, sent, onSend])

  // The page asked for has arrived - the placeholder can be tapped again.
  useEffect(() => {
    if (loadingEarlier) setLoadingEarlier(false)
  }, [feed.items.length])

  /*
   * Following the answer as it arrives is the feed's own business here, exactly as it is in the panel
   * (see Feed.tsx): it holds the bottom until the person scrolls up and lets go of it the moment they do.
   *
   * This screen used to do the following itself, with a scrollIntoView on every chunk of the arriving
   * text - and that is what made a phone impossible to read on while an answer was printing: a finger
   * moving up was overruled within a fraction of a second, and the two scrollers - this screen's and the
   * feed's own - shuddered against each other the whole time. Scrolling belongs to one of them, and the
   * one that knows whether the person is still at the bottom is the feed.
   */

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

  /**
   * The context this conversation has taken, by the panel's own arithmetic: the figure the CLI reports
   * when it has one, and the fallback of the model's window size when it does not (see contextOf).
   */
  const context = useMemo(() => contextOf(feed, facts.contextWindow), [feed, facts.contextWindow])

  /**
   * How many images have already gone into this conversation - from this phone, from another, from the
   * desk. The numbering of the next one carries on from it, so "[Image #2]" in the text means the same
   * picture whichever screen sent it.
   */
  const imageBase = useMemo(
    () => countSessionImages(feed.items, queue.reduce((sum, item) => sum + item.images.length, 0)),
    [feed.items, queue],
  )

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
            streamStatus={streamStatus(feed, cards, now())}
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
      </div>

      <footer className={m.composer}>
        {/* Above the field, like the panel's own Queue - what will fire, in order, once the run in
            progress ends. */}
        {queue.length > 0 && (
          <div className={m.queueList}>
            {queue.map((item, index) => (
              <div key={item.id} className={m.queueRow}>
                <span className={m.queueBadge}>{index + 1}</span>
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

        <Composer
          facts={facts}
          context={context}
          running={feed.status === 'running'}
          connected={connected}
          imageBase={imageBase}
          onSend={onSend}
          onQueue={(prompt) =>
            setQueue((current) => [
              ...current,
              { ...prompt, id: `q-${Date.now().toString(36)}-${current.length}` },
            ])
          }
          onStop={onStop}
        />
      </footer>
    </>
  )
}

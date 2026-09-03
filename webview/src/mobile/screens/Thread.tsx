import { useMemo, useState } from 'react'
import { AgentStreamView } from '../../components/AgentStreamView'
import { Feed } from '../../components/Feed'
import { StreamSwitcher } from '../../components/StreamSwitcher'
import type { CardState } from '../../hooks/useCardState'
import { useNow } from '../../hooks/useNow'
import { contextOf } from '../../feed/build'
import type { PanelState } from '../../feed/panelState'
import { awaiting, buildAgentTabs, mainStatusOf, streamStatus } from '../../feed/streamStatus'
import { countSessionImages } from '../../feed/tokens'
import type { TaskItem } from '../../feed/types'
import type { ProjectFacts } from '../facts'
import { Back } from './Back'
import { Magnifier, SearchCapsule } from '../../components/SearchCapsule'
import { Composer, type OutgoingPrompt } from './Composer'
import type { PhoneDictation } from '../useDictation'
import m from '../mobile.module.css'
import { useT } from '../../i18n'
import type { Dict } from '../../i18n/en'
import type { PaintedTerm } from '../../protocol'

/** Mobile has no "clear finished agents" action, so every task the session ever ran stays on the strip. */
const NO_HIDDEN_TASKS: ReadonlySet<string> = new Set()

/**
 * What the strip above the feed says, by what is actually holding the turn.
 *
 * Named rather than left as one line for all three: the three cost different things to answer - a
 * permission is one tap, a plan is a page to read - and someone glancing at a phone decides whether to
 * stop what they are doing by this line alone.
 */
const waitingFor = (t: Dict): Record<'perm' | 'ask' | 'plan', string> => ({
  perm: t.mobile.thread.waitingPerm,
  ask: t.mobile.thread.waitingAsk,
  plan: t.mobile.thread.waitingPlan,
})

interface ThreadProps {
  feed: PanelState
  /** Which plans have been decided and which questions answered - kept by the application, see mobile/App. */
  cards: CardState
  title: string
  project: string
  /** What this phone knows about the project the conversation is in - see mobile/facts. */
  facts: ProjectFacts
  connected: boolean
  /** Nothing about this conversation has arrived yet - see MobileFeed.loaded. */
  loading: boolean
  /** Dictation, held by the application because the token for it arrives there - see useDictation. */
  voice: PhoneDictation
  onSend: (prompt: OutgoingPrompt) => void
  /** Said when the agent comes free. It waits in the IDE, not here - see SessionQueue.kt. */
  onQueue: (prompt: OutgoingPrompt) => void
  /** The cross on a queued message. */
  onUnqueue: (id: string) => void
  onStop: () => void
  onStopTask: (taskId: string) => void
  /**
   * A page further back than the EARLIER placeholder reaches - absent once there is nothing further, and
   * while an answer is still on its way (see useEarlierPages, which owns both).
   */
  onLoadEarlier?: () => void
  /** How many answers about earlier pages have arrived - see PanelState.earlierPages. */
  earlierPages: number
  onDecide: () => void
  onBack: () => void
  /** The search window, over this conversation (see Search.tsx and the wiring in mobile/App). */
  onSearch: () => void
  /** The search folded into the feed's corner after a hit was chosen - see SearchCapsule. */
  capsule?: {
    /** What the feed is doing about the hit - the capsule and the veil word it themselves (see CapsuleNote). */
    note: 'none' | 'loading' | 'missing'
    /** This conversation's hits and which one the thread is on - the arrows walk them. */
    count: number
    at: number
    onStep: (direction: -1 | 1) => void
    onOpen: () => void
    onClose: () => void
  }
  /** The row a search jumped to, and the words it paints - see Feed.focus and Feed.paint. */
  focus?: { row: string; nonce: number }
  /** The jump has been made - see Feed.onFocused. */
  onFocused?: () => void
  paint?: readonly PaintedTerm[]
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
  cards,
  title,
  project,
  facts,
  connected,
  loading,
  voice,
  onSend,
  onQueue,
  onUnqueue,
  onStop,
  onStopTask,
  onLoadEarlier,
  earlierPages,
  onDecide,
  onBack,
  onSearch,
  capsule,
  focus,
  onFocused,
  paint,
}: ThreadProps) => {
  const t = useT()
  /**
   * The IDE's clock rather than this device's - the counter beside "Claude is thinking" counts from a
   * moment that machine stamped (see mobile/clock.ts and hooks/useNow).
   */
  const now = useNow()

  const [activeStream, setActiveStream] = useState('main')

  /**
   * What this conversation is waiting to say, held by the IDE and fired by it when the turn ends.
   *
   * It used to be a piece of this screen's own state, worked through by an effect here. On a phone that
   * quietly does not work: leaving the screen took the queue with it, and a page in a pocket is thrown
   * out by the browser without warning - so a message put in the queue was neither sent nor waiting
   * anywhere, and the conversation simply stopped after the last turn (see SessionQueue.kt).
   */
  const queue = feed.queue

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

  /**
   * Whether the turn stands on something only a person can settle - by the shared rule rather than a
   * second one written here (see awaitsYou).
   *
   * It used to ask about permission requests alone, so a question with options and a plan raised nothing:
   * the line above the feed said "Waiting for you" - it goes by the very same rule - while the one way in
   * to the screen where the answer is given stayed hidden. A question is not drawn in the feed either
   * (the panel pins it over the input field instead), which left it invisible and unanswerable from a
   * phone: the conversation simply stopped.
   */
  const waiting = awaiting(feed.items, cards)

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
    () => countSessionImages(feed.items, queue.reduce((sum, item) => sum + item.images, 0)),
    [feed.items, queue],
  )

  return (
    <>
      <header className={m.header}>
        <Back onClick={onBack} />
        <span className={m.headerTitle}>{title}</span>
        <span className={m.headerMeta}>{project}</span>
        <button type="button" className={m.headerAction} onClick={onSearch} aria-label={t.search.title}>
          <Magnifier size={18} />
        </button>
      </header>

      {waiting && (
        <button type="button" className={m.waitingBanner} onClick={onDecide}>
          {waitingFor(t)[waiting.kind]}
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
        {capsule && resolvedStream === 'main' ? (
          <SearchCapsule {...capsule} />
        ) : null}

        {resolvedStream !== 'main' ? (
          <AgentStreamView item={activeTask} />
        ) : loading && feed.items.length === 0 ? (
          <p className={m.empty}>{t.mobile.thread.loading}</p>
        ) : (
          <Feed
            items={feed.items}
            streamingText={feed.streamingText}
            streamingId={feed.streamingId}
            streamingThinking={feed.streamingThinking}
            streaming={feed.status === 'running'}
            streamStatus={streamStatus(t, feed, cards, now())}
            statusStalled={feed.retry !== undefined}
            cards={cards}
            // Answering a plan happens on the decision screen, where the buttons are the size of a thumb.
            onPlanDecision={() => onDecide()}
            onDismissError={() => {}}
            // A link from the agent's answer opens here rather than on the machine with the IDE: asking
            // that machine to open a URL is a small primitive of remote control, and it is refused over
            // the wire anyway (see RemoteCommands).
            onOpenLink={(url) => window.open(url, '_blank', 'noopener,noreferrer')}
            earlierPages={earlierPages}
            onLoadEarlier={onLoadEarlier}
            focus={focus}
            onFocused={onFocused}
            paint={paint}
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
                  aria-label={t.mobile.removeFromQueue}
                  onClick={() => onUnqueue(item.id)}
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
          onQueue={onQueue}
          onStop={onStop}
          voice={voice}
        />
      </footer>
    </>
  )
}

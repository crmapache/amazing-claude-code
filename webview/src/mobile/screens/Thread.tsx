import { useMemo, useState } from 'react'
import { AgentStreamView } from '../../components/AgentStreamView'
import { Feed } from '../../components/Feed'
import { WorkflowAgentView } from '../../components/items/WorkflowAgentView'
import { StreamSwitcher } from '../../components/StreamSwitcher'
import type { CardState } from '../../hooks/useCardState'
import { useNow } from '../../hooks/useNow'
import { OpenAgentContext, type OpenedAgent } from '../../hooks/useOpenAgent'
import { contextOf } from '../../feed/build'
import type { PanelState } from '../../feed/panelState'
import { awaiting, buildAgentTabs, mainStatusOf, streamStatus } from '../../feed/streamStatus'
import { countSessionImages } from '../../feed/tokens'
import { openedAgentOf } from '../../feed/workflow'
import type { FeedItem, TaskItem, TodoItem } from '../../feed/types'
import type { ProjectFacts } from '../facts'
import type { SessionEntry } from '../projects'
import { Back } from './Back'
import { Magnifier, SearchCapsule } from '../../components/SearchCapsule'
import { Composer, type OutgoingPrompt } from './Composer'
import { dotClass, groupColor } from './TabsSheet'
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
  /**
   * Which conversation this screen holds - the pair the phone tells chats apart by (see chatKey).
   *
   * This screen is not remounted between chats, so anything it remembers has to be pinned to the chat it
   * was remembered for: an agent's window opened in one conversation would otherwise stand over the
   * next one, naming a card by a number that means something else there.
   */
  chat: string
  title: string
  project: string
  /** Every conversation of this project, for the strip of tabs and the sheet behind it. */
  siblings: SessionEntry[]
  /** Which of them is on screen - the tab drawn as the current one. */
  sessionId: string
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
  /** Quoted out of the feed and waiting above the field - see the message sheet. */
  quotes: string[]
  onDropQuote: (index: number) => void
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
  /** The task list and the agents of this turn, on a screen of their own. */
  onTasks: () => void
  /** The strip of tabs, and the "+" at its end. */
  onTabs: () => void
  onPickTab: (session: SessionEntry) => void
  /** The model, the effort and the mode of this conversation - the sheet behind the chip. */
  onRun: () => void
  /** One message's own actions: quote, fork, copy, pin. */
  onMessage: (item: FeedItem) => void
  /** Which messages are pinned over this conversation, and the button that changes that. */
  pins: readonly string[]
  onPin: (id: string) => void
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
 * What surrounds it is where the two screens genuinely differ - a thumb, no hover, and a keyboard that
 * owns the bottom third. Above the feed: a header of two lines, because a conversation's name and its
 * project on one line meant neither could be read; and the strip of tabs, because a project with a fork
 * in it has more than one conversation and there was no way to reach the others at all. Below it: the
 * task list, the two windows and how the turn runs - each one line, each opening the screen or the
 * sheet that holds the rest.
 */
export const Thread = ({
  feed,
  cards,
  chat,
  title,
  project,
  siblings,
  sessionId,
  facts,
  connected,
  loading,
  voice,
  quotes,
  onDropQuote,
  onSend,
  onQueue,
  onUnqueue,
  onStop,
  onStopTask,
  onLoadEarlier,
  earlierPages,
  onDecide,
  onBack,
  onTasks,
  onTabs,
  onPickTab,
  onRun,
  onMessage,
  pins,
  onPin,
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

  /** Whether the list of what is waiting to be said is unfolded - the row above the field says how many. */
  const [queueOpen, setQueueOpen] = useState(false)

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
   */

  /**
   * Whether the turn stands on something only a person can settle - by the shared rule rather than a
   * second one written here (see awaitsYou).
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
   * The agent of a fleet whose window is open, named by where it stands rather than copied - see
   * OpenedAgent. The session is the chat this screen holds, so a window does not survive the way back
   * into the list and a different chat opened after it.
   */
  const [openedAgent, setOpenedAgent] = useState<OpenedAgent | undefined>(undefined)
  const openAgent = (card: string, index: number) => setOpenedAgent({ session: chat, card, index })
  const shownAgent = openedAgentOf(feed.items, openedAgent?.session === chat ? openedAgent : undefined)

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

  /** The newest task list the agent sent - the one line the row above the field carries. */
  const todo = useMemo(() => latestTodo(feed.items), [feed.items])

  return (
    <OpenAgentContext.Provider value={openAgent}>
      <header className={m.threadHeader}>
        <div className={m.threadHeadRow}>
          <Back onClick={onBack} />

          {/*
            Two lines rather than one, and this is the fix the whole header was redrawn for. The name of
            a conversation and the name of its project were competing for the same row: an ellipsis ate
            whichever lost, and on a project with a long name that was always the conversation - the one
            thing the screen is about.
          */}
          <span className={m.threadTitles}>
            <span className={m.threadTitle}>{title}</span>
            <span className={m.threadWhere}>
              {project}
              {facts.gitBranch ? ` · ${facts.gitBranch}` : ''}
            </span>
          </span>

          <button type="button" className={m.headerIcon} aria-label={t.search.title} onClick={onSearch}>
            <Magnifier size={18} />
          </button>
        </div>

        {/*
          The conversations of this project, and the way to start another.

          A strip of its own rather than merged with the agents' one below: the two answer different
          questions - "which conversation am I in" and "what is running inside it" - and the second one
          is the panel's own component with the panel's own stopping and background chips (see
          StreamSwitcher). One strip would have meant a second copy of that.
        */}
        <div className={m.tabStrip}>
          {siblings.map((session) => (
            <button
              key={session.sessionId}
              type="button"
              className={`${m.tab} ${session.sessionId === sessionId ? m.tabOn : ''}`}
              onClick={() => (session.sessionId === sessionId ? onTabs() : onPickTab(session))}
            >
              {/* The group's colour, as at the desk: a fork and its parent carry one bar, so which
                  conversation a tab grew out of is answered without reading a word (see tabs.ts). */}
              <span className={m.tabBar} style={{ background: groupColor(session.groupId) }} />
              <span className={`${m.tabDot} ${dotClass(session)}`} />
              {session.depth > 0 ? <span className={m.tabFork}>⑂</span> : null}
              <span className={m.tabLabel}>{session.title}</span>
            </button>
          ))}

          <button type="button" className={m.tabPlus} aria-label={t.mobile.sessions.newChat} onClick={onTabs}>
            +
          </button>
        </div>
      </header>

      {waiting && (
        <button type="button" className={m.waitingBanner} onClick={onDecide}>
          <span className={m.waitingBannerText}>{waitingFor(t)[waiting.kind]}</span>
          <span className={m.waitingBannerChevron}>›</span>
        </button>
      )}

      <StreamSwitcher
        tabs={agentTabs}
        background={feed.background}
        mainStatus={mainStatus}
        active={resolvedStream}
        onPick={setActiveStream}
        onStop={(task) => {
          if (window.confirm(t.mobile.thread.stopAgent(task.subject || task.title))) onStopTask(task.id)
        }}
      />

      <div className={m.thread}>
        {capsule && resolvedStream === 'main' ? <SearchCapsule {...capsule} /> : null}

        {/* One agent of a fleet, over the thread - the same window the desk draws, and needed here rather
            more: a fleet is what runs for half an hour with nobody at the machine. */}
        {shownAgent ? (
          <WorkflowAgentView
            agent={shownAgent.agent}
            live={shownAgent.live}
            onClose={() => setOpenedAgent(undefined)}
          />
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
            onActions={onMessage}
            pins={pins}
            onPin={onPin}
            earlierPages={earlierPages}
            onLoadEarlier={onLoadEarlier}
            focus={focus}
            onFocused={onFocused}
            paint={paint}
          />
        )}
      </div>

      <footer className={m.composer}>
        {/*
          What the agent said it would do, in one line, opening the screen that holds the rest.

          A line rather than the panel's folding card: the panel has the height for five tasks above its
          field and a phone does not, and the same screen carries the subagents and the background
          commands - which is what somebody away from the desk is actually asking about.
        */}
        {todo && todo.todos.length > 0 && (
          <button type="button" className={m.taskRow} onClick={onTasks}>
            <span className={m.taskRowLabel}>{t.mobile.tasks.label}</span>
            <span className={m.taskRowText}>{currentTask(todo)}</span>
            <span className={m.taskRowCount}>
              {todo.todos.filter((one) => one.state === 'done').length}/{todo.todos.length}
            </span>
            <span className={m.taskRowChevron}>›</span>
          </button>
        )}

        <Composer
          facts={facts}
          context={context}
          run={{
            model: feed.model ?? '',
            effort: feed.effort ?? '',
            mode: feed.permissionMode ?? '',
          }}
          running={feed.status === 'running'}
          since={feed.turnStartedAt ?? 0}
          queue={queue}
          queueOpen={queueOpen}
          onQueueOpen={setQueueOpen}
          onUnqueue={onUnqueue}
          connected={connected}
          imageBase={imageBase}
          quotes={quotes}
          onDropQuote={onDropQuote}
          onSend={onSend}
          onQueue={onQueue}
          onStop={onStop}
          onRun={onRun}
          voice={voice}
        />
      </footer>
    </OpenAgentContext.Provider>
  )
}

/**
 * The newest task list of this conversation - the panel's own rule (see latestTodo in App.tsx).
 *
 * A list out of a past conversation's replay is not one of them: nothing is happening in a conversation
 * opened for reading, and yesterday's list above an empty field reads as work that has hung.
 */
const latestTodo = (items: FeedItem[]): TodoItem | undefined =>
  [...items].reverse().find((item): item is TodoItem => item.kind === 'todo' && !item.replayed)

/** Which of the tasks the row names: the one being worked on, else the first one not yet done. */
const currentTask = (todo: TodoItem): string =>
  (todo.todos.find((one) => one.state === 'active') ?? todo.todos.find((one) => one.state !== 'done'))?.text ??
  todo.todos.at(-1)?.text ??
  ''

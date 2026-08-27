/**
 * Sound alerts: when the panel calls the person.
 *
 * The panel decides and the shell sounds (see protocol, the sound message): only here is it known what
 * the turn is busy with - whether it waits for a decision about a plan, has run into a limit, or reached
 * its end by itself.
 *
 * A sound is needed precisely when one is not looking here, so the watching covers every tab at once
 * rather than the open one: a background conversation calls in exactly the same way, and nobody sees the
 * dot on its tab.
 */

import { STOPPED_BY_YOU } from './feed/build'
import type { FeedItem } from './feed/types'
import type { AgentStatus, SoundId } from './protocol'

export interface SoundInfo {
  id: SoundId
  label: string
  hint: string
}

/** The volume of a sound nothing has been said about: the file as it is. */
export const FULL_VOLUME = 100

/** The checkboxes and the volumes - what the person configured in the sounds list. */
export interface SoundPrefs {
  muted: SoundId[]
  volumes: Partial<Record<SoundId, number>>
}

export const NO_SOUND_PREFS: SoundPrefs = { muted: [], volumes: {} }

export const volumeOf = (prefs: SoundPrefs, sound: SoundId): number => prefs.volumes[sound] ?? FULL_VOLUME

export const isMuted = (prefs: SoundPrefs, sound: SoundId): boolean => prefs.muted.includes(sound)

/**
 * Clear or restore a checkbox.
 *
 * A switched-off sound remembers its volume: turning it back on, the person expects their previous
 * seventy per cent rather than a hundred. The exception is a sound switched off by the slider itself,
 * dragged down to zero: restoring it "as it was" would mean restoring silence, so it starts at full
 * volume.
 */
export const toggleSound = (prefs: SoundPrefs, sound: SoundId): SoundPrefs => {
  if (!isMuted(prefs, sound)) return { ...prefs, muted: [...prefs.muted, sound] }

  const volumes = { ...prefs.volumes }
  if (volumeOf(prefs, sound) === 0) delete volumes[sound]

  return { muted: prefs.muted.filter((id) => id !== sound), volumes }
}

/**
 * The volume from the slider - which is the checkbox too.
 *
 * Zero and a switched-off sound are one and the same, so the slider governs the checkbox as well:
 * dragged to zero it clears it, raised back it restores it. There is no separate "switched off but
 * loud" state.
 */
export const setVolume = (prefs: SoundPrefs, sound: SoundId, volume: number): SoundPrefs => {
  const value = Math.min(FULL_VOLUME, Math.max(0, Math.round(volume)))
  const volumes = { ...prefs.volumes }

  // Full volume is not stored: silence in the settings is what means "as it is".
  if (value === FULL_VOLUME) delete volumes[sound]
  else volumes[sound] = value

  const off = isMuted(prefs, sound)
  const muted =
    value === 0
      ? off
        ? prefs.muted
        : [...prefs.muted, sound]
      : off
        ? prefs.muted.filter((id) => id !== sound)
        : prefs.muted

  return { muted, volumes }
}

/** The order here is the order in the settings list: what calls most often comes first. */
export const SOUNDS: SoundInfo[] = [
  { id: 'turnFinished', label: 'Turn finished', hint: 'Claude answered and is waiting for you' },
  { id: 'permission', label: 'Permission asked', hint: 'a tool call needs your approval' },
  { id: 'question', label: 'Question asked', hint: 'Claude asked you to pick an answer' },
  { id: 'plan', label: 'Plan ready', hint: 'a plan is waiting for your approval' },
  { id: 'rateLimit', label: 'Limit reached', hint: 'the subscription limit stopped the turn' },
  { id: 'extraUsage', label: 'Extra usage started', hint: 'the plan is used up - the work is now billed on top' },
  { id: 'trouble', label: 'Something broke', hint: 'an error, a dead process or a signed-out session' },
]

/**
 * What sounds when there are several occasions at once. A turn broken off by a refusal brings both an
 * error and the turn's result in one update - what says so should be the more important of the two
 * rather than two signals overlaid on each other.
 *
 * The shell knows the same order: there it decides whose signal outlives the other when several tabs
 * call at once (see AlertSounds.kt).
 */
const PRIORITY: SoundId[] = [
  'trouble',
  'rateLimit',
  'extraUsage',
  'permission',
  'question',
  'plan',
  'turnFinished',
]

/**
 * A limit refusal recognised by its text.
 *
 * The main route is different: the limit event arrives separately and becomes a row of its own in the
 * feed (see LimitItem), which is what the case below it leans on - that route does not depend on
 * wording. But a limit also arrives as a plain turn refusal, in the CLI's words, and then there is
 * nothing else to recognise it by. Being wrong here is cheap: a miss means the ordinary breakage signal
 * sounds rather than silence.
 */
const LIMIT_PATTERN = /(rate|usage|quota)[ -]?limit|limit (reached|exceeded|is used up)|out of (usage|credits)/i

/**
 * What the watcher has already seen in this tab.
 *
 * Mutated in place: this is not React state but memory between frames, and a copy on every feed update
 * would cost more than the watching itself.
 */
export interface SoundMemory {
  /** The items already spoken about. New ones are always appended to the end of the feed. */
  seen: Set<string>
  /** The status at the previous check: a turn's end is visible only as a transition out of work. */
  status: AgentStatus
}

/**
 * The first look at a tab: nothing already in it should sound.
 *
 * Otherwise a conversation raised from the history would play every question and error it has held for a
 * year all at once.
 */
export const rememberPanel = (panel: PanelView): SoundMemory => ({
  seen: new Set(panel.items.map((item) => item.id)),
  status: panel.status,
})

/** Exactly what the watcher needs out of a tab's state. */
export interface PanelView {
  items: FeedItem[]
  status: AgentStatus
}

/**
 * What to call the person with after this update of a tab, if there is anything.
 *
 * The memory is updated here as well - calling this makes sense exactly once per frame.
 */
export const soundForPanel = (panel: PanelView, memory: SoundMemory): SoundId | null => {
  const fresh = freshItems(panel.items, memory.seen)
  for (const item of fresh) memory.seen.add(item.id)

  const wasRunning = memory.status === 'running'
  memory.status = panel.status

  if (fresh.length === 0) return null

  // A background subagent (a skill's own, or one the Task tool ran outside the ordinary turn cycle) keeps
  // the panel busy even once the main stream's own turn has ended - see streamStatus.ts for the same
  // reading of pending task cards. Chiming on every such intermediate "result" would mean one chime per
  // subagent notification rather than one for the work as a whole.
  const stillWorking = panel.items.some((item) => item.kind === 'task' && item.pending)

  const sounds = new Set(
    fresh
      .map((item) => soundFor(item, wasRunning || panel.status === 'running', stillWorking))
      .filter((sound): sound is SoundId => sound !== null),
  )

  return PRIORITY.find((sound) => sounds.has(sound)) ?? null
}

/**
 * The items that have appeared since the previous check.
 *
 * We walk from the end to the first familiar one: the feed only grows at the end, so a pass costs as
 * many steps as there are new cards rather than as the whole conversation is long - otherwise every
 * chunk of a printing answer would walk a thousand cards afresh.
 */
const freshItems = (items: FeedItem[], seen: Set<string>): FeedItem[] => {
  const fresh: FeedItem[] = []

  for (let index = items.length - 1; index >= 0; index--) {
    const item = items[index]!
    if (seen.has(item.id)) break
    fresh.push(item)
  }

  return fresh
}

/**
 * What the appearance of one card sounds like.
 *
 * `live` is whether a turn is running right now (or was a moment ago, if this very card is what ended
 * it). Without it a conversation raised from the history would sound with its old questions and
 * refusals: a transcript arrives as the same events a live one does and looks no different. A process
 * crash is the exception: it comes not as an agent's event but as a message from the shell itself, so it
 * cannot occur in a raised transcript, while it can happen in silence, with no turn running at all.
 *
 * `stillWorking` only matters to a `meta` card: it says a background subagent has not reported back yet,
 * so this particular turn's end is not the work's end.
 */
const soundFor = (item: FeedItem, live: boolean, stillWorking: boolean): SoundId | null => {
  if (item.kind === 'crash') return 'trouble'
  if (!live) return null

  switch (item.kind) {
    case 'perm':
      return 'permission'

    case 'ask':
      return 'question'

    case 'plan':
      return 'plan'

    case 'error':
      return LIMIT_PATTERN.test(item.message) ? 'rateLimit' : 'trouble'

    // The limit's own row (see LimitItem). The two states are opposite occasions and get a sound each: a
    // stop is work that will not move until the window resets, extra usage is work that carries on -
    // for money. The second one calls not because anything has halted but because from this moment the
    // spending is one's own, and the row saying so appears exactly once per window that runs out (the
    // CLI repeats the event on every turn while the state holds - see rate_limit_event in feed/build.ts).
    case 'limit':
      return item.state === 'waiting' ? 'rateLimit' : 'extraUsage'

    // A turn's result is its end - but only if the agent finished the turn itself. One interrupted by
    // the person is marked right here, and calling someone who pressed "stop" a minute ago serves
    // nothing.
    case 'meta':
      if (item.stats.some((stat) => stat.startsWith(STOPPED_BY_YOU))) return null
      return stillWorking ? null : 'turnFinished'

    default:
      return null
  }
}

/**
 * Звуковые оповещения: когда панель зовёт человека.
 *
 * Решает панель, а звучит оболочка (см. protocol, сообщение sound): только
 * здесь известно, чем занят ход — ждёт ли он решения по плану, упёрся в лимит
 * или дошёл до конца сам.
 *
 * Звук нужен именно тогда, когда смотрят не сюда, поэтому наблюдение идёт по
 * всем вкладкам сразу, а не по открытой: фоновый разговор зовёт точно так же,
 * а его точку на вкладке никто не видит.
 */

import { STOPPED_BY_YOU } from './feed/build'
import type { FeedItem } from './feed/types'
import type { AgentStatus, SoundId } from './protocol'

export interface SoundInfo {
  id: SoundId
  label: string
  hint: string
}

/** Громкость звука, о котором ничего не сказано: файл как есть. */
export const FULL_VOLUME = 100

/** Галочки и громкость — то, что человек настроил в списке звуков. */
export interface SoundPrefs {
  muted: SoundId[]
  volumes: Partial<Record<SoundId, number>>
}

export const NO_SOUND_PREFS: SoundPrefs = { muted: [], volumes: {} }

export const volumeOf = (prefs: SoundPrefs, sound: SoundId): number => prefs.volumes[sound] ?? FULL_VOLUME

export const isMuted = (prefs: SoundPrefs, sound: SoundId): boolean => prefs.muted.includes(sound)

/**
 * Снять или вернуть галочку.
 *
 * Выключенный звук помнит свою громкость: вернув его, человек ждёт прежние
 * семьдесят процентов, а не сотню. Исключение — звук, выключенный самим
 * ползунком, доведённым до нуля: вернуть его «как было» значит вернуть тишину,
 * поэтому он начинает с полной громкости.
 */
export const toggleSound = (prefs: SoundPrefs, sound: SoundId): SoundPrefs => {
  if (!isMuted(prefs, sound)) return { ...prefs, muted: [...prefs.muted, sound] }

  const volumes = { ...prefs.volumes }
  if (volumeOf(prefs, sound) === 0) delete volumes[sound]

  return { muted: prefs.muted.filter((id) => id !== sound), volumes }
}

/**
 * Громкость с ползунка — она же и галочка.
 *
 * Ноль и выключенный звук это одно и то же, поэтому ползунок распоряжается и
 * галочкой: доведённый до нуля снимает её, поднятый обратно — возвращает.
 * Отдельного «выключен, но громкий» состояния не бывает.
 */
export const setVolume = (prefs: SoundPrefs, sound: SoundId, volume: number): SoundPrefs => {
  const value = Math.min(FULL_VOLUME, Math.max(0, Math.round(volume)))
  const volumes = { ...prefs.volumes }

  // Полную громкость не храним: молчание настроек и значит «как есть».
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

/** Порядок здесь — порядок в списке настроек: сперва то, что зовёт чаще. */
export const SOUNDS: SoundInfo[] = [
  { id: 'turnFinished', label: 'Turn finished', hint: 'Claude answered and is waiting for you' },
  { id: 'permission', label: 'Permission asked', hint: 'a tool call needs your approval' },
  { id: 'question', label: 'Question asked', hint: 'Claude asked you to pick an answer' },
  { id: 'plan', label: 'Plan ready', hint: 'a plan is waiting for your approval' },
  { id: 'rateLimit', label: 'Limit reached', hint: 'the subscription limit stopped the turn' },
  { id: 'trouble', label: 'Something broke', hint: 'an error, a dead process or a signed-out session' },
]

/**
 * Что звучит, если поводов сразу несколько. Ход, оборванный отказом, приносит и
 * ошибку, и итог хода одним обновлением — сказать об этом должно то, что важнее,
 * а не два наложенных друг на друга сигнала.
 *
 * Тот же порядок знает и оболочка: там он решает, чей сигнал переживёт другой,
 * когда позвали сразу несколько вкладок (см. AlertSounds.kt).
 */
const PRIORITY: SoundId[] = ['trouble', 'rateLimit', 'permission', 'question', 'plan', 'turnFinished']

/**
 * Отказ по лимиту, узнанный по тексту.
 *
 * Основной путь другой: событие о лимите приходит отдельно и разбирается в
 * ленте пометкой (см. ErrorItem.limit) — на неё и опираемся, потому что она не
 * зависит от формулировок. Но лимит доезжает и просто отказом хода, словами от
 * CLI, и тогда узнать его больше не по чему. Ошибиться тут дёшево: не угадали —
 * прозвучит обычный сигнал о поломке, а не тишина.
 */
const LIMIT_PATTERN = /(rate|usage|quota)[ -]?limit|limit (reached|exceeded|is used up)|out of (usage|credits)/i

/**
 * Что наблюдатель уже видел в этой вкладке.
 *
 * Меняется на месте: это не состояние React, а память между кадрами, и копия на
 * каждое обновление ленты обошлась бы дороже самого наблюдения.
 */
export interface SoundMemory {
  /** Элементы, о которых уже сказали. Новые всегда дописываются в конец ленты. */
  seen: Set<string>
  /** Статус на прошлой проверке: конец хода виден только по переходу из работы. */
  status: AgentStatus
}

/**
 * Первый взгляд на вкладку: всё, что в ней уже есть, звучать не должно.
 *
 * Иначе поднятый из истории разговор проиграл бы разом все свои прошлогодние
 * вопросы и ошибки.
 */
export const rememberPanel = (panel: PanelView): SoundMemory => ({
  seen: new Set(panel.items.map((item) => item.id)),
  status: panel.status,
})

/** Ровно то, что нужно наблюдателю от состояния вкладки. */
export interface PanelView {
  items: FeedItem[]
  status: AgentStatus
}

/**
 * Чем позвать человека после этого обновления вкладки, если есть чем.
 *
 * Память обновляется здесь же — вызывать имеет смысл ровно один раз на кадр.
 */
export const soundForPanel = (panel: PanelView, memory: SoundMemory): SoundId | null => {
  const fresh = freshItems(panel.items, memory.seen)
  for (const item of fresh) memory.seen.add(item.id)

  const wasRunning = memory.status === 'running'
  memory.status = panel.status

  if (fresh.length === 0) return null

  const sounds = new Set(
    fresh
      .map((item) => soundFor(item, wasRunning || panel.status === 'running'))
      .filter((sound): sound is SoundId => sound !== null),
  )

  return PRIORITY.find((sound) => sounds.has(sound)) ?? null
}

/**
 * Элементы, появившиеся с прошлой проверки.
 *
 * Идём с конца до первого знакомого: лента растёт только в конец, поэтому
 * проход стоит по числу новых карточек, а не по длине всего разговора — иначе
 * каждый кусочек печатающегося ответа перебирал бы тысячу карточек заново.
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
 * Чем звучит появление одной карточки.
 *
 * `live` — идёт ли ход прямо сейчас (или шёл мгновение назад, если этой самой
 * карточкой он и закончился). Без него разговор, поднятый из истории, звучал бы
 * своими старыми вопросами и отказами: переписка приезжает теми же событиями,
 * что и живая, и на вид ничем от неё не отличается. Крах процесса — исключение:
 * он приходит не событием агента, а сообщением самой оболочки, поэтому в
 * поднятой переписке его быть не может, зато случиться он способен и в тишине,
 * когда никакого хода не идёт.
 */
const soundFor = (item: FeedItem, live: boolean): SoundId | null => {
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
      return item.limit || LIMIT_PATTERN.test(item.message) ? 'rateLimit' : 'trouble'

    // Итог хода и есть его конец — но только если ход закончил сам агент.
    // Прерванный человеком помечен здесь же, и звать того, кто минуту назад
    // сам нажал «стоп», незачем.
    case 'meta':
      return item.stats.some((stat) => stat.startsWith(STOPPED_BY_YOU)) ? null : 'turnFinished'

    default:
      return null
  }
}

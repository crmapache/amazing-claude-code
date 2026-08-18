import { useEffect, useRef, useState } from 'react'
import { LinkedText } from './LinkedText'
import { compactProgress } from '../../feed/compact'
import type {
  CheckpointItem,
  CompactItem,
  CrashItem,
  ErrorItem,
  MetaItem,
  RetryItem,
  ThinkItem,
} from '../../feed/types'
import s from '../feed.module.css'

/**
 * Всегда в одну строку — обрезаем многоточием через CSS (text-overflow), а не
 * разворачиваем на полэкрана: это ход мысли между делом, не то, ради чего
 * приходят в панель. Пока мысль ещё стримится, plашка дышит тем же пульсом,
 * что и CONTEXT во время сжатия — тот же язык «идёт, не готово».
 */
export const ThinkRow = ({ item }: { item: ThinkItem }) => (
  <div className={s.think}>
    <span className={`${s.toolChip} ${s.chipThink} ${item.pending ? s.thinkPending : ''}`}>THINK</span>
    <span className={s.thinkText}>{item.text}</span>
  </div>
)

export const CheckpointRow = ({ item }: { item: CheckpointItem }) => (
  <div className={s.checkpoint}>
    <span className={s.checkpointChip}>{item.chip}</span>
    <span className={s.checkpointTarget}>{item.target}</span>
    <div className={s.dashed} />
  </div>
)

/** Как часто подрастает полоса сжатия: чаще незачем, кривая и так пологая. */
const COMPACT_TICK_MS = 500

/**
 * Сколько сжатия позади — по секундомеру от первого сообщения о нём.
 *
 * Время считается от появления карточки, а не от какой-либо отметки в событии:
 * карточка заводится тем же сообщением, которым CLI объявляет о начале сжатия,
 * так что это и есть его начало.
 */
const useCompactProgress = (pending: boolean): number => {
  const startedAt = useRef<number | null>(null)
  const [percent, setPercent] = useState(0)

  useEffect(() => {
    if (!pending) return

    const from = startedAt.current ?? Date.now()
    startedAt.current = from

    const tick = () => setPercent(compactProgress(Date.now() - from))
    tick()

    const timer = window.setInterval(tick, COMPACT_TICK_MS)
    return () => window.clearInterval(timer)
  }, [pending])

  return percent
}

/**
 * Сжатие контекста. Пока оно идёт, за подписью стоит процент — единственный
 * рассказ о происходящем на всю панель (строка состояния под лентой в этот
 * момент молчит, чтобы не говорить то же самое дважды).
 *
 * Процент считается от прошедшего времени: сколько сжатия позади, CLI не
 * сообщает никому, включая собственный терминальный интерфейс, — тот рисует ту
 * же кривую (см. compactProgress). Цифра поэтому не обещает точной доли, а
 * показывает, что работа идёт и сколько примерно уже тянется.
 */
export const CompactRow = ({ item }: { item: CompactItem }) => {
  const percent = useCompactProgress(item.pending)

  return (
    <div className={s.compact}>
      <span className={`${s.compactLabel} ${item.pending ? s.pending : ''}`}>CONTEXT</span>
      <span className={s.compactText}>{item.target}</span>
      {item.pending ? <span className={s.compactPercent}>{percent}%</span> : null}
      <div className={s.spacer} />
    </div>
  )
}

/**
 * Как часто пересчитывается обратный отсчёт до следующей попытки. Чаще секунды
 * незачем: сама цифра идёт по секундам, а лишние перерисовки ленты во время
 * ответа стоят дорого.
 */
const RETRY_TICK_MS = 1000

/** Сколько секунд осталось до следующей попытки — никогда не меньше нуля. */
const secondsLeft = (retryAt: number): number => Math.max(0, Math.ceil((retryAt - Date.now()) / 1000))

/**
 * Обратный отсчёт до следующей попытки. Пока пауза идёт, это единственная
 * цифра во всей панели, которая говорит, что разговор не умер, а ждёт.
 */
const useRetryCountdown = (item: RetryItem): number => {
  const [left, setLeft] = useState(() => secondsLeft(item.retryAt))

  useEffect(() => {
    if (!item.pending) return

    const tick = () => setLeft(secondsLeft(item.retryAt))
    tick()

    const timer = window.setInterval(tick, RETRY_TICK_MS)
    return () => window.clearInterval(timer)
  }, [item.pending, item.retryAt])

  return left
}

/** Попытки числом: «1 attempt», но «4 attempts». */
const attempts = (count: number): string => (count === 1 ? '1 attempt' : `${count} attempts`)

/** Чем кончилась череда повторов — словами, а не цветом: цвет читается не всеми. */
const retryOutcomeText = (item: RetryItem): string => {
  switch (item.outcome) {
    case 'recovered':
      return `went through after ${attempts(item.attempt)}`
    case 'failed':
      return `gave up after ${attempts(item.attempt)}`
    default:
      return `stopped after ${attempts(item.attempt)}`
  }
}

/**
 * Пауза перед повторным запросом к API (см. RetryItem).
 *
 * Устроена как строка сжатия контекста и стоит на том же месте в ленте: это тот
 * же разговор про «сейчас ничего не происходит, и вот почему». Пока пауза идёт,
 * метка дышит, а справа тикает обратный отсчёт; когда всё кончилось, на его
 * месте остаётся, сколько заняла вся череда.
 */
export const RetryRow = ({ item }: { item: RetryItem }) => {
  const left = useRetryCountdown(item)
  const attemptOf = item.maxRetries ? `attempt ${item.attempt}/${item.maxRetries}` : `attempt ${item.attempt}`

  return (
    <div className={s.retry}>
      <span className={`${s.retryLabel} ${item.pending ? s.pending : ''}`}>RETRY</span>
      <span className={s.retryText}>
        {item.label} · {item.pending ? attemptOf : retryOutcomeText(item)}
      </span>
      {/* Отсчёт истёк — попытка уже пошла, и ждём мы теперь не паузу, а ответ. */}
      <span className={s.retryCount}>
        {item.pending ? (left > 0 ? `retrying in ${left}s` : 'retrying…') : item.duration}
      </span>
      <div className={s.spacer} />
    </div>
  )
}

/** Итог хода — включая прерванный: он отличается подписью, а не видом строки. */
export const MetaRow = ({ item }: { item: MetaItem }) => (
  <div className={s.meta}>
    {item.stats.map((stat, index) => (
      <span key={index}>{stat}</span>
    ))}
  </div>
)

/** Процесс умер сам — недвусмысленная пометка, а не молчаливое «idle». */
export const CrashRow = ({ item }: { item: CrashItem }) => (
  <div className={s.crash}>
    <span className={s.crashLabel}>SESSION</span>
    <span className={s.crashText}>{item.message}</span>
  </div>
)

/**
 * Отказ агента или процесса — на своём месте в хронологии (см. ErrorItem).
 * Крестик остаётся: прочитанную ошибку можно убрать сразу, не дожидаясь, пока
 * она уедет вверх сама.
 */
export const ErrorRow = ({
  item,
  onDismiss,
  onOpenLink,
}: {
  item: ErrorItem
  onDismiss: () => void
  /** Открыть адрес из текста ошибки в системном браузере. */
  onOpenLink: (url: string) => void
}) => (
  <p className={s.error}>
    {/* Адрес внутри ошибки — обычно единственное, что по ней можно сделать:
        «check https://status.claude.com» просит сходить и посмотреть. Ссылкой
        он и остаётся, как в ответе агента (см. LinkedText). */}
    <span className={s.errorText}>
      <LinkedText text={item.message} onOpenLink={onOpenLink} />
    </span>
    <button type="button" className={s.errorDismiss} onClick={onDismiss}>
      ×
    </button>
  </p>
)

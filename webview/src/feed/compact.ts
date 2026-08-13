/**
 * Доля сжатия контекста — по прошедшему времени, а не по сделанной работе.
 *
 * Настоящего прогресса тут нет ни у кого: сжатие — это один запрос к модели, и
 * CLI сообщает только его начало и конец. Собственный интерфейс Claude Code
 * рисует ровно ту же кривую от секундомера, и здесь она повторена один в один,
 * чтобы полоса в панели и полоса в терминале показывали одно и то же число.
 *
 * Кривая насыщения: быстро растёт в первые секунды, дальше почти стоит и
 * упирается в потолок. Потолок нужен, чтобы полоса не добралась до сотни раньше
 * самого сжатия и не заставляла думать, что панель зависла на «100%».
 */
const TIME_CONSTANT_S = 90
const CEILING_PERCENT = 95

export const compactProgress = (elapsedMs: number): number => {
  const seconds = Math.max(0, elapsedMs) / 1000
  const ratio = 1 - Math.exp(-seconds / TIME_CONSTANT_S)
  return Math.min(CEILING_PERCENT, Math.round(ratio * 100))
}

/** `/compact` с аргументом или без — не `/compaction` и не команда в середине строки. */
export const isCompactCommand = (text: string): boolean => /^\/compact(?:\s|$)/.test(text.trim())

/**
 * Пока идёт сжатие, stdin агенту слать нельзя: он его не подхватит «на следующем
 * шаге», как обычную дописку, а проглотит и после конца сжатия не выполнит.
 *
 * `compacting` — уже пришёл статус. Второй флаг ловит гонку: человек отправил
 * `/compact` и сразу следующее сообщение, а статус compacting ещё в пути —
 * ход уже начался командой сжатия, и дописка туда же пропадёт.
 */
export const deferFollowUpForCompact = (
  compacting: boolean,
  running: boolean,
  lastUserText: string,
): boolean => compacting || (running && isCompactCommand(lastUserText))

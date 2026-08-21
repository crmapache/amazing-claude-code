/**
 * The share of a context compaction - by the time elapsed rather than by the work done.
 *
 * There is no real progress here for anyone: a compaction is one request to the model, and the CLI
 * reports only its start and its end. Claude Code's own interface draws exactly the same curve off a
 * stopwatch, and it is repeated here one to one, so that the percentage in the panel and the percentage
 * in the terminal show one and the same number.
 *
 * A saturation curve: it grows fast in the first seconds, then almost stands still and runs into a
 * ceiling. The ceiling is there so that the counter does not reach a hundred before the compaction does
 * and leave one thinking the panel has hung at "100%".
 */
const TIME_CONSTANT_S = 90
const CEILING_PERCENT = 95

export const compactProgress = (elapsedMs: number): number => {
  const seconds = Math.max(0, elapsedMs) / 1000
  const ratio = 1 - Math.exp(-seconds / TIME_CONSTANT_S)
  return Math.min(CEILING_PERCENT, Math.round(ratio * 100))
}

/** `/compact` with or without an argument - not `/compaction` and not a command mid-line. */
export const isCompactCommand = (text: string): boolean => /^\/compact(?:\s|$)/.test(text.trim())

/**
 * While a compaction runs, stdin must not be sent to the agent: it will not pick it up "at the next
 * step" as it does an ordinary mid-turn message, it will swallow it and not carry it out once the
 * compaction ends.
 *
 * `compacting` means the status has already arrived. The second flag catches a race: the person sent
 * `/compact` and immediately the next message while the compacting status is still on its way - the turn
 * has already begun with the compaction command, and a message written into it will vanish too.
 */
export const deferFollowUpForCompact = (
  compacting: boolean,
  running: boolean,
  lastUserText: string,
): boolean => compacting || (running && isCompactCommand(lastUserText))

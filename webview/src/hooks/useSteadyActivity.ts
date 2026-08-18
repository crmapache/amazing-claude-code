import { useEffect, useRef, useState } from 'react'

/**
 * Сколько названное дело держится в строке состояния, прежде чем уступить
 * следующему.
 *
 * Две секунды — не про анимацию, а про чтение: короткие вызовы идут очередью по
 * несколько штук в секунду, и строка, честно называющая каждый, показывает не
 * работу, а мельтешение — прочитать не успеваешь ни одного.
 */
const HOLD_MS = 2000

/**
 * То же дело, но не чаще, чем раз в HOLD_MS.
 *
 * Пропущенные за выдержку значения не копятся в очередь и не показываются
 * задним числом: по её истечении встаёт то, что происходит сейчас, а всё, что
 * успело пробежать мимо, так и остаётся только карточками в ленте. Иначе строка
 * отставала бы от происходящего тем сильнее, чем быстрее идёт работа.
 *
 * `turn` — ход, к которому дело относится. Дело прошлого хода к новому не имеет
 * отношения, и выдержку на стыке не досиживают: иначе первые секунды свежего
 * ответа подписаны тем, что делалось в предыдущем.
 */
export const useSteadyActivity = (activity: string, turn: string): string => {
  const [shown, setShown] = useState(activity)
  const shownAt = useRef(0)
  const shownTurn = useRef(turn)

  useEffect(() => {
    if (turn !== shownTurn.current) {
      shownTurn.current = turn
      shownAt.current = Date.now()
      setShown(activity)
      return
    }

    if (activity === shown) return

    const waited = Date.now() - shownAt.current
    if (waited >= HOLD_MS) {
      shownAt.current = Date.now()
      setShown(activity)
      return
    }

    const timer = window.setTimeout(() => {
      shownAt.current = Date.now()
      setShown(activity)
    }, HOLD_MS - waited)

    return () => window.clearTimeout(timer)
  }, [activity, shown, turn])

  return shown
}

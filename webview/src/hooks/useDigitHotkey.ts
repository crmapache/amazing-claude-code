import { useEffect, useRef } from 'react'

/** «1»…«9» по порядку: десятый вариант и дальше живут без хоткея, цифр больше нет. */
const DIGITS = ['1', '2', '3', '4', '5', '6', '7', '8', '9']

export const MAX_DIGIT_HOTKEYS = DIGITS.length

/**
 * Куда попадёт нажатая цифра, если её не перехватить: в текст или в никуда.
 *
 * Поле ответа «своими словами» внутри самой панели и любое другое обычное поле
 * ввода забирают цифру себе всегда — там она часть ответа. Поле сообщения
 * (единственный contentEditable в панели) отдаёт её хоткею, но лишь пока пусто:
 * начатый черновик — знак того, что человек печатает, и цифра в нём цифра.
 */
const typedInto = (target: EventTarget | null, composerEmpty: boolean): boolean => {
  const element = target as HTMLElement | null
  if (!element) return false
  if (element.tagName === 'INPUT' || element.tagName === 'TEXTAREA') return true
  return element.isContentEditable && !composerEmpty
}

/**
 * Цифры выбирают вариант в панели, которая держит ход: разрешение и вопрос
 * агента. Ровно та же привычка, что и в терминале, где ответ выбирают номером,
 * а не мышью.
 *
 * Фокус при этом никто ни у кого не отнимает: панель появляется, когда человек,
 * скорее всего, уже стоит курсором в поле сообщения, и выдёргивать его оттуда
 * значило бы терять первые буквы у того, кто как раз начал печатать. Вместо
 * этого цифра достаётся хоткею, только пока в поле пусто — то есть терять
 * нечего.
 */
export const useDigitHotkey = (
  count: number,
  onPick: (index: number) => void,
  { enabled, composerEmpty }: { enabled: boolean; composerEmpty: boolean },
): void => {
  /**
   * Само действие — в ссылке, а не в зависимостях: у панели вопроса оно
   * пересобирается на каждой перерисовке (а она идёт на каждом кусочке
   * печатающегося ответа), и слушатель окна снимался бы и вешался заново по
   * нескольку раз в секунду впустую.
   */
  const pick = useRef(onPick)
  pick.current = onPick

  useEffect(() => {
    if (!enabled || count === 0) return

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.metaKey || event.ctrlKey || event.altKey || event.shiftKey) return
      if (typedInto(event.target, composerEmpty)) return

      const index = DIGITS.indexOf(event.key)
      if (index < 0 || index >= count) return

      event.preventDefault()
      pick.current(index)
    }

    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [count, enabled, composerEmpty])
}

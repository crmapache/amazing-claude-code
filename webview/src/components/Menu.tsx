import { useState } from 'react'
import type { Anchor } from './StatusBar'
import s from './shell.module.css'

export interface MenuOption {
  id: string
  label: string
  tag?: string
  danger?: boolean
  sub?: string
  key?: string
  /** Виден, но не нажимается — недоступен на текущей модели/аккаунте (см. modeMenuOptions). */
  disabled?: boolean
}

interface MenuProps {
  title: string
  hint: string
  width: number
  /** Кнопка, из которой меню открыли: оно встаёт прямо над ней или под ней. */
  anchor: Anchor
  options: MenuOption[]
  selected: string
  onPick: (id: string) => void
  onClose: () => void
  /**
   * Колонка под галочку слева от каждого пункта — по умолчанию есть, она
   * нужна там, где выбор действительно один из вариантов (модель, effort,
   * режим, раскладка). Меню бургера в шапке (история/MCP/плагины/звуки/
   * раскладка) — список действий, а не переключатель одного значения:
   * почти никогда ни один пункт не выбран, и пустая колонка была просто
   * лишним отступом слева у каждой строки без всякого смысла.
   */
  tick?: boolean
}

export const Menu = ({ title, hint, width, anchor, options, selected, onPick, onClose, tick = true }: MenuProps) => {
  /*
   * Подсветка под мышью — своим состоянием, а не чистым CSS :hover: тот же
   * приём, что и в SlashSuggest (см. её onMouseEnter), и по той же причине —
   * в JCEF он срабатывает не всегда. В частности, на пункте, который окажется
   * под уже неподвижным курсором прямо в момент открытия меню (кнопку нажали
   * мышью, курсор с неё никуда не уехал), :hover вовсе не включится, пока
   * мышь не шевельнётся хоть на пиксель, — так и выглядело «часто не срабатывает».
   */
  const [hovered, setHovered] = useState<string | null>(null)

  // Прижимаемся к правому краю кнопки, но не даём уехать за края панели: она в
  // IDE бывает уже самого меню.
  const actualWidth = Math.min(width, window.innerWidth - 16)
  const right = Math.min(Math.max(8, anchor.right), Math.max(8, window.innerWidth - actualWidth - 8))

  /*
   * Куда расти, решает не вызывающий код, а само место: сравниваем, чего
   * реально больше — над кнопкой или под ней. Кнопка нижней строки почти
   * всегда открывает вверх (над ней вся лента), кнопка в шапке — вниз (сверху
   * почти ничего нет), а боковая рельса (MODEL/EFFORT/MODE в left/right,
   * см. Composer) сама подстраивается под то, у какого края экрана она
   * оказалась, — без отдельной пометки под каждый вызов.
   */
  const spaceAbove = anchor.top - 14
  const spaceBelow = window.innerHeight - anchor.bottom - 14
  const openDownward = spaceBelow > spaceAbove

  const verticalStyle = openDownward
    ? { top: `${Math.max(8, anchor.bottom + 6)}px` }
    : { bottom: `${Math.max(8, window.innerHeight - anchor.top + 6)}px` }

  /*
   * Место в выбранную сторону не бесконечно: у compact, например, MODE сидит
   * невысоко над низом панели, а вариантов в нём — на добрую сотню пикселей
   * текста. Без своего потолка меню просто продолжало бы расти поверх экрана —
   * заголовок и первые пункты уезжали за край, до них было не дотянуться.
   * max-height в самой .menu (86vh) не спасает: он отмеряет от всего окна, а
   * не от места, которое реально осталось от кнопки до края. Пола под
   * availableHeight нет нарочно — искусственный минимум точно так же
   * выталкивал бы меню за экран, если реального места меньше минимума; список
   * внутри и так скроллится (см. overflow-y в .menu).
   */
  const availableHeight = openDownward ? spaceBelow : spaceAbove
  // Не шире потолка самого класса .menu (min(640px, 86vh)) — иначе инлайн-стиль
  // молча его перебивает для любой раскладки, не только compact.
  const maxHeight = Math.min(640, window.innerHeight * 0.86, Math.max(0, availableHeight))

  return (
    <>
      <div className={s.menuScrim} onClick={onClose} />
      <div
        className={s.menu}
        style={{
          width: `${actualWidth}px`,
          right: `${right}px`,
          maxHeight: `${maxHeight}px`,
          ...verticalStyle,
        }}
      >
        <div className={s.menuHead}>
          <span className={s.menuTitle}>{title}</span>
          <span className={s.menuHint}>{hint}</span>
        </div>

        {options.map((option) => {
          const on = option.id === selected
          return (
            <button
              key={option.id}
              type="button"
              disabled={option.disabled}
              className={[s.menuItem, on && s.menuItemOn, !option.disabled && hovered === option.id && s.menuItemHover]
                .filter(Boolean)
                .join(' ')}
              onClick={() => onPick(option.id)}
              onMouseEnter={() => setHovered(option.disabled ? null : option.id)}
              onMouseLeave={() => setHovered((current) => (current === option.id ? null : current))}
            >
              {tick ? <span className={s.menuTick}>{on ? '✓' : ''}</span> : null}
              <div className={s.menuBody}>
                <div className={s.menuRow}>
                  <span className={`${s.menuLabel} ${on ? s.menuLabelOn : ''}`}>{option.label}</span>
                  {option.tag ? (
                    <span className={`${s.menuTag} ${option.danger ? s.menuTagDanger : ''}`}>{option.tag}</span>
                  ) : null}
                </div>
                {option.sub ? <div className={s.menuSub}>{option.sub}</div> : null}
              </div>
            </button>
          )
        })}
      </div>
    </>
  )
}

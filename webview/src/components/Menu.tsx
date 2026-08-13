import type { Anchor } from './StatusBar'
import s from './shell.module.css'

export interface MenuOption {
  id: string
  label: string
  tag?: string
  danger?: boolean
  sub?: string
  key?: string
}

interface MenuProps {
  title: string
  hint: string
  width: number
  /** Кнопка, из которой меню открыли: оно встаёт прямо над ней. */
  anchor: Anchor
  options: MenuOption[]
  selected: string
  onPick: (id: string) => void
  onClose: () => void
  /**
   * Кнопки нижней строки открывают меню вверх — над собой. Кнопка в хедере стоит
   * у верхнего края панели, там расти вверх некуда: для неё anchor.top — нижний
   * край самой кнопки, и меню растёт вниз от него.
   */
  openDownward?: boolean
}

export const Menu = ({ title, hint, width, anchor, options, selected, onPick, onClose, openDownward = false }: MenuProps) => {
  // Прижимаемся к правому краю кнопки, но не даём уехать за края панели: она в
  // IDE бывает уже самого меню.
  const actualWidth = Math.min(width, window.innerWidth - 16)
  const right = Math.min(Math.max(8, anchor.right), Math.max(8, window.innerWidth - actualWidth - 8))
  const verticalStyle = openDownward
    ? { top: `${Math.max(8, anchor.top + 6)}px` }
    : { bottom: `${Math.max(8, window.innerHeight - anchor.top + 6)}px` }

  /*
   * Меню растёт от кнопки в сторону, где нет соседа (вверх у нижней строки,
   * вниз у кнопки в шапке — см. openDownward), но место в этой стороне не
   * бесконечно: у compact, например, MODE сидит невысоко над низом панели, а
   * вариантов в нём — на добрую сотню пикселей текста. Без своего потолка
   * меню просто продолжало расти вверх поверх экрана — заголовок и первые
   * пункты уезжали за верхний край, до них было не дотянуться. max-height в
   * самой .menu (86vh) не спасает: он отмеряет от всего окна, а не от места,
   * которое реально осталось от кнопки до края. Пола под availableHeight нет
   * нарочно — искусственный минимум точно так же выталкивал бы меню за
   * экран, если реального места меньше минимума; список внутри и так
   * скроллится (см. overflow-y в .menu).
   */
  const availableHeight = openDownward ? window.innerHeight - anchor.top - 14 : anchor.top - 14
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
              className={`${s.menuItem} ${on ? s.menuItemOn : ''}`}
              onClick={() => onPick(option.id)}
            >
              <span className={s.menuTick}>{on ? '✓' : ''}</span>
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

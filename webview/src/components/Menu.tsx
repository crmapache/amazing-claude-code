import type { Anchor } from './StatusBar'
import s from './shell.module.css'

export interface MenuOption {
  id: string
  label: string
  tag?: string
  danger?: boolean
  sub?: string
  key?: string
  /** Цветная точка перед подписью — цвет как значение CSS (var(...) или #hex). */
  dot?: string
}

interface MenuProps {
  title: string
  hint: string
  width: number
  /** Кнопка, из которой меню открыли: оно встаёт рядом с ней. */
  anchor: Anchor
  options: MenuOption[]
  selected: string
  onPick: (id: string) => void
  onClose: () => void
  /** 'up' (по умолчанию) — растёт вверх от кнопки, как у нижней строки статуса. 'down' — вниз. */
  placement?: 'up' | 'down'
}

export const Menu = ({ title, hint, width, anchor, options, selected, onPick, onClose, placement = 'up' }: MenuProps) => {
  // Прижимаемся к правому краю кнопки, но не даём уехать за края панели: она в
  // IDE бывает уже самого меню.
  const actualWidth = Math.min(width, window.innerWidth - 16)
  const right = Math.min(Math.max(8, anchor.right), Math.max(8, window.innerWidth - actualWidth - 8))
  const vertical =
    placement === 'down'
      ? { top: `${Math.max(8, (anchor.bottom ?? anchor.top) + 6)}px` }
      : { bottom: `${Math.max(8, window.innerHeight - anchor.top + 6)}px` }

  return (
    <>
      <div className={s.menuScrim} onClick={onClose} />
      <div className={s.menu} style={{ width: `${actualWidth}px`, right: `${right}px`, ...vertical }}>
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
                  {option.dot ? <span className={s.menuDot} style={{ background: option.dot }} /> : null}
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

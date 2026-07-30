import { useEffect, useRef } from 'react'
import type { CommandEntry } from '../feed/slash'
import s from './composer.module.css'

interface SlashSuggestProps {
  commands: CommandEntry[]
  highlight: number
  onPick: (command: CommandEntry) => void
  onHighlight: (index: number) => void
  /** Аргумент команды показываем без слэша — это не имя команды, а её значение. */
  showSlash?: boolean
}

/** Список команд над полем ввода. Выбор идёт с клавиатуры, мышь — на всякий случай. */
export const SlashSuggest = ({ commands, highlight, onPick, onHighlight, showSlash = true }: SlashSuggestProps) => {
  const active = useRef<HTMLButtonElement>(null)

  // При ходьбе стрелками подсвеченная строка должна оставаться на виду.
  useEffect(() => {
    active.current?.scrollIntoView({ block: 'nearest' })
  }, [highlight])

  return (
    <div className={s.suggest}>
      {commands.map((command, index) => (
        <button
          key={`${command.group}-${command.id}`}
          ref={index === highlight ? active : undefined}
          type="button"
          className={`${s.suggestItem} ${index === highlight ? s.suggestItemOn : ''}`}
          // mousedown, а не click: click приходит после потери фокуса полем ввода,
          // и подсказка успевает закрыться раньше выбора.
          onMouseDown={(event) => {
            event.preventDefault()
            onPick(command)
          }}
          onMouseEnter={() => onHighlight(index)}
        >
          <span className={s.suggestName}>{showSlash ? '/' : ''}{command.id}</span>
          {command.hint ? <span className={s.suggestHintText}>{command.hint}</span> : null}
          {command.group !== 'project' ? (
            <span className={s.suggestGroup}>{command.group}</span>
          ) : null}
        </button>
      ))}

    </div>
  )
}

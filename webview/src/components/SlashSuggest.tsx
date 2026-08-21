import { useEffect, useRef } from 'react'
import type { CommandEntry } from '../feed/slash'
import s from './composer.module.css'

interface SlashSuggestProps {
  commands: CommandEntry[]
  highlight: number
  onPick: (command: CommandEntry) => void
  onHighlight: (index: number) => void
  /** A command's argument is shown without a slash - it is the value rather than the command's name. */
  showSlash?: boolean
}

/** The command list above the input field. Picking happens from the keyboard; the mouse is a fallback. */
export const SlashSuggest = ({
  commands,
  highlight,
  onPick,
  onHighlight,
  showSlash = true,
}: SlashSuggestProps) => {
  const active = useRef<HTMLButtonElement>(null)

  // While walking with the arrows the highlighted row has to stay in view.
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
          // mousedown rather than click: a click arrives after the input field has lost focus, and the
          // hint manages to close before the choice is made.
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

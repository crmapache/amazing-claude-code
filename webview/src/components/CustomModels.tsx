import { useState } from 'react'
import { isModelName } from '../catalog'
import { useFieldHistory } from '../hooks/useFieldHistory'
import { useT } from '../i18n'
import s from './sideMenu.module.css'

/**
 * The models somebody names by hand, because Claude Code does not name them.
 *
 * The menu under the input field shows the catalogue the CLI itself answers with, and on an ordinary
 * sign-in that is the whole truth. Through a proxy router or a gateway it is not: the models on the
 * other end are whatever that end serves, the CLI has never heard of them, and until this screen there
 * was no way to name one - the menu offered a list, and a list was all it could offer.
 *
 * The list is the machine's rather than the project's, like the rest of the settings behind this row: a
 * provider is a property of how somebody's Claude Code is set up, not of the repository they opened.
 *
 * Nothing is chosen here. What is added stands in the MODEL menu afterwards (see modelOptions), which is
 * where models are picked - a settings screen that also moved the conversation on screen would be a
 * settings screen with a side effect.
 */
export const CustomModels = ({
  models,
  onChange,
}: {
  models: string[]
  /** The whole list, always - an addition and a removal are the same message (see setCustomModels). */
  onChange: (models: string[]) => void
}) => {
  const t = useT()
  const [typed, setTyped] = useState('')
  const keys = useFieldHistory(typed, setTyped)

  const name = typed.trim()
  // A name that cannot be a launch argument is refused rather than trimmed into something else: the IDE
  // would drop it anyway (see ClaudePreferences.customModels), and a button that adds nothing is worse
  // than a button that will not press. One already on the list is refused for the plainer reason.
  const ready = isModelName(name) && !models.includes(name)

  const add = () => {
    if (!ready) return

    onChange([...models, name])
    setTyped('')
  }

  return (
    <div className={s.screen}>
      <span className={s.screenNote}>{t.customModels.note}</span>
      <span className={s.screenNote}>{t.customModels.warn}</span>

      <div className={s.field}>
        <div className={s.inputRow}>
          <input
            className={s.input}
            value={typed}
            spellCheck={false}
            placeholder={t.customModels.placeholder}
            aria-label={t.customModels.placeholder}
            onChange={keys.onChange}
            onKeyDown={(event) => {
              keys.onKeyDown(event)
              if (!event.defaultPrevented && event.key === 'Enter') add()
            }}
          />
          <button type="button" className={`${s.button} ${s.buttonPrimary}`} disabled={!ready} onClick={add}>
            {t.customModels.add}
          </button>
        </div>
      </div>

      {models.length > 0 && (
        <div className={s.field}>
          <span className={s.screenLabel}>{t.customModels.added}</span>
          {models.map((model) => (
            <div key={model} className={s.device}>
              <span className={s.modelName}>{model}</span>
              {/* Nothing is lost by it: the entry is a name, and the menu it stood in is where it goes
                  back the moment it is typed again. */}
              <button
                type="button"
                className={`${s.button} ${s.buttonDanger}`}
                onClick={() => onChange(models.filter((one) => one !== model))}
              >
                {t.customModels.remove}
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

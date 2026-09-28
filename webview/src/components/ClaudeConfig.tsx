import { useEffect, useState } from 'react'
import { useFieldHistory } from '../hooks/useFieldHistory'
import { useT } from '../i18n'
import type { Dict } from '../i18n/en'
import type { ClaudeConfigSetting } from '../protocol'
import s from './sideMenu.module.css'

/** What the screen knows at the moment - the IDE's last word about Claude Code's settings. */
export interface ClaudeConfigState {
  settings: ClaudeConfigSetting[]
  loading: boolean
  /** One of the screen's own words - `noCli` or `unreadable` - or empty. */
  error: string
}

export const EMPTY_CLAUDE_CONFIG: ClaudeConfigState = { settings: [], loading: true, error: '' }

/** The groups in the order they stand on the screen - what shapes the work first, then the terminal's. */
const GROUPS: ClaudeConfigSetting['group'][] = ['work', 'terminal', 'other']

/** A setting that takes exactly on and off - drawn as a switch rather than as two words to pick from. */
const isSwitch = (setting: ClaudeConfigSetting): boolean =>
  setting.options.length === 2 && setting.options.includes('true') && setting.options.includes('false')

/** The two settings the panel's own chips decide - see the `chips` words. */
const DECIDED_BY_CHIPS = new Set(['model', 'permissionMode'])

const labelOf = (t: Dict, key: string): string =>
  (t.claudeConfig.labels as Record<string, string | undefined>)[key] ?? key

const lockedWords = (t: Dict, layer: ClaudeConfigSetting['lockedBy']): string => {
  if (layer === 'policy') return t.claudeConfig.lockedPolicy
  if (layer === 'local') return t.claudeConfig.lockedLocal
  return t.claudeConfig.lockedProject
}

/**
 * Claude Code's own settings - what `/config` changes in a terminal - opened by `/config` in the panel and
 * from the settings list (see ClaudeConfig.kt on the IDE's side for where every value comes from).
 *
 * The list, the values each setting takes and the writing are all the CLI's: the screen only draws them.
 * A change goes out one at a time and the rows hold still until the CLI answers - every change is a whole
 * CLI rewriting its settings file, and two at once would each write the file as it found it.
 *
 * A value that is not known is drawn as none picked, with a line saying the CLI decides, rather than as a
 * guess: a switch showing "on" for a setting that is off is worse than no switch.
 */
export const ClaudeConfig = ({
  state,
  pending,
  failures,
  onSet,
}: {
  state: ClaudeConfigState
  /** The key a change is on its way for, if any. */
  pending: string | null
  /** The CLI's own words about a change it did not take, by key - its sentence, or empty for our own. */
  failures: Record<string, string>
  onSet: (key: string, value: string) => void
}) => {
  const t = useT()
  const busy = pending !== null

  const note = (setting: ClaudeConfigSetting) => {
    if (pending === setting.key) return <span className={s.switchHint}>{t.claudeConfig.saving}</span>
    if (setting.lockedBy) return <span className={s.switchHint}>{lockedWords(t, setting.lockedBy)}</span>

    const lines = [
      setting.value === undefined ? t.claudeConfig.notSet : '',
      DECIDED_BY_CHIPS.has(setting.key) ? t.claudeConfig.chips : '',
      // Where it lands decides where it holds: the CLI keeps a few settings per project, and a switch
      // that seems to do nothing in the next project is a switch nobody was told about.
      setting.projectOnly ? t.claudeConfig.projectOnly : '',
    ].filter(Boolean)

    return lines.length > 0 ? <span className={s.switchHint}>{lines.join(' ')}</span> : null
  }

  const failure = (setting: ClaudeConfigSetting) =>
    setting.key in failures ? (
      <div className={`${s.message} ${s.messageBad}`}>{failures[setting.key] || t.claudeConfig.failed}</div>
    ) : null

  const row = (setting: ClaudeConfigSetting) => {
    const locked = Boolean(setting.lockedBy)
    const disabled = busy || locked

    // A switch only when its state is known: an unknown one is two words with neither picked (below).
    if (isSwitch(setting) && setting.value !== undefined) {
      const on = setting.value === 'true'
      return (
        <div key={setting.key} className={s.configItem}>
          <button
            type="button"
            className={`${s.switchRow} ${disabled ? s.switchRowMoot : ''}`}
            aria-pressed={on}
            disabled={disabled}
            onClick={() => onSet(setting.key, on ? 'false' : 'true')}
          >
            <span className={s.switchText}>
              <span className={s.switchLabel}>{labelOf(t, setting.key)}</span>
              {note(setting)}
            </span>
            <span className={`${s.switchTrack} ${on ? s.switchTrackOn : ''}`}>
              <span className={`${s.switchKnob} ${on ? s.switchKnobOn : ''}`} />
            </span>
          </button>
          {failure(setting)}
        </div>
      )
    }

    return (
      <div key={setting.key} className={s.configItem}>
        <div className={`${s.configCard} ${disabled ? s.switchRowMoot : ''}`}>
          <span className={s.switchText}>
            <span className={s.switchLabel}>{labelOf(t, setting.key)}</span>
            {note(setting)}
          </span>
          {setting.free ? (
            <FreeValue
              value={setting.value ?? ''}
              disabled={disabled}
              label={labelOf(t, setting.key)}
              onSave={(value) => onSet(setting.key, value)}
            />
          ) : (
            <div className={s.configChoices} role="radiogroup" aria-label={labelOf(t, setting.key)}>
              {setting.options.map((option) => {
                const picked = option === setting.value
                return (
                  <button
                    key={option}
                    type="button"
                    role="radio"
                    aria-checked={picked}
                    className={`${s.configChoice} ${picked ? s.configChoiceOn : ''}`}
                    disabled={disabled}
                    onClick={() => {
                      if (!picked) onSet(setting.key, option)
                    }}
                  >
                    {optionWords(t, option)}
                  </button>
                )
              })}
            </div>
          )}
        </div>
        {failure(setting)}
      </div>
    )
  }

  return (
    <div className={s.screen}>
      <div className={s.screenNote}>{state.error ? '' : t.claudeConfig.intro}</div>

      {state.error ? (
        <div className={`${s.message} ${s.messageBad}`}>
          {state.error === 'noCli' ? t.claudeConfig.noCli : t.claudeConfig.unreadable}
        </div>
      ) : null}

      {state.loading && state.settings.length === 0 && !state.error ? (
        <div className={s.screenEmpty}>{t.claudeConfig.loading}</div>
      ) : null}

      {GROUPS.map((group) => {
        const settings = state.settings.filter((setting) => setting.group === group)
        if (settings.length === 0) return null

        return (
          <section key={group} className={s.configGroup}>
            <div className={s.screenLabel}>{t.claudeConfig.groups[group]}</div>
            <div className={s.indicatorList}>{settings.map(row)}</div>
          </section>
        )
      })}
    </div>
  )
}

/**
 * On and off in the panel's words wherever the CLI offers them - a switch whose state is not known, and a
 * setting that takes a third value beside them ("default" for Remote Control). Anything else as the CLI
 * says it: those are its own names for things.
 */
const optionWords = (t: Dict, option: string): string => {
  if (option === 'true') return t.claudeConfig.on
  if (option === 'false') return t.claudeConfig.off
  return option
}

/**
 * A setting that takes any value - the language Claude answers in. Its own component for the reason
 * OwnAnswer is one: the keys the embedded browser does not give a plain field come from a hook (see
 * useFieldHistory), and a hook cannot be called inside the list's loop.
 */
const FreeValue = ({
  value,
  disabled,
  label,
  onSave,
}: {
  value: string
  disabled: boolean
  label: string
  onSave: (value: string) => void
}) => {
  const t = useT()
  const [draft, setDraft] = useState(value)
  const field = useFieldHistory(draft, setDraft)

  // What the CLI stored is the new ground: it spells a language its own way ("ja" comes back "Japanese"),
  // and a field still holding what was typed would offer to save it again.
  useEffect(() => setDraft(value), [value])
  const changed = draft.trim() !== '' && draft.trim() !== value

  return (
    <div className={s.inputRow}>
      <input
        className={s.input}
        value={draft}
        aria-label={label}
        disabled={disabled}
        spellCheck={false}
        onChange={field.onChange}
        onKeyDown={(event) => {
          if (event.nativeEvent.isComposing) return
          if (event.key === 'Enter' && changed) {
            event.preventDefault()
            onSave(draft.trim())
            return
          }
          field.onKeyDown(event)
        }}
      />
      <button
        type="button"
        className={`${s.button} ${s.buttonPrimary}`}
        disabled={disabled || !changed}
        onClick={() => onSave(draft.trim())}
      >
        {t.claudeConfig.save}
      </button>
    </div>
  )
}

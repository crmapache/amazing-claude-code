import { useState } from 'react'
import { EFFORT_OPTIONS, MODE_OPTIONS, modelOptions } from '../../catalog'
import type { MenuOption } from '../../components/Menu'
import type { ModelInfo } from '../../protocol'
import type { SessionLaunch } from '../link'
import type { ProjectEntry } from './Sessions'
import { Back } from './Back'
import m from '../mobile.module.css'

interface NewSessionProps {
  project: ProjectEntry
  /** The catalogue as the CLI on that machine reports it, or null until it has said (see catalog.ts). */
  models: ModelInfo[] | null
  /** What is chosen at the desk - where this screen starts from rather than from an invention of ours. */
  prefs: SessionLaunch
  /** The project is being opened - only possible for a closed one, and it takes a while. */
  busy: boolean
  error: string
  onStart: (launch: SessionLaunch) => void
  onBack: () => void
}

/**
 * The line that means "whatever that machine is set up to do".
 *
 * First in every one of the three lists, and the value this screen starts on when nothing has been
 * chosen at the desk either. It is a real answer rather than a missing one: Claude Code has its own
 * configured defaults, and a phone quietly sending "manual" would be overriding them while claiming to
 * be doing nothing.
 */
const AS_CONFIGURED: MenuOption = {
  id: '',
  label: 'As configured',
  sub: 'However Claude Code is set up on that machine.',
}

/**
 * Starting a conversation from a phone.
 *
 * The three choices are here because the phone cannot see the ones at the desk: the panel's selectors
 * sit beside the input field, and a conversation started from across the city would otherwise begin on
 * whatever was picked there last - which, for the mode, is the difference between an agent that asks
 * before it writes and one that does not.
 *
 * The choice reaches this conversation and nothing else. It is not written into the machine's settings
 * (see SessionLaunch), so a tab started here decides nothing about the next one opened at the keyboard.
 */
export const NewSession = ({ project, models, prefs, busy, error, onStart, onBack }: NewSessionProps) => {
  const [launch, setLaunch] = useState<SessionLaunch>(prefs)

  // One list at a time. Three lists open at once is six screens of scrolling to reach a button, and the
  // usual visit here changes one of the three - most often none.
  const [open, setOpen] = useState<keyof SessionLaunch | null>(null)

  const choices: Array<{ field: keyof SessionLaunch; title: string; options: MenuOption[] }> = [
    { field: 'model', title: 'Model', options: [AS_CONFIGURED, ...modelOptions(models)] },
    { field: 'effort', title: 'Effort', options: [AS_CONFIGURED, ...EFFORT_OPTIONS] },
    { field: 'mode', title: 'Mode', options: [AS_CONFIGURED, ...MODE_OPTIONS] },
  ]

  return (
    <>
      <header className={m.header}>
        <Back onClick={onBack} />
        <span className={m.headerTitle}>New conversation</span>
        <span className={m.headerMeta}>{project.name}</span>
      </header>

      <div className={m.list}>
        {project.closed && (
          <p className={m.reach}>This project is closed - the IDE will open it before starting.</p>
        )}

        <div className={m.choices}>
          {choices.map(({ field, title, options }, index) => {
            const chosen = options.find((option) => option.id === launch[field]) ?? AS_CONFIGURED
            const isOpen = open === field

            return (
              <div key={field}>
                {index > 0 && <div className={m.choiceGap} />}

                <button
                  type="button"
                  className={`${m.choiceHead} ${isOpen ? m.choiceHeadOpen : ''}`}
                  onClick={() => setOpen((current) => (current === field ? null : field))}
                >
                  <span className={m.choiceTitle}>{title}</span>
                  <span className={m.choiceValue}>{chosen.label}</span>
                </button>

                {isOpen && (
                  <div className={m.choiceOptions}>
                    {options.map((option) => (
                      <button
                        key={option.id || 'as-configured'}
                        type="button"
                        className={`${m.choiceOption} ${option.id === launch[field] ? m.choiceOptionPicked : ''}`}
                        disabled={option.disabled}
                        onClick={() => {
                          setLaunch((current) => ({ ...current, [field]: option.id }))
                          setOpen(null)
                        }}
                      >
                        <span className={m.rowMain}>
                          <span className={`${m.rowTitle} ${option.danger ? m.choiceDanger : ''}`}>
                            {option.label}
                          </span>
                          {option.sub && <span className={m.rowMeta}>{option.sub}</span>}
                        </span>
                        {option.tag && <span className={m.badgeRunning}>{option.tag}</span>}
                      </button>
                    ))}
                  </div>
                )}
              </div>
            )
          })}
        </div>

        {error && <p className={m.startError}>{error}</p>}
      </div>

      <footer className={m.decisionFooter}>
        <button type="button" className={m.buttonPrimary} disabled={busy} onClick={() => onStart(launch)}>
          {busy ? 'Opening the project…' : 'Start'}
        </button>
      </footer>
    </>
  )
}

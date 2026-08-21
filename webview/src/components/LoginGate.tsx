import { useState } from 'react'
import s from './shell.module.css'

export interface AuthState {
  installed: boolean
  loggedIn: boolean
  email?: string
  plan?: string
  /** The path to the CLI given by hand, when one is set. */
  executablePath?: string
  /** Where the executable was looked for - arrives only when it was not found. */
  searched?: string[]
}

interface LoginGateProps {
  /** Empty until the shell has answered: we say so honestly. */
  auth: AuthState | null
  /** The sign-in is already open in the terminal and we are waiting for it to finish. */
  waiting: boolean
  onLogin: () => void
  onRecheck: () => void
  /** Point the panel at the CLI's file by hand - when it did not find it itself. */
  onSetExecutablePath: (path: string) => void
}

/**
 * A screen instead of the panel until the sign-in is confirmed.
 *
 * Showing an input field without a sign-in would be dishonest: the agent answers every question with a
 * single line about /login, while that command itself is unavailable in streaming mode.
 */
export const LoginGate = ({ auth, waiting, onLogin, onRecheck, onSetExecutablePath }: LoginGateProps) => {
  /**
   * The field holds what the person typed, and while they have typed nothing - the path already saved
   * earlier. It cannot be started as state of its own: the screen is shown before the shell's first
   * answer ("Checking…" until it arrives), and the initial value would be empty forever - while sending
   * an untouched empty field would silently wipe the configured path.
   */
  const [edited, setEdited] = useState<string | null>(null)
  const path = edited ?? auth?.executablePath ?? ''

  if (!auth) {
    return (
      <div className={s.gate}>
        <p className={s.gateWaiting}>Checking Claude Code…</p>
      </div>
    )
  }

  /**
   * The file was not found - but "not found" and "not installed" are not the same thing: the CLI is
   * sometimes installed in an unusual place, and the IDE's PATH is not the terminal's. So here are both
   * the list of places checked and a field to point at the file oneself.
   */
  if (!auth.installed) {
    return (
      <div className={s.gate}>
        <p className={s.gateTitle}>Claude Code not found</p>
        <p className={s.gateText}>
          The panel drives the claude CLI. If it is installed, point the panel at it - the IDE does not always
          see the same PATH as your terminal.
        </p>

        <div className={s.gateRow}>
          <input
            className={s.gateInput}
            value={path}
            placeholder="/path/to/claude"
            spellCheck={false}
            onChange={(event) => setEdited(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === 'Enter') onSetExecutablePath(path.trim())
            }}
          />
          <button type="button" className={s.gateButton} onClick={() => onSetExecutablePath(path.trim())}>
            Use this
          </button>
        </div>

        {auth.searched && auth.searched.length > 0 ? (
          <details className={s.gateDetails}>
            <summary className={s.gateSummary}>Where the panel looked</summary>
            <ul className={s.gateList}>
              {auth.searched.map((place) => (
                <li key={place}>{place}</li>
              ))}
            </ul>
          </details>
        ) : null}

        <button type="button" className={s.gateGhost} onClick={onRecheck}>
          Check again
        </button>
      </div>
    )
  }

  return (
    <div className={s.gate}>
      <p className={s.gateTitle}>Sign in to Claude Code</p>
      <p className={s.gateText}>
        Signing in happens once, in the IDE terminal: Claude opens a browser and waits for you to come
        back. The panel picks it up on its own.
      </p>

      <button type="button" className={s.gateButton} onClick={onLogin}>
        {waiting ? 'Open the terminal again' : 'Log in'}
      </button>

      {waiting ? (
        <p className={s.gateWaiting}>Finish the login in the terminal - this screen closes by itself.</p>
      ) : null}

      <button type="button" className={s.gateGhost} onClick={onRecheck}>
        Check again
      </button>
    </div>
  )
}

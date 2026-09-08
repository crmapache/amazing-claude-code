import { useState } from 'react'
import s from './shell.module.css'
import { useT } from '../i18n'
import { useFieldHistory } from '../hooks/useFieldHistory'

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
  /**
   * The machine's other Claude accounts, when there are any - offered right here as a way out.
   *
   * This gate is an early return in front of the whole panel, the side menu included. So a person whose
   * current account lost its credential would be locked out of the one screen that could fix it, with
   * nothing on offer but signing that same dead account in again. One row of buttons is the difference
   * between a dead end and a switch.
   */
  otherAccounts?: { id: string; label: string }[]
  onSwitchAccount?: (id: string) => void
  /**
   * What the account in force is called, or empty when there is nothing to call it.
   *
   * The sign-in goes into that account's credential drawer (see ClaudeLogin), so with several accounts
   * on the machine this is the screen's whole subject: a bare "Log in" above a list of other names does
   * not say which of them the button fills.
   */
  account: string
  /** The sign-in is already open in the terminal and we are waiting for it to finish. */
  waiting: boolean
  /** Why it could not even be started, when it could not - see the `authProblem` message. */
  problem: 'no-drawer' | 'no-terminal' | ''
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
export const LoginGate = ({
  auth,
  account,
  waiting,
  problem,
  otherAccounts,
  onSwitchAccount,
  onLogin,
  onRecheck,
  onSetExecutablePath,
}: LoginGateProps) => {
  const t = useT()
  /**
   * The field holds what the person typed, and while they have typed nothing - the path already saved
   * earlier. It cannot be started as state of its own: the screen is shown before the shell's first
   * answer ("Checking…" until it arrives), and the initial value would be empty forever - while sending
   * an untouched empty field would silently wipe the configured path.
   */
  const [edited, setEdited] = useState<string | null>(null)
  const path = edited ?? auth?.executablePath ?? ''
  // Before the early returns: a hook has to be called on every render, whatever the screen shows.
  const pathKeys = useFieldHistory(path, setEdited)

  if (!auth) {
    return (
      <div className={s.gate}>
        <p className={s.gateWaiting}>{t.login.checking}</p>
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
        <p className={s.gateTitle}>{t.login.notFound}</p>
        <p className={s.gateText}>{t.login.notFoundText}</p>

        <div className={s.gateRow}>
          <input
            className={s.gateInput}
            value={path}
            placeholder="/path/to/claude"
            spellCheck={false}
            onChange={pathKeys.onChange}
            onKeyDown={(event) => {
              pathKeys.onKeyDown(event)
              if (!event.defaultPrevented && event.key === 'Enter') onSetExecutablePath(path.trim())
            }}
          />
          <button type="button" className={s.gateButton} onClick={() => onSetExecutablePath(path.trim())}>
            {t.login.useThis}
          </button>
        </div>

        {auth.searched && auth.searched.length > 0 ? (
          <details className={s.gateDetails}>
            <summary className={s.gateSummary}>{t.login.whereLooked}</summary>
            <ul className={s.gateList}>
              {auth.searched.map((place) => (
                <li key={place}>{place}</li>
              ))}
            </ul>
          </details>
        ) : null}

        <button type="button" className={s.gateGhost} onClick={onRecheck}>
          {t.login.checkAgain}
        </button>
      </div>
    )
  }

  return (
    <div className={s.gate}>
      {/* Which account, whenever there is one to name: the button fills that account's drawer. */}
      <p className={s.gateTitle}>{account !== '' ? t.login.signInAs(account) : t.login.signIn}</p>
      <p className={s.gateText}>{t.login.signInText}</p>

      <button type="button" className={s.gateButton} onClick={onLogin}>
        {waiting ? t.login.openTerminalAgain : t.login.logIn}
      </button>

      {/* Directly under the button, both of them: what the press came to is not news about the screen. */}
      {problem !== '' ? (
        <p className={s.gateProblem}>
          {problem === 'no-drawer' ? t.login.noDrawer : t.login.noTerminal}
        </p>
      ) : null}

      {waiting ? <p className={s.gateWaiting}>{t.login.finishInTerminal}</p> : null}

      {otherAccounts && otherAccounts.length > 0 && onSwitchAccount ? (
        <div className={s.gateSwitch}>
          <p className={s.gateText}>{t.login.orSwitch}</p>
          {/* Not .gateRow: that one is the width of the field it was written for, and names left-aligned
              inside it stood off to one side of a screen centred to the pixel. */}
          <div className={s.gateAccounts}>
            {otherAccounts.map((one) => (
              <button
                key={one.id}
                type="button"
                className={s.gateAccount}
                onClick={() => onSwitchAccount(one.id)}
              >
                {one.label}
              </button>
            ))}
          </div>
        </div>
      ) : null}

      <button type="button" className={s.gateGhost} onClick={onRecheck}>
        {t.login.checkAgain}
      </button>
    </div>
  )
}

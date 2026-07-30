import s from './shell.module.css'

export interface AuthState {
  installed: boolean
  loggedIn: boolean
  email?: string
  plan?: string
}

interface LoginGateProps {
  /** Пусто, пока оболочка не ответила: об этом честно и говорим. */
  auth: AuthState | null
  /** Вход уже открыт в терминале и мы ждём его окончания. */
  waiting: boolean
  onLogin: () => void
  onRecheck: () => void
}

/**
 * Экран вместо панели, пока вход не подтверждён.
 *
 * Показывать поле ввода без входа нечестно: агент ответит на любой вопрос одной
 * строкой про /login, а сама эта команда в потоковом режиме недоступна.
 */
export const LoginGate = ({ auth, waiting, onLogin, onRecheck }: LoginGateProps) => {
  if (!auth) {
    return (
      <div className={s.gate}>
        <p className={s.gateWaiting}>Checking Claude Code…</p>
      </div>
    )
  }

  if (!auth.installed) {
    return (
      <div className={s.gate}>
        <p className={s.gateTitle}>Claude Code is not installed</p>
        <p className={s.gateText}>
          The panel drives the claude CLI. Install it, make sure it is on your PATH, and check again.
        </p>
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
        <p className={s.gateWaiting}>Finish the login in the terminal — this screen closes by itself.</p>
      ) : null}

      <button type="button" className={s.gateGhost} onClick={onRecheck}>
        Check again
      </button>
    </div>
  )
}

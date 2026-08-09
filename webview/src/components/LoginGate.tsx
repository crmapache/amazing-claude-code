import { useState } from 'react'
import s from './shell.module.css'

export interface AuthState {
  installed: boolean
  loggedIn: boolean
  email?: string
  plan?: string
  /** Путь к CLI, указанный руками, если он задан. */
  executablePath?: string
  /** Где искали исполняемый файл — приходит, только когда не нашли. */
  searched?: string[]
}

interface LoginGateProps {
  /** Пусто, пока оболочка не ответила: об этом честно и говорим. */
  auth: AuthState | null
  /** Вход уже открыт в терминале и мы ждём его окончания. */
  waiting: boolean
  onLogin: () => void
  onRecheck: () => void
  /** Показать панели файл CLI руками — когда сама она его не нашла. */
  onSetExecutablePath: (path: string) => void
}

/**
 * Экран вместо панели, пока вход не подтверждён.
 *
 * Показывать поле ввода без входа нечестно: агент ответит на любой вопрос одной
 * строкой про /login, а сама эта команда в потоковом режиме недоступна.
 */
export const LoginGate = ({ auth, waiting, onLogin, onRecheck, onSetExecutablePath }: LoginGateProps) => {
  /**
   * В поле — то, что человек набрал, а пока он ничего не набирал — путь, уже
   * сохранённый раньше. Своим состоянием его не завести: экран показывается
   * ещё до первого ответа оболочки (пока ответа нет — «Checking…»), и
   * начальное значение досталось бы пустое навсегда — а отправка нетронутого
   * пустого поля молча стёрла бы настроенный путь.
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
   * Файл не нашёлся — но «не нашёлся» и «не установлен» не одно и то же: CLI
   * бывает поставлен в необычное место, а PATH у IDE не такой, как в терминале.
   * Поэтому здесь и список проверенных мест, и поле, чтобы показать файл самому.
   */
  if (!auth.installed) {
    return (
      <div className={s.gate}>
        <p className={s.gateTitle}>Claude Code not found</p>
        <p className={s.gateText}>
          The panel drives the claude CLI. If it is installed, point the panel at it — the IDE does not always
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
        <p className={s.gateWaiting}>Finish the login in the terminal — this screen closes by itself.</p>
      ) : null}

      <button type="button" className={s.gateGhost} onClick={onRecheck}>
        Check again
      </button>
    </div>
  )
}

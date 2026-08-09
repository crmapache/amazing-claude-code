import { Component, type ErrorInfo, type ReactNode } from 'react'
import { send } from '../bridge'
import s from './shell.module.css'

/**
 * Последняя преграда между сбоем в интерфейсе и пустой чёрной панелью.
 *
 * React при необработанной ошибке сносит всё дерево — панель просто гасла, без
 * единого слова о том, что случилось, и без способа вернуться: инструменты
 * разработчика во встроенном браузере ещё надо суметь открыть. Здесь же
 * человеку остаётся кнопка перезагрузки (разговоры живут в процессах CLI и
 * переживают её), а причина уходит в лог IDE — иначе о ней не узнать вообще
 * никому.
 */
interface CrashState {
  message: string
}

export class Crash extends Component<{ children: ReactNode }, CrashState> {
  state: CrashState = { message: '' }

  static getDerivedStateFromError(error: unknown): CrashState {
    return { message: error instanceof Error ? error.message : String(error) }
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    send({ type: 'trace', message: `panel crashed: ${error.stack ?? error.message}\n${info.componentStack ?? ''}` })
  }

  render() {
    if (!this.state.message) return this.props.children

    return (
      <div className={s.panel} data-anchor="right">
        <div className={s.gate}>
          <p className={s.gateTitle}>The panel hit an error</p>
          <p className={s.gateText}>
            Reloading is safe: your conversations live in the Claude Code processes behind the panel and survive it.
          </p>
          <p className={s.gateWaiting}>{this.state.message}</p>
          <button type="button" className={s.gateButton} onClick={() => window.location.reload()}>
            Reload the panel
          </button>
        </div>
      </div>
    )
  }
}

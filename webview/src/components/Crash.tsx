import { Component, type ErrorInfo, type ReactNode } from 'react'
import { send } from '../bridge'
import s from './shell.module.css'
import { dictOf, resolveLocale } from '../i18n'

/**
 * The last barrier between a failure in the interface and an empty black panel.
 *
 * On an unhandled error React tears the whole tree down - the panel simply went dark, without a single
 * word about what had happened and with no way back: the developer tools inside an embedded browser have
 * to be opened first, which is a feat of its own. Here the person is left with a reload button (the
 * conversations live in the CLI's processes and survive it), while the reason goes into the IDE's log -
 * otherwise nobody would ever learn it.
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

    /*
     * The words are fetched rather than taken from the hook, and both halves of that are forced.
     *
     * This is a class - an error boundary has to be one - and it stands ABOVE the panel that owns the
     * language setting, so there is no context to read here even if there were a hook to read it with.
     * What there is, is the attribute the provider writes onto <html> on every change (see
     * LocaleProvider): the language is on the page itself, and reading it back is exact.
     */
    const t = dictOf(resolveLocale(document.documentElement.lang))

    return (
      <div className={s.panel} data-anchor="right">
        <div className={s.gate}>
          <p className={s.gateTitle}>{t.chrome.crash.title}</p>
          <p className={s.gateText}>{t.chrome.crash.text}</p>
          <p className={s.gateWaiting}>{this.state.message}</p>
          <button type="button" className={s.gateButton} onClick={() => window.location.reload()}>
            {t.chrome.crash.button}
          </button>
        </div>
      </div>
    )
  }
}

import { useT } from '../i18n'
import type { TerminalHoldState, TerminalRefusal } from '../protocol'
import c from './composer.module.css'

/**
 * The card over the field while a terminal holds this tab's conversation (see TerminalDesk.kt), and the note
 * when Continue in terminal did not go.
 *
 * It answers the question a held tab raises the moment anybody looks at it: why is nothing happening here. The
 * conversation is being written somewhere else, and the tab does not raise a process of its own over it - two
 * writers over one transcript is the one thing a conversation does not survive. What is typed meanwhile goes
 * into the queue and waits; the card says so, so that a message sitting there reads as waiting rather than lost.
 *
 * Two kinds of hold, and only one has buttons. A terminal the panel opened can be brought forward, and closed to
 * give the conversation back - closing it ends the CLI in it, which the card says before the button is pressed.
 * Somebody else's process (a line pasted from `/status`, a terminal outside the IDE) is theirs: nothing here may
 * end it, so the card only says where the conversation is.
 *
 * The accent's tint, like the usage question beside it: nothing is broken and nobody is waiting on an answer.
 * A refusal takes the warning's tint - the press did not do what it said.
 */
export const TerminalCard = ({
  state,
  refused,
  onShow,
  onBack,
  onDismiss,
}: {
  state?: TerminalHoldState
  refused?: TerminalRefusal
  /**
   * Bring the terminal holding the conversation forward, and close it to give the conversation back. Both absent on
   * the phone: the terminal is on the desk, and closing it from a sofa would end whatever the CLI is doing there
   * (see RemoteCommands). The card then says only where the conversation is.
   */
  onShow?: () => void
  onBack?: () => void
  /** Take the note about a refusal away. */
  onDismiss?: () => void
}) => {
  const t = useT()
  const words = t.terminal

  if (state === 'here') {
    const desk = onBack !== undefined && onShow !== undefined
    return (
      <div className={c.terminalCard} role="region" aria-label={words.here}>
        <div className={c.usageHead}>
          <span className={c.usageLabel}>{words.label}</span>
          <span className={c.usageTitle}>{words.here}</span>
        </div>
        <p className={desk ? c.usageBody : `${c.usageBody} ${c.terminalLast}`}>{desk ? words.hereBody : words.atDesk}</p>
        {desk ? (
          <div className={c.usageActions}>
            <button type="button" className={c.primary} onClick={onBack}>
              {words.back}
            </button>
            <button type="button" className={c.secondary} onClick={onShow}>
              {words.show}
            </button>
          </div>
        ) : null}
      </div>
    )
  }

  if (state === 'elsewhere') {
    return (
      <div className={c.terminalCard} role="region" aria-label={words.elsewhere}>
        <div className={c.usageHead}>
          <span className={c.usageLabel}>{words.label}</span>
          <span className={c.usageTitle}>{words.elsewhere}</span>
        </div>
        <p className={`${c.usageBody} ${c.terminalLast}`}>{words.elsewhereBody}</p>
      </div>
    )
  }

  // Only the desk asks for a terminal, so only the desk is told it did not open.
  if (!refused || !onDismiss) return null

  return (
    <div className={c.terminalRefused} role="status">
      <div className={c.usageHead}>
        <span className={c.terminalRefusedLabel}>{words.label}</span>
        <span className={c.usageTitle}>{words.refused}</span>
      </div>
      <p className={c.usageBody}>{words.reasons[refused]}</p>
      <div className={c.usageActions}>
        <button type="button" className={c.secondary} onClick={onDismiss}>
          {words.dismiss}
        </button>
      </div>
    </div>
  )
}

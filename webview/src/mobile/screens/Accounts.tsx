import { useState } from 'react'
import type { AccountInfo, UsageWindow } from '../../protocol'
import type { UsageFacts } from '../../feed/usage'
import { FIVE_HOUR_MS, WEEK_MS, paceColor } from '../../feed/usage'
import { Ring } from '../../components/StatusBar'
import { Back } from './Back'
import m from '../mobile.module.css'
import { useT } from '../../i18n'
import type { Dict } from '../../i18n/en'

/** Everything the phone holds about the machine's accounts - the `accounts` message, as it arrives. */
export interface AccountsState {
  accounts: AccountInfo[]
  /** Undefined until the IDE has proven it - see the `accounts` message. */
  capability?: 'supported' | 'ignored' | 'wsl' | 'not_signed_in' | 'api_key'
  current: string
  pending: boolean
}

interface AccountsProps {
  /** null means the list has not arrived yet - it is asked for when this screen opens. */
  state: AccountsState | null
  /** That account's figures, if any have been asked for yet - see the rings below. */
  usage: (id: string) => UsageFacts
  /** How the last request went, as a code. Empty when there is nothing to say. */
  note: string
  /** Which account is paying for the conversation this phone was last in, and what it is called. */
  paying: { account: string; title: string } | null
  onUse: (id: string) => void
  onRename: (id: string, alias: string) => void
  onForget: (id: string) => void
  onLogout: (id: string) => void
  onBack: () => void
}

/**
 * What an account is called: the person's own word for it, or the local part of the address.
 *
 * Never the whole address. A row here is one line and a long address pushes everything else off it; the
 * address stands on the line below, beside the plan, on every row - which is what makes two rows
 * comparable without reading them.
 */
const shortName = (account: AccountInfo, t: Dict): string =>
  account.alias.trim() !== ''
    ? account.alias
    : account.email !== ''
      ? (account.email.split('@')[0] ?? account.email)
      : account.isDefault === true
        ? t.accounts.defaultName
        : t.accounts.unnamed

/** One window's share, small, beside the name it belongs to. A dash where it is not known yet. */
const Meter = ({ name, window, span }: { name: string; window?: UsageWindow; span: number }) => (
  <span className={m.accountMeter}>
    {window ? (
      <>
        <Ring
          percent={window.percent}
          color={paceColor(window.percent, window.resets, span)}
          size={16}
        />
        <span style={{ color: paceColor(window.percent, window.resets, span) }}>
          {Math.round(window.percent)}%
        </span>
      </>
    ) : (
      <span className={m.accountMeterEmpty}>—</span>
    )}
    <span className={m.accountMeterName}>{name}</span>
  </span>
)

/**
 * Which Claude account pays for the work, from a phone.
 *
 * This screen was refused over the wire whole, and the argument had three legs. Two of them still stand
 * and keep their buttons at the desk: adding an account opens a terminal and a browser sign-in on that
 * machine, and so does authorizing Claude Design - neither can be finished from a sofa. The third leg
 * was that choosing an account decides what every future conversation runs on, and that was the wrong
 * comparison: an account is not a preference, it is the answer to "whose subscription is paying", and
 * the person paying is the one holding the phone. Running a five-hour window dry in the evening with a
 * second account signed in and no way to reach it is exactly the situation this channel exists for.
 *
 * What it costs is said before it is pressed, not after: switching moves every open conversation on that
 * machine onto the new account and stops any turn in the middle of running. That sentence stands under
 * the button, and the button asks again.
 */
export const Accounts = ({
  state,
  usage,
  note,
  paying,
  onUse,
  onRename,
  onForget,
  onLogout,
  onBack,
}: AccountsProps) => {
  const t = useT()

  /** Which account's name is being edited, and the text so far. One at a time. */
  const [renaming, setRenaming] = useState<string | null>(null)
  const [alias, setAlias] = useState('')

  return (
    <>
      <header className={m.threadHeader}>
        <div className={m.threadHeadRow}>
          <Back onClick={onBack} />
          <span className={m.threadTitles}>
            <span className={m.threadTitle}>{t.menu.rows.accounts.label}</span>
            <span className={m.threadWhere}>{t.mobile.accounts.subtitle}</span>
          </span>
        </div>
      </header>

      <div className={m.list}>
        {state === null && <p className={m.empty}>{t.common.loading}</p>}

        {note !== '' && <p className={m.noteBad}>{t.accounts.outcome[note] ?? t.accounts.outcome.unknown}</p>}

        {/* Which account is paying for the conversation this phone was last looking at. It is the
            question this screen is opened with, and answering it at the top saves reading four rows to
            find the one marked "in use". */}
        {paying && (
          <div className={m.payingCard}>
            <span className={m.payingLabel}>{t.mobile.accounts.paying}</span>
            <span className={m.payingName}>{paying.account}</span>
            <span className={m.payingWhere}>{paying.title}</span>
          </div>
        )}

        {state && state.accounts.length === 0 && (
          <p className={m.empty}>{t.mobile.accounts.none}</p>
        )}

        {state && state.accounts.length > 0 && (
          <div className={m.card}>
            {state.accounts.map((account) => {
              const current = account.id === state.current
              const facts = usage(account.id)

              return (
                <div key={account.id} className={m.accountRow}>
                  <div className={m.accountHead}>
                    <span className={`${m.dot} ${current ? m.dotLive : account.health === 'absent' ? m.dotCrashed : ''}`} />
                    <span className={m.accountName}>{shortName(account, t)}</span>
                    {current && <span className={m.accountCurrent}>{t.accounts.current}</span>}
                    {account.pending && <span className={m.accountPending}>{t.accounts.signingIn}</span>}
                  </div>

                  {/* The plan and the address on one line, in that order and on every row: a shape
                      repeated is a shape that can be compared without being read. */}
                  {(account.plan !== '' || account.email !== '') && (
                    <div className={m.accountFacts}>
                      {account.plan !== '' && <span className={m.accountPlan}>{account.plan}</span>}
                      {account.email !== '' && <span className={m.accountAddress}>{account.email}</span>}
                    </div>
                  )}

                  {/* Real figures rather than a tick: a stored credential proves only that a credential
                      is stored, while a percentage had to be fetched with it (see UsageProbes). */}
                  <div className={m.accountMeters}>
                    <Meter name={t.accounts.fiveHour} window={facts.session} span={FIVE_HOUR_MS} />
                    <Meter name={t.accounts.weekly} window={facts.week} span={WEEK_MS} />
                  </div>

                  {account.health === 'absent' && <p className={m.noteBad}>{t.accounts.absent}</p>}

                  {renaming === account.id ? (
                    <div className={m.formActions}>
                      <input
                        className={m.input}
                        value={alias}
                        autoFocus
                        placeholder={t.accounts.aliasPlaceholder}
                        onChange={(event) => setAlias(event.target.value)}
                      />
                      <button
                        type="button"
                        className={m.buttonPrimary}
                        onClick={() => {
                          onRename(account.id, alias)
                          setRenaming(null)
                        }}
                      >
                        {t.accounts.save}
                      </button>
                    </div>
                  ) : (
                    <div className={m.accountActions}>
                      {/* Not on a sign-in still in flight: its drawer is empty, so everything moved onto
                          it would come up signed out. The IDE refuses it as well. */}
                      {!current && account.pending !== true && (
                        <button
                          type="button"
                          className={m.rowButtonPrimary}
                          onClick={() => {
                            if (window.confirm(t.mobile.accounts.switchAsk(shortName(account, t)))) {
                              onUse(account.id)
                            }
                          }}
                        >
                          {t.accounts.use}
                        </button>
                      )}

                      <button
                        type="button"
                        className={m.rowButton}
                        onClick={() => {
                          setRenaming(account.id)
                          setAlias(account.alias)
                        }}
                      >
                        {t.accounts.rename}
                      </button>

                      {/*
                        Two different acts, so two different words and two different questions.

                        Forgetting an added account drops its credential drawer from THAT machine and
                        leaves the account itself alone - signing in again brings it back. The sign-in
                        Claude Code already had has no drawer, so the only removal it has is ending the
                        session, and that revokes the credential at Anthropic: every machine the person
                        is signed in on goes with it. The second question says so in as many words.
                      */}
                      {account.isDefault === true ? (
                        <button
                          type="button"
                          className={m.rowButtonDanger}
                          onClick={() => {
                            if (window.confirm(t.mobile.accounts.logoutAsk)) onLogout(account.id)
                          }}
                        >
                          {t.accounts.logout}
                        </button>
                      ) : (
                        <button
                          type="button"
                          className={m.rowButtonDanger}
                          onClick={() => {
                            if (window.confirm(t.mobile.accounts.forgetAsk(shortName(account, t)))) {
                              onForget(account.id)
                            }
                          }}
                        >
                          {t.accounts.forget}
                        </button>
                      )}
                    </div>
                  )}
                </div>
              )
            })}
          </div>
        )}

        {/* What switching does, said before anything is pressed. */}
        <p className={m.screenNote}>{t.mobile.accounts.switchNote}</p>

        {/* And the one half of this screen that is not here, named rather than left as a hole somebody
            goes looking for. */}
        <p className={m.screenNote}>{t.mobile.accounts.addNote}</p>
      </div>
    </>
  )
}

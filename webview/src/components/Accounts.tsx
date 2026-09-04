import { useEffect, useState } from 'react'
import { useT } from '../i18n'
import type { Dict } from '../i18n/en'
import type { AccountInfo, UsageWindow } from '../protocol'
import type { UsageFacts } from '../feed/usage'
import { FIVE_HOUR_MS, WEEK_MS, paceColor } from '../feed/usage'
import { useFieldHistory } from '../hooks/useFieldHistory'
import { SkeletonBar } from './Skeleton'
import s from './sideMenu.module.css'

/** Everything the panel holds about the machine's accounts - see the `accounts` message. */
export interface AccountsState {
  accounts: AccountInfo[]
  /** Undefined until the IDE has proven it - see the `accounts` message. */
  capability?: 'supported' | 'ignored' | 'wsl' | 'not_signed_in' | 'api_key'
  current: string
  pending: boolean
}

interface AccountsProps {
  /** null means the list has not arrived yet. */
  state: AccountsState | null
  /** That account's figures, if any have been asked for yet - see the note on the rows below. */
  usage: (id: string) => UsageFacts
  /** How the last request went, as a code. Empty when there is nothing to say. */
  note: string
  onUse: (id: string) => void
  onAdd: () => void
  /** Stop waiting for a sign-in that is under way - see the `accountCancel` message. */
  onCancelAdd: () => void
  onForget: (id: string) => void
  /** Sign out of Claude Code. Only the default account has this - see the button below. */
  onLogout: (id: string) => void
  onRename: (id: string, alias: string) => void
  /** Authorize Claude Design in a terminal, for the account in force - see the `designLogin` message. */
  onDesignLogin: () => void
}

/**
 * What the menu row says without being opened: the account in force, and a tone for its dot.
 *
 * Exported so the row and the screen cannot disagree - the same shape `remoteState` has, and for the
 * same reason.
 */
export const accountState = (
  t: Dict,
  state: AccountsState | null,
): { label: string; tone: 'off' | 'busy' | 'live' | 'bad' } => {
  if (state === null) return { label: '', tone: 'off' }
  if (state.capability !== 'supported' && state.accounts.length === 0) {
    return { label: t.accounts.row.one, tone: 'off' }
  }

  const current = state.accounts.find((one) => one.id === state.current)

  if (state.pending) return { label: t.accounts.row.adding, tone: 'busy' }
  if (current === undefined) return { label: t.accounts.row.one, tone: 'off' }
  if (current.health === 'absent') return { label: shortName(current, t), tone: 'bad' }

  return { label: shortName(current, t), tone: 'live' }
}

/**
 * What an account is called: the person's own word for it, or the local part of the address.
 *
 * Never the whole address, in either place it is used. A menu row is one line with an ellipsis, and a
 * long address there pushes the description onto a second row - a list where one row is taller than the
 * rest reads as broken. On a card the whole address stands on the line below, beside the plan, on every
 * row: a heading repeating it in full would be the same fact twice, one line apart.
 */
const shortName = (account: AccountInfo, t: Dict): string =>
  account.alias.trim() !== ''
    ? account.alias
    : account.email !== ''
      ? (account.email.split('@')[0] ?? account.email)
      : nameless(account, t)



/**
 * What to call an account with no address to show.
 *
 * Two different silences. A newcomer has no address because the sign-in has not landed yet - "Signing
 * in…" is the news. The sign-in the CLI already had may have none because the address the CLI offers
 * belongs to another row and has been dropped on purpose (see ClaudeAccounts.defaultIdentity), and
 * there is nothing in progress to report - so it is named by what it is.
 */
const nameless = (account: AccountInfo, t: Dict): string =>
  account.isDefault === true ? t.accounts.defaultName : t.accounts.unnamed

/** Whether there is an address to show at all - the default sign-in sometimes has none (see nameless). */
const showsAddress = (account: AccountInfo): boolean => account.email !== ''

/**
 * One account's share of its own subscription, drawn small beside its name.
 *
 * This is the answer to "which of my accounts still has room in it", which is the question a person
 * opens this screen to settle. It is real rather than a green tick: a stored credential proves only that
 * a credential is stored, while a figure had to be fetched with it. Absent until it arrives - an account
 * is asked for its figures when this screen opens, and each answer costs a process.
 */
const Meters = ({ facts, t }: { facts: UsageFacts; t: Dict }) => (
  <div className={s.accountMeters}>
    <Meter name={t.accounts.fiveHour} window={facts.session} span={FIVE_HOUR_MS} />
    <Meter name={t.accounts.weekly} window={facts.week} span={WEEK_MS} />
  </div>
)

/**
 * One figure, or a dash where it is not known yet.
 *
 * A dash rather than nothing at all, because these arrive one answer at a time - each costs a process
 * in that account's own environment, and a refused one is deliberately not shown (see UsageProbes on
 * the plugin's side). Drawn only when known, the row appeared, grew a second figure and sometimes
 * vanished again, and the cards under it moved every time: a list that twitches while it is being read
 * is harder to read than a list that says "not yet".
 */
const Meter = ({ name, window, span }: { name: string; window?: UsageWindow; span: number }) => (
  <span className={s.accountMeter}>
    <span className={s.accountMeterName}>{name}</span>
    {window ? (
      <span style={{ color: paceColor(window.percent, window.resets, span) }}>{Math.round(window.percent)}%</span>
    ) : (
      <span className={s.accountMeterName}>—</span>
    )}
  </span>
)

/**
 * Adding an account, and stopping halfway through it.
 *
 * The Cancel beside the wait is not a nicety. A sign-in is given ten minutes on purpose - a browser, a
 * password manager and an SSO detour all fit inside that - and until this button existed, a person who
 * opened the terminal and thought better of it had no way out of it at all: the button said "waiting
 * for the sign-in" and refused to do anything else for the rest of the ten minutes.
 *
 * The terminal is not closed by it. That window is the person's, and it may have a browser sign-in
 * half-finished in it; what goes is the credential drawer this panel minted (see AccountSignIn.cancel).
 */
const AddButton = ({
  state,
  t,
  onAdd,
  onCancelAdd,
  primary,
}: {
  state: AccountsState
  t: Dict
  onAdd: () => void
  onCancelAdd: () => void
  primary?: boolean
}) =>
  state.pending ? (
    <div className={s.accountsWaiting}>
      <span className={s.accountsWaitingText}>{t.accounts.adding}</span>
      <button type="button" className={s.button} onClick={onCancelAdd}>
        {t.accounts.cancel}
      </button>
    </div>
  ) : (
    <button
      type="button"
      className={`${s.button} ${primary === true ? `${s.buttonPrimary} ` : ''}${s.accountsAction}`}
      onClick={onAdd}
    >
      {t.accounts.add}
    </button>
  )

/**
 * Several Claude accounts on one machine, switched without signing out of any of them.
 *
 * What travels between them is the credential and nothing else: `~/.claude` stays one folder, so the
 * skills, the hooks, the MCP servers and the settings are the same whichever account is in force. That
 * promise is why this screen exists at all rather than a note telling people to run `claude auth login`
 * again - and it is why the screen refuses itself, plainly and with a reason, on a machine where the
 * mechanism cannot be proven to work.
 */
export const Accounts = ({
  state,
  usage,
  note,
  onUse,
  onAdd,
  onCancelAdd,
  onForget,
  onLogout,
  onRename,
  onDesignLogin,
}: AccountsProps) => {
  const t = useT()

  /** Which account's name is being edited, and the text so far. One at a time. */
  const [renaming, setRenaming] = useState<string | null>(null)
  const [alias, setAlias] = useState('')
  const aliasField = useFieldHistory(alias, setAlias)

  /** Which row asked for something and has not been answered - "Switching…" on the button it was. */
  const [pending, setPending] = useState('')

  /*
   * Any answer at all ends the wait, rather than the particular one the request was hoping for.
   *
   * The mark is put on by pressing and can only be taken off by the IDE saying something back, so every
   * road out of the request on that side has to remember to answer - and one that forgets leaves a grey
   * button reading "Switching…" until the person walks off the screen and comes back. A fresh list is
   * the answer to all of them: it is sent after every one of these requests, and it already says what
   * became of the row.
   */
  useEffect(() => setPending(''), [state])

  if (state === null) {
    return (
      <div className={s.screen}>
        <SkeletonBar width="60%" />
        <SkeletonBar width="40%" />
      </div>
    )
  }

  const act = (key: string, run: () => void) => {
    setPending(key)
    run()
  }

  const startRename = (account: AccountInfo) => {
    setRenaming(account.id)
    setAlias(account.alias)
  }

  const commitRename = (id: string) => {
    onRename(id, alias)
    setRenaming(null)
  }

  /**
   * Nothing added yet.
   *
   * Everything the populated screen says is about accounts that do not exist here, so none of it is
   * shown: what a person needs at this moment is what the feature buys and one thing to press. The
   * paragraph about open conversations keeping their account, and the one about MCP servers, belong on
   * the screen where there are accounts to apply them to.
   */
  if (state.accounts.length === 0) {
    return (
      <div className={s.screen}>
        <div className={s.accountsEmpty}>
          <span className={s.accountsGlyph}>
            <svg viewBox="0 0 16 16" aria-hidden="true" width="22" height="22" fill="none" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round">
              <circle cx="6.2" cy="6" r="2.5" />
              <path d="M1.9 13.2a4.6 4.6 0 018.6 0" />
              <path d="M10.6 4a2.5 2.5 0 010 4" />
              <path d="M12.1 9.6a4.6 4.6 0 012 2.6" />
            </svg>
          </span>

          <span className={s.accountsHeadline}>{t.accounts.empty.title}</span>
          <p className={s.accountsBody}>{t.accounts.empty.body}</p>

          {state.capability === 'supported' ? (
            <>
              <AddButton state={state} t={t} onAdd={onAdd} onCancelAdd={onCancelAdd} primary />
              <p className={s.accountsFinePrint}>{t.accounts.addHint}</p>
            </>
          ) : state.capability !== undefined ? (
            // No button at all where the mechanism cannot be proven: one here would run the sign-in into
            // the drawer the existing account lives in and overwrite it.
            <p className={s.accountsFinePrint}>{t.accounts.unavailable[state.capability]}</p>
          ) : null}

          {note !== '' ? (
            <p className={s.cardError}>{t.accounts.outcome[note] ?? t.accounts.outcome.unknown}</p>
          ) : null}
        </div>
      </div>
    )
  }

  return (
    <div className={s.screen}>
      {/* Nothing said about the mechanism until it is proven: the answer costs processes and arrives a
          moment after the list (see the `accounts` message). */}
      {state.capability === 'supported' ? (
        <div className={s.screenNote}>{t.accounts.intro}</div>
      ) : state.capability !== undefined ? (
        <div className={s.screenNote}>{t.accounts.unavailable[state.capability]}</div>
      ) : null}

      {note !== '' ? <div className={s.cardError}>{t.accounts.outcome[note] ?? t.accounts.outcome.unknown}</div> : null}

      <div className={s.accountList}>
        {state.accounts.map((account) => {
          const isCurrent = account.id === state.current
          const facts = usage(account.id)

          return (
            <div key={account.id} className={account.health === 'absent' ? `${s.card} ${s.cardWarn}` : s.card}>
              <div className={s.cardTop}>
                <span
                  className={`${s.cardDot} ${isCurrent ? s.cardDotOn : account.health === 'absent' ? s.cardDotBad : ''}`}
                />
                <span className={s.cardName}>{shortName(account, t)}</span>
                {isCurrent ? <span className={s.cardStateOk}>{t.accounts.current}</span> : null}
                {account.pending ? <span className={s.cardStateWarn}>{t.accounts.signingIn}</span> : null}
              </div>

              {/*
                What the account is and whose it is, on one line: the plan, and the address after it.

                The same shape on every row, whether or not the person has named the account - that is
                what makes two rows comparable without reading them. The heading above carries the name
                (or the local part of this address, see shortName), so nothing here is a repeat.

                The organisation used to stand on this line and has been dropped. It answered a question
                nobody asks of this screen - the plan already says "team", and the name beside it was
                either the company (which the address says too) or Anthropic's own
                "somebody@example.com's Organization", which is a longer way of writing the address. The
                plan is the CLI's own word - data, never translated.
              */}
              {account.plan !== '' || showsAddress(account) ? (
                <div className={s.accountFacts}>
                  {account.plan !== '' ? <span className={s.accountPlan}>{account.plan}</span> : null}
                  {showsAddress(account) ? <span className={s.accountAddress}>{account.email}</span> : null}
                </div>
              ) : null}

              <Meters facts={facts} t={t} />

              {account.health === 'absent' ? <div className={s.cardError}>{t.accounts.absent}</div> : null}

              {renaming === account.id ? (
                <div className={s.inputRow}>
                  <input
                    className={s.input}
                    value={alias}
                    autoFocus
                    placeholder={t.accounts.aliasPlaceholder}
                    onChange={aliasField.onChange}
                    onKeyDown={(event) => {
                      if (event.key === 'Enter') {
                        commitRename(account.id)
                        return
                      }
                      if (event.key === 'Escape') {
                        setRenaming(null)
                        return
                      }
                      // Cmd/Ctrl+Z and the word-delete the embedded browser does not give a plain field
                      // (see useFieldHistory) - every input in the panel goes through it.
                      aliasField.onKeyDown(event)
                    }}
                  />
                  <button type="button" className={`${s.button} ${s.buttonPrimary}`} onClick={() => commitRename(account.id)}>
                    {t.accounts.save}
                  </button>
                </div>
              ) : (
                <div className={s.cardActions}>
                  {/*
                    Not on a sign-in still in flight: its drawer is empty, so everything moved onto it
                    would come up signed out. The IDE refuses it as well (see ClaudeAccounts.canSelect) -
                    this is only the half that keeps the button from being there to press.
                  */}
                  {!isCurrent && account.pending !== true ? (
                    <button
                      type="button"
                      className={`${s.button} ${s.buttonPrimary}`}
                      disabled={pending === `use:${account.id}`}
                      onClick={() => act(`use:${account.id}`, () => onUse(account.id))}
                    >
                      {pending === `use:${account.id}` ? t.accounts.switching : t.accounts.use}
                    </button>
                  ) : null}
                  <button type="button" className={s.button} onClick={() => startRename(account)}>
                    {t.accounts.rename}
                  </button>
                  {/*
                    Two different acts, so two different words. Forgetting an added account drops its
                    drawer from this machine and leaves the account itself alone; the sign-in Claude Code
                    already had has no drawer, so the only way to remove it is to end the session - which
                    revokes the credential and is what "Log out" honestly says.
                  */}
                  {account.isDefault === true ? (
                    <button
                      type="button"
                      className={`${s.button} ${s.buttonDangerStrong}`}
                      onClick={() => onLogout(account.id)}
                    >
                      {t.accounts.logout}
                    </button>
                  ) : (
                    <button
                      type="button"
                      className={`${s.button} ${s.buttonDanger}`}
                      disabled={pending === `forget:${account.id}`}
                      onClick={() => act(`forget:${account.id}`, () => onForget(account.id))}
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

      {state.capability === 'supported' ? (
        <>
          <AddButton state={state} t={t} onAdd={onAdd} onCancelAdd={onCancelAdd} />
          <div className={s.screenNote}>{t.accounts.addHint}</div>
          {/*
            Said out loud because it surprises people: MCP sign-ins live in the same credential store the
            account does, so a new account starts with none of them and has to authenticate each server
            once. Everything else - the skills, the hooks, the settings, the history - is shared.
          */}
          <div className={s.screenNote}>{t.accounts.mcpNote}</div>
        </>
      ) : null}

      {/*
        Claude Design, whose sign-in belongs here and nowhere else.

        It is filed in the same credential drawer as the account itself, so it is per account exactly as
        the MCP servers above are - and it can only be authorized in a terminal: the CLI leaves
        `/design-login` out of a streaming session's command list altogether, and DesignSync's other road
        to the same authorization, out of a permission prompt, is shut by the same condition (see
        DesignLogin). Without this button there is no way to reach it from the panel at all - the command
        typed into the field used to come back refusing itself.

        Outside the block above on purpose: all of this is just as true of a machine with one ordinary
        sign-in, where nothing about switching accounts applies.
      */}
      <div className={s.accountsDesign}>
        <button type="button" className={`${s.button} ${s.accountsAction}`} onClick={onDesignLogin}>
          {t.accounts.designAuthorize}
        </button>
        <div className={s.screenNote}>{t.accounts.designNote}</div>
      </div>
    </div>
  )
}

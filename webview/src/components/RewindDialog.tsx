import { useCallback, useEffect, useMemo, useRef } from 'react'
import { forkBlocked, pathParts, type RewindChoice } from '../feed/rewind'
import { clipboardMessage } from '../feed/tokens'
import type { UserItem } from '../feed/types'
import type { RewindCode, RewindRefusal } from '../protocol'
import { useT } from '../i18n'
import { useDialogKeys } from './dialogKeys'
import s from './shell.module.css'


interface RewindDialogProps {
  item: UserItem
  /** What the code part would touch, once the IDE has said - undefined while it is being asked. */
  code?: RewindCode
  choice: RewindChoice
  onChoice: (choice: RewindChoice) => void
  /** A turn is running in this conversation: a rewind stops it, and code alone would race it. */
  running: boolean
  /** How many messages wait in this conversation's queue - a rewind drops them (see ClaudeSessionHub.rewind). */
  queued: number
  /** The press has gone out and the answer has not come back. */
  working: boolean
  /** Why the last press did not happen - said right above the buttons, and the dialog stays. */
  refusal?: { reason: RewindRefusal; detail?: string }
  onRewind: () => void
  /** The same cut in a fork, leaving this tab as it is - offered while the conversation is part of the choice. */
  onFork: () => void
  onCancel: () => void
}

/**
 * The question a rewind asks before anything goes - the panel's `/rewind` (Esc Esc in a terminal).
 *
 * It says what is about to leave (this message and everything after it), what else goes with it (a running
 * turn, a queue), and what the code part would touch, file by file, before the press rather than after it:
 * putting files back overwrites them, and the person deciding has to see which. The three choices are the
 * terminal's own; code is offered only when there is code to put back, and the dialog says why when there
 * is not.
 *
 * Keys like the other questions (see useDialogKeys): Enter presses the button that has the focus - the main
 * one when the dialog opens - and Escape takes the question back, caught before the panel's own Escape,
 * which would stop the turn.
 */
export const RewindDialog = ({
  item,
  code,
  choice,
  onChoice,
  running,
  queued,
  working,
  refusal,
  onRewind,
  onFork,
  onCancel,
}: RewindDialogProps) => {
  const t = useT()
  const words = t.chrome.rewind
  const dialog = useRef<HTMLDivElement | null>(null)
  const primary = useRef<HTMLButtonElement | null>(null)

  const subject = useMemo(() => clipboardMessage(item).split('\n').find((line) => line.trim() !== '') ?? '', [item])
  const offersCode = code?.state === 'ready'
  const keepsConversation = choice === 'code'
  // Code alone under a conversation that carries on, while the agent is still writing files: the IDE would
  // refuse it (see ClaudeSession.rewind), so the button says why before the press instead.
  const blocked = keepsConversation && running
  const enabled = !working && !blocked
  // "In a new tab" with the code: put back here while this tab's turn keeps writing - the same refusal, said
  // before the press (see forkBlocked).
  const forkHeld = forkBlocked(choice, code, running)

  useEffect(() => {
    primary.current?.focus()
  }, [])

  const accept = useCallback(() => {
    if (enabled) onRewind()
  }, [enabled, onRewind])
  const cancel = useCallback(() => {
    if (!working) onCancel()
  }, [working, onCancel])
  useDialogKeys(dialog, accept, cancel)

  return (
    <>
      <div className={s.confirmScrim} onClick={working ? undefined : onCancel} />
      <div className={`${s.confirm} ${s.rewind}`} role="dialog" aria-modal="true" aria-label={words.title} ref={dialog}>
        <div className={s.confirmTitle}>{words.title}</div>
        {subject ? <div className={s.confirmSubject}>{subject}</div> : null}

        {keepsConversation ? (
          <div className={s.rewindLead}>{words.codeLead}</div>
        ) : (
          <div className={s.rewindLead}>{words.lead}</div>
        )}

        {offersCode ? (
          <div className={s.rewindChoices} role="radiogroup" aria-label={words.what}>
            {(['conversation', 'code', 'both'] as const).map((option) => (
              <button
                key={option}
                type="button"
                role="radio"
                aria-checked={choice === option}
                className={`${s.rewindChoice} ${choice === option ? s.rewindChoiceOn : ''}`}
                disabled={working}
                onClick={() => onChoice(option)}
              >
                {words[option]}
              </button>
            ))}
          </div>
        ) : null}

        <CodeLine code={code} showFiles={choice !== 'conversation'} />

        {!keepsConversation && running ? <div className={s.rewindWarn}>{words.running}</div> : null}
        {!keepsConversation && queued > 0 ? <div className={s.rewindWarn}>{words.queued(queued)}</div> : null}
        {blocked ? <div className={s.rewindWarn}>{words.codeWhileRunning}</div> : null}
        {forkHeld ? <div className={s.rewindWarn}>{words.forkWhileRunning}</div> : null}

        {refusal ? <div className={s.rewindRefusal}>{refusalWords(t, refusal)}</div> : null}

        <div className={s.confirmActions}>
          <button type="button" className={s.confirmCancel} disabled={working} onClick={onCancel}>
            {words.cancel}
          </button>
          {keepsConversation ? null : (
            // Held with aria-disabled rather than disabled: a turn can start while this button has the focus, and
            // a button disabled under the focus hands it to the page - where Enter would rewind in this tab
            // instead (see useDialogKeys). Held this way it keeps the focus and Enter on it does nothing.
            <button
              type="button"
              className={s.confirmCancel}
              data-tooltip={words.forkHint}
              disabled={working}
              aria-disabled={forkHeld || undefined}
              onClick={() => {
                if (!forkHeld) onFork()
              }}
            >
              {words.fork}
            </button>
          )}
          <button
            type="button"
            className={s.confirmAccept}
            ref={primary}
            disabled={!enabled}
            onClick={onRewind}
          >
            {working ? words.working : keepsConversation ? words.goCode : words.go}
          </button>
        </div>
      </div>
    </>
  )
}

/**
 * What the code part comes to, in one place under the choices: the files and the lines when there are
 * some, and otherwise the reason there is nothing to offer - said, rather than a choice that silently is
 * not there.
 */
const CodeLine = ({ code, showFiles }: { code?: RewindCode; showFiles: boolean }) => {
  const t = useT()
  const words = t.chrome.rewind

  if (!code) return <div className={s.rewindNote}>{words.checking}</div>

  switch (code.state) {
    case 'ready': {
      if (!showFiles) return null

      const shown = code.files.slice(0, FILES_SHOWN)
      const rest = code.count - shown.length

      return (
        <div className={s.rewindCode}>
          <div className={s.rewindCodeHead}>
            <span>{words.files(code.count)}</span>
            <span className={s.rewindStats}>
              <span className={s.rewindAdded}>+{code.insertions}</span>
              <span className={s.rewindRemoved}>-{code.deletions}</span>
            </span>
          </div>
          <ul className={s.rewindFiles}>
            {shown.map((file) => {
              const { name, folder } = pathParts(file)
              // Said from the project's folder (or from "~") by the IDE already (see Rewind.relativeTo).
              // The name goes first and the folder after it, dimmed: a path cut at its end hid exactly the
              // name, and a file outside the project (the agent's memory) was all folder. The hint carries
              // the path whole.
              return (
                <li key={file} className={s.rewindFile} data-tooltip={folder ? file : undefined}>
                  <span className={s.rewindFileName}>{name}</span>
                  {folder ? <span className={s.rewindFileFolder}>{folder}</span> : null}
                </li>
              )
            })}
            {rest > 0 ? <li className={s.rewindMore}>{words.more(rest)}</li> : null}
          </ul>
        </div>
      )
    }
    case 'none':
      return <div className={s.rewindNote}>{words.none}</div>
    case 'off':
      return <div className={s.rewindNote}>{words.off}</div>
    case 'notTracked':
      return <div className={s.rewindNote}>{words.notTracked}</div>
    case 'noCheckpoint':
      return <div className={s.rewindNote}>{words.noCheckpoint}</div>
    case 'unavailable':
      return <div className={s.rewindNote}>{words.unavailable(code.detail ?? '')}</div>
  }
}

/** How many files the dialog names before "and N more" - a handful reads at a glance, forty does not. */
const FILES_SHOWN = 5

/** Why the rewind did not happen, in the panel's words - see Rewind.Refusal. */
export const refusalWords = (
  t: ReturnType<typeof useT>,
  refusal: { reason: RewindRefusal; detail?: string },
): string => {
  const words = t.chrome.rewind
  const detail = refusal.detail ?? ''

  switch (refusal.reason) {
    case 'code':
      // The code part's reasons are the preview's own states (see Rewind.detailOf), worded the same way.
      if (detail === 'off') return words.off
      if (detail === 'notTracked') return words.notTracked
      if (detail === 'noCheckpoint') return words.noCheckpoint
      if (detail === 'none') return words.none
      return words.unavailable(detail)
    case 'other':
      return words.refused.other(detail)
    default:
      return words.refused[refusal.reason]
  }
}

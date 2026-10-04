import { refusalWords } from '../../components/RewindDialog'
import { forkBlocked, type RewindChoice } from '../../feed/rewind'
import { pinLine } from '../../feed/pins'
import type { UserItem } from '../../feed/types'
import type { RewindCode, RewindRefusal } from '../../protocol'
import { Sheet } from './Sheet'
import m from '../mobile.module.css'
import { useT } from '../../i18n'

interface RewindSheetProps {
  item: UserItem
  code?: RewindCode
  choice: RewindChoice
  onChoice: (choice: RewindChoice) => void
  running: boolean
  queued: number
  working: boolean
  refusal?: { reason: RewindRefusal; detail?: string }
  onRewind: () => void
  onFork: () => void
  onClose: () => void
}

/**
 * The desk's rewind dialog, as a sheet (see RewindDialog): the same question, the same three answers, the
 * same words - only laid out for a thumb. The files come said from the project's folder (see
 * ClaudeSessionHub.previewRewind), so no path through anybody's home directory reaches the phone.
 */
export const RewindSheet = ({
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
  onClose,
}: RewindSheetProps) => {
  const t = useT()
  const words = t.chrome.rewind
  const keepsConversation = choice === 'code'
  const blocked = keepsConversation && running
  const forkHeld = forkBlocked(choice, code, running)

  return (
    <Sheet
      title={words.title}
      height="84%"
      onClose={working ? () => undefined : onClose}
      footer={
        <>
          {keepsConversation ? null : (
            <button type="button" className={m.buttonSecondary} disabled={working || forkHeld} onClick={onFork}>
              {words.fork}
            </button>
          )}
          <button type="button" className={m.buttonPrimary} disabled={working || blocked} onClick={onRewind}>
            {working ? words.working : keepsConversation ? words.goCode : words.go}
          </button>
        </>
      }
    >
      <div className={m.rewindSheet}>
        <p className={m.selectedLine}>{pinLine(item)}</p>
        <p className={m.sheetNote}>{keepsConversation ? words.codeLead : words.lead}</p>

        {code?.state === 'ready' ? (
          <>
            <p className={m.sheetLabel}>{words.what}</p>
            <div className={m.chipWrap}>
              {(['conversation', 'code', 'both'] as const).map((option) => (
                <button
                  key={option}
                  type="button"
                  className={`${m.pickChip} ${choice === option ? m.pickChipOn : ''}`}
                  disabled={working}
                  onClick={() => onChoice(option)}
                >
                  {words[option]}
                </button>
              ))}
            </div>
            {choice !== 'conversation' ? (
              <>
                <p className={m.sheetLabel}>
                  {words.files(code.count)} · +{code.insertions} -{code.deletions}
                </p>
                {code.files.slice(0, FILES_SHOWN).map((file) => (
                  <p key={file} className={m.sheetNote}>
                    {file}
                  </p>
                ))}
                {code.count > FILES_SHOWN ? <p className={m.sheetNote}>{words.more(code.count - FILES_SHOWN)}</p> : null}
              </>
            ) : null}
          </>
        ) : (
          <p className={m.sheetNote}>{codeLine(words, code)}</p>
        )}

        {!keepsConversation && running ? <p className={m.sheetNote}>{words.running}</p> : null}
        {!keepsConversation && queued > 0 ? <p className={m.sheetNote}>{words.queued(queued)}</p> : null}
        {blocked ? <p className={m.sheetNote}>{words.codeWhileRunning}</p> : null}
        {forkHeld ? <p className={m.sheetNote}>{words.forkWhileRunning}</p> : null}
        {refusal ? <p className={m.noteBad}>{refusalWords(t, refusal)}</p> : null}
      </div>
    </Sheet>
  )
}

/** A handful of names reads on a phone at a glance; the rest is a count. */
const FILES_SHOWN = 4

const codeLine = (words: ReturnType<typeof useT>['chrome']['rewind'], code?: RewindCode): string => {
  if (!code) return words.checking
  switch (code.state) {
    case 'ready':
      return ''
    case 'none':
      return words.none
    case 'off':
      return words.off
    case 'notTracked':
      return words.notTracked
    case 'noCheckpoint':
      return words.noCheckpoint
    case 'unavailable':
      return words.unavailable(code.detail ?? '')
  }
}

import type { DetailLine, Hunk, ToolChip, ToolItem } from '../../feed/types'
import s from '../feed.module.css'
import { Caret } from './Caret'

export const CHIP_CLASS: Record<ToolChip, string> = {
  READ: s.chipRead ?? '',
  GREP: s.chipGrep ?? '',
  EDIT: s.chipEdit ?? '',
  WRITE: s.chipWrite ?? '',
  BASH: s.chipBash ?? '',
  WEB: s.chipWeb ?? '',
  MCP: s.chipMcp ?? '',
  SKILL: s.chipSkill ?? '',
  TOOL: s.chipTool ?? '',
}

interface ToolCardProps {
  item: ToolItem
  open: boolean
  /** The agent has not even begun: it stands there waiting for you to allow this call. */
  awaitingPermission: boolean
  onToggle: () => void
}

export const ToolCard = ({ item, open, awaitingPermission, onToggle }: ToolCardProps) => {
  const hasBody = item.detail.length > 0 || item.hunks.length > 0

  return (
    <div className={s.tool}>
      <button type="button" className={s.toolHead} onClick={onToggle} disabled={!hasBody}>
        {hasBody ? <Caret open={open} /> : null}
        <span className={`${s.toolChip} ${CHIP_CLASS[item.chip]}`}>{item.chip}</span>
        <span className={`${s.toolTarget} ${item.isError ? s.toolError : ''}`}>{item.target}</span>
        <span
          className={`${s.toolMeta} ${item.pending ? (awaitingPermission ? s.waiting : s.running) : ''}`}
        >
          {item.pending ? (awaitingPermission ? '· waiting for you' : '· running') : item.meta}
        </span>
        <div className={s.spacer} />
        <span className={s.toolDur}>{item.duration}</span>
      </button>

      {open && hasBody ? (
        <div className={s.toolBody}>
          {item.detail.map((line, index) => (
            <DetailRow key={index} line={line} />
          ))}

          {item.hunks.length > 0 ? (
            <div className={s.hunks}>
              {item.hunks.map((hunk) => (
                <HunkView key={hunk.id} hunk={hunk} />
              ))}
            </div>
          ) : null}
        </div>
      ) : null}
    </div>
  )
}

const DetailRow = ({ line }: { line: DetailLine }) => (
  <div
    className={`${s.detail} ${line.tone === 'ok' ? s.detailOk : ''} ${line.tone === 'bad' ? s.detailBad : ''}`}
  >
    {line.text}
  </div>
)

/**
 * One piece of an edit, as a diff and nothing more.
 *
 * There used to be "accept" and "reject" beside it, and neither did anything: the first wrote a tick into
 * the interface's own memory, the second wiped it. Nothing reached the agent or the IDE - and there was
 * nothing for them to do about it anyway, since a card like this appears after the edit has been written
 * to the file. A button offering to reject what has already happened is worse than no button at all.
 *
 * The place where an edit genuinely can be turned down is before it runs, and the panel has that: a call
 * awaiting permission (see PermissionPanel), which is where "allow" and "deny" mean what they say.
 */
const HunkView = ({ hunk }: { hunk: Hunk }) => (
  <div className={s.hunk}>
    <div className={s.hunkHead}>
      <span className={s.hunkRange}>{hunk.range}</span>
      <span className={s.hunkNote}>{hunk.note}</span>
    </div>

    {hunk.lines.map((line, index) => (
      <div
        key={index}
        className={`${s.diffLine} ${line.kind === 'add' ? s.diffAdd : ''} ${line.kind === 'del' ? s.diffDel : ''}`}
      >
        <span className={s.diffNum}>{line.n ?? ''}</span>
        <span
          className={`${s.diffSign} ${line.kind === 'add' ? s.diffSignAdd : ''} ${
            line.kind === 'del' ? s.diffSignDel : ''
          }`}
        >
          {line.sign}
        </span>
        <span
          className={`${s.diffText} ${line.kind === 'add' ? s.diffTextAdd : ''} ${
            line.kind === 'del' ? s.diffTextDel : ''
          }`}
        >
          {line.text}
        </span>
      </div>
    ))}
  </div>
)

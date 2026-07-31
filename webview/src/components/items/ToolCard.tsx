import type { DetailLine, Hunk, ToolChip, ToolItem } from '../../feed/types'
import s from '../feed.module.css'

export const CHIP_CLASS: Record<ToolChip, string> = {
  THINK: s.chipThink ?? '',
  READ: s.chipRead ?? '',
  GREP: s.chipGrep ?? '',
  EDIT: s.chipEdit ?? '',
  WRITE: s.chipWrite ?? '',
  BASH: s.chipBash ?? '',
  WEB: s.chipWeb ?? '',
  MCP: s.chipMcp ?? '',
  TOOL: s.chipTool ?? '',
}

interface ToolCardProps {
  item: ToolItem
  open: boolean
  appliedHunks: string[]
  /** Агент ещё даже не начал: стоит и ждёт, разрешишь ли ты этот вызов. */
  awaitingPermission: boolean
  onToggle: () => void
  onAcceptHunk: (hunkId: string) => void
  onRejectHunk: (hunkId: string) => void
}

export const ToolCard = ({
  item,
  open,
  appliedHunks,
  awaitingPermission,
  onToggle,
  onAcceptHunk,
  onRejectHunk,
}: ToolCardProps) => {
  const hasBody = item.detail.length > 0 || item.hunks.length > 0

  return (
    <div className={s.tool}>
      <button type="button" className={s.toolHead} onClick={onToggle} disabled={!hasBody}>
        {hasBody ? <span className={`${s.caret} ${open ? s.caretOpen : ''}`}>▶</span> : null}
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
                <HunkView
                  key={hunk.id}
                  hunk={hunk}
                  applied={appliedHunks.includes(hunk.id)}
                  onAccept={() => onAcceptHunk(hunk.id)}
                  onReject={() => onRejectHunk(hunk.id)}
                />
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

interface HunkViewProps {
  hunk: Hunk
  applied: boolean
  onAccept: () => void
  onReject: () => void
}

const HunkView = ({ hunk, applied, onAccept, onReject }: HunkViewProps) => (
  <div className={s.hunk}>
    <div className={s.hunkHead}>
      <span className={s.hunkRange}>{hunk.range}</span>
      <span className={s.hunkNote}>{hunk.note}</span>
      <div className={s.spacer} />
      <button type="button" className={s.hunkAccept} onClick={onAccept}>
        {applied ? '✓ applied' : 'accept'}
      </button>
      <button type="button" className={s.hunkReject} onClick={onReject}>
        reject
      </button>
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

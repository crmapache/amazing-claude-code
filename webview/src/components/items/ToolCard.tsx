import type { DetailLine, DetailNote, Hunk, ToolChip, ToolItem, ToolMeta } from '../../feed/types'
import s from '../feed.module.css'
import { Caret } from './Caret'
import { useT } from '../../i18n'
import type { Dict } from '../../i18n/en'

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
  const t = useT()
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
          {item.pending
            ? awaitingPermission
              ? t.feed.tool.waitingForYou
              : t.feed.tool.running
            : toolMetaText(t, item.meta)}
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

const DetailRow = ({ line }: { line: DetailLine }) => {
  const t = useT()

  return (
    <div
      className={`${s.detail} ${line.tone === 'ok' ? s.detailOk : ''} ${line.tone === 'bad' ? s.detailBad : ''}`}
    >
      {/* A line the panel wrote about the call is said in today's language; one the tool printed is
          shown exactly as it came (see DetailLine.note). */}
      {line.note ? noteText(t, line.note, 'tool') : line.text}
    </div>
  )
}

/**
 * What the panel itself has to say on a line of a card, put into words - see DetailNote.
 *
 * `where` decides between two wordings of the same fact: a tool call finishes, a subagent returns, and
 * the English for the two differs enough that one sentence would read wrong in half the places.
 */
export const noteText = (t: Dict, note: DetailNote, where: 'tool' | 'task'): string => {
  switch (note.kind) {
    case 'closed':
      return where === 'task' ? t.feed.task.closed[note.reason] : t.feed.tool.closed[note.reason]
    case 'taskEnded':
      return note.outcome === 'failed'
        ? t.agentTask.failedBeforeFinishing
        : t.agentTask.stoppedBeforeFinishing
    case 'moreLines':
      return t.feed.tool.moreLines(note.count)
    case 'trimmed':
      return t.agentTask.trimmed(note.count)
    default:
      return t.agentTask.backgroundEnded(
        note.outcome === 'failed'
          ? t.agentTask.outcomeFailed
          : note.outcome === 'stopped'
            ? t.agentTask.outcomeStopped
            : t.agentTask.outcomeFinished,
        note.duration,
      )
  }
}

/** The short summary at the end of a tool's line, put into words - see ToolMeta. */
const toolMetaText = (t: Dict, meta: ToolMeta): string => {
  switch (meta.kind) {
    case 'failed':
      return t.feed.tool.failed
    case 'lines':
      return t.feed.tool.lines(meta.count)
    case 'matches':
      return t.feed.tool.matches(meta.count)
    case 'output':
      return t.feed.tool.output(meta.empty)
    case 'diff':
      return t.feed.tool.diff(meta.added, meta.removed)
    case 'closed':
      return t.feed.tool.closedMeta[meta.reason]
    default:
      return ''
  }
}

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

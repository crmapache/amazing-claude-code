import type { DetailLine, DetailNote, Hunk, ToolChip, ToolItem, ToolMeta } from '../../feed/types'
import s from '../feed.module.css'
import { Caret } from './Caret'
import { editAnchor, filePathOf } from '../../feed/tools'
import { useOpenFile, type OpenFileRequest } from '../../hooks/useOpenFile'
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

/**
 * How many lines of a diff stand open in the feed before the rest is put behind the caret.
 *
 * The diff is here to be noticed rather than read in full: a wrong edit shows itself in the first lines,
 * and a call that rewrites a file in one go would otherwise push the whole conversation off the screen -
 * which is what it did at twenty-four. What is cut off is said out loud on the last row, and that row is
 * the button that opens the rest.
 */
const DIFF_PREVIEW_LINES = 6

/**
 * How many lines over the limit are shown anyway rather than hidden.
 *
 * Cutting a nine-line diff down to six to announce "3 more lines" costs a click and saves nothing: the
 * point of the limit is the edit that runs off the screen, not the one that is a little longer than the
 * number.
 */
const DIFF_PREVIEW_SLACK = 3

/** The first [limit] lines of an edit, hunk by hunk, and how many were left out. */
const trimHunks = (hunks: Hunk[], limit: number): { hunks: Hunk[]; hidden: number } => {
  const total = hunks.reduce((sum, hunk) => sum + hunk.lines.length, 0)
  if (total <= limit + DIFF_PREVIEW_SLACK) return { hunks, hidden: 0 }

  const shown: Hunk[] = []
  let room = limit

  for (const hunk of hunks) {
    if (room <= 0) break
    shown.push(hunk.lines.length <= room ? hunk : { ...hunk, lines: hunk.lines.slice(0, room) })
    room -= hunk.lines.length
  }

  return { hunks: shown, hidden: total - limit }
}

/**
 * The file a call's head points at, and where in it to land.
 *
 * The path comes from what the tool was given rather than from the caption on screen: a caption is also a
 * command, a pattern or a URL (see targetFor), while a tool that names a file names it outright.
 *
 * The place comes from the diff, as a line of text rather than as a number (see editAnchor): the CLI
 * answers an edit with a sentence about success and no position in the file, so there is no number to be
 * had on this side - and a line of the change itself is a thing the IDE can find in the file it is about
 * to show.
 */
const fileTarget = (item: ToolItem): OpenFileRequest | null => {
  const path = filePathOf(item.toolName, item.input)
  if (!path) return null

  const find = editAnchor(item.hunks)
  return find ? { path, find } : { path }
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
  /**
   * An edit shows its diff without being asked - see the reasoning in build.ts, where such a call is also
   * kept out of the groups. The caret is left for what is genuinely hidden: the tool's own output, and the
   * tail of a diff too long to stand open.
   */
  const preview = trimHunks(item.hunks, DIFF_PREVIEW_LINES)
  const hasBody = item.detail.length > 0 || preview.hidden > 0
  const hunks = open ? item.hunks : preview.hunks

  /**
   * The file this call is about, when it is about one - and the line the edit begins at, so the editor
   * opens where the change is rather than at the top of the file.
   */
  const openFile = useOpenFile()
  const file = fileTarget(item)

  return (
    <div className={s.tool}>
      {/*
        A div rather than a button, because the path inside it is a button of its own: the head opens the
        card, the path opens the file, and one cannot stand inside the other. Everything a button gave for
        free is written out here instead - the pointer, the keyboard, the state read aloud.

        With nothing to open it is not a button at all rather than a disabled one: a row that says
        "disabled" about itself says it about the path inside it too, and that path is the one thing on
        such a row that does something.
      */}
      <div
        className={s.toolHead}
        role={hasBody ? 'button' : undefined}
        tabIndex={hasBody ? 0 : undefined}
        aria-expanded={hasBody ? open : undefined}
        onClick={hasBody ? onToggle : undefined}
        onKeyDown={(event) => {
          if (!hasBody) return
          // A key pressed on the path inside belongs to the path: it opens the file, and the row must not
          // swallow it to collapse itself instead. The mouse is kept apart by stopPropagation on the
          // button; a key press has to be told apart by where it came from.
          if (event.target !== event.currentTarget) return
          if (event.key !== 'Enter' && event.key !== ' ') return
          // Space scrolls the feed otherwise, and the card under the finger never opens.
          event.preventDefault()
          onToggle()
        }}
      >
        {hasBody ? <Caret open={open} /> : null}
        <span className={`${s.toolChip} ${CHIP_CLASS[item.chip]}`}>{item.chip}</span>
        {file && openFile ? (
          /*
           * The path in the head is the shortest way from "the agent has just edited this" to the file
           * itself - two panes away, and until now retyped by hand. The click stays inside the path: the
           * row around it goes on opening the card.
           */
          <button
            type="button"
            className={`${s.toolTarget} ${s.toolTargetLink} ${item.isError ? s.toolError : ''}`}
            /* Said as well as shown: the hover hint is the only place the action was written, and hints
               are deliberately hidden from assistive software (see Tooltips), so there it read as a
               second button repeating the path with nothing to do. */
            aria-label={`${t.feed.copy.openFile}: ${item.target}`}
            data-tooltip={t.feed.copy.openFile}
            onClick={(event) => {
              event.stopPropagation()
              openFile(file)
            }}
          >
            {item.target}
          </button>
        ) : (
          <span className={`${s.toolTarget} ${item.isError ? s.toolError : ''}`}>{item.target}</span>
        )}
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
      </div>

      {open && item.detail.length > 0 ? (
        <div className={s.toolBody}>
          {item.detail.map((line, index) => (
            <DetailRow key={index} line={line} />
          ))}
        </div>
      ) : null}

      {hunks.length > 0 ? (
        <div className={s.hunks}>
          {hunks.map((hunk) => (
            <HunkView key={hunk.id} hunk={hunk} />
          ))}
          {preview.hidden === 0 ? null : (
            /*
             * The row under the diff opens it and closes it again, both.
             *
             * The caret on the head does the same, but the head and the diff are neighbours rather than
             * one inside the other: a row that opened from below and could only be closed from above read
             * as two different controls that happened to agree.
             */
            <button type="button" className={s.hunkMore} onClick={onToggle}>
              {open ? t.feed.tool.fewerLines : t.feed.tool.moreLines(preview.hidden)}
            </button>
          )}
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

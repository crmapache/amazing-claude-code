import { useCallback, useLayoutEffect, useMemo, useRef, useState } from 'react'
import { Ring } from '../../components/StatusBar'
import { atQueryInText, matchFiles } from '../../feed/files'
import { appendChip, matchCommands, slashQuery, type CommandEntry } from '../../feed/slash'
import { composePrompt, imageAttachments, trimTrailingSpace } from '../../feed/tokens'
import type { UserToken } from '../../feed/types'
import type { UsageWindow } from '../../protocol'
import {
  contextColor,
  contextGlow,
  FIVE_HOUR_MS,
  limitWindowRing,
  paceColor,
  WEEK_MS,
  weekBudgetToday,
} from '../../feed/usage'
import { encodeImage, IMAGE_BUDGET, IMAGE_MINIMUM, type PickedImage } from '../images'
import { phoneCommands, type ProjectFacts } from '../facts'
import { Limits } from './Limits'
import m from '../mobile.module.css'

/** A message on its way to the agent, in the three pieces the shell wants it in. */
export interface OutgoingPrompt {
  text: string
  tokens: UserToken[]
  images: { mediaType: string; data: string }[]
}

interface ComposerProps {
  facts: ProjectFacts
  /** This conversation's context fill and what it is made of - see contextOf in feed/build. */
  context: { percent: number; used: number; limit: number }
  running: boolean
  connected: boolean
  /** How many images have already travelled in this conversation - the numbering carries on from it. */
  imageBase: number
  onSend: (prompt: OutgoingPrompt) => void
  onQueue: (prompt: OutgoingPrompt) => void
  onStop: () => void
}

/** Ticks at every fifth - unrelated to the colour thresholds, purely the scale's ruler. */
const CONTEXT_TICKS = [20, 40, 60, 80]

/** One of the two rings in the top row: how full, in what paint, and what stands beside it. */
interface RingFacts {
  percent: number
  color: string
  /** The percentage as it is written out, or empty when a figure would say nothing - see [windowRing]. */
  caption: string
  flame: boolean
}

/** The window being paid past: closed, in the extra usage's own paint, alight and without a figure. */
const BURNING_RING: RingFacts = {
  percent: 100,
  color: 'var(--acc-extra)',
  caption: '',
  flame: true,
}

/**
 * A window's ring, or the empty track that stands in for one nothing is known about yet.
 *
 * `span` is the length of the window the pace colour is judged against (see paceColor): a five-hour
 * window and a weekly one climb at very different speeds, and the same share means different things in
 * the two.
 */
const windowRing = (usage: UsageWindow | undefined, span: number): RingFacts =>
  usage
    ? {
        percent: usage.percent,
        color: paceColor(usage.percent, usage.resets, span),
        caption: `${usage.percent}%`,
        flame: false,
      }
    : { percent: 0, color: 'var(--acc-fg-ghost)', caption: '', flame: false }

/** The figure beside a ring, in the ring's own paint. Nothing at all when there is no figure to show. */
const MeterValue = ({ ring }: { ring: RingFacts }) =>
  ring.caption ? (
    <span className={m.meterValue} style={{ color: ring.color }}>
      {ring.caption}
    </span>
  ) : null

/**
 * The phone's composer.
 *
 * Three rows, and the division between them is the whole idea: what is read never moves, and what is
 * pressed is never where a thumb might brush it by accident.
 *
 * The top row is read - the five-hour window, the weekly one, the branch and its pull request. The
 * middle is the field, full width, with the context bar on its own top edge exactly as in the panel.
 * The bottom row is the actions, and while the agent is working it carries three of them rather than
 * one: Send reaches the turn in progress, Queue waits it out, Stop ends it. Send never leaves - the
 * phone used to offer Queue alone mid-run, and "I have changed my mind, now" was a thing one simply
 * could not say from a sofa.
 *
 * Everything the two hints know - which commands exist, which files, how a query narrows them - is the
 * panel's own (see feed/slash and feed/files). What differs is the shape they are shown in: two lines
 * per row instead of one, because at 390 points a name, its explanation and its group on one line
 * leave the explanation about nine characters.
 */
export const Composer = ({
  facts,
  context,
  running,
  connected,
  imageBase,
  onSend,
  onQueue,
  onStop,
}: ComposerProps) => {
  const [draft, setDraft] = useState('')
  const [caret, setCaret] = useState(0)
  const [attached, setAttached] = useState<PickedImage[]>([])
  const [focused, setFocused] = useState(false)
  const [limitsOpen, setLimitsOpen] = useState(false)
  const [attachError, setAttachError] = useState('')

  /**
   * The query the hint was closed at, rather than a plain flag.
   *
   * A phone has no Escape, so the sheet is closed with a cross - and a flag would then keep it shut
   * for the rest of the message, including the next command typed after it. Remembering what was on
   * screen when it was dismissed lets one more character bring it back.
   */
  const [dismissedAt, setDismissedAt] = useState<string | null>(null)

  const field = useRef<HTMLTextAreaElement>(null)
  const picker = useRef<HTMLInputElement>(null)

  /** Where to put the caret after an insertion the person did not type - see [replace]. */
  const pendingCaret = useRef<number | null>(null)

  /**
   * The field grows with what is in it.
   *
   * A textarea does not do this by itself: `rows` is a starting height and nothing more, so a second
   * line was written into a box the size of one and the first line scrolled out of sight. Measured
   * before the paint rather than after it, or the wrong height is on screen for a frame on every
   * keystroke.
   */
  useLayoutEffect(() => {
    const node = field.current
    if (!node) return

    // Back to nothing first: scrollHeight of an element already tall enough for its text is that
    // height, so without this the field could only ever grow.
    node.style.height = 'auto'
    node.style.height = `${node.scrollHeight}px`

    if (pendingCaret.current !== null) {
      node.setSelectionRange(pendingCaret.current, pendingCaret.current)
      setCaret(pendingCaret.current)
      pendingCaret.current = null
    }
  }, [draft])

  const commands = useMemo(() => phoneCommands(facts), [facts])

  /** Which ring burns, when one does: the window being paid past, not always the five-hour one. */
  const burning = facts.extra?.active ? limitWindowRing(facts.extra.window) : null

  /**
   * What each of the two rings is, figure and all - the same three answers as in the panel (see
   * UsageMeters), gathered here rather than spelled out twice inside the markup below.
   *
   * The figure is left out in the two cases where it would say nothing: a burning ring is stuck at a
   * hundred and what matters about it is that the work is being paid for, and a window nothing is known
   * about yet gets an empty track rather than an honest-looking "0%".
   */
  const sessionRing = burning === 'session' ? BURNING_RING : windowRing(facts.session, FIVE_HOUR_MS)
  const weekRing = burning === 'week' ? BURNING_RING : windowRing(facts.week, WEEK_MS)

  /**
   * The field's start up to the caret - what a slash command is read from.
   *
   * A command need not be the whole of the field: one may return to the start of an already written
   * message and put a command in front of it, exactly as in a terminal.
   */
  const head = draft.slice(0, caret)
  const commandQuery = slashQuery(head)
  const commandMatches = commandQuery === null ? [] : matchCommands(commands, commandQuery)

  /**
   * "@" searches from the caret rather than from the field's start: unlike a slash command it can be
   * typed mid-sentence. While the command hint is up it gets none of its own - two lists at once are
   * noise.
   */
  const at = commandMatches.length > 0 ? null : atQueryInText(draft, caret)
  const fileMatches = at ? matchFiles(facts.files, at.query) : []

  const suggesting = commandMatches.length > 0 || fileMatches.length > 0
  const suggestQuery = commandMatches.length > 0 ? `/${commandQuery ?? ''}` : `@${at?.query ?? ''}`
  const showing = suggesting && dismissedAt !== suggestQuery

  /** Put text in place of a piece of the field, and leave the caret after it. */
  const replace = useCallback(
    (from: number, to: number, text: string) => {
      setDraft((current) => current.slice(0, from) + text + current.slice(to))
      pendingCaret.current = from + text.length
      setDismissedAt(null)
      field.current?.focus()
    },
    [],
  )

  const pickCommand = useCallback(
    (command: CommandEntry) => {
      // A command that takes an argument keeps the caret right after the space, where the value goes.
      replace(0, caret, `/${command.id} `)
    },
    [caret, replace],
  )

  const pickFile = useCallback(
    (path: string) => {
      if (!at) return
      // The same shape a file chip travels to the agent in at the desk (see tokenText): an "@" and the
      // path. The phone's field is plain text, so what the panel keeps as a chip is written out here -
      // the agent reads exactly the same message either way.
      replace(at.start, caret, `@${path} `)
    },
    [at, caret, replace],
  )

  const attach = useCallback(
    async (files: FileList | null) => {
      if (!files || files.length === 0) return
      setAttachError('')

      let budget = IMAGE_BUDGET - attached.reduce((sum, image) => sum + image.weight, 0)
      const added: PickedImage[] = []
      let refused = 0

      for (const file of Array.from(files)) {
        if (budget < IMAGE_MINIMUM) {
          refused += 1
          continue
        }

        const image = await encodeImage(file, Math.min(budget, IMAGE_BUDGET / 2))
        if (!image) {
          refused += 1
          continue
        }

        added.push(image)
        budget -= image.weight
      }

      if (added.length > 0) setAttached((current) => [...current, ...added])
      if (refused > 0) {
        setAttachError(
          added.length > 0
            ? `${refused} more would not fit in one message - send these first.`
            : 'That would not fit in one message. Try one photo at a time.',
        )
      }
    },
    [attached],
  )

  /**
   * The message, in the three pieces the shell wants.
   *
   * Assembled with the panel's own functions rather than by hand: the numbering of the images, the
   * "[Image #2]" that stands in the text where the bytes go, the trimming of an empty tail - each of
   * those has a rule, and a second copy of the rules here would drift from the first one silently.
   */
  const compose = useCallback((): OutgoingPrompt | null => {
    const text = draft.trim()
    if (!text && attached.length === 0) return null

    let tokens: UserToken[] = text ? [{ kind: 'text', value: text }] : []
    attached.forEach((image, index) => {
      tokens = appendChip(tokens, {
        kind: 'img',
        value: `Image #${imageBase + index + 1}`,
        data: image.dataUrl,
      })
    })

    tokens = trimTrailingSpace(tokens)

    return {
      text: composePrompt({ tokens, quotes: [] }, imageBase),
      tokens,
      images: imageAttachments(tokens),
    }
  }, [draft, attached, imageBase])

  const submit = useCallback(
    (queued: boolean) => {
      const prompt = compose()
      if (!prompt) return

      if (queued) onQueue(prompt)
      else onSend(prompt)

      setDraft('')
      setAttached([])
      setAttachError('')
      setDismissedAt(null)
    },
    [compose, onQueue, onSend],
  )

  const canSubmit = (draft.trim().length > 0 || attached.length > 0) && connected

  return (
    <>
      {showing && (
        <div className={m.suggest}>
          <div className={m.sheetGrab} />
          <div className={m.sheetHead}>
            <span className={m.sheetTitle}>{commandMatches.length > 0 ? 'Commands' : 'Project files'}</span>
            <span className={m.sheetCount}>
              {commandMatches.length > 0
                ? `${commandMatches.length} of ${commands.length}`
                : `${fileMatches.length} of ${facts.files.length}`}
            </span>
            <button
              type="button"
              className={m.sheetClose}
              aria-label="Close the list"
              onMouseDown={(event) => event.preventDefault()}
              onClick={() => setDismissedAt(suggestQuery)}
            >
              ×
            </button>
          </div>

          <div className={m.sheetBody}>
            {commandMatches.length > 0
              ? commandMatches.map((command) => (
                  <button
                    key={`${command.group}-${command.id}`}
                    type="button"
                    className={m.suggestItem}
                    // mousedown rather than click: a click arrives after the field has lost focus, and
                    // the hint manages to close before the choice is made.
                    onMouseDown={(event) => event.preventDefault()}
                    onClick={() => pickCommand(command)}
                  >
                    <span className={m.suggestText}>
                      <span className={m.suggestName}>/{command.id}</span>
                      {command.hint ? <span className={m.suggestHint}>{command.hint}</span> : null}
                    </span>
                    {command.group !== 'project' ? (
                      <span className={m.suggestGroup}>{command.group}</span>
                    ) : null}
                  </button>
                ))
              : fileMatches.map((path) => (
                  <button
                    key={path}
                    type="button"
                    className={m.suggestItem}
                    onMouseDown={(event) => event.preventDefault()}
                    onClick={() => pickFile(path)}
                  >
                    <span className={m.suggestText}>
                      <span className={m.suggestName}>{fileName(path)}</span>
                      {folderOf(path) ? <span className={m.suggestPath}>{folderOf(path)}</span> : null}
                    </span>
                  </button>
                ))}
          </div>
        </div>
      )}

      {/* What is read: the two windows, the branch and its pull request. A tap on either ring opens the
          rest of the figures - which window this is, when it resets - because the panel keeps those in a
          tooltip and a phone has no hover to put one under.

          Each ring carries its percentage beside it, as in the panel: the shape of a ring says "filling
          up", but "how much" is what one actually looks down at the row for, and having to tap to see a
          figure that fits in three characters was a tap for nothing. What stays behind the tap is the
          wording - which limit, how long until it resets. */}
      <div className={m.strip}>
        <button
          type="button"
          className={m.meter}
          aria-label="Usage limits"
          disabled={!facts.session && !facts.week && !facts.extra?.active}
          onClick={() => setLimitsOpen(true)}
        >
          {/* Nothing known yet - an empty track rather than a dash: the row keeps its shape, and the
              button stays dead until there is something to open. Extra usage closes the ring, takes its
              own paint and burns - but only on the ring whose window actually ran out (the same
              substitution as in the panel - see UsageMeters). */}
          <Ring
            percent={sessionRing.percent}
            color={sessionRing.color}
            flame={sessionRing.flame}
            size={20}
          />
          <MeterValue ring={sessionRing} />
        </button>

        <button
          type="button"
          className={m.meter}
          aria-label="Usage limits"
          disabled={!facts.session && !facts.week && !facts.extra?.active}
          onClick={() => setLimitsOpen(true)}
        >
          <Ring
            percent={weekRing.percent}
            color={weekRing.color}
            pace={burning === 'week' || !facts.week ? undefined : weekBudgetToday(facts.week.resets)}
            flame={weekRing.flame}
            size={20}
          />
          <MeterValue ring={weekRing} />
        </button>

        {facts.gitBranch ? (
          <>
            <span className={m.stripRule} />
            <span className={m.branch}>
              <BranchIcon />
              <span className={m.branchName}>{facts.gitBranch}</span>
            </span>
            {facts.pullRequest ? (
              <button
                type="button"
                className={m.pr}
                // Opened here rather than on the machine with the IDE: asking that machine to open a
                // URL is a small primitive of remote control, and it is refused over the wire anyway
                // (see RemoteCommands).
                onClick={() =>
                  facts.pullRequestUrl && window.open(facts.pullRequestUrl, '_blank', 'noopener,noreferrer')
                }
              >
                PR #{facts.pullRequest}
              </button>
            ) : (
              <span className={m.prNone}>no PR</span>
            )}
          </>
        ) : null}
      </div>

      {attached.length > 0 && (
        <div className={m.attachRow}>
          {attached.map((image) => (
            <span key={image.id} className={m.attachChip}>
              <img className={m.attachThumb} src={image.dataUrl} alt="" />
              {image.name}
              <button
                type="button"
                className={m.attachRemove}
                aria-label={`Remove ${image.name}`}
                onClick={() => setAttached((current) => current.filter((one) => one.id !== image.id))}
              >
                ×
              </button>
            </span>
          ))}
        </div>
      )}

      {attachError ? <p className={m.attachError}>{attachError}</p> : null}

      <div className={m.boxWrap}>
        <div className={`${m.box} ${focused ? m.boxFocused : ''}`}>
          <div className={m.ctxRow} aria-hidden="true">
            <div className={m.ctxMeter}>
              <div
                className={m.ctxFill}
                style={{
                  width: `${context.percent}%`,
                  background: contextColor(context.percent),
                  boxShadow: `0 0 8px ${contextGlow(context.percent).strong}, 0 0 16px ${contextGlow(context.percent).soft}`,
                }}
              />
              {CONTEXT_TICKS.map((tick) => (
                <span key={tick} className={m.ctxTick} style={{ left: `${tick}%` }} />
              ))}
            </div>
          </div>

          <textarea
            ref={field}
            className={m.composerInput}
            value={draft}
            rows={1}
            placeholder={connected ? 'Say something…' : 'Reconnecting…'}
            // Not "send": there is a Send button under the field, and Enter here makes a new line. A
            // key cap that says one thing and does another is worse than a plain one.
            enterKeyHint="enter"
            onChange={(event) => {
              setDraft(event.target.value)
              setCaret(event.target.selectionStart ?? event.target.value.length)
            }}
            onSelect={(event) => setCaret((event.target as HTMLTextAreaElement).selectionStart ?? 0)}
            onFocus={() => setFocused(true)}
            onBlur={() => setFocused(false)}
          />
        </div>
      </div>

      <div className={m.tools}>
        {/* The button does not open a catalogue but puts a slash into the field: the command is typed
            on from there and the list narrows by itself, exactly as at the desk. */}
        <button
          type="button"
          className={`${m.iconBtn} ${commandMatches.length > 0 ? m.iconBtnOn : ''}`}
          aria-label="Slash commands"
          onMouseDown={(event) => event.preventDefault()}
          onClick={() => replace(0, 0, '/')}
        >
          <span className={m.iconSlash}>/</span>
        </button>

        <button
          type="button"
          className={m.iconBtn}
          aria-label="Attach a photo"
          onClick={() => picker.current?.click()}
        >
          <Paperclip />
        </button>

        {/*
          An ordinary file input, which is what opens the phone's own chooser: the photo library, the
          camera, whatever else the system offers there. Images only, and that is a limit of the wire
          rather than a preference - bytes are the only attachment the protocol carries, and a file on
          the phone has no path the agent could read (see prompt.images in protocol.ts).
        */}
        <input
          ref={picker}
          className={m.picker}
          type="file"
          accept="image/*"
          multiple
          onChange={(event) => {
            void attach(event.target.files)
            // Cleared so that picking the same photo twice in a row fires the change a second time.
            event.target.value = ''
          }}
        />

        <span className={m.spacer} />

        {running ? (
          <>
            <button type="button" className={m.stop} aria-label="Stop the run" onClick={onStop}>
              <StopSquare />
            </button>
            <button
              type="button"
              className={m.queue}
              disabled={!canSubmit}
              onClick={() => submit(true)}
            >
              Queue
            </button>
          </>
        ) : null}

        <button type="button" className={m.send} disabled={!canSubmit} onClick={() => submit(false)}>
          Send
        </button>
      </div>

      {limitsOpen && <Limits facts={facts} context={context} onClose={() => setLimitsOpen(false)} />}
    </>
  )
}

/** The last piece of a path - what the row is found by. */
const fileName = (path: string): string => {
  const parts = path.split('/').filter(Boolean)
  return path.endsWith('/') ? `${parts.at(-1) ?? path}/` : (parts.at(-1) ?? path)
}

/** Everything before it, which is what tells two files of the same name apart. */
const folderOf = (path: string): string => {
  const parts = path.split('/').filter(Boolean)
  return parts.slice(0, -1).join('/')
}

/** The same paperclip as the panel's, drawn rather than typed - see Composer.tsx at the desk. */
const Paperclip = () => (
  <svg className={m.iconClip} viewBox="0 0 24 24" aria-hidden="true">
    <path
      d="M21.44 11.05l-9.19 9.19a6 6 0 0 1-8.49-8.49l9.19-9.19a4 4 0 0 1 5.66 5.66l-9.2 9.19a2 2 0 0 1-2.83-2.83l8.49-8.48"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    />
  </svg>
)

/**
 * The stop mark as a square rather than as "■".
 *
 * The typographic one is missing from the interface font and gets substituted from another, where it
 * has a seat of its own - it lands off-centre in a round button and at a size nobody chose.
 */
const StopSquare = () => (
  <svg viewBox="0 0 16 16" aria-hidden="true">
    <rect x="0" y="0" width="16" height="16" rx="2" fill="currentColor" />
  </svg>
)

const BranchIcon = () => (
  <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" aria-hidden="true">
    <circle cx="4.5" cy="3.5" r="1.75" />
    <circle cx="4.5" cy="12.5" r="1.75" />
    <circle cx="11.5" cy="3.5" r="1.75" />
    <path d="M4.5 5.25v5.5" />
    <path d="M11.5 5.25v1.25a3 3 0 0 1-3 3H6.25" />
  </svg>
)

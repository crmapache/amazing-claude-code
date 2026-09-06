import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import { Microphone } from '../../components/Microphone'
import { Ring } from '../../components/StatusBar'
import { effortShortLabel, modeShortLabel, modelLabel } from '../../catalog'
import { atQueryInText, matchFiles } from '../../feed/files'
import { appendChip, matchCommands, slashQuery, type CommandEntry } from '../../feed/slash'
import { composePrompt, imageAttachments, trimTrailingSpace } from '../../feed/tokens'
import { formatDuration } from '../../feed/tools'
import type { QueuedMessage } from '../../protocol'
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
import { useNow } from '../../hooks/useNow'
import { encodeImage, IMAGE_BUDGET, IMAGE_MINIMUM, type PickedImage } from '../images'
import { phoneCommands, type ProjectFacts } from '../facts'
import { Limits } from './Limits'
import { voiceJoin, voiceMessage } from '../../feed/voice'
import type { PhoneDictation } from '../useDictation'
import m from '../mobile.module.css'
import { useT } from '../../i18n'

/** A message on its way to the agent, in the three pieces the shell wants it in. */
export interface OutgoingPrompt {
  text: string
  tokens: UserToken[]
  images: { mediaType: string; data: string }[]
  /** What was quoted out of the conversation before it was written - see feed/tokens.composePrompt. */
  quotes: string[]
}

interface ComposerProps {
  facts: ProjectFacts
  /** This conversation's context fill and what it is made of - see contextOf in feed/build. */
  context: { percent: number; used: number; limit: number }
  /** How the turn runs, for the one chip that says so and opens the sheet behind it. */
  run: { model: string; effort: string; mode: string }
  running: boolean
  /** When the turn on screen began, by the IDE's clock - zero when none is running. */
  since: number
  /** What this conversation will say next, in order, once the run in progress ends. */
  queue: readonly QueuedMessage[]
  queueOpen: boolean
  onQueueOpen: (open: boolean) => void
  onUnqueue: (id: string) => void
  connected: boolean
  /** How many images have already travelled in this conversation - the numbering carries on from it. */
  imageBase: number
  /** Quoted out of the feed and waiting above the field - see the message sheet. */
  quotes: string[]
  onDropQuote: (index: number) => void
  onSend: (prompt: OutgoingPrompt) => void
  onQueue: (prompt: OutgoingPrompt) => void
  onStop: () => void
  /** The model, the effort and the permission mode of this conversation - the sheet behind the chip. */
  onRun: () => void
  /** Dictation - the state lives in the application, because the token for it arrives there. */
  voice: PhoneDictation
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
 * Four rows, and the division between them is the whole idea: what is read never moves, and what is
 * pressed is never where a thumb might brush it by accident.
 *
 * The first row is read - the two windows, and how this turn runs. The second appears only while a turn
 * is running and carries the one thing that ends it: Stop used to sit in the row of actions, which is
 * how a row of six controls came to be wider than a phone and pushed Send and Queue off the edge. The
 * third is the field, full width, with the context bar on its own top edge exactly as in the panel. The
 * fourth is the actions, and it wraps rather than scrolls: a control a thumb cannot reach is not a
 * control.
 *
 * Everything the two hints know - which commands exist, which files, how a query narrows them - is the
 * panel's own (see feed/slash and feed/files). What differs is the shape they are shown in: two lines
 * per row instead of one, because at 390 points a name, its explanation and its group on one line
 * leave the explanation about nine characters.
 */
export const Composer = ({
  facts,
  context,
  run,
  running,
  since,
  queue,
  queueOpen,
  onQueueOpen,
  onUnqueue,
  connected,
  imageBase,
  quotes,
  onDropQuote,
  onSend,
  onQueue,
  onStop,
  onRun,
  voice,
}: ComposerProps) => {
  const t = useT()
  const now = useNow()
  const [draft, setDraft] = useState('')
  const [caret, setCaret] = useState(0)
  const [attached, setAttached] = useState<PickedImage[]>([])
  const [focused, setFocused] = useState(false)
  const [limitsOpen, setLimitsOpen] = useState(false)

  /** When the press began, and whether a tap has latched it on - see the dictation button below. */
  const pressedAt = useRef(0)
  const held = useRef(false)
  const listening = voice.phase === 'listening'

  /*
   * Where a dictated phrase lands.
   *
   * Handed upwards rather than pulled down as state: the draft belongs to this field, and the words
   * arrive from a socket the application holds (see useDictation). The rule for joining them to what is
   * already written is the panel's own - one rule for both screens (see feed/voice.ts).
   */
  const registerInsert = voice.registerInsert
  useEffect(() => {
    registerInsert((phrase) => setDraft((current) => voiceJoin(current, phrase)))
    return () => registerInsert(null)
  }, [registerInsert])
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

  const commands = useMemo(() => phoneCommands(t, facts), [t, facts])

  /** Which ring burns, when one does: the window being paid past, not always the five-hour one. */
  const burning = facts.extra?.active ? limitWindowRing(facts.extra.window) : null

  /**
   * What each of the two rings is, figure and all - the same three answers as in the panel (see
   * UsageMeters), gathered here rather than spelled out twice inside the markup below.
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
  const replace = useCallback((from: number, to: number, text: string) => {
    setDraft((current) => current.slice(0, from) + text + current.slice(to))
    pendingCaret.current = from + text.length
    setDismissedAt(null)
    field.current?.focus()
  }, [])

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
          added.length > 0 ? t.mobile.composer.photosDropped(refused) : t.mobile.composer.photoTooBig,
        )
      }
    },
    [attached, t],
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
      text: composePrompt({ tokens, quotes: quotes.map((text) => ({ text })) }, imageBase),
      tokens,
      images: imageAttachments(tokens),
      quotes,
    }
  }, [draft, attached, imageBase, quotes])

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
            <span className={m.sheetTitleGroup}>
              <span className={m.sheetTitle}>
                {commandMatches.length > 0 ? t.mobile.composer.commands : t.mobile.composer.projectFiles}
              </span>
            </span>
            <span className={m.sheetCount}>
              {commandMatches.length > 0
                ? t.mobile.composer.ofTotal(commandMatches.length, commands.length)
                : t.mobile.composer.ofTotal(fileMatches.length, facts.files.length)}
            </span>
            <button
              type="button"
              className={m.sheetClose}
              aria-label={t.mobile.composer.closeList}
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

      {/* What is read: the two windows, and how this turn runs. A tap on either ring opens the rest of
          the figures - which window this is, when it resets - because the panel keeps those in a tooltip
          and a phone has no hover to put one under. */}
      <div className={m.strip}>
        <button
          type="button"
          className={m.meter}
          aria-label={t.mobile.composer.usageLimits}
          disabled={!facts.session && !facts.week && !facts.extra?.active}
          onClick={() => setLimitsOpen(true)}
        >
          <Ring percent={sessionRing.percent} color={sessionRing.color} flame={sessionRing.flame} size={20} />
          <MeterValue ring={sessionRing} />
        </button>

        <button
          type="button"
          className={m.meter}
          aria-label={t.mobile.composer.usageLimits}
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

        <span className={m.stripRule} />

        {/*
          Model, effort and mode in one chip rather than as three selectors.

          At the desk they are three buttons because there is a row to put them in; here that row is the
          one a thumb reaches, and three of them left no width for any of the three to say what it holds.
          One chip says all three and opens the sheet where they are changed - which is also where the
          mode explains why it cannot be.
        */}
        <button type="button" className={m.runChip} onClick={onRun}>
          <Gear />
          <span className={m.runChipText}>
            {modelLabel(run.model)}
            {run.effort ? ` · ${effortShortLabel(run.effort)}` : ''}
            {run.mode ? ' · ' : ''}
            {run.mode ? <span className={m.runChipMode}>{modeShortLabel(t, run.mode)}</span> : null}
          </span>
          <span className={m.runChipChevron}>›</span>
        </button>
      </div>

      {/*
        The turn in progress, and the one button that ends it.

        Its own row, and that is the fix: Stop used to stand in the row of actions beside Queue and Send,
        and six controls in one row on a 390-point screen pushed the two that send a message off the
        edge. Here it is alone with the thing it is about, and it exists only while there is a turn.
      */}
      {running && (
        <div className={m.runRow}>
          <span className={`${m.dot} ${m.dotRunning}`} />
          <span className={m.runRowText}>
            {t.mobile.composer.running}
            {since > 0 ? ` · ${formatDuration(Math.max(0, now() - since))}` : ''}
          </span>

          {queue.length > 0 && (
            <button type="button" className={m.runRowQueue} onClick={() => onQueueOpen(!queueOpen)}>
              {t.mobile.composer.queued(queue.length)}
            </button>
          )}

          <button type="button" className={m.stop} onClick={onStop}>
            <StopSquare />
            {t.mobile.composer.stop}
          </button>
        </div>
      )}

      {/* What is waiting to be said, and the cross that takes one back. Folded away by default while a
          turn runs - the row above already says how many there are, and the list is opened to change it
          rather than to be reminded of it. */}
      {queue.length > 0 && (!running || queueOpen) && (
        <div className={m.queueList}>
          {queue.map((item, index) => (
            <div key={item.id} className={m.queueRow}>
              <span className={m.queueBadge}>{index + 1}</span>
              <span className={m.queueText}>{item.text}</span>
              <button
                type="button"
                className={m.queueRemove}
                aria-label={t.mobile.removeFromQueue}
                onClick={() => onUnqueue(item.id)}
              >
                ×
              </button>
            </div>
          ))}
        </div>
      )}

      {/* What was quoted out of the conversation, above the field exactly as at the desk: without it a
          question like "but why?" goes out with nothing to say what it is about. */}
      {quotes.length > 0 && (
        <div className={m.quoteList}>
          {quotes.map((quote, index) => (
            <div key={index} className={m.quoteRow}>
              <span className={m.quoteText}>{quote}</span>
              <button
                type="button"
                className={m.queueRemove}
                aria-label={t.mobile.composer.dropQuote}
                onClick={() => onDropQuote(index)}
              >
                ×
              </button>
            </div>
          ))}
        </div>
      )}

      {attached.length > 0 && (
        <div className={m.attachRow}>
          {attached.map((image) => (
            <span key={image.id} className={m.attachChip}>
              <img className={m.attachThumb} src={image.dataUrl} alt="" />
              {image.name}
              <button
                type="button"
                className={m.attachRemove}
                aria-label={t.mobile.composer.removeImage(image.name)}
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
            placeholder={connected ? t.mobile.composer.say : t.mobile.composer.reconnecting}
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

      {voice.interim ? <p className={m.voiceTail}>{voice.interim}</p> : null}
      {voice.error ? <p className={m.attachError}>{voiceMessage(t, voice.error, true)}</p> : null}

      {/*
        The row of actions, as a grid that wraps rather than a line that scrolls.

        Four icons on the left, the two words on the right, and if a language or a font makes them too
        wide for one line they take two - a control pushed off the edge of a phone is a control that
        does not exist, which is exactly what happened to Send while Stop still lived here.
      */}
      <div className={m.tools}>
        <div className={m.toolIcons}>
          {/* The button does not open a catalogue but puts a slash into the field: the command is typed
              on from there and the list narrows by itself, exactly as at the desk. */}
          <button
            type="button"
            className={`${m.iconBtn} ${commandMatches.length > 0 ? m.iconBtnOn : ''}`}
            aria-label={t.mobile.composer.slash}
            onMouseDown={(event) => event.preventDefault()}
            onClick={() => replace(0, 0, '/')}
          >
            <span className={m.iconSlash}>/</span>
          </button>

          {/* And the same for a file: an "@" at the caret, which the hint answers as it is typed on. */}
          <button
            type="button"
            className={`${m.iconBtn} ${fileMatches.length > 0 ? m.iconBtnOn : ''}`}
            aria-label={t.mobile.composer.projectFiles}
            onMouseDown={(event) => event.preventDefault()}
            onClick={() => replace(caret, caret, '@')}
          >
            <span className={m.iconSlash}>@</span>
          </button>

          <button
            type="button"
            className={m.iconBtn}
            aria-label={t.mobile.composer.attachPhoto}
            onClick={() => picker.current?.click()}
          >
            <Paperclip />
          </button>

          {/*
            Dictation. Held down it records and stops when the finger lifts; tapped it stays on until the
            next tap. That is the gesture every messenger already taught everybody, and it is the one that
            suits a phone: holding a button for a two-minute thought is not a thing a hand wants to do.

            Pointer events rather than mouse or touch ones: one set that covers a finger, a stylus and the
            desktop browser this is debugged in. The press is claimed with setPointerCapture so that a
            finger sliding off the button still ends the dictation on release rather than leaving it
            recording for ever.
          */}
          <button
            type="button"
            className={`${m.iconBtn} ${listening ? m.iconBtnLive : ''}`}
            aria-label={listening ? t.mobile.composer.voiceStop : t.mobile.composer.voice}
            aria-pressed={listening}
            /*
               Greyed out with no link, but never while it is recording.

               The socket to Deepgram is the phone's own and outlives a relay that flaps, so disabling a
               running dictation would be a recording nothing could stop: a disabled control gets no
               pointer events, so even letting go would not reach it.
            */
            disabled={voice.phase === 'finishing' || (!connected && !listening)}
            onPointerDown={(event) => {
              if (listening) return
              // Belt and braces with the disabled state above: no link, no token, and a microphone
              // opened for nothing would only light the indicator.
              if (!connected) return
              event.currentTarget.setPointerCapture(event.pointerId)
              pressedAt.current = Date.now()
              voice.start()
            }}
            onPointerUp={() => {
              if (!listening) return
              // A tap rather than a hold: leave it running, and let the next tap end it.
              if (Date.now() - pressedAt.current < TAP_MS) {
                held.current = true
                return
              }
              voice.stop()
            }}
            onPointerCancel={() => voice.cancel()}
            onClick={() => {
              // The click that follows a tap-to-latch is the same press; the one after that is the stop.
              if (!listening) return
              if (held.current) {
                held.current = false
                return
              }
              voice.stop()
            }}
          >
            <Microphone className={m.iconMic} />
          </button>
        </div>

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

        <div className={m.toolSend}>
          {/* Queue only while there is a turn to wait out. Off a run it would be the same button as Send
              with a longer word on it. */}
          {running ? (
            <button type="button" className={m.queue} disabled={!canSubmit} onClick={() => submit(true)}>
              {t.mobile.composer.queue}
            </button>
          ) : null}

          {/* Send never leaves, running or not: "I have changed my mind, now" is a thing one says from a
              sofa, and for a while it was the one thing this screen could not say. */}
          <button type="button" className={m.send} disabled={!canSubmit} onClick={() => submit(false)}>
            {t.mobile.composer.send}
          </button>
        </div>
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

/** How long a press counts as a tap rather than as holding the button down. */
const TAP_MS = 350

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
  <svg viewBox="0 0 16 16" className={m.stopGlyph} aria-hidden="true">
    <rect x="0" y="0" width="16" height="16" rx="2" fill="currentColor" />
  </svg>
)

const Gear = () => (
  <svg
    viewBox="0 0 16 16"
    className={m.runChipIcon}
    fill="none"
    stroke="currentColor"
    strokeWidth="1.4"
    aria-hidden="true"
  >
    <circle cx="8" cy="8" r="2.4" />
    <path d="M8 1.5v2M8 12.5v2M1.5 8h2M12.5 8h2M3.4 3.4l1.4 1.4M11.2 11.2l1.4 1.4M12.6 3.4l-1.4 1.4M4.8 11.2l-1.4 1.4" />
  </svg>
)

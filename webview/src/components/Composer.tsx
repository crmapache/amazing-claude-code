import {
  useEffect,
  useMemo,
  useRef,
  useState,
  type ClipboardEvent,
  type DragEvent,
  type FormEvent,
  type KeyboardEvent,
  type ReactNode,
} from 'react'
import { createPortal } from 'react-dom'
import { isBashDraft } from '../feed/bash'
import { matchFiles } from '../feed/files'
import {
  argumentOptions,
  argumentQuery,
  captureCommand,
  captureWrittenCommand,
  commandChip,
  commandNameBeforeArgument,
  matchArguments,
  matchCommands,
  plainText,
  replaceCommandHead,
  requiresArgument,
  slashQuery as slashQueryFromText,
  type CommandEntry,
} from '../feed/slash'
import { clipboardHtml, clipboardTokens, tokensText } from '../feed/tokens'
import type { Chip, UserToken } from '../feed/types'
import { isSideComposerLayout, type ComposerLayout } from '../composerLayout'
import type { ModelInfo } from '../protocol'
import { SlashSuggest } from './SlashSuggest'
import { contextColor, contextGlow } from '../feed/usage'
import {
  atQueryAt,
  caretRect,
  charAfter,
  charBefore,
  chipBesideCaret,
  chipNodeIn,
  currentRange,
  droppedPaths,
  extractTokens,
  hasFiles,
  headText,
  isMultiline,
  needsLeadingSpace,
  needsTrailingSpace,
  padTrailingBreak,
  placeCaretAtEnd,
  placeCaretBefore,
  placeCaretBeside,
  rebuildDom,
  relabelImages,
  removeChip,
  scrollCaretIntoView,
  splitTokens,
} from './composerDom'
import { FeedbackButton } from './Feedback'
import { Selectors, type Anchor, type SelectorKind } from './StatusBar'
import { ThanksButton } from './Thanks'
import s from './composer.module.css'

/** Ticks at every fifth - unrelated to the colour thresholds, purely the scale's ruler. */
const CONTEXT_METER_TICKS = [20, 40, 60, 80]

/**
 * The context bar at the very top of the field is the one place where how much of it is taken is visible:
 * the same thing is repeated nowhere as a figure. The fill and the colour are read at a glance, while an
 * exact number adds nothing to the decision at hand ("is it time to compact").
 */
const ContextMeter = ({ percent }: { percent: number }) => {
  const color = contextColor(percent)
  const glow = contextGlow(percent)

  return (
    // A row of its own above the field rather than a layer over its top padding: the padding scrolls
    // along with the text, and in a long message the lines slid under the bar - which read as a
    // strikethrough. A separate row is physically outside the scrolling, and nothing can slide under
    // it.
    <div className={s.contextMeterRow} aria-hidden="true">
      <div className={s.contextMeter}>
        <div
          className={s.contextMeterFill}
          style={{ width: `${percent}%`, background: color, boxShadow: `0 0 8px ${glow.strong}, 0 0 16px ${glow.soft}` }}
        />
        {CONTEXT_METER_TICKS.map((tick) => (
          <span key={tick} className={s.contextMeterTick} style={{ left: `${tick}%` }} />
        ))}
      </div>
    </div>
  )
}

/** How many segments the vertical scale has - see ContextMeterVertical. */
const CONTEXT_METER_SEGMENTS = 5

/**
 * The same as ContextMeter, but as a vertical scale to the left of the field - that way a narrow field
 * (compact, left, right) saves height, giving it to the textarea rather than to a horizontal bar above it
 * (see Composer.layout).
 *
 * The segments light up whole rather than filling by percentage: with a smooth fill cut exactly at
 * percent%, the topmost filled segment almost always ended up cut through its middle - to the eye it came
 * out shorter than the even ones. Five discrete divisions promise no pixel precision anyway, so we round
 * up - a segment lights as soon as the progress has entered its share at all, the same way a battery
 * indicator's arrow does.
 */
const ContextMeterVertical = ({ percent }: { percent: number }) => {
  const color = contextColor(percent)
  const glow = contextGlow(percent)
  const clamped = Math.min(100, Math.max(0, percent))
  const lit = Math.ceil((clamped / 100) * CONTEXT_METER_SEGMENTS)

  return (
    <div className={s.compactMeter} aria-hidden="true">
      <div className={s.compactMeterTrack}>
        {Array.from({ length: CONTEXT_METER_SEGMENTS }, (_, index) => (
          <span
            key={index}
            className={s.compactMeterSeg}
            style={
              index < lit
                ? { background: color, boxShadow: `0 0 8px ${glow.strong}, 0 0 16px ${glow.soft}` }
                : undefined
            }
          />
        ))}
      </div>
    </div>
  )
}

/**
 * A paperclip on the attachment button: it opens the ordinary system file chooser, while an at-sign
 * promised something else entirely - mentioning a file right inside the text, as in Claude Code itself.
 * As a drawing rather than a character from the font: a typographic paperclip is missing from some
 * typefaces and in a monospaced row looks now larger, now smaller than its neighbours.
 *
 * It is drawn at an angle but stands upright: the style turns it to the vertical (see attachIcon in
 * composer.module.css).
 */
const Paperclip = () => (
  <svg className={s.attachIcon} viewBox="0 0 24 24" aria-hidden="true">
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

/** The highlight of a chip the arrow has reached (see .tokenSelected in the styles). */
const SELECTED_CHIP_CLASS = s.tokenSelected ?? ''

/** The keys that by themselves type nothing and move nothing. */
const MODIFIER_KEYS = ['Shift', 'Meta', 'Control', 'Alt', 'CapsLock']

/**
 * An edit an input method made halfway through a character.
 *
 * A chip removed by its own cross reports itself through a plain Event (see removeChip), which carries no
 * such flag at all - and honestly counts as no composition.
 */
const isComposingEvent = (event: Event): boolean => event instanceof InputEvent && event.isComposing

interface ComposerProps {
  /** Whose tab this is - each has an undo history of its own rather than one shared by all. */
  sessionId: string
  /** Text and attachments as one sequence - in the order they were inserted in. */
  tokens: UserToken[]
  streaming: boolean
  planMode: boolean
  /** The same figure as "ctx" in the status line - it colours the context bar in the field. */
  contextPercent: number
  /** The panel's and the agent's commands as one list. */
  commands: CommandEntry[]
  /** The model catalogue from the CLI - the value hint for `/model` comes out of it. */
  models: ModelInfo[] | null
  /** The usage row (ctx/5h/wk/tok) - it stands in the field's bottom row, see UsageMeters. */
  meters: ReactNode
  /** The project's files for the "@" hint - relative to the working directory's root. */
  files: string[]
  /** How many images have already gone out in this session - the new ones are numbered on from here. */
  imageBaseCount: number
  /** The panel asks for the field to be focused, after a reference from the editor for instance. */
  focusToken: number
  onTokensChange: (tokens: UserToken[]) => void
  onAttach: () => void
  /** Files and folders dropped into the field: the shell assembles the chips out of them (see protocol). */
  onDropFiles: (paths: string[]) => void
  /**
   * A file is being held over the panel that only the shell knows about: dragging inside the IDE never
   * reaches the page at all (see fileDrag). The highlight it causes is the same as for a drag the field
   * sees itself.
   */
  fileDragOver?: boolean
  /**
   * Hands an "insert at the caret" outwards - the panel puts what came from the IDE into the field with
   * it: a reference from the editor, a file chosen in a dialog, a folder dropped with the mouse.
   * Appending such a thing to the end of the state is not an option: the caret's place lives in the field
   * itself and is simply invisible from outside.
   */
  registerInsert: (insert: ((token: UserToken) => void) | null) => void
  /** Send now: a busy agent gets the message at its next step. */
  onSubmit: () => void
  /** Defer: the agent takes this next, once it has finished what it started. */
  onQueue: () => void
  /** Whether there is anything to send - text, an attachment or a quote. */
  canSubmit: boolean
  onStop: () => void
  /** Stop has gone unconfirmed longer than is reasonable - we offer to kill the process by force. */
  stopStalled: boolean
  onForceStop: () => void
  /**
   * Where the input field sits - the same layout as the whole panel's (see App.tsx). compact tightens the
   * row itself: the context bar moves to the left as a vertical scale, and MODEL/EFFORT/MODE stand beside
   * the field - compact has no status line of its own under it. left/right tighten the row and the bar
   * too, but MODEL/EFFORT/MODE and the buttons travel into the side rail running the panel's full height
   * (see railContainer) - there is no status line of their own there either (see App.tsx).
   */
  layout?: ComposerLayout
  /**
   * For compact and left/right: those layouts have no status line under the field (see App.tsx), and
   * MODEL/EFFORT/MODE move into the composer itself (compact) or into the side rail (left/right) - by the
   * same callback that opens the other menus.
   */
  model?: string
  /** The choice the conversation has been moved away from, when that happened - see Selectors. */
  switchedFrom?: string
  effort?: string
  mode?: string
  onOpenSelector?: (kind: SelectorKind, anchor: Anchor) => void
  /**
   * The heart's menu - the same story as the selectors above: compact and left/right have no status line
   * of their own, so the heart travels here with them (see Thanks.tsx and StatusBar.tsx).
   */
  onOpenThanks?: (anchor: Anchor) => void
  onOpenFeedback?: () => void
  /**
   * The side rail's node in left/right (see App.tsx) - MODEL/EFFORT/MODE, the usage and the buttons
   * travel there through a portal rather than being rendered right here: the rail needs the panel's full
   * height, from the top of the feed to the bottom of the field, while the composer itself stands only
   * beside the field, much lower. The state and the handlers stay in the composer - the portal carries
   * only the markup. null/undefined means it is not mounted yet, or the layout is not left/right.
   */
  railContainer?: HTMLElement | null
}

export const Composer = ({
  sessionId,
  tokens,
  streaming,
  planMode,
  contextPercent,
  commands,
  models,
  meters,
  files,
  imageBaseCount,
  focusToken,
  onTokensChange,
  onAttach,
  onDropFiles,
  fileDragOver = false,
  registerInsert,
  onSubmit,
  onQueue,
  canSubmit,
  onStop,
  stopStalled,
  onForceStop,
  layout = 'bottom',
  model,
  switchedFrom,
  effort,
  mode,
  onOpenSelector,
  onOpenThanks,
  onOpenFeedback,
  railContainer,
}: ComposerProps) => {
  const compact = layout === 'compact'
  const rail = isSideComposerLayout(layout)
  const [focused, setFocused] = useState(false)
  /**
   * A dragged file hangs over the field - we highlight where it will land. This is a drag the page sees
   * itself (an ordinary browser, the harness); the one the IDE leads arrives as a separate prop (see
   * fileDragOver).
   */
  const [dropping, setDropping] = useState(false)
  const [dismissed, setDismissed] = useState(false)
  const [highlight, setHighlight] = useState(0)
  const input = useRef<HTMLDivElement>(null)
  /** The origin for the overlaid argument hint - the hint itself is not part of the field. */
  const box = useRef<HTMLDivElement>(null)
  const [ghostRect, setGhostRect] = useState<{ left: number; top: number; height: number } | null>(null)

  /**
   * The last thing the field reported outwards itself. If the incoming tokens are exactly that value,
   * the edit was caused by us (ordinary typing) and the DOM is already right: rebuilding it would only
   * lose the caret's place. But if the tokens came from outside (a tab was switched, a file was attached
   * through the IDE's dialog, a slash command was chosen) - the DOM has fallen behind and has to be
   * rebuilt.
   */
  const lastReported = useRef<UserToken[] | null>(null)

  /**
   * The chip the caret has reached with an arrow. It is indivisible, and stepping over it silently, as
   * the browser does, is not an option: then the only way to remove an attachment from the keyboard would
   * be to guess which side the caret is on and hope backspace takes exactly that one. While a chip is
   * highlighted, backspace removes precisely it, and the next arrow in the same direction passes on - the
   * same gesture as in Claude Code itself.
   *
   * A ref rather than state: the chips live in the DOM outside React (see chipNodeIn), and there is
   * nothing to repaint for a highlight - the class is set right on the node.
   */
  const selectedChip = useRef<HTMLElement | null>(null)

  const clearChipSelection = () => {
    if (SELECTED_CHIP_CLASS) selectedChip.current?.classList.remove(SELECTED_CHIP_CLASS)
    selectedChip.current = null
  }

  const selectChip = (node: HTMLElement) => {
    clearChipSelection()
    if (SELECTED_CHIP_CLASS) node.classList.add(SELECTED_CHIP_CLASS)
    selectedChip.current = node
  }

  useEffect(() => {
    const root = input.current
    if (!root || tokens === lastReported.current) return

    // The field is rebuilt whole - the highlighted node is about to be gone.
    clearChipSelection()
    rebuildDom(root, tokens)
    // A draft may have been set aside with captions that have gone stale since - we show the numbers as
    // they are, and the state catches up with the first edit.
    relabelImages(root, imageBaseCount)
    lastReported.current = tokens
  }, [tokens])

  /**
   * An undo history of our own: the browser's native undo does not see the chips - they are inserted
   * directly through a Range rather than through execCommand, and for content holding images the native
   * Cmd+Z simply has nothing to restore. Typing is coalesced by time, as the browser itself does it,
   * while attachments and programmatic edits always get a step of their own: inserted an image, took it
   * back with one Cmd+Z.
   *
   * The stack is per tab: one and the same panel edits now one session, now another, and mixing someone
   * else's history into Cmd+Z is not an option.
   */
  const undoStack = useRef<UserToken[][]>([])
  const redoStack = useRef<UserToken[][]>([])
  const lastEditAt = useRef(0)
  const sessionRef = useRef(sessionId)

  /**
   * This tab's sent messages - the up/down arrows walk over them, as in a terminal. The draft at the
   * moment the walking began is remembered separately: the down arrow past the newest message has to
   * bring back exactly that draft rather than an empty field, if the person had typed something before
   * they started walking the history from the middle.
   */
  const sentHistory = useRef<UserToken[][]>([])
  const historyIndex = useRef<number | null>(null)
  const historyDraft = useRef<UserToken[] | null>(null)

  useEffect(() => {
    if (sessionRef.current === sessionId) return
    sessionRef.current = sessionId
    undoStack.current = []
    redoStack.current = []
    sentHistory.current = []
    historyIndex.current = null
    historyDraft.current = null
  }, [sessionId])

  useEffect(() => {
    if (focusToken > 0) input.current?.focus()
  }, [focusToken])

  // Any edit opens the hint again and returns the choice to the start: the list has become a different
  // one, and holding the previous place in it serves nothing.
  useEffect(() => {
    setDismissed(false)
    setHighlight(0)
  }, [tokens])

  /**
   * A command that has already become a chip. What follows in the field is only its argument, so both
   * hints - the one by value and the one by syntax - take the name from here rather than reading it out
   * of the text afresh.
   */
  const command = commandChip(tokens)
  const argumentText = command === null ? '' : plainText(tokens.slice(1))

  /**
   * The field's start up to the caret - what a slash command is read from.
   *
   * A command need not be the whole of the field: one may return to the start of an already written
   * message and put a command in front of it, exactly as in a terminal. So the hints look at the piece
   * being typed right now rather than at the whole contents, and everything past the caret stays as it
   * is - the text, and the attachments in it too.
   *
   * It is read from the DOM rather than from the tokens: only the DOM knows where the caret is. And it
   * is kept in step both with an edit (handleInput) and with a bare move of the caret - walking away
   * from a half-typed command has to close the hint.
   */
  const [head, setHead] = useState<string | null>(null)
  const syncHead = () => setHead(input.current ? headText(input.current) : null)

  useEffect(() => {
    syncHead()
    document.addEventListener('selectionchange', syncHead)
    return () => document.removeEventListener('selectionchange', syncHead)
  }, [tokens])

  const query = head === null ? null : slashQueryFromText(head)

  /**
   * A terminal command has been typed rather than a message to the agent (see feed/bash). The field
   * changes its look because of it: this goes somewhere other than usual, and that has to be understood
   * before the press rather than from a card appearing in the feed.
   */
  const bash = isBashDraft(tokens)

  const commandMatches = useMemo(
    () => (query === null || dismissed ? [] : matchCommands(commands, query)),
    [commands, query, dismissed],
  )

  // The command's name has been typed and its argument follows - the hint's second step, exactly as in a
  // terminal: first the command, then its value.
  const argument = useMemo(() => {
    if (dismissed || commandMatches.length > 0) return null

    if (command !== null) {
      const options = argumentOptions(command, models)
      const value = argumentText.trim()
      // A space inside the value means the argument is no longer one word from a list but free text -
      // there is nothing to choose there.
      return options && !/\s/.test(value) ? { command, query: value, options } : null
    }

    return head === null ? null : argumentQuery(head, models)
  }, [head, dismissed, commandMatches, command, argumentText, models])

  const argumentMatches = useMemo(
    () => (argument ? matchArguments(argument.options, argument.query) : []),
    [argument],
  )

  const matches: CommandEntry[] =
    commandMatches.length > 0
      ? commandMatches
      : argumentMatches.map((option) => ({ ...option, group: 'built-in' as const }))

  /**
   * The argument's syntax as static text right after the command's name - the same step as argument
   * above, but for commands without enumerable values (not model/effort, which have lists of options of
   * their own): simply a reminder of the format, as in a terminal, rather than a list to choose from.
   */
  const ghostCommand = useMemo(() => {
    if (dismissed || commandMatches.length > 0 || argument) return null

    // The argument's slot is still empty - for a chip that is the empty tail after it, for hand-typed
    // text the same place right after the command's name.
    const name =
      command !== null
        ? (argumentText.trim() === '' ? command : null)
        : head === null
          ? null
          : commandNameBeforeArgument(head)

    return name ? (commands.find((entry) => entry.id === name) ?? null) : null
  }, [head, dismissed, commandMatches, argument, commands, command, argumentText])

  const ghostHint = ghostCommand?.argumentHint || null

  useEffect(() => {
    if (!ghostHint) {
      setGhostRect(null)
      return
    }

    const root = input.current
    const origin = box.current
    if (!root || !origin) return

    const update = () => setGhostRect(caretRect(root, origin))
    update()

    document.addEventListener('selectionchange', update)
    return () => document.removeEventListener('selectionchange', update)
  }, [ghostHint, tokens])

  /**
   * "@" searches for a file from the caret's place rather than from the start of the whole field -
   * unlike a slash command it can be typed mid-sentence, as in a terminal. While the slash hint is
   * active it gets none of its own: two lists at once are noise.
   */
  const atQuery = matches.length > 0 || dismissed ? null : (input.current ? atQueryAt(input.current) : null)
  /**
   * The search itself is remembered by what was typed after the "@", not redone on every repaint. Finding
   * the caret is cheap, going through the project's paths is not: the shell sends up to a few thousand of
   * them, and each is lowercased and split on the way. Composer repaints on every chunk of the agent's
   * answer too, so without this the list was searched afresh while nobody was typing at all - about a
   * millisecond a time, out of the sixteen a frame has.
   */
  const atText = atQuery?.query ?? null
  const fileMatches = useMemo(() => (atText === null ? [] : matchFiles(files, atText)), [files, atText])
  const isFileSuggest = matches.length === 0 && fileMatches.length > 0

  const suggestionItems: CommandEntry[] = isFileSuggest
    ? fileMatches.map((path) => ({ id: path, hint: '', group: 'project' as const }))
    : matches

  const suggesting = suggestionItems.length > 0
  const showSlash = argument === null && !isFileSuggest

  const UNDO_COALESCE_MS = 700

  /** Consecutive typing is merged into one undo step; everything else gets a boundary of its own. */
  const commitHistory = (before: UserToken[], boundary: boolean) => {
    const now = Date.now()
    // One edit sometimes reports itself in two goes - a paste that turns out to be a command reads the
    // field back and rebuilds it (see [pasteText]). Both goes carry the same snapshot of what was there
    // before, and a second copy of it in the history costs a Cmd+Z that changes nothing on the screen.
    const duplicate = undoStack.current.at(-1) === before
    const coalesce = !boundary && undoStack.current.length > 0 && now - lastEditAt.current < UNDO_COALESCE_MS
    if (!duplicate && !coalesce) undoStack.current.push(before)
    lastEditAt.current = now
    redoStack.current = []
  }

  /** The DOM is already ours - we report outwards and remember it, so the effect does not rebuild it. */
  const report = (next: UserToken[], boundary = false) => {
    commitHistory(tokens, boundary)
    lastReported.current = next
    onTokensChange(next)
    // Any edit may take the caret past the field's edge - it is limited in height and scrolls past that
    // (see scrollCaretIntoView).
    if (input.current) scrollCaretIntoView(input.current)
  }

  /**
   * Reads the field and along the way brings the images' captions into line with their order: the number
   * in a chip has to match the [Image #N] the agent will see.
   */
  const readTokens = (root: HTMLElement): UserToken[] => {
    relabelImages(root, imageBaseCount)
    return extractTokens(root)
  }

  /**
   * This session's images have been recounted (a message went out, the queue was worked through) - which
   * means the captions in the field have shifted too. Such an update does not touch the undo history: the
   * person edited nothing, only a number changed.
   */
  useEffect(() => {
    const root = input.current
    if (!root || !relabelImages(root, imageBaseCount)) return

    const next = extractTokens(root)
    lastReported.current = next
    onTokensChange(next)
  }, [imageBaseCount])

  /** A programmatic edit of the whole contents: we change the DOM ourselves rather than wait for the effect. */
  const applyTokens = (next: UserToken[]) => {
    const root = input.current
    if (!root) {
      report(next, true)
      return
    }

    clearChipSelection()
    rebuildDom(root, next)
    // We read the field back rather than report next as it is: there may be fewer images now (a piece was
    // cut out along with one of them), and the remaining captions have to shift - otherwise the field
    // keeps an "Image #2" that will travel to the agent first.
    report(readTokens(root), true)
  }

  /** Restoring a step from the history is not itself a new boundary in that history. */
  const restoreTokens = (next: UserToken[]) => {
    const root = input.current
    if (root) {
      clearChipSelection()
      rebuildDom(root, next)
      scrollCaretIntoView(root)
    }
    lastReported.current = next
    onTokensChange(next)
  }

  const undo = () => {
    const previous = undoStack.current.pop()
    if (previous === undefined) return
    redoStack.current.push(tokens)
    restoreTokens(previous)
  }

  const redo = () => {
    const next = redoStack.current.pop()
    if (next === undefined) return
    undoStack.current.push(tokens)
    restoreTokens(next)
  }

  /**
   * Whether what stands in the field has just become a finished command - then it is already a chip and
   * there is nothing left to report.
   *
   * Apart from [handleInput] because typing is not the only way a command gets into the field: pasted from
   * the clipboard it arrives whole, without a single keystroke to catch it on (see [pasteText]).
   */
  const captureTypedCommand = (next: UserToken[]): boolean => {
    const root = input.current
    if (!root) return false

    const captured = captureCommand(next, commands, headText(root))
    if (!captured) return false

    applyTokens(captured)
    // Right behind the chip and the space after it - the argument is typed there, in front of the text
    // that was already in the field.
    placeCaretBefore(root, 2)
    syncHead()
    return true
  }

  /**
   * The field has been edited: we read it back and report it outwards.
   *
   * While an input method is still assembling a character the field is not ours to rebuild - the browser
   * holds the unfinished character in a node of its own, and replacing that node tears the character out
   * of the person's hands together with the candidate window. So both rebuilds wait: the emptied field's
   * cleanup and turning a finished command into a chip.
   *
   * What does NOT wait is the report outwards. The half-typed characters keep travelling into the panel's
   * state, and that is deliberate: "is there a draft" is what tells the question card and the digit
   * hotkeys to keep their hands off the keyboard (see composerEmpty in App). A field that reported itself
   * empty for the whole of an Asian word would hand those keys away exactly when they belong to the input
   * method.
   */
  const applyEdit = (root: HTMLElement, composing: boolean) => {
    const next = readTokens(root)

    if (!composing) {
      // Having wiped every character by selection or by consecutive backspaces, Chromium leaves a lone
      // <br> instead of a genuinely empty node - because of it the placeholder (css :empty) does not
      // appear. Since no tokens are left while the node is not literally empty, we clean up ourselves.
      if (next.length === 0 && root.childNodes.length > 0) root.innerHTML = ''

      // The command's name has been finished and a space put after it - it becomes a chip on the spot,
      // without waiting for a choice from the hint. Only the name goes: whatever stands past the caret was
      // written before the command and stays where it is.
      if (captureTypedCommand(next)) return
    }

    report(next)
    // In the same batch as the tokens, so that the hint does not lag a frame behind what has been typed.
    syncHead()
  }

  /**
   * Composition is read off the event rather than remembered: one that ends with the focus leaving the
   * field reports no end at all, and a remembered "still composing" would then silence the field for good.
   * A chip's own removal arrives here as a plain Event, which carries no such flag - and rightly counts as
   * no composition (see removeChip).
   */
  const handleInput = (event: FormEvent<HTMLDivElement>) => {
    const root = input.current
    if (root) applyEdit(root, isComposingEvent(event.nativeEvent))
  }

  /**
   * The character is finished - what the input above put off now happens.
   *
   * There is no ordinary input event left to do it on: Chromium sends the last one WHILE the composition
   * is still on (insertCompositionText with the flag raised) and closes with compositionend, silently. So
   * the finishing touches are taken here and synchronously: a person who confirms a candidate with Enter
   * sends the message with the very next one, and a deferred pass would let that Enter land on a draft the
   * panel still counts as empty.
   */
  const handleCompositionEnd = () => {
    const root = input.current
    if (root) applyEdit(root, false)
  }

  /**
   * A choice from the hint. The command itself becomes a chip - like a file or an image, and for the same
   * reason: this is a chosen entity rather than typed text, and spoiling it by half an edit by accident
   * must not be possible. The argument after it stays ordinary text: every command has its own.
   */
  const insert = (picked: CommandEntry) => {
    const chip: UserToken = { kind: 'chip', chip: { kind: 'cmd', value: argument ? argument.command : picked.id } }

    // An argument's value was chosen - the command's chip already stands there, we finish the value;
    // the command itself was chosen - a place for its argument is left after the chip.
    const tail = argument ? ` ${picked.id}` : ' '
    const replacement: UserToken[] = [chip, { kind: 'text', value: tail }]

    // Only what was typed up to the caret gives way to the choice: the command may have been put in
    // front of an already written message, and that message has to survive it. There is no head to
    // replace when the command is already a chip - then the whole of the field is its argument.
    const next = (head === null ? null : replaceCommandHead(tokens, head, replacement)) ?? replacement

    applyTokens(next)
    setDismissed(true)
    if (input.current) placeCaretBefore(input.current, replacement.length)
    input.current?.focus()
    syncHead()
  }

  /**
   * Choosing a file from the "@" hint - what was typed from the "@" up to the caret is replaced by a chip
   * rather than left as text beside it: the very same attachment as a link from the editor, only chosen
   * right in the field rather than through a context menu.
   */
  const insertFileReference = (path: string) => {
    const root = input.current
    if (!root || !atQuery) return

    const range = document.createRange()
    range.setStart(atQuery.node, atQuery.start)
    range.setEnd(atQuery.node, atQuery.end)
    range.deleteContents()

    const chip: Chip = { kind: path.endsWith('/') ? 'dir' : 'file', value: path }
    const node = chipNodeIn(root, chip)
    range.insertNode(node)
    range.setStartAfter(node)
    range.collapse(true)

    // The caret has somewhere to type on without sticking to the chip - as after an attachment from the
    // clipboard.
    const space = document.createTextNode(' ')
    range.insertNode(space)
    range.setStartAfter(space)
    range.collapse(true)

    const selection = window.getSelection()
    selection?.removeAllRanges()
    selection?.addRange(range)

    report(readTokens(root), true)
  }

  /** A "/" from the button goes where the caret is, without wiping what has already been typed. */
  const insertTextAtCursor = (text: string) => {
    const root = input.current
    if (!root) return

    const range = currentRange(root)
    range.deleteContents()

    const node = document.createTextNode(text)
    range.insertNode(node)
    range.setStartAfter(node)
    range.collapse(true)

    // What was pasted may end in a line break - a line copied from a terminal usually does. The caret
    // needs room on that line.
    const padded = node === root.lastChild ? padTrailingBreak(root) : null

    const selection = window.getSelection()
    selection?.removeAllRanges()
    selection?.addRange(padded ?? range)

    report(readTokens(root), true)
  }

  /**
   * Text from the clipboard, and a command in it recognised the same way as a typed one.
   *
   * A command copied whole (out of one's own message in the feed, for instance) passes no keystroke the
   * field could catch it on, so it stayed plain text where the very same characters typed by hand became a
   * chip. Since [captureTypedCommand] reads the field itself, the paste goes in first and is looked at
   * afterwards.
   */
  const pasteText = (text: string) => {
    insertTextAtCursor(text)
    const root = input.current
    if (!root) return

    const next = readTokens(root)
    // A pasted command's name cannot be half-finished - unlike a typed one it arrives whole, with no
    // keystroke ahead to complete it - so it becomes a chip without waiting for a space (see
    // captureWrittenCommand). Only when the paste landed at the field's very end, though: rebuilding the
    // field moves the caret to it, and one pasted into the middle of a sentence has to stay where the
    // person put it.
    const written = headText(root) === tokensText(next) ? captureWrittenCommand(next, commands) : null
    if (!written) {
      captureTypedCommand(next)
      return
    }

    applyTokens(written)
    placeCaretAtEnd(root)
    syncHead()
  }

  /**
   * An image from the clipboard goes exactly where the caret stood at the moment of the paste, and with a
   * space on either side: without it the text before the attachment and after it sticks to it into one
   * unreadable word, which is what the agent sees.
   */
  const insertChipAtCursor = (chip: Chip) => {
    const root = input.current
    if (!root) return

    const range = currentRange(root)
    range.deleteContents()

    // Before the attachment only if a non-space character already stands there: the field's empty start
    // needs no space in front of it, there is nothing to add.
    if (needsLeadingSpace(charBefore(range))) {
      const space = document.createTextNode(' ')
      range.insertNode(space)
      range.setStartAfter(space)
      range.collapse(true)
    }

    const node = chipNodeIn(root, chip)
    range.insertNode(node)
    range.setStartAfter(node)
    range.collapse(true)

    // After it always: the caret needs something to stand on in order to type on without sticking to the
    // chip, even if the image landed at the very end of the field.
    if (needsTrailingSpace(charAfter(range))) {
      const space = document.createTextNode(' ')
      range.insertNode(space)
      range.setStartAfter(space)
      range.collapse(true)
    }

    const selection = window.getSelection()
    selection?.removeAllRanges()
    selection?.addRange(range)

    report(readTokens(root), true)
  }

  /**
   * Return into the field a sequence copied out of it.
   *
   * The chips are rebuilt as genuine nodes rather than from the clipboard's markup: the "node to
   * attachment" link lives by the node's identity, and a clone from the clipboard has none - a chip
   * pasted as markup would look right but would mean nothing when sending.
   */
  const insertTokensAtCursor = (next: UserToken[]) => {
    const root = input.current
    if (!root) return

    const range = currentRange(root)
    range.deleteContents()

    let tail: Node | null = null

    for (const token of next) {
      if (token.kind === 'text') {
        const text = document.createTextNode(token.value)
        range.insertNode(text)
        range.setStartAfter(text)
        tail = text
      } else {
        const node = chipNodeIn(root, token.chip)
        range.insertNode(node)
        range.setStartAfter(node)
        tail = node
      }
      range.collapse(true)
    }

    // It came back at the field's end and ends in a break - the caret needs a line to stand on (see
    // padTrailingBreak).
    const padded = tail && tail === root.lastChild ? padTrailingBreak(root) : null

    const selection = window.getSelection()
    selection?.removeAllRanges()
    selection?.addRange(padded ?? range)

    report(readTokens(root), true)
  }

  /**
   * Copying and cutting out of the field.
   *
   * Handing this to the browser is not an option: the attachments here are chips rather than text, and it
   * would put their visible caption into the clipboard along with the icon and the delete button's cross -
   * precisely the meaningless string that then got pasted back in place of the image. We put it there
   * ourselves: readable text as the agent will see it, and beside it a full description of the attachments
   * with their bytes, out of which a chip is restored alive (see feed/tokens).
   */
  const copySelection = (event: ClipboardEvent<HTMLDivElement>, cut: boolean) => {
    const root = input.current
    const selection = window.getSelection()
    if (!root || !selection || selection.rangeCount === 0) return

    const range = selection.getRangeAt(0)
    if (range.collapsed || !root.contains(range.commonAncestorContainer)) return

    const { picked, rest, caret } = splitTokens(root, range)
    if (picked.length === 0) return

    event.preventDefault()
    event.clipboardData.setData('text/plain', tokensText(picked))
    event.clipboardData.setData('text/html', clipboardHtml(picked))

    // We cut not through deleteContents: the selection may have begun or ended inside a chip, and the
    // browser would gut it, leaving half of its nodes behind. What remains has already been counted, so we
    // simply rebuild the field out of the remainder and return the caret to where the cut was made.
    if (cut) {
      applyTokens(rest)
      placeCaretBefore(root, caret)
    }
  }

  /**
   * A screenshot from the clipboard is pasted as a genuine image right at the caret's position rather than
   * as its file name in text and not at the end: the agent has to see the attachment where it stood in the
   * sentence rather than torn out of its context.
   *
   * Ordinary text is intercepted too: the default paste into a contentEditable drags someone else's markup
   * along with it. execCommand('insertText') does not always cope with that - when pasting SEVERAL lines
   * the browser may wrap the second and the rest into <div>s of its own instead of leaving them as a break
   * character inside one text node. Parsing the DOM back into tokens understands only plain text and our
   * own chips - such a <div> it silently loses whole, and the message is cut off exactly at the first
   * line. We insert a text node directly - by the same route as the "/" button - where the browser has no
   * such fork at all.
   */
  const handlePaste = (event: ClipboardEvent<HTMLDivElement>) => {
    const items = Array.from(event.clipboardData?.items ?? [])
    const images = items.filter((item) => item.type.startsWith('image/'))

    event.preventDefault()

    // Our own contents, copied out of the field, come back as live chips - with the images' bytes rather
    // than the caption off them. Checked first: a copied chip does not lie in the clipboard as an image,
    // and the ordinary branches would not recognise it.
    const restored = clipboardTokens(event.clipboardData?.getData('text/html') ?? '')
    if (restored) {
      insertTokensAtCursor(restored)
      return
    }

    if (images.length === 0) {
      const text = event.clipboardData?.getData('text/plain') ?? ''
      if (!text) return

      // Multi-line goes in as a chip, like a file or an image: a pasted wall of text pushed everything
      // else out of the field, and one's own message had to be scrolled to see what was written around
      // it. Single-line stays text: a short paste is edited right in the field, and a chip is precisely
      // what forbids that.
      if (isMultiline(text)) insertChipAtCursor({ kind: 'paste', value: 'pasted', text })
      else pasteText(text)
      return
    }

    for (const item of images) {
      const file = item.getAsFile()
      if (!file) continue

      const reader = new FileReader()
      reader.onload = () => {
        if (typeof reader.result !== 'string') return

        const root = input.current
        // The number goes by the images that genuinely stand in the field rather than by how many times
        // a paste happened: one of them may have been deleted already.
        const count = (root ? extractTokens(root) : []).filter(
          (token) => token.kind === 'chip' && token.chip.kind === 'img' && Boolean(token.chip.data),
        ).length

        insertChipAtCursor({ kind: 'img', value: `Image #${imageBaseCount + count + 1}`, data: reader.result })
      }
      reader.readAsDataURL(file)
    }
  }

  /**
   * A paste from the panel - a link from the editor, a file from a dialog, a dropped folder. It lives in a
   * ref rather than in a prop: the subscription to the shell's messages is set once for the panel's whole
   * life and would not see a fresh function from every render anyway.
   */
  const insertFromShell = useRef<(token: UserToken) => void>(() => {})
  insertFromShell.current = (token: UserToken) => {
    if (token.kind === 'chip') insertChipAtCursor(token.chip)
    else insertTextAtCursor(token.value)

    // The focus goes right after the paste rather than before it: the caret already stands past the chip
    // and one can type without aiming at the field with a mouse. Earlier would knock the paste's place
    // off: focusing an empty field puts the caret at its start.
    input.current?.focus()
  }

  useEffect(() => {
    registerInsert((token) => insertFromShell.current(token))
    return () => registerInsert(null)
  }, [registerInsert])

  /**
   * A file or a folder dropped into the field we take for ourselves: without that the embedded browser
   * would simply open the file in place of the panel's page. The contents themselves we do not need - only
   * the path, out of which the shell assembles the chip.
   */
  const handleDrop = (event: DragEvent<HTMLDivElement>) => {
    if (!hasFiles(event.dataTransfer)) return

    event.preventDefault()
    setDropping(false)

    const paths = droppedPaths(event.dataTransfer)
    if (paths.length > 0) onDropFiles(paths)
  }

  const placeholder = tokens.length
    ? ''
    : planMode
      ? 'Describe what to plan…'
      : 'Ask, or describe a change…'

  /**
   * The caret has run into a chip and stopped on it rather than stepped over: from there backspace
   * (remove) and the same arrow (pass by) work on it.
   *
   * A branch of its own before everything else in the handler: while a chip is highlighted the keys belong
   * to it - exactly as the hint list takes the arrows for itself while it is open.
   */
  const handleChipKey = (event: KeyboardEvent<HTMLDivElement>): boolean => {
    const root = input.current
    if (!root) return false

    // A held modifier by itself does nothing yet - dropping the highlight because of it would mean losing
    // it from the mere intent to type a capital letter.
    if (MODIFIER_KEYS.includes(event.key)) return false

    if (event.metaKey || event.ctrlKey || event.altKey || event.shiftKey) {
      clearChipSelection()
      return false
    }

    const selected = selectedChip.current

    if (selected) {
      if (event.key === 'Backspace' || event.key === 'Delete') {
        event.preventDefault()
        // The caret goes to the removed chip's place: typing continues right where the deletion happened
        // rather than at the field's end.
        placeCaretBeside(selected, 'before')
        clearChipSelection()
        // By the same route as the chip's own cross - literally the same one (see removeChip).
        removeChip(root, selected)
        return true
      }

      if (event.key === 'ArrowLeft' || event.key === 'ArrowRight') {
        event.preventDefault()
        placeCaretBeside(selected, event.key === 'ArrowLeft' ? 'before' : 'after')
        clearChipSelection()
        return true
      }

      // Everything else (typing, Enter, Escape) simply drops the highlight and works as usual: holding it
      // after the person has moved on to something else serves nothing.
      clearChipSelection()
      return false
    }

    if (event.key !== 'ArrowLeft' && event.key !== 'ArrowRight') return false

    const chip = chipBesideCaret(root, event.key === 'ArrowLeft' ? 'backward' : 'forward')
    if (!chip) return false

    event.preventDefault()
    selectChip(chip)
    return true
  }

  /**
   * While an input method is assembling a character, the keyboard is not ours.
   *
   * Enter confirms a candidate, Tab and the arrows walk the candidate list, the digits pick from it,
   * Escape throws the half-typed character away - the very keys the field otherwise takes for sending, for
   * the hint, for the history and for stopping the agent. Taken by us, they answer the hint with a file
   * instead of a word (checked live: a chip landed in the field mid-word), or stop the turn on a plain
   * "no, not that character".
   *
   * So the whole handler steps aside for the duration - the chip navigation and the Cmd combinations
   * first of all: they edit the field through execCommand and Selection.modify, which break the
   * composition in the engine rather than merely in our logic.
   *
   * The flag comes off the event rather than out of a remembered state on purpose. A composition that
   * ends with the focus leaving the field sends no end event, and a remembered one would stay raised - a
   * field that never sends again and an Escape that never stops the agent, with nothing but a reload to
   * cure it.
   */
  const handleKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    if (event.nativeEvent.isComposing) {
      // Escape is thrown away rather than acted upon: cancelling a half-typed character must not travel
      // up to the panel's own Escape and stop the turn (see the window handler in App). The browser still
      // gets it - that is what cancels the composition.
      if (event.key === 'Escape') event.stopPropagation()
      return
    }

    if (handleChipKey(event)) return

    // JCEF does not forward macOS's native "by line" combinations - Cmd+Backspace and Cmd+arrow stay
    // silent in a contentEditable, although Option+arrow (by word) works as it should. We implement them
    // ourselves through Selection.modify: that is a pure DOM API bypassing the very native key bindings
    // that are unreliable here.
    if (event.metaKey && (event.key === 'Backspace' || event.key === 'ArrowLeft' || event.key === 'ArrowRight')) {
      event.preventDefault()
      const selection = window.getSelection()
      if (!selection) return

      if (event.key === 'Backspace') {
        selection.modify('extend', 'backward', 'word')
        document.execCommand('delete')
        return
      }

      const direction = event.key === 'ArrowRight' ? 'forward' : 'backward'
      selection.modify(event.shiftKey ? 'extend' : 'move', direction, 'lineboundary')
      return
    }

    // An undo history of our own - the browser's native Cmd+Z/Ctrl+Z knows nothing about our chips and
    // would restore them wrongly, so we intercept it entirely. Ctrl is needed on a Mac too: Chromium
    // inside JCEF answers Ctrl+Z with an undo of its own regardless of the host OS, and without the
    // interception that would look like a stray "someone else's" undo over the input field.
    if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'z') {
      event.preventDefault()
      if (event.shiftKey) redo()
      else undo()
      return
    }

    if ((event.metaKey || event.ctrlKey) && !event.shiftKey && event.key.toLowerCase() === 'y') {
      event.preventDefault()
      redo()
      return
    }

    // While the list of commands or files is open, the arrows and Enter belong to it.
    if (suggesting) {
      if (event.key === 'ArrowDown') {
        event.preventDefault()
        setHighlight((current) => (current + 1) % suggestionItems.length)
        return
      }

      if (event.key === 'ArrowUp') {
        event.preventDefault()
        setHighlight((current) => (current - 1 + suggestionItems.length) % suggestionItems.length)
        return
      }

      // The command or the argument has already been typed in full - substituting a second time serves
      // nothing, Enter has to send. But not a bare command name that takes an argument: sending it
      // without a value is not allowed, and Enter has to bring it as far as the hint over the argument
      // itself. A file has no such case - the choice there is always explicit.
      const exact = isFileSuggest
        ? false
        : argument
          ? argumentMatches.length === 1 && argumentMatches[0]?.id === argument.query
          : matches.length === 1 && matches[0]?.id === query && !requiresArgument(matches[0].id)

      if ((event.key === 'Enter' && !exact) || event.key === 'Tab') {
        event.preventDefault()
        const picked = suggestionItems[highlight] ?? suggestionItems[0]
        if (picked) {
          if (isFileSuggest) insertFileReference(picked.id)
          else insert(picked)
        }
        return
      }

      if (event.key === 'Escape') {
        event.preventDefault()
        // The hint has been closed - that is enough: we do not let the Escape fall through higher and
        // stop the agent along the way (see the global handler in App).
        event.stopPropagation()
        setDismissed(true)
        return
      }
    }

    // The up/down arrows walk the history of sent messages, as in a terminal. Up works only if the field
    // is empty or the history is already being walked: otherwise this is simply the caret moving over a
    // multi-line draft rather than walking anything.
    if (event.key === 'ArrowUp' || event.key === 'ArrowDown') {
      const browsing = historyIndex.current !== null
      const empty = tokens.length === 0

      if (event.key === 'ArrowUp' && (empty || browsing) && sentHistory.current.length > 0) {
        event.preventDefault()
        if (historyIndex.current === null) historyDraft.current = tokens
        historyIndex.current = Math.max(0, (historyIndex.current ?? sentHistory.current.length) - 1)
        applyTokens(sentHistory.current[historyIndex.current] ?? [])
        return
      }

      if (event.key === 'ArrowDown' && browsing) {
        event.preventDefault()
        const nextIndex = (historyIndex.current ?? 0) + 1

        if (nextIndex >= sentHistory.current.length) {
          historyIndex.current = null
          applyTokens(historyDraft.current ?? [])
          historyDraft.current = null
        } else {
          historyIndex.current = nextIndex
          applyTokens(sentHistory.current[nextIndex] ?? [])
        }
        return
      }
    }

    if (event.key === 'Enter' && !event.shiftKey) {
      event.preventDefault()
      // Enter is the Send button, so it stays silent at exactly the times the button is dimmed: there is
      // nothing to send.
      if (!canSubmit) return
      if (tokens.length > 0) sentHistory.current.push(tokens)
      historyIndex.current = null
      historyDraft.current = null
      onSubmit()
      return
    }

    if (event.key === 'Enter' && event.shiftKey) {
      event.preventDefault()
      // A line break is insertLineBreak, the browser's own command for exactly this. The neighbouring
      // options will not do: insertText with '\n' splits the field into a separate <div> for the second
      // line (checked live), and a text node of our own through a Range loses the caret.
      //
      // The caret got lost like this: a line break at the very end of the contents the browser does not
      // draw - by the rules of wrapping an empty last line takes no space - and the caret has nowhere to
      // stand on it. It collapsed into the end of the previous line and the next letter was typed BEFORE
      // the break: the first press looked as though it had not worked, the second as though it had
      // "finally broken the line".
      //
      // insertLineBreak knows about that case and keeps a spare line break at the field's end while the
      // caret stands on the empty last line; the first typed letter takes it. After that the field stays
      // flat text, which is how the token parsing reads it.
      document.execCommand('insertLineBreak')
    }
  }

  /* One button for every attachment: a file, an image and a folder are chosen through one and the same
     dialog, and the difference is visible from the path itself. The tooltip unfolds upwards: the row
     stands at the panel's bottom edge, and downwards there is nowhere for it to go. */
  const attachButton = (
    <button
      type="button"
      className={s.attach}
      data-tooltip="Attach files or folders"
      data-tooltip-at="top"
      aria-label="Attach files or folders"
      onClick={onAttach}
    >
      <Paperclip />
    </button>
  )

  /* The button does not open a catalogue but puts a slash into the field: the command is typed on from
     there and the list narrows by itself. A slash mid-text does not start the hint - so with something
     already in the field the button is disabled, unless the caret stands at the very start: a command in
     front of a written message is a command just the same. */
  const slashDisabled = tokens.length > 0 && head !== ''
  const slashButton = (
    <button
      type="button"
      className={s.attach}
      data-tooltip="Slash commands"
      data-tooltip-at="top"
      aria-label="Slash commands"
      disabled={slashDisabled}
      /* The press must not take the focus away from the field: the slash goes where the caret stands,
         and a caret that has left the field would drop it at the end instead. */
      onMouseDown={(event) => event.preventDefault()}
      onClick={() => {
        insertTextAtCursor('/')
        input.current?.focus()
      }}
    >
      <span className={s.attachSlash}>/</span>
    </button>
  )

  /* Only the rail's variant is built here: in compact the heart stands in the selectors' row rather than
     among the buttons (see below), and in the ordinary layout it stands in the status line under the field
     (see StatusBar). */
  const thanksButton = <ThanksButton rail onOpen={(anchor) => onOpenThanks?.(anchor)} />
  const feedbackButton = <FeedbackButton rail onOpen={() => onOpenFeedback?.()} />

  const stopButton = streaming ? (
    <button type="button" className={s.stop} onClick={onStop}>
      ■ Stop
    </button>
  ) : null

  // An ordinary Stop honestly waits for a confirmation. If it has not come for longer than is reasonable,
  // the only working way out of here is to kill the process.
  const forceStopButton = stopStalled ? (
    <button
      type="button"
      className={s.forceStop}
      onClick={onForceStop}
      data-tooltip="Claude isn't confirming the stop"
      data-tooltip-at="top"
    >
      ⚠ Not responding · Force stop
    </button>
  ) : null

  /* Two separate buttons rather than one with two faces: while the agent is busy, a message has a choice -
     to reach it now, mid-work, or to wait its turn. Send always works, Queue is meaningful only with a busy
     agent: a free one has nothing to wait for.

     A terminal command has no queue at all: the panel runs it itself and has no reason to wait for the
     agent to come free. */
  const queueButton = bash ? null : (
    <button
      type="button"
      className={`${s.send} ${s.sendQueued}`}
      onClick={onQueue}
      disabled={!canSubmit || !streaming}
      data-tooltip="Send after the current run finishes"
      data-tooltip-at="top"
    >
      Queue
    </button>
  )

  const sendButton = (
    <button
      type="button"
      className={`${s.send} ${bash ? s.sendRun : ''}`}
      onClick={onSubmit}
      disabled={!canSubmit}
      data-tooltip={bash ? 'Run in your shell - Claude sees the output with your next message' : undefined}
      data-tooltip-at="top"
    >
      {bash ? 'Run' : 'Send'}
    </button>
  )

  /**
   * The row of buttons under the field: usage, attachments, commands, sending. One and the same set of
   * children both in the ordinary layout (a `.tools` row of its own inside box) and in compact (the second
   * row of the column to the right of box, see below) - the buttons' behaviour does not obey the layout,
   * only where the row stands and in which order it reads them changes. In left/right the usage stands in
   * a row of its own above this one, in the side rail (see .railMeters below) - here it would climb in as
   * the same heap that pushes Send/Queue when a Stop appears.
   *
   * The order differs by rearranging the children in the markup rather than through the CSS `order`:
   * keyboard tabbing goes by the DOM's order and does not follow the visual `order`, so a rearrangement
   * through CSS would part ways with what is visible on the screen.
   */
  const toolsRow = compact ? (
    <>
      {/* In compact the buttons are the most important thing on the row (the usage is already visible a
          row above, in the rings), so Send and Queue come first and the usage last, after the icons. Send
          and Queue are ordinary actions, so they stand first; Stop and Force stop interrupt the agent, so
          they ride behind them rather than break the Send/Queue pair apart. The .spacer before the usage
          presses the buttons to the left edge: without it they hang in a shared group with the usage,
          which .compactToolsRow (justify-content: flex-end) drives whole to the right edge - and in the
          first instant after the plugin starts, while the usage is still empty and narrow, the buttons
          ride rightwards along with it. */}
      {sendButton}
      {queueButton}
      {stopButton}
      {forceStopButton}
      {attachButton}
      {slashButton}
      {/* Level with the two beside it rather than beside the heart a row above - see FeedbackButton.tight. */}
      <FeedbackButton tight onOpen={() => onOpenFeedback?.()} />
      <div className={s.spacer} />
      {meters}
    </>
  ) : rail ? (
    <>
      {sendButton}
      {queueButton}
      {stopButton}
      {forceStopButton}
      {attachButton}
      {slashButton}
      {/* The heart goes to the row's far end, opposite Send - under left the row is mirrored whole (see
          .railToolsRowLeft), so the end here is always the rail's outer edge rather than its boundary
          with the feed. */}
      <div className={s.spacer} />
      {feedbackButton}
      {thanksButton}
    </>
  ) : (
    <>
      {/* The usage goes on the left, in the place where the attachment and command buttons used to stand:
          this is where one looks while deciding what to write next, and the numbers have to be at hand
          rather than a row below. The buttons themselves have moved right, over to Send. */}
      {meters}
      <div className={s.spacer} />
      {attachButton}
      {slashButton}
      {stopButton}
      {forceStopButton}
      {queueButton}
      {sendButton}
    </>
  )

  const ghostHintNode =
    ghostHint && ghostRect ? (
      <span
        className={s.ghostHint}
        style={{ left: ghostRect.left, top: ghostRect.top, lineHeight: `${ghostRect.height}px` }}
        aria-hidden="true"
      >
        {ghostHint}
      </span>
    ) : null

  const fieldNode = (
    <div
      ref={input}
      className={`${s.field} ${compact ? s.fieldCompact : rail ? s.fieldRail : ''}`}
      contentEditable
      suppressContentEditableWarning
      data-placeholder={placeholder}
      onInput={handleInput}
      // The finishing touches the input above put off while the character was still being assembled.
      onCompositionEnd={handleCompositionEnd}
      onFocus={() => setFocused(true)}
      onBlur={() => {
        setFocused(false)
        // The highlight promises that the next backspace will remove this chip - and with the focus gone
        // from the field it promises nothing any more.
        clearChipSelection()
      }}
      // The caret was placed with a mouse - that has nothing to do with the chip the arrows reached.
      onMouseDown={clearChipSelection}
      onPaste={handlePaste}
      onCopy={(event) => copySelection(event, false)}
      onCut={(event) => copySelection(event, true)}
      onKeyDown={handleKeyDown}
    />
  )

  const boxClassName = (extra: string) =>
    `${s.box} ${extra} ${focused ? s.boxFocused : ''} ${dropping || fileDragOver ? s.boxDropping : ''} ${bash ? s.boxBash : ''}`

  const suggestNode = suggesting ? (
    <SlashSuggest
      commands={suggestionItems}
      highlight={highlight}
      onPick={isFileSuggest ? (picked) => insertFileReference(picked.id) : insert}
      onHighlight={setHighlight}
      showSlash={showSlash}
    />
  ) : null

  if (compact) {
    return (
      <div className={s.boxWrap}>
        {suggestNode}

        <div className={s.compactRow}>
          <div
            className={boxClassName(s.boxCompact)}
            ref={box}
            onDragOver={(event) => {
              if (!hasFiles(event.dataTransfer)) return
              event.preventDefault()
              event.dataTransfer.dropEffect = 'copy'
              setDropping(true)
            }}
            onDragLeave={(event) => {
              if (event.currentTarget.contains(event.relatedTarget as Node | null)) return
              setDropping(false)
            }}
            onDrop={handleDrop}
          >
            <ContextMeterVertical percent={contextPercent} />
            {ghostHintNode}
            {fieldNode}
          </div>

          {/*
           * MODEL/EFFORT/MODE and the buttons used to live in a separate status row under the field (see
           * StatusBar), but compact has no status row of its own: both rows moved here, into the column
           * beside the field, so that as much height as possible is left for the feed.
           */}
          <div className={s.compactControls}>
            <div className={s.compactSelectors}>
              <Selectors
                model={model}
                switchedFrom={switchedFrom}
                effort={effort ?? ''}
                mode={mode ?? ''}
                auto
                onOpen={(kind, anchor) => onOpenSelector?.(kind, anchor)}
              />

              {/* Right after MODE rather than past a spacer: unlike the status line, this row is divided
                  evenly among the three selectors (see .selectorAuto), so its end is wherever they end.
                  The bubble is not here but among the buttons below - this row has no width to spare, and
                  why that matters is written out at FeedbackButton.tight. */}
              <ThanksButton withSelectors onOpen={(anchor) => onOpenThanks?.(anchor)} />
            </div>

            <div className={s.compactToolsRow}>{toolsRow}</div>
          </div>
        </div>
      </div>
    )
  }

  if (rail) {
    return (
      <div className={s.boxWrap}>
        {suggestNode}

        <div className={s.railRow}>
          <div
            className={boxClassName(s.boxRail)}
            ref={box}
            onDragOver={(event) => {
              if (!hasFiles(event.dataTransfer)) return
              event.preventDefault()
              event.dataTransfer.dropEffect = 'copy'
              setDropping(true)
            }}
            onDragLeave={(event) => {
              if (event.currentTarget.contains(event.relatedTarget as Node | null)) return
              setDropping(false)
            }}
            onDrop={handleDrop}
          >
            <ContextMeterVertical percent={contextPercent} />
            {ghostHintNode}
            {fieldNode}
          </div>
        </div>

        {/*
         * MODEL/EFFORT/MODE and the buttons: left/right has no status row of its own under the field -
         * through a portal they travel into the side rail spanning the panel's full height (see
         * railContainer and App.tsx). The state and the handlers stay here, in the composer, only the
         * markup is drawn elsewhere in the DOM. While the node is not mounted yet (the first render) we
         * draw nothing at all - React will not let anyone into a portal with a null container.
         */}
        {railContainer
          ? createPortal(
              <>
                <div className={s.railSelectors}>
                  <Selectors
                    model={model}
                    switchedFrom={switchedFrom}
                    effort={effort ?? ''}
                    mode={mode ?? ''}
                    auto
                    onOpen={(kind, anchor) => onOpenSelector?.(kind, anchor)}
                  />
                </div>

                {/* The usage sits right under the selectors, in a row of its own: neither does it move
                    when a Stop/Queue appears below, nor do they when the usage rings grow after the data
                    arrives. */}
                <div className={s.railMeters}>{meters}</div>

                <div className={layout === 'left' ? `${s.railToolsRow} ${s.railToolsRowLeft}` : s.railToolsRow}>
                  {toolsRow}
                </div>
              </>,
              railContainer,
            )
          : null}
      </div>
    )
  }

  return (
    <div className={s.boxWrap}>
      {suggestNode}

      <div
        className={boxClassName('')}
        ref={box}
        onDragOver={(event) => {
          if (!hasFiles(event.dataTransfer)) return
          // Without preventDefault the browser decides that dropping here is not allowed, and it never
          // gets as far as onDrop.
          event.preventDefault()
          event.dataTransfer.dropEffect = 'copy'
          setDropping(true)
        }}
        // A move between the field's children the browser counts as a leave too - we dim the highlight
        // only when the cursor has genuinely left the frame.
        onDragLeave={(event) => {
          if (event.currentTarget.contains(event.relatedTarget as Node | null)) return
          setDropping(false)
        }}
        onDrop={handleDrop}
      >
        <ContextMeter percent={contextPercent} />
        {ghostHintNode}
        {fieldNode}

        <div className={s.tools}>{toolsRow}</div>
      </div>
    </div>
  )
}

import type { ShellMessage, VoiceHotkey, VoiceHotkeySlot, WebviewMessage } from '../protocol'
import { bootstrap, SESSION } from './events'
import { SHOWCASE_HISTORY } from './scenarios/showcase'
import type { Scenario, ScenarioStep } from './types'

const sleep = (ms: number): Promise<void> => new Promise((resolve) => setTimeout(resolve, ms))

/**
 * The number of the command the panel has just sent to the "shell".
 *
 * In a browser there is no shell, and its side of the bridge is played by the harness: a bash-mode command
 * the panel sends genuinely, and it has to be answered under the same number - otherwise the card in the
 * feed stays "running". The bridge is installed once per page: the panel sends into it both before and
 * after <App/> is recreated.
 */
let lastShellRequest: { id: string; command: string } | undefined

/** A file the panel produced, handed to the browser the way the shell hands it to the IDE. */
const download = (name: string, base64: string): void => {
  const link = document.createElement('a')
  link.href = `data:image/png;base64,${base64}`
  link.download = name
  link.click()
}

/*
 * The IDE's half of the feedback screen, played by the harness.
 *
 * The screen is the one place in the panel that asks the shell for things it cannot make up itself - the
 * address kept from last time, the files a native dialog picked, the debug report - so without an answer
 * here it would sit empty and none of it could be looked at. The files are invented; the report is a
 * sample of the real shape (see FeedbackReport on the plugin's side).
 *
 * Sending fails every third time on purpose. The failed path has its own banner and leaves the draft
 * where it was, and that is precisely the state one never reaches by accident when checking by hand.
 */
let feedbackFiles: { id: string; name: string; bytes: number }[] = []
let feedbackSends = 0

const SAMPLE_FILES = [
  { name: 'screenshot.png', bytes: 184_320 },
  { name: 'idea.md', bytes: 2_140 },
  { name: 'crash-report.txt', bytes: 51_200 },
]

const SAMPLE_REPORT = [
  'Amazing Claude Code 0.8.1',
  'WebStorm 2026.2 (WS-262.19173.4)',
  'macOS 26.6 - aarch64',
  'Claude Code 2.1.4',
  '',
  '--- this conversation, in outline ---',
  '',
  '+0.0s  turn started',
  '+0.4s  Read  ok    4.1 KB  f:9f2ac4',
  '+1.9s  Edit  ok    96 B    f:9f2ac4',
  '+2.3s  Bash  fail  exit 1',
  '+4.8s  turn ended  4.8s  3 tools',
  '',
  '--- what the plugin ran into ---',
  '',
  '11:04:22 session  claude exited (code 1)',
  '11:04:22 stderr   ERR_STREAM_PREMATURE_CLOSE',
  '11:04:23 panel    uncaught TypeError',
].join('\n')

const answerFeedback = (message: WebviewMessage): void => {
  const state = (note?: string): void => {
    window.__accReceive?.({
      type: 'feedbackState',
      email: 'you@example.com',
      attachments: feedbackFiles,
      ...(note ? { note } : {}),
    })
  }

  if (message.type === 'feedbackOpen') state()

  if (message.type === 'feedbackReport') {
    window.__accReceive?.({ type: 'feedbackLog', text: SAMPLE_REPORT })
  }

  if (message.type === 'feedbackAttach') {
    const next = SAMPLE_FILES[feedbackFiles.length % SAMPLE_FILES.length]
    if (next) {
      feedbackFiles = [...feedbackFiles, { id: `f${feedbackFiles.length + 1}`, ...next }]
      state(feedbackFiles.length >= 3 ? 'One of them was skipped: it is bigger than 10 MB.' : undefined)
    }
  }

  if (message.type === 'feedbackDetach') {
    feedbackFiles = feedbackFiles.filter((file) => file.id !== message.id)
    state()
  }

  if (message.type === 'feedbackSend') {
    feedbackSends += 1
    const ok = feedbackSends % 3 !== 0
    if (ok) feedbackFiles = []

    setTimeout(() => {
      window.__accReceive?.(
        ok
          ? { type: 'feedbackSent', ok: true }
          : { type: 'feedbackSent', ok: false, error: 'The feedback service did not answer. Try again.' },
      )
    }, 700)
  }
}

/*
 * The improve button, played by the harness.
 *
 * In the IDE this is a `claude -p` run of its own (see PromptImprover); here the answer is made up, but it
 * is made up the way the real one comes back - with the [[n]] markers moved rather than left where they
 * were. That is the half of the feature worth looking at without an IDE: the attachments have to come back
 * as chips, in their new place, and none of them may go missing.
 *
 * Every third press fails, as with the feedback screen above: the strip that explains a failed rewrite is
 * otherwise a piece of interface nobody ever sees.
 */
let improveRuns = 0

const answerImprove = (message: WebviewMessage): void => {
  if (message.type !== 'improvePrompt') return

  improveRuns += 1
  const failing = improveRuns % 3 === 0

  const markers = message.draft.match(/\[\[\d+\]\]/g) ?? []
  const words = message.draft.replace(/\[\[\d+\]\]/g, ' ').replace(/\s+/g, ' ').trim()
  // A press past an answer says that answer was not wanted, and the real rewriter is given every one of
  // them to steer away from (see PromptImprover). Here that is played by counting them: each take opens
  // differently, so pressing again visibly produces something else rather than the same words back.
  const takes = message.rejected?.length ?? 0
  const openings = [
    markers.length > 0 ? `Working in ${markers.join(' and ')}:` : 'In this repository:',
    'Here is what needs doing:',
    'The task, put another way:',
    'Shortest version:',
  ]
  const rewritten = [
    openings[takes % openings.length],
    '',
    `${words.charAt(0).toUpperCase()}${words.slice(1)}.`,
    '',
    takes === 0
      ? 'Say what you changed and why. If anything above is ambiguous, ask before you start.'
      : `Ask before you start if anything is unclear. (Take ${takes + 1}.)`,
  ].join('\n')

  setTimeout(() => {
    window.__accReceive?.(
      failing
        ? {
            type: 'promptImproved',
            sessionId: message.sessionId,
            id: message.id,
            error: 'Claude Code exited with code 1: not logged in.',
          }
        : { type: 'promptImproved', sessionId: message.sessionId, id: message.id, text: rewritten },
    )
  }, 1200)
}

/*
 * Voice input, played by the harness.
 *
 * In the IDE this is a microphone and a socket to Deepgram (see the voice package on the plugin's side);
 * here the speech is invented, but it arrives the way real speech does - a grey tail that grows word by
 * word and then settles into the field as a phrase. That is the half of the feature worth looking at
 * without an IDE and without a key: the tail must never end up in the message, and the settled phrases
 * must join the draft with exactly one space between them.
 *
 * Every third dictation fails, as the improve button above does: the line that explains a failed
 * dictation is otherwise a piece of interface nobody ever sees.
 */
let voiceRuns = 0
let voiceTimers: ReturnType<typeof setTimeout>[] = []
let voiceSettings = {
  enabled: true,
  language: 'en',
  device: '',
  keyHint: '…9f2c',
  hotkeys: {
    push: { caps: [{ glyph: 'option', text: '', side: 'right' }] },
    hold: {
      caps: [
        { glyph: '', text: 'Ctrl', side: '' },
        { glyph: '', text: 'Shift', side: '' },
        { glyph: '', text: 'V', side: '' },
      ],
    },
    pushMouse: { caps: [{ glyph: 'mouse', text: '4', side: '' }] },
    holdMouse: { caps: [] },
  } as Record<VoiceHotkeySlot, VoiceHotkey>,
}

/** A few of the sixty-odd nova-3 takes, enough for the list and the search above it to be tried. */
const VOICE_LANGUAGES = [
  { code: 'multi', native: 'Multilingual', english: 'Follows a language change mid-sentence' },
  { code: 'en', native: 'English', english: 'English' },
  { code: 'de', native: 'Deutsch', english: 'German' },
  { code: 'es', native: 'Español', english: 'Spanish' },
  { code: 'fr', native: 'Français', english: 'French' },
  { code: 'ja', native: '日本語', english: 'Japanese' },
  { code: 'ru', native: 'Русский', english: 'Russian' },
  { code: 'zh', native: '中文', english: 'Chinese (Simplified)' },
]

const VOICE_DEVICES = [
  { id: 'MacBook Pro Microphone', label: 'MacBook Pro Microphone' },
  { id: 'Shure MV7', label: 'Shure MV7' },
]

/** What gets dictated. Two phrases, so the space between them can be checked on screen. */
const VOICE_PHRASES = [
  'add a spinner to the export button',
  'and keep it disabled while the file is being written',
]

const voiceConfig = (): ShellMessage => ({
  type: 'voiceConfig',
  enabled: voiceSettings.enabled,
  language: voiceSettings.language,
  languages: VOICE_LANGUAGES,
  device: voiceSettings.device,
  devices: VOICE_DEVICES,
  keyHint: voiceSettings.keyHint,
  hotkeys: voiceSettings.hotkeys,
})

const voiceLater = (ms: number, run: () => void): void => {
  voiceTimers.push(setTimeout(run, ms))
}

const voiceSilence = (): void => {
  for (const timer of voiceTimers) clearTimeout(timer)
  voiceTimers = []
}

/**
 * The settings, answered a beat later rather than at once.
 *
 * The panel asks for them while it is mounting, before its own subscription is in place - in the IDE the
 * answer comes back from another process and lands well after that, while here it would be handed over
 * inside the same call and drop into a bridge that is not listening yet. The delay is what makes the
 * harness behave like the shell rather than like a function call.
 */
const sendVoiceConfig = (): void => {
  voiceLater(60, () => window.__accReceive?.(voiceConfig()))
}

const answerVoice = (message: WebviewMessage): void => {
  if (message.type === 'voiceConfig') {
    sendVoiceConfig()
    return
  }

  if (message.type === 'voiceEnabled') {
    voiceSettings = { ...voiceSettings, enabled: message.enabled }
    sendVoiceConfig()
    return
  }

  if (message.type === 'voiceLanguage') {
    voiceSettings = { ...voiceSettings, language: message.language }
    sendVoiceConfig()
    return
  }

  if (message.type === 'voiceDevice') {
    voiceSettings = { ...voiceSettings, device: message.device }
    sendVoiceConfig()
    return
  }

  if (message.type === 'voiceKey') {
    voiceSettings = { ...voiceSettings, keyHint: message.key ? `…${message.key.slice(-4)}` : '' }
    sendVoiceConfig()
    return
  }

  if (message.type === 'voiceBalance') {
    window.__accReceive?.({ type: 'voiceBalanceIs', state: 'checking' })
    // Not instant, so the "asking Deepgram" line is something one can actually see.
    voiceLater(600, () =>
      window.__accReceive?.(
        voiceSettings.keyHint
          ? { type: 'voiceBalanceIs', state: 'ok', amount: 182.4, units: 'usd' }
          : { type: 'voiceBalanceIs', state: 'none' },
      ),
    )
    return
  }

  // The recording of a hotkey: in the IDE the next real press is taken (see VoiceHotkeys), here one is
  // invented after a beat, so that the "press a key" state is visible on the way past.
  if (message.type === 'voiceCaptureHotkey') {
    const slot = message.slot
    voiceLater(900, () => {
      const bound: VoiceHotkey =
        slot === 'pushMouse' || slot === 'holdMouse'
          ? { caps: [{ glyph: 'mouse', text: '5', side: '' }] }
          : {
              caps: [
                { glyph: 'option', text: '', side: '' },
                { glyph: '', text: 'Shift', side: '' },
                { glyph: '', text: 'D', side: '' },
              ],
            }
      voiceSettings = { ...voiceSettings, hotkeys: { ...voiceSettings.hotkeys, [slot]: bound } }
      window.__accReceive?.(voiceConfig())
      return
    })
    return
  }

  if (message.type === 'voiceClearHotkey') {
    voiceSettings = {
      ...voiceSettings,
      hotkeys: { ...voiceSettings.hotkeys, [message.slot]: { caps: [] } },
    }
    sendVoiceConfig()
    return
  }

  if (message.type === 'voiceCancel') {
    voiceSilence()
    window.__accReceive?.({ type: 'voiceText', text: '', final: false })
    window.__accReceive?.({ type: 'voiceState', phase: 'idle', mode: 'hold', level: 0, error: '' })
    return
  }

  if (message.type === 'voiceStop') {
    voiceSilence()
    window.__accReceive?.({ type: 'voiceState', phase: 'finishing', mode: 'hold', level: 0, error: '' })
    // The tail Deepgram still owes after the key is released - a couple of tenths of a second in life.
    voiceLater(320, () => {
      window.__accReceive?.({ type: 'voiceText', text: '', final: false })
      window.__accReceive?.({ type: 'voiceState', phase: 'idle', mode: 'hold', level: 0, error: '' })
    })
    return
  }

  if (message.type !== 'voiceStart') return

  voiceSilence()
  voiceRuns += 1

  if (voiceRuns % 3 === 0) {
    window.__accReceive?.({ type: 'voiceState', phase: 'listening', mode: message.mode, level: 20, error: '' })
    voiceLater(700, () =>
      window.__accReceive?.({ type: 'voiceState', phase: 'idle', mode: message.mode, level: 0, error: 'mic' }),
    )
    return
  }

  window.__accReceive?.({ type: 'voiceState', phase: 'listening', mode: message.mode, level: 12, error: '' })

  const phrase = VOICE_PHRASES[(voiceRuns - 1) % VOICE_PHRASES.length] ?? VOICE_PHRASES[0]!
  const words = phrase.split(' ')
  let elapsed = 0

  words.forEach((_, index) => {
    elapsed += 260
    const tail = words.slice(0, index + 1).join(' ')
    voiceLater(elapsed, () => {
      window.__accReceive?.({ type: 'voiceText', text: tail, final: false })
      // The ring answers the voice rather than sitting still - a level that never moves is exactly how a
      // dead microphone looks, and this is the state that has to be told apart from it.
      window.__accReceive?.({
        type: 'voiceState',
        phase: 'listening',
        mode: message.mode,
        level: 25 + ((index * 37) % 60),
        error: '',
      })
    })
  })

  // The phrase settles: the grey tail is replaced by the words themselves in the draft.
  voiceLater(elapsed + 320, () => {
    window.__accReceive?.({ type: 'voiceText', text: '', final: false })
    window.__accReceive?.({ type: 'voiceText', text: phrase, final: true })
  })
}

/**
 * Pages of a conversation older than what is on screen.
 *
 * In the IDE these are read off Claude Code's transcript (see ClaudeHistory.page); here they are made up,
 * so that the mark above the feed is a working button rather than a caption: a tab opens a past
 * conversation with its end, and the way back through it is worth being able to try without an IDE.
 *
 * Four pages, and deliberately of two different kinds. The first and the last hold a conversation - the
 * ordinary press, over as soon as it is answered. The two in between hold nothing but a burst of tool
 * calls, which the feed folds into a single row: that is the page that arrives in full and moves the
 * screen by almost nothing, and the panel is supposed to ask for the next one itself rather than leave
 * the press looking ignored (see useEarlierPages). The last answer comes back without a cursor - the
 * conversation's beginning, where the mark has to disappear.
 */
let earlierPages = 0

/** The pages themselves, in the order they are asked for - the newest first, as one reads back. */
const EARLIER_PAGES: ('talk' | 'calls' | 'start')[] = ['talk', 'calls', 'calls', 'start']

const answerHistoryPage = (message: WebviewMessage): void => {
  if (message.type !== 'historyPage') return

  earlierPages += 1
  const page = earlierPages
  const shape = EARLIER_PAGES[page - 1] ?? 'start'
  const last = shape === 'start'
  const uuid = (line: number): string => `h${page}-${line}`

  const asked = (line: number, text: string) => ({
    type: 'user',
    uuid: uuid(line),
    message: { role: 'user', content: [{ type: 'text', text }] },
  })

  const replied = (line: number, text: string) => ({
    type: 'assistant',
    uuid: uuid(line),
    message: { content: [{ type: 'text', text }] },
  })

  const called = (line: number, name: string, input: unknown) => ({
    type: 'assistant',
    uuid: uuid(line),
    message: { content: [{ type: 'tool_use', id: `p${page}-${line}`, name, input }] },
  })

  const returned = (line: number, text: string) => ({
    type: 'user',
    uuid: uuid(line),
    message: { content: [{ type: 'tool_result', tool_use_id: `p${page}-${line - 1}`, content: text }] },
  })

  // A stretch of a working day: on disk it is a dozen lines, on screen one folded row.
  const burst = [
    called(1, 'Read', { file_path: 'src/checkout/summary.tsx' }),
    returned(2, 'export const Summary = () => {'),
    called(3, 'Grep', { pattern: 'discountTotal', path: 'src' }),
    returned(4, 'src/checkout/summary.tsx:41'),
    called(5, 'Read', { file_path: 'src/checkout/totals.ts' }),
    returned(6, 'export const totals = (lines: Line[]) => {'),
    called(7, 'Bash', { command: 'pnpm vitest run checkout' }),
    returned(8, '12 passed'),
  ]

  const talk =
    shape === 'start'
      ? [
          asked(1, 'Where did this whole thing start?'),
          replied(2, 'That is where this conversation begins - there is nothing above it.'),
          asked(3, 'Right, I remember now.'),
          replied(4, 'The order of the sections was left alone; only the look was fixed.'),
          asked(5, 'And the totals?'),
          replied(6, 'Rounded once, at the end, so the line items still add up.'),
        ]
      : [
          asked(1, `And what did we settle on back then? (page ${page})`),
          replied(2, 'On leaving the order of the sections alone and only fixing the look.'),
          asked(3, 'What about the discount line?'),
          replied(4, 'It stays under the subtotal - moving it up made the tax read as part of it.'),
          asked(5, 'Good.'),
          replied(6, 'Then the look is the whole of it.'),
        ]

  const entries = shape === 'calls' ? burst : talk

  setTimeout(() => {
    window.__accReceive?.({
      type: 'historyPage',
      sessionId: message.sessionId,
      entries: entries as never,
      before: message.before,
      ...(last ? {} : { cursor: uuid(1) }),
    })
  }, 400)
}

const listenToPanel = () => {
  // A scenario replayed from the top reads its history from the top too. The counter is a module's own,
  // so without this the mark stayed dead after the pages ran out once, for the rest of the browser tab.
  earlierPages = 0

  if (window.__accSend) return

  window.__accSend = (payload: string) => {
    const message = ((): WebviewMessage | null => {
      try {
        return JSON.parse(payload) as WebviewMessage
      } catch {
        return null
      }
    })()

    if (message?.type === 'bash') lastShellRequest = { id: message.id, command: message.command }

    // In the IDE an external address is opened by the shell in the system browser; here the browser is
    // the harness's own, so a link (the PR in the header, the thanks menu) genuinely opens instead of
    // quietly going nowhere.
    if (message?.type === 'openExternal') window.open(message.url, '_blank', 'noopener')

    // The picture of the statistics screen: in the IDE the shell writes it into the downloads folder,
    // here the browser has downloads of its own and does it itself - so the button can be tried out.
    if (message?.type === 'saveImage') download(message.name, message.data)

    // The history screen asks the shell for this project's past conversations. In the IDE they are read
    // off Claude Code's own folder; here they are the showcase's invented ones, so the screen can be
    // looked at - and photographed - without an IDE.
    if (message?.type === 'history') {
      setTimeout(() => window.__accReceive?.({ type: 'history', conversations: SHOWCASE_HISTORY }), 200)
    }

    if (message) answerFeedback(message)
    if (message) answerHistoryPage(message)
    if (message) answerImprove(message)
    if (message) answerVoice(message)
  }

  window.dispatchEvent(new Event('acc:ready'))
}

/** Waits for the panel to hand a command to the bridge - and returns it together with its number. */
const waitForShellRequest = async (realPacing: boolean): Promise<{ id: string; command: string } | undefined> => {
  for (let i = 0; i < 50; i += 1) {
    if (lastShellRequest) return lastShellRequest
    await sleep(realPacing ? 10 : 0)
  }

  console.warn('[harness] panel never sent the shell command; the card will stay pending')
  return undefined
}

/**
 * After <App/>'s key changes, React unmounts the old instance and mounts a new one - its own subscribe()
 * rewrites window.__accReceive afresh, but not instantly. We wait until a genuinely NEW function appears
 * there rather than the one that was there before the remount (otherwise on a repeated click the events
 * would fly for the first half second to the old, already unmounted instance).
 */
const waitForFreshBridge = async (previous: Window['__accReceive']): Promise<void> => {
  for (let i = 0; i < 50; i += 1) {
    if (window.__accReceive && window.__accReceive !== previous) return
    await sleep(10)
  }

  console.warn('[harness] bridge never refreshed after remount; scenario events may be lost')
}

export interface PlayerProgress {
  checkpointIndex: number
  total: number
}

export class ScenarioPlayer {
  private runId = 0

  cancel(): void {
    this.runId += 1
  }

  /** Live auto playback with genuine pauses and a typing effect. */
  async playAuto(scenario: Scenario, onProgress?: (progress: PlayerProgress) => void): Promise<void> {
    const myRun = (this.runId += 1)
    const previousBridge = window.__accReceive
    listenToPanel()
    await waitForFreshBridge(previousBridge)

    for (const step of bootstrap) {
      if (this.runId !== myRun) return
      await this.dispatch(step, true)
    }

    const total = scenario.checkpoints.length

    for (let index = 0; index < total; index += 1) {
      if (this.runId !== myRun) return

      onProgress?.({ checkpointIndex: index, total })

      for (const step of scenario.checkpoints[index]!.steps) {
        if (this.runId !== myRun) return
        await this.dispatch(step, true)
      }
    }
  }

  /**
   * Step mode: it instantly plays out every checkpoint from the first through targetIndex inclusive - the
   * pauses and the pieces of typing text are skipped. It works the same forwards and backwards: events
   * already applied cannot be "undone", so <App/> is always rebuilt afresh by the caller beforehand.
   */
  async jumpTo(scenario: Scenario, targetIndex: number): Promise<void> {
    const myRun = (this.runId += 1)
    const previousBridge = window.__accReceive
    listenToPanel()
    await waitForFreshBridge(previousBridge)

    for (const step of bootstrap) {
      if (this.runId !== myRun) return
      await this.dispatch(step, false)
    }

    for (let index = 0; index <= targetIndex; index += 1) {
      if (this.runId !== myRun) return

      for (const step of scenario.checkpoints[index]!.steps) {
        if (this.runId !== myRun) return
        await this.dispatch(step, false)
      }
    }
  }

  private async dispatch(step: ScenarioStep, realPacing: boolean): Promise<void> {
    if (step.kind === 'wait') {
      if (realPacing) await sleep(step.ms)
      return
    }

    // The pieces of typing text are an effect for auto playback only: the final text block restores the
    // feed's state in full without them.
    if (!realPacing && step.kind === 'agent' && step.event.type === 'stream_event') return

    if (step.kind === 'user') {
      window.__accHarnessSend?.(step.text)
      return
    }

    if (step.kind === 'resolvePlan') {
      window.__accHarnessResolvePlan?.(step.itemId, step.decision)
      return
    }

    if (step.kind === 'openStatistics') {
      window.__accHarnessOpenStatistics?.(step.view ?? 'overview')
      return
    }

    if (step.kind === 'bash') {
      await this.runShell(step, realPacing)
      return
    }

    const message: ShellMessage =
      step.kind === 'shell' ? step.message : { type: 'agent', sessionId: SESSION, event: step.event }

    window.__accReceive?.(message)
  }

  /**
   * Sends a command exactly as a person would - by typing it into the field through a "!" - and answers it
   * with the prepared output.
   */
  private async runShell(
    step: Extract<ScenarioStep, { kind: 'bash' }>,
    realPacing: boolean,
  ): Promise<void> {
    lastShellRequest = undefined
    window.__accHarnessSend?.(`!${step.command}`)

    // The send goes through the bridge, and that is asynchronous: we wait for the panel genuinely to hand
    // the command outwards, and only then learn its number.
    const request = await waitForShellRequest(realPacing)
    if (!request) return

    // A command does not run instantly - it is during this pause that the "running" card the scenario holds
    // it for is visible in the feed.
    if (realPacing) await sleep(step.runMs ?? 900)

    window.__accReceive?.({
      type: 'bashResult',
      sessionId: SESSION,
      id: request.id,
      exitCode: step.exitCode ?? 0,
      stdout: step.stdout,
      stderr: step.stderr ?? '',
    })
  }
}

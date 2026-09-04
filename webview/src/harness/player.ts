import type { PaintedTerm, SearchHit, ShellMessage, VoiceHotkey, VoiceHotkeySlot, WebviewMessage } from '../protocol'
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
  'Amazing Claude Code GUI 0.8.1',
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


/**
 * The accounts screen, played by the harness.
 *
 * Three invented accounts so every state on the screen is reachable without an IDE: the one in use, a
 * second healthy one to switch to and move a chat onto, and a third whose credential is gone. Adding a
 * fourth takes a moment and every third attempt fails, so the waiting state and the failure line are
 * both visible. Their figures ride the ordinary `usage` messages, keyed by account, exactly as they do
 * in the plugin - which is what makes the per-account limits on the rows real here too.
 */
let harnessAccounts = [
  // The sign-in Claude Code already had, first and always: it is what a person who has never touched this
  // screen is actually running on, and leaving it out is what made the screen claim they had no account.
  { id: '', alias: '', email: 'you@company.com', plan: 'max', health: 'present' as const, isDefault: true },
  { id: 'a2', alias: 'Personal', email: 'you@personal.com', plan: 'pro', health: 'present' as const },
  { id: 'a3', alias: 'Old client', email: 'me@client.com', plan: 'pro', health: 'absent' as const },
]

let harnessCurrent = ''
let harnessAdds = 0
let harnessAdding = false
/** How many Claude Design sign-ins have been asked for - every second one is played as a refusal. */
let harnessDesignLogins = 0

/** Invented shares, so the rows carry real-looking figures rather than a bare tick. */
const ACCOUNT_USAGE: Record<string, { session: number; week: number }> = {
  '': { session: 34, week: 61 },
  a2: { session: 88, week: 12 },
  a3: { session: 5, week: 5 },
}

const sendAccounts = (): void => {
  window.__accReceive?.({
    type: 'accounts',
    accounts: harnessAccounts,
    capability: 'supported',
    current: harnessCurrent,
    pending: harnessAdding,
  })

  // The figures arrive the way they really do - one `usage` message per account.
  for (const account of harnessAccounts) {
    const share = ACCOUNT_USAGE[account.id] ?? { session: 20, week: 20 }
    window.__accReceive?.({
      type: 'usage',
      account: account.id,
      session: { percent: share.session, resets: new Date(Date.now() + 2 * 3600_000).toISOString() },
      week: { percent: share.week, resets: new Date(Date.now() + 4 * 86_400_000).toISOString() },
    })
  }
}

const answerAccounts = (message: WebviewMessage): void => {
  if (message.type === 'accountList') sendAccounts()

  if (message.type === 'accountUse') {
    harnessCurrent = message.id
    sendAccounts()
  }

  if (message.type === 'accountRename') {
    harnessAccounts = harnessAccounts.map((one) => (one.id === message.id ? { ...one, alias: message.alias } : one))
    sendAccounts()
  }

  // Logging out removes the CLI's own sign-in and moves to whatever else is signed in here.
  if (message.type === 'accountLogout') {
    harnessAccounts = harnessAccounts.filter((one) => one.id !== message.id)
    if (harnessCurrent === message.id) harnessCurrent = harnessAccounts[0]?.id ?? ''
    sendAccounts()
  }

  if (message.type === 'accountForget') {
    harnessAccounts = harnessAccounts.filter((one) => one.id !== message.id)
    if (harnessCurrent === message.id) harnessCurrent = harnessAccounts[0]?.id ?? ''

    sendAccounts()
  }

  // Giving up on a sign-in halfway: the drawer goes, the list comes back without it.
  if (message.type === 'accountCancel') {
    harnessAdding = false
    sendAccounts()
  }

  if (message.type === 'accountAdd') {
    harnessAdding = true
    harnessAdds += 1
    sendAccounts()

    const failing = harnessAdds % 3 === 0
    const mine = harnessAdds

    window.setTimeout(() => {
      // Cancelled while this was in flight, or another sign-in started since: neither one is this one.
      if (!harnessAdding || harnessAdds !== mine) return

      harnessAdding = false

      if (failing) {
        sendAccounts()
        window.__accReceive?.({ type: 'accountOutcome', code: 'did-not-land' })
        return
      }

      harnessAccounts = [
        ...harnessAccounts,
        {
          id: `new${harnessAdds}`,
          alias: '',
          email: `added${harnessAdds}@example.com`,
          plan: 'pro',
          health: 'present' as const,
        },
      ]
      sendAccounts()
    }, 1_800)
  }

  /*
   * Authorizing Claude Design. In the IDE this opens a terminal and says nothing back when it works, so
   * the only thing there is to play here is the road where it does not: every second press answers with
   * a refusal, which is what opens the accounts screen when the command was typed into the field.
   */
  if (message.type === 'designLogin') {
    harnessDesignLogins += 1
    if (harnessDesignLogins % 2 === 0) {
      window.__accReceive?.({ type: 'accountOutcome', code: 'no-terminal' })
    }
  }
}

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

/**
 * A conversation chosen in the history screen.
 *
 * In the IDE the shell opens the tab when there is none under this id, replays the transcript's end into
 * it and declares the replay over. Here the harness plays that part - so the rule that decides WHICH tab
 * a past conversation lands in (see resume in App.tsx) can be tried out without an IDE: pick one on an
 * untouched tab and it opens right there, type a word into the field first and the next one opens in a
 * tab of its own.
 */
const answerResume = (message: WebviewMessage): void => {
  if (message.type !== 'resumeSession') return

  const name = message.title || 'a past conversation'
  const uuid = (line: number): string => `r-${message.conversationId}-${line}`

  const line = (event: unknown): void => {
    window.__accReceive?.({ type: 'agent', sessionId: message.sessionId, event, replay: true } as never)
  }

  setTimeout(() => {
    line({
      type: 'user',
      uuid: uuid(1),
      message: { role: 'user', content: [{ type: 'text', text: `Where did we leave off on ${name}?` }] },
    })
    line({
      type: 'assistant',
      uuid: uuid(2),
      message: { content: [{ type: 'text', text: 'On the last change of that day - it is all still here.' }] },
    })

    window.__accReceive?.({ type: 'replayFinished', sessionId: message.sessionId, cursor: uuid(1) } as never)
  }, 250)
}

/**
 * The search, answered by the harness (see SearchDesk on the IDE's side for the real thing).
 *
 * Two corpora. The showcase's past conversations are given a few messages each, so "all chats" and the
 * model's search have something to find and a hit can open one of them. And whatever the scenario on
 * screen typed into the field is remembered as it goes past, so a hit in "this chat" lands on a row that
 * is really there - a live message of one's own is found by its words (see rowOf in feed/search.ts).
 * The words are matched by plain inclusion: the harness shows the window, not the ranking.
 */
const LIVE_CONVERSATION = 'demo-session'

let typedIntoFeed: { text: string; at: number }[] = []

let aiSearches = 0

const cancelledSearches = new Set<string>()

const pastMessage = (
  conversationId: string,
  uuid: string,
  speaker: 'you' | 'claude',
  text: string,
  minutesAgo: number,
): Omit<SearchHit, 'snippet' | 'spans' | 'truncated' | 'title' | 'named'> => ({
  conversationId,
  uuid,
  speaker,
  text,
  at: Date.now() - minutesAgo * 60_000,
  // How long the conversation is, and the message: what the group heading and an unfolded hit say.
  messages: 20 + (uuid.length % 7) * 9,
  length: text.length,
})

const SEARCH_PAST = [
  pastMessage('h-1', 'p1-1', 'you', 'The Apple Pay button never shows in the checkout sheet on Safari 17 - merchant validation fails silently.', 14),
  pastMessage('h-1', 'p1-2', 'claude', 'The validation call goes through the proxy, and the proxy strips the Origin header; Apple rejects it without a word.', 13),
  pastMessage('h-2', 'p2-1', 'you', 'Refund webhooks are retried every 30 seconds and the queue explodes by lunchtime.', 3 * 60),
  pastMessage('h-2', 'p2-2', 'claude', 'Every retry re-enqueues the whole batch. A per-event backoff with a ceiling of an hour stops the storm.', 3 * 60 - 2),
  pastMessage('h-4', 'p4-1', 'you', 'Why does the Adyen sandbox reject our 3DS challenge every single time?', 2 * 24 * 60),
  pastMessage('h-4', 'p4-2', 'claude', 'The challenge window size is wrong: 05 means full page, and the sheet sends 02.', 2 * 24 * 60 - 3),
  pastMessage('h-6', 'p6-1', 'you', 'Postgres deadlock on concurrent refunds again, twice this morning.', 5 * 24 * 60),
  pastMessage('h-6', 'p6-2', 'claude', 'Two transactions lock the order row and the refund row in opposite order. Lock the order first in both.', 5 * 24 * 60 - 4),
  pastMessage('h-9', 'p9-1', 'you', 'Idempotency keys on the intent endpoint - what do we store with them, and for how long?', 11 * 24 * 60),
  pastMessage('h-9', 'p9-2', 'claude', 'The key, the request hash and the first response, for 24 hours. A second request with the same key and a different hash is a 409.', 11 * 24 * 60 - 5),
]

/** A query's words as typed, quotation marks dropped - the harness matches by inclusion. */
const searchWords = (query: string): string[] =>
  query
    .replace(/["«»“”„]/g, ' ')
    .split(/\s+/)
    .filter((word) => word.length > 0)

const escapeRegExp = (text: string): string => text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')

/**
 * The words the feed paints, as the IDE names them (see Painted in TextIndex.kt): every word of the
 * matched texts that a typed word begins, folded, painted as far as it was typed - so "dee" lights the
 * "Dee" of Deepgram in the feed the way the real index does.
 */
const paintedTerms = (texts: string[], words: string[], matchCase: boolean, wholeWords: boolean): PaintedTerm[] =>
  words.flatMap((word) => {
    const needle = matchCase ? word : word.toLowerCase()
    const found = new Set<string>()
    for (const text of texts) {
      for (const token of text.match(/[\p{L}\p{N}]+/gu) ?? []) {
        const probe = matchCase ? token : token.toLowerCase()
        if (wholeWords ? probe === needle : probe.startsWith(needle)) found.add(token.toLowerCase())
      }
    }
    return [...found].map((term) => ({
      term,
      paint: word.length,
      ...(matchCase ? { text: word } : {}),
      ...(wholeWords ? { whole: true } : {}),
    }))
  })

/** Whether a word stands in a text under the field's two switches - an inclusion, case-blind or word-bound. */
const wordStands = (text: string, word: string, matchCase: boolean, wholeWords: boolean): boolean =>
  new RegExp(wholeWords ? `\\b${escapeRegExp(word)}\\b` : escapeRegExp(word), matchCase ? '' : 'i').test(text)

/** The hit for a message that matched: a window of it around the first word, the words' places in it. */
const searchHit = (
  message: (typeof SEARCH_PAST)[number],
  words: string[],
  matchCase: boolean,
  title: string,
  named: boolean,
): SearchHit => {
  const fold = (text: string): string => (matchCase ? text : text.toLowerCase())
  const folded = fold(message.text)
  const first = Math.min(...words.map((word) => folded.indexOf(fold(word))).filter((at) => at >= 0), message.text.length)
  const start = message.text.length <= 220 ? 0 : Math.max(0, first - 60)
  const end = Math.min(message.text.length, start + 220)
  const lead = start > 0 ? '…' : ''
  const snippet = lead + message.text.slice(start, end) + (end < message.text.length ? '…' : '')

  const spans: [number, number][] = []
  const window_ = fold(snippet)
  for (const word of words) {
    const needle = fold(word)
    for (let at = window_.indexOf(needle); at >= 0; at = window_.indexOf(needle, at + 1)) spans.push([at, at + word.length])
  }
  spans.sort((a, b) => a[0] - b[0])

  return { ...message, title, named, snippet, spans: spans.filter((span, index) => index === 0 || span[0] >= spans[index - 1]![1]), truncated: false }
}

const answerSearch = (message: WebviewMessage): void => {
  if (message.type === 'prompt') {
    if (message.text.trim()) typedIntoFeed.push({ text: message.text, at: Date.now() })
    return
  }

  if (message.type === 'searchCancel') {
    cancelledSearches.add(message.id)
    return
  }

  if (message.type === 'search') {
    const words = searchWords(message.query)
    const matchCase = message.matchCase === true
    const wholeWords = message.wholeWords === true
    const live = typedIntoFeed.map((typed, index) =>
      pastMessage(LIVE_CONVERSATION, `live-${index}`, 'you', typed.text, (Date.now() - typed.at) / 60_000),
    )
    const matched = [...live, ...SEARCH_PAST].filter((one) => words.every((word) => wordStands(one.text, word, matchCase, wholeWords)))
    const hits = (message.scope === 'chat' ? matched.filter((one) => one.conversationId === LIVE_CONVERSATION) : matched)
      .map((one) => {
        const past = SHOWCASE_HISTORY.find((entry) => entry.id === one.conversationId)
        return searchHit(one, words, matchCase, past?.title ?? 'This conversation', past?.titleSource === 'llm')
      })
      .sort((a, b) => b.at - a.at)

    // Both counts whichever scope was asked for - the window's tabs carry one each (see SearchDesk).
    const counts = {
      chat: matched.filter((one) => one.conversationId === LIVE_CONVERSATION).length,
      project: matched.length,
      conversations: new Set(matched.map((one) => one.conversationId)).size,
    }

    setTimeout(() => {
      window.__accReceive?.({
        type: 'searchResults',
        id: message.id,
        hits,
        terms: paintedTerms(matched.map((one) => one.text), words, matchCase, wholeWords),
        counts,
        total: message.scope === 'chat' ? counts.chat : counts.project,
      } as never)
    }, 180)
    return
  }

  if (message.type === 'searchAi') {
    aiSearches += 1
    const failing = aiSearches % 3 === 0

    /*
     * What the model does on the way, one step at a time (see AiStep on the IDE's side): it greps for
     * words of its own, opens what looked promising, and only then answers. Played out over the seconds
     * the real run takes, so the progress panel can be looked at without an IDE.
     */
    const steps = [
      { kind: 'list' as const, subject: '' },
      { kind: 'grep' as const, subject: 'refund|retry|deadlock' },
      { kind: 'read' as const, subject: 'Refund webhooks retry storm' },
      { kind: 'grep' as const, subject: 'lock order' },
      { kind: 'read' as const, subject: 'Postgres deadlock on concurrent refunds' },
    ]
    steps.forEach((step, index) => {
      setTimeout(() => {
        if (cancelledSearches.has(message.id)) return
        window.__accReceive?.({ type: 'searchProgress', id: message.id, ...step } as never)
      }, 260 * (index + 1))
    })
    const reasons = [
      'This is where the retry storm was traced to the batch being re-enqueued whole.',
      'The deadlock on refunds - the two lock orders are named here.',
      'The 3DS challenge rejection and its cause, the window size code.',
    ]
    const picked = [SEARCH_PAST[3]!, SEARCH_PAST[7]!, SEARCH_PAST[5]!].map((one, index) => ({
      ...searchHit(one, [], false, SHOWCASE_HISTORY.find((entry) => entry.id === one.conversationId)?.title ?? '', true),
      reason: reasons[index],
    }))

    setTimeout(() => {
      if (cancelledSearches.delete(message.id)) return
      window.__accReceive?.(
        failing
          ? ({ type: 'searchResults', id: message.id, hits: [], terms: [], error: 'The model could not be reached - try again.' } as never)
          : ({ type: 'searchResults', id: message.id, hits: picked, terms: [] } as never),
      )
    }, 2200)
  }
}

const listenToPanel = () => {
  // A scenario replayed from the top reads its history from the top too. The counter is a module's own,
  // so without this the mark stayed dead after the pages ran out once, for the rest of the browser tab.
  earlierPages = 0
  typedIntoFeed = []

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

    /*
     * A path clicked in the feed. In the IDE it opens in the editor beside the panel; here there is no
     * editor at all, so the harness says out loud what it was asked for - that is enough to see that the
     * link fired, and which line it named.
     */
    if (message?.type === 'openFile') {
      const at = [message.line, message.column].filter(Boolean).join(':')
      const to = [message.endLine, message.endColumn].filter(Boolean).join(':')
      console.info('openFile', message.path, [at, to].filter(Boolean).join('-') || message.find || '')
    }

    // The picture of the statistics screen: in the IDE the shell writes it into the downloads folder,
    // here the browser has downloads of its own and does it itself - so the button can be tried out.
    if (message?.type === 'saveImage') download(message.name, message.data)

    // Something pasted into the panel: in the IDE the shell writes it out and answers with the path (see
    // PastedFiles.kt), so a copied message carries the file rather than "Image #3". Here there is no disk
    // to write to, so the harness invents a path - enough to see that a copy comes out with one.
    if (message?.type === 'savePastedFile') {
      const suffix = message.mediaType.split('/')[1] ?? 'png'
      const name = message.name || `${message.id}.${suffix}`
      window.__accReceive?.({
        type: 'pastedFile',
        id: message.id,
        path: `/Users/demo/Library/Caches/amazing-claude-code/pasted/${name}`,
      } as never)
    }

    // The history screen asks the shell for this project's past conversations. In the IDE they are read
    // off Claude Code's own folder; here they are the showcase's invented ones, so the screen can be
    // looked at - and photographed - without an IDE.
    if (message?.type === 'history') {
      setTimeout(() => window.__accReceive?.({ type: 'history', conversations: SHOWCASE_HISTORY }), 200)
    }

    // The shell is the only one who can say what effort a conversation works at (see
    // ClaudeSessionHub.changeEffort), so here the harness plays that part: without the answer the chip
    // would stand "chosen" forever and the applied state would never be seen.
    if (message?.type === 'setEffort') {
      window.__accReceive?.({ type: 'effort', sessionId: message.sessionId, effort: message.effort })
    }

    if (message) answerFeedback(message)
    if (message) answerHistoryPage(message)
    if (message) answerResume(message)
    if (message) answerImprove(message)
    if (message) answerVoice(message)
    if (message) answerSearch(message)
    if (message) answerAccounts(message)
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

    if (step.kind === 'openSearch') {
      window.__accHarnessOpenSearch?.()
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

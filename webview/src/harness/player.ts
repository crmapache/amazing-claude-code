import type { ShellMessage, WebviewMessage } from '../protocol'
import { bootstrap, SESSION } from './events'
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

/**
 * Pages of a conversation older than what is on screen.
 *
 * In the IDE these are read off Claude Code's transcript (see ClaudeHistory.page); here they are made up,
 * so that the mark above the feed is a working button rather than a caption: a tab opens a past
 * conversation with its end, and the way back through it is worth being able to try without an IDE.
 *
 * The third answer comes back without a cursor - the conversation's beginning, where the mark has to
 * disappear.
 */
let earlierPages = 0

const answerHistoryPage = (message: WebviewMessage): void => {
  if (message.type !== 'historyPage') return

  earlierPages += 1
  const page = earlierPages
  const last = page >= 3
  const uuid = (line: number): string => `h${page}-${line}`

  const entries = [
    {
      type: 'user',
      uuid: uuid(1),
      message: { role: 'user', content: [{ type: 'text', text: `And what did we settle on back then? (page ${page})` }] },
    },
    {
      type: 'assistant',
      uuid: uuid(2),
      message: {
        content: [
          {
            type: 'text',
            text: last
              ? 'That is where this conversation begins - there is nothing above it.'
              : 'On leaving the order of the sections alone and only fixing the look.',
          },
        ],
      },
    },
  ]

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

    if (message) answerFeedback(message)
    if (message) answerHistoryPage(message)
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

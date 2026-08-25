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

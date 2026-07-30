import type { ShellMessage } from '../protocol'
import { SESSION } from './events'
import type { Scenario } from './types'

const sleep = (ms: number): Promise<void> => new Promise((resolve) => setTimeout(resolve, ms))

/**
 * После смены key у <App/> React размонтирует старый экземпляр и монтирует новый —
 * его собственный subscribe() перепишет window.__accReceive заново, но не мгновенно.
 * Ждём, пока там появится действительно НОВАЯ функция, а не та, что была до ремонта
 * (иначе на повторном клике события первые полсекунды улетали бы ещё старому,
 * уже размонтированному экземпляру).
 */
const waitForFreshBridge = async (previous: Window['__accReceive']): Promise<void> => {
  for (let i = 0; i < 50; i += 1) {
    if (window.__accReceive && window.__accReceive !== previous) return
    await sleep(10)
  }

  console.warn('[harness] bridge never refreshed after remount; scenario events may be lost')
}

export class ScenarioPlayer {
  private runId = 0

  cancel(): void {
    this.runId += 1
  }

  async play(scenario: Scenario): Promise<void> {
    const myRun = (this.runId += 1)
    const previousBridge = window.__accReceive
    await waitForFreshBridge(previousBridge)

    for (const step of scenario.steps) {
      if (this.runId !== myRun) return

      if (step.kind === 'wait') {
        await sleep(step.ms)
        continue
      }

      if (step.kind === 'user') {
        window.__accHarnessSend?.(step.text)
        continue
      }

      const message: ShellMessage =
        step.kind === 'shell' ? step.message : { type: 'agent', sessionId: SESSION, event: step.event }

      window.__accReceive?.(message)
    }
  }
}

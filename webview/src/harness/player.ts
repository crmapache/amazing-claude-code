import type { ShellMessage } from '../protocol'
import { bootstrap, SESSION } from './events'
import type { Scenario, ScenarioStep } from './types'

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

export interface PlayerProgress {
  checkpointIndex: number
  total: number
}

export class ScenarioPlayer {
  private runId = 0

  cancel(): void {
    this.runId += 1
  }

  /** Живое автовоспроизведение с настоящими паузами и эффектом печати. */
  async playAuto(scenario: Scenario, onProgress?: (progress: PlayerProgress) => void): Promise<void> {
    const myRun = (this.runId += 1)
    const previousBridge = window.__accReceive
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
   * Пошаговый режим: мгновенно доигрывает все чекпоинты с первого по targetIndex
   * включительно — паузы и кусочки печатающегося текста пропускаются. Работает
   * одинаково что вперёд, что назад: «отменить» уже применённые события нельзя,
   * поэтому <App/> всегда пересобирается заново вызывающей стороной перед этим.
   */
  async jumpTo(scenario: Scenario, targetIndex: number): Promise<void> {
    const myRun = (this.runId += 1)
    const previousBridge = window.__accReceive
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

    // Кусочки печатающегося текста — только эффект для автовоспроизведения:
    // итоговый текстовый блок и без них полностью восстановит состояние ленты.
    if (!realPacing && step.kind === 'agent' && step.event.type === 'stream_event') return

    if (step.kind === 'user') {
      window.__accHarnessSend?.(step.text)
      return
    }

    const message: ShellMessage =
      step.kind === 'shell' ? step.message : { type: 'agent', sessionId: SESSION, event: step.event }

    window.__accReceive?.(message)
  }
}

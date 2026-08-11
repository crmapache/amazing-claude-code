import type { ShellMessage, WebviewMessage } from '../protocol'
import { bootstrap, SESSION } from './events'
import type { Scenario, ScenarioStep } from './types'

const sleep = (ms: number): Promise<void> => new Promise((resolve) => setTimeout(resolve, ms))

/**
 * Номер команды, которую панель только что отправила «оболочке».
 *
 * В браузере оболочки нет, и её сторону моста играет харнесс: команду из
 * bash-режима панель отправляет по-настоящему, а ответить на неё надо тем же
 * номером — иначе карточка в ленте так и останется «running». Ставим мост один
 * раз на страницу: панель шлёт в него и до, и после пересоздания <App/>.
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
  }

  window.dispatchEvent(new Event('acc:ready'))
}

/** Ждёт, пока панель отдаст команду в мост, — и возвращает её вместе с номером. */
const waitForShellRequest = async (realPacing: boolean): Promise<{ id: string; command: string } | undefined> => {
  for (let i = 0; i < 50; i += 1) {
    if (lastShellRequest) return lastShellRequest
    await sleep(realPacing ? 10 : 0)
  }

  console.warn('[harness] panel never sent the shell command; the card will stay pending')
  return undefined
}

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
   * Пошаговый режим: мгновенно доигрывает все чекпоинты с первого по targetIndex
   * включительно — паузы и кусочки печатающегося текста пропускаются. Работает
   * одинаково что вперёд, что назад: «отменить» уже применённые события нельзя,
   * поэтому <App/> всегда пересобирается заново вызывающей стороной перед этим.
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

    // Кусочки печатающегося текста — только эффект для автовоспроизведения:
    // итоговый текстовый блок и без них полностью восстановит состояние ленты.
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
   * Отправляет команду ровно так же, как это сделал бы человек — набрав её в
   * поле через «!», — и отвечает на неё заготовленным выводом.
   */
  private async runShell(
    step: Extract<ScenarioStep, { kind: 'bash' }>,
    realPacing: boolean,
  ): Promise<void> {
    lastShellRequest = undefined
    window.__accHarnessSend?.(`!${step.command}`)

    // Отправка идёт через мост, а он асинхронный: дожидаемся, пока панель
    // действительно отдаст команду наружу, и только тогда узнаём её номер.
    const request = await waitForShellRequest(realPacing)
    if (!request) return

    // Команда идёт не мгновенно — на этой паузе в ленте и видно карточку
    // «running», ради которой она в сценарии и стоит.
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

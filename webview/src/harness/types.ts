import type { AgentEvent, ShellMessage } from '../protocol'

export type ScenarioStep =
  | { kind: 'shell'; message: ShellMessage }
  | { kind: 'agent'; event: AgentEvent }
  | { kind: 'user'; text: string }
  | { kind: 'wait'; ms: number }

/**
 * Один осмысленный момент сценария с подписью для карточки чекпоинтов.
 * В автовоспроизведении его шаги играются как есть, с настоящими паузами.
 * В пошаговом режиме шаги 'wait' и кусочки печатающегося текста ('stream_event')
 * пропускаются — переход на чекпоинт происходит мгновенно и целиком.
 */
export interface Checkpoint {
  id: string
  label: string
  steps: ScenarioStep[]
}

export interface Scenario {
  id: string
  title: string
  category: 'grouping' | 'cards' | 'system' | 'combined'
  checkpoints: Checkpoint[]
}

/** 'auto' — живое воспроизведение с паузами, 'step' — чекпоинт за чекпоинтом вручную. */
export type PlaybackMode = 'auto' | 'step'

declare global {
  interface Window {
    /**
     * Тонкий хук в App.tsx (только dev-сборка): харнесс имитирует настоящую
     * отправку сообщения из поля ввода, не трогая само поле ввода.
     */
    __accHarnessSend?: (text: string) => void
  }
}

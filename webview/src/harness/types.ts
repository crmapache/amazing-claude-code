import type { AgentEvent, ShellMessage } from '../protocol'

export type ScenarioStep =
  | { kind: 'shell'; message: ShellMessage }
  | { kind: 'agent'; event: AgentEvent }
  | { kind: 'user'; text: string }
  | { kind: 'wait'; ms: number }

export interface Scenario {
  id: string
  title: string
  category: 'grouping' | 'cards' | 'system' | 'combined'
  steps: ScenarioStep[]
}

declare global {
  interface Window {
    /**
     * Тонкий хук в App.tsx (только dev-сборка): харнесс имитирует настоящую
     * отправку сообщения из поля ввода, не трогая само поле ввода.
     */
    __accHarnessSend?: (text: string) => void
  }
}

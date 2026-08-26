import type { AgentEvent, ShellMessage } from '../protocol'

export type ScenarioStep =
  | { kind: 'shell'; message: ShellMessage }
  | { kind: 'agent'; event: AgentEvent }
  | { kind: 'user'; text: string }
  | { kind: 'wait'; ms: number }
  | { kind: 'resolvePlan'; itemId: string; decision: 'approve' | 'keepPlanning' }
  /**
   * A bash-mode command together with its output. As a step of its own rather than as a "sent - answered"
   * pair: the number for a started command is given by the panel itself, and the scenario cannot know it in
   * advance - the player peeks at it in what the panel sent to the shell (see ScenarioPlayer).
   */
  | { kind: 'bash'; command: string; stdout: string; stderr?: string; exitCode?: number; runMs?: number }
  /**
   * Open the statistics tab - and, if asked, its achievements screen - the way the menu's row would.
   * The figures themselves arrive as an ordinary shell message (see the statistics scenario).
   */
  | { kind: 'openStatistics'; view?: 'overview' | 'achievements' }

/**
 * One meaningful moment of a scenario with a caption for the checkpoints card. In auto playback its steps
 * are played as they are, with genuine pauses. In step mode the 'wait' steps and the pieces of typing text
 * ('stream_event') are skipped - the move to a checkpoint happens instantly and whole.
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

/** 'auto' is live playback with pauses, 'step' is checkpoint after checkpoint by hand. */
export type PlaybackMode = 'auto' | 'step'

declare global {
  interface Window {
    /**
     * A thin hook in App.tsx (dev builds only): the harness imitates a genuine send of a message from the
     * input field without touching the input field itself.
     */
    __accHarnessSend?: (text: string) => void
    /**
     * The same trick: it imitates a genuine click on a plan card's button ("Approve & run" / "Keep
     * planning") without touching the button itself.
     */
    __accHarnessResolvePlan?: (itemId: string, decision: 'approve' | 'keepPlanning') => void
    /** And the same for the statistics tab: opens it as the menu's row does, on the screen asked for. */
    __accHarnessOpenStatistics?: (view: 'overview' | 'achievements') => void
  }
}

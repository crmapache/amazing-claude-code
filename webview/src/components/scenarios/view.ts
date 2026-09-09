import type { Scenario, ScenarioRepeat, ScenarioScope } from '../../protocol'

/**
 * The little vocabulary of the hub: which of its three questions is on screen, what is open over it,
 * and where the editor is standing.
 *
 * In a module of its own because both the root and the leaves need it, and App needs it too - the state
 * of this screen is kept there, since the tab is unmounted the moment somebody glances at a chat. Left in
 * the root component's file, the form for an hour would import a type from the file that imports the
 * form, and "where does the hub's vocabulary live" would have no answer.
 */

/** An hour as the form holds it: minutes from midnight, a rhythm, and a day for a weekly one. */
export interface ScheduledHour {
  at: number
  repeat: ScenarioRepeat
  weekday: number
}

/**
 * The three questions the hub answers, one band each.
 *
 * What exists, what is happening, what will happen. They used to be five sections down one scroll, every
 * row of them in the same clothes: a scenario, a live run, a scheduled hour and a finished run were told
 * apart only by reading. Each carries its own count, so nothing has to be hunted for by scrolling.
 */
export type ScenariosBand = 'scenarios' | 'runs' | 'schedule'

export const BANDS: readonly ScenariosBand[] = ['scenarios', 'runs', 'schedule']

/**
 * What stands over the hub, if anything.
 *
 * An overlay rather than a card wedged into the list, which is what all three used to be: a form that
 * opens inside the scroll pushes everything under it down, and half a minute of a model reading the
 * project moved the shelf while somebody was looking at it. This is the layer the help and the
 * confirmation already use.
 */
export type ScenariosOverlay =
  | { kind: 'none' }
  /** What a new scenario begins as: a sentence for a model to write it from, and which shelf to keep it on. */
  | { kind: 'new'; description: string; scope: ScenarioScope }
  /** The little form in front of a run: the questions the scenario asks before it starts. */
  | { kind: 'start'; scenario: Scenario; values: Record<string, string> }
  /**
   * The form in front of a scheduled run: when to start, how often, and the scenario's own questions.
   *
   * `scheduleId` is empty for a new arrangement and names the one being changed otherwise. It lives in
   * the view rather than in the hub's own state for the reason the rest of this does: the tab is
   * unmounted by a glance at a chat, and an edit that lost its bearings on the way back would quietly
   * add a second arrangement instead of changing the first.
   */
  | {
      kind: 'when'
      scenario: Scenario
      scheduleId: string
      hour: ScheduledHour
      values: Record<string, string>
    }

/**
 * Where the editor is standing: which part of the scenario the right-hand pane is holding.
 *
 * The outline down the left is the map, and this is the pin in it. Kept in the view rather than inside
 * the editor because the editor is unmounted by a glance at a chat, and coming back to the top of a
 * scenario one was three stages into is the same loss the description in the new-scenario form used to
 * suffer.
 *
 * A stage is what the pane holds, cards and all - `cardId` only says which of them to bring into view,
 * because the outline lists cards too and a click on one has to land on the card rather than on the
 * stage it belongs to.
 */
export type EditorPlace =
  | { part: 'name' }
  | { part: 'head' }
  | { part: 'inputs' }
  | { part: 'stage'; stageId: string; cardId?: string }

export type ScenariosView =
  | { kind: 'list'; band: ScenariosBand; over: ScenariosOverlay }
  | { kind: 'edit'; draft: Scenario; fresh: boolean; at: EditorPlace }

/** What the hub opens on, and what it goes back to when a form is closed. */
export const AT_FIRST: ScenariosView = { kind: 'list', band: 'scenarios', over: { kind: 'none' } }

/** Where the editor opens: the top of the outline, which is where a scenario is read from. */
export const EDIT_AT_FIRST: EditorPlace = { part: 'name' }

/**
 * How much of the past runs stands open before the rest is behind a row that asks for it.
 *
 * A run is a night's work and they pile up daily: a scenario on an hour leaves one every morning, and by
 * the second month the table is longer than the screen. Eight is about a screenful, and the row below
 * says how many are left rather than hiding the number.
 */
export const RUNS_PAGE = 8

/**
 * What the hub has unfolded of the past runs, kept in App beside the rest of this screen's state.
 *
 * An object of one field rather than a bare number so that the next list needing a page has somewhere to
 * go. It only ever grows: a run that ends must not fold the table back up under the hand of whoever just
 * opened it.
 */
export interface ScenariosShown {
  runs: number
}

export const SHOWN_AT_FIRST: ScenariosShown = { runs: RUNS_PAGE }

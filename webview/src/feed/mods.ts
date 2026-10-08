import type { AgentSystemEvent } from '../protocol'
import { push, type PanelState } from './panelState'
import { readQuestions } from './toolInput'
import type { ModPane } from './types'

/**
 * What a mod says to the screen, folded into a tab.
 *
 * A mod (Claude Code 2.1.287 and later) is a plugin whose code runs inside the CLI and may draw an interface
 * of its own. The panel attaches no surface for it to draw on - the protocol for that is the CLI's internal
 * one - but the CLI still says the words meant for the person: a status line under the prompt, a toast, a
 * line in the transcript, and the panes a mod holds open. Not one of these events exists without a mod, so a
 * conversation that has none never reaches anything here.
 *
 * The IDE has already sorted them (see ModLines on the plugin's side): the redraw requests never arrive, the
 * status lines and panes come as the latest state and again to whoever joins, the toast only live, and a log
 * line is kept like any line of the conversation.
 *
 * One more event is the IDE's own: the card for a question a mod asked through the CLI (`$.ui.ask`). Such a
 * question comes with no tool call to draw its card from, and without a card it held the turn with nothing
 * on screen; the IDE sends the request itself, and it becomes the same card any question is.
 */

/** The IDE's event carrying a mod's question - a subtype the CLI never sends (see ModLines.MOD_QUESTION). */
export const MOD_QUESTION = 'acc_mod_question'

/** How long a toast stays when the mod did not say: the CLI's own four seconds. */
const TOAST_MS = 4000

/** The tab with a mod's event folded in, or undefined when the event is not a mod's - every other event. */
export const applyModEvent = (state: PanelState, event: AgentSystemEvent, now: number): PanelState | undefined => {
  switch (event.subtype) {
    case 'ui_status': {
      const plugin = event.plugin ?? ''
      const text = typeof event.text === 'string' ? event.text.trim() : ''
      const rest = { ...state.modStatus }
      if (text) rest[plugin] = text
      else delete rest[plugin]
      return { ...state, modStatus: Object.keys(rest).length > 0 ? rest : undefined }
    }

    case 'ui_panes': {
      const panes = (Array.isArray(event.panes) ? event.panes : [])
        .map((pane): ModPane => ({ id: pane.id ?? '', title: pane.title ?? '', plugin: pane.plugin ?? '' }))
        .filter((pane) => pane.id.length > 0)
      return { ...state, modPanes: panes.length > 0 ? panes : undefined }
    }

    case 'ui_toast': {
      const text = typeof event.text === 'string' ? event.text.trim() : ''
      if (!text) return state
      const lasts = typeof event.timeout_ms === 'number' && event.timeout_ms > 0 ? event.timeout_ms : TOAST_MS
      return { ...state, modToast: { plugin: event.plugin ?? '', text, until: now + lasts } }
    }

    case 'ui_log': {
      const text = typeof event.text === 'string' ? event.text.trim() : ''
      if (!text) return state
      return push(state, (id) => ({ id, kind: 'modLog', plugin: event.plugin ?? '', text }))
    }

    case MOD_QUESTION: {
      const id = event.tool_use_id
      if (!id || state.items.some((item) => item.kind === 'ask' && item.id === id)) return state
      // Without a single question there is no card to answer it from - the IDE refuses such a request
      // itself (see SessionPermissions.ask), so this is a guard rather than a path.
      const questions = readQuestions(event.input ?? {})
      if (questions.length === 0) return state
      return { ...state, items: [...state.items, { id, kind: 'ask', questions, fromMod: true }] }
    }

    default:
      return undefined
  }
}

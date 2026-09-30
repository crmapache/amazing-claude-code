/**
 * What each feature id the plugin counts is called on the dashboard, and which group it stands in.
 *
 * The ids themselves are decided on the plugin's side (UsageFeatures.kt), which is also the side that
 * refuses to count one it does not know. This is only the wording: a test here reads that file and fails
 * when an id there has no line here (see features.test.ts), so a new feature cannot reach the dashboard
 * as a bare identifier nobody remembers the meaning of.
 *
 * Two families are worded by rule rather than one by one: "screen:<name>" is a screen of the side menu
 * opened, and "setting:<name>" is a setting changed.
 */

export interface FeatureLabel {
  group: string
  label: string
}

export const GROUPS: Record<string, string> = {
  conversation: 'Conversations',
  editor: 'Editor and files',
  history: 'History and search',
  voice: 'Voice input',
  remote: 'Remote access',
  scenarios: 'Scenarios',
  statistics: 'Statistics',
  manage: 'MCP, plugins, accounts',
  feedback: 'Feedback',
  menu: 'Menu screens opened',
  settings: 'Settings changed',
  other: 'Other',
}

export const FEATURES: Record<string, FeatureLabel> = {
  new_tab: { group: 'conversation', label: 'New tab' },
  fork: { group: 'conversation', label: 'Fork a conversation' },
  tab_rename: { group: 'conversation', label: 'Rename a tab by hand' },
  tab_reorder: { group: 'conversation', label: 'Reorder tabs' },
  queue: { group: 'conversation', label: 'Queue a message during a turn' },
  queue_edit: { group: 'conversation', label: 'Edit a queued message' },
  queue_reorder: { group: 'conversation', label: 'Reorder the queue' },
  stop: { group: 'conversation', label: 'Stop a turn' },
  stop_task: { group: 'conversation', label: 'Stop a background task' },
  bash_mode: { group: 'conversation', label: 'Shell command with !' },
  improve_prompt: { group: 'conversation', label: 'Improve prompt' },
  model_switch: { group: 'conversation', label: 'Switch model' },
  effort_switch: { group: 'conversation', label: 'Switch effort' },
  mode_switch: { group: 'conversation', label: 'Switch permission mode' },
  plan_decision: { group: 'conversation', label: 'Answer a plan' },
  ask_answer: { group: 'conversation', label: "Answer the agent's question" },
  subagent_window: { group: 'conversation', label: "Open a subagent's transcript" },
  message_reuse: { group: 'conversation', label: 'Copy or reuse a sent message' },
  pin: { group: 'conversation', label: 'Pin a message' },

  open_in_editor: { group: 'editor', label: 'Open a file from the feed' },
  send_selection: { group: 'editor', label: 'Send an editor selection to the panel' },
  attach_file: { group: 'editor', label: 'Attach a file or folder' },
  paste_file: { group: 'editor', label: 'Paste a file or an image' },
  copy: { group: 'editor', label: 'Copy from the feed' },

  history_resume: { group: 'history', label: 'Reopen a past conversation' },
  search: { group: 'history', label: 'Search conversations' },
  search_ai: { group: 'history', label: 'AI search' },

  voice: { group: 'voice', label: 'Dictate by voice' },

  remote_enable: { group: 'remote', label: 'Turn remote access on' },
  remote_pairing: { group: 'remote', label: 'Pair a phone' },

  scenarios_tab: { group: 'scenarios', label: 'Open scenarios' },
  scenario_run: { group: 'scenarios', label: 'Run a scenario' },
  scenario_save: { group: 'scenarios', label: 'Save a scenario' },
  scenario_author: { group: 'scenarios', label: 'Have a scenario written from a phrase' },
  scenario_schedule: { group: 'scenarios', label: 'Schedule a scenario' },
  scenario_queue: { group: 'scenarios', label: 'Queue a scenario' },
  scenario_answer: { group: 'scenarios', label: "Answer a run's question" },

  statistics_tab: { group: 'statistics', label: 'Open the statistics tab' },
  stats_share: { group: 'statistics', label: 'Save a statistics picture' },

  mcp_manage: { group: 'manage', label: 'Add, remove or sign in to an MCP server' },
  plugins_manage: { group: 'manage', label: 'Install or manage a Claude Code plugin' },
  account_add: { group: 'manage', label: 'Add a Claude account' },
  account_switch: { group: 'manage', label: 'Switch Claude account' },
  design_login: { group: 'manage', label: 'Claude Design sign-in' },

  feedback_sent: { group: 'feedback', label: 'Send feedback' },
}

/** "newChatModel" -> "New chat model". */
const words = (name: string): string => {
  const spaced = name
    .replace(/[_-]/g, ' ')
    .replace(/([a-z])([A-Z])/g, '$1 $2')
    .toLowerCase()
  return spaced.charAt(0).toUpperCase() + spaced.slice(1)
}

export const featureLabel = (id: string): FeatureLabel => {
  const known = FEATURES[id]
  if (known) return known

  if (id.startsWith('screen:')) return { group: 'menu', label: words(id.slice('screen:'.length)) }
  if (id.startsWith('setting:')) return { group: 'settings', label: words(id.slice('setting:'.length)) }

  return { group: 'other', label: id }
}

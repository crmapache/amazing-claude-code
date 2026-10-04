import { owns, type Product } from './products.js'

/**
 * Which features each plugin may count, what each is called on the dashboard, and which group it stands in.
 *
 * The ids themselves are decided on the plugin's side (UsageFeatures.kt), which is also the side that
 * refuses to count one it does not know. This file holds the same lists a second time, for two reasons:
 * the wording, and the door - a report naming a feature that is not on its plugin's list here is dropped
 * on arrival (see report.ts), so a feature of one plugin can never show up on the other's tab, and nothing
 * but a known id reaches the table. A test reads the plugins' files and fails when a list here and a list
 * there part ways (see features.test.ts), so a new feature cannot be lost on the way in, nor reach the
 * dashboard as a bare identifier nobody remembers the meaning of.
 *
 * Three families, as on the plugin's side: the features named one by one, "screen:<name>" for a screen of
 * the side menu opened, and "setting:<name>" for a setting changed.
 *
 * The two plugins share the panel, so most of every list is shared; what is left is the agent underneath.
 * ACX (the Codex fork) has no stopping of one background task (`app-server` has no such request), no rewind,
 * no Claude Design sign-in, no Claude Code settings screens, and has Codex's project trust and settings instead.
 */

export interface FeatureLabel {
  group: string
  label: string
}

export const SCREEN = 'screen:'

export const SETTING = 'setting:'

export const GROUPS: Record<string, string> = {
  conversation: 'Conversations',
  editor: 'Editor and files',
  history: 'History and search',
  voice: 'Voice input',
  remote: 'Remote access',
  scenarios: 'Scenarios',
  statistics: 'Statistics',
  manage: 'MCP, plugins, accounts',
  project: 'Project trust',
  feedback: 'Feedback',
  menu: 'Menu screens opened',
  settings: 'Settings changed',
  other: 'Other',
}

const SHARED_FEATURES: Record<string, FeatureLabel> = {
  new_tab: { group: 'conversation', label: 'New tab' },
  fork: { group: 'conversation', label: 'Fork a conversation' },
  tab_rename: { group: 'conversation', label: 'Rename a tab by hand' },
  tab_reorder: { group: 'conversation', label: 'Reorder tabs' },
  queue: { group: 'conversation', label: 'Queue a message during a turn' },
  queue_edit: { group: 'conversation', label: 'Edit a queued message' },
  queue_reorder: { group: 'conversation', label: 'Reorder the queue' },
  stop: { group: 'conversation', label: 'Stop a turn' },
  bash_mode: { group: 'conversation', label: 'Shell command with !' },
  side_question: { group: 'conversation', label: 'Side question with /btw' },
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

  feedback_sent: { group: 'feedback', label: 'Send feedback' },
}

export const FEATURES: Record<Product, Record<string, FeatureLabel>> = {
  acc: {
    ...SHARED_FEATURES,
    stop_task: { group: 'conversation', label: 'Stop a background task' },
    // Claude Code's rewind_conversation/rewind_files - Codex's app-server has nothing like them yet.
    rewind: { group: 'conversation', label: 'Rewind a conversation to an earlier message' },
    plugins_manage: { group: 'manage', label: 'Install or manage a Claude Code plugin' },
    account_add: { group: 'manage', label: 'Add a Claude account' },
    account_switch: { group: 'manage', label: 'Switch Claude account' },
    design_login: { group: 'manage', label: 'Claude Design sign-in' },
  },
  acx: {
    ...SHARED_FEATURES,
    plugins_manage: { group: 'manage', label: 'Install or remove a Codex plugin' },
    account_add: { group: 'manage', label: 'Add a Codex account' },
    account_switch: { group: 'manage', label: 'Switch Codex account' },
    project_trust: { group: 'project', label: 'Trust a project with its Codex settings' },
  },
}

/**
 * The screens of the side menu, by the name the panel gives each (MenuScreen in SideMenu.tsx), worded the
 * way the menu itself titles them.
 */
const SHARED_SCREENS: Record<string, string> = {
  menu: 'Menu',
  history: 'History',
  mcp: 'MCP servers',
  plugins: 'Plugins',
  settings: 'Settings',
  appearance: 'Appearance',
  sounds: 'Sound alerts',
  calmColors: 'No-stress colors',
  indicators: 'Indicators',
  remote: 'Remote access',
  remoteAbout: 'Remote access: what travels',
  newChat: 'New chats',
  restoreTabs: 'Tabs on start',
  shareEditor: 'Editor in messages',
  newChatModel: 'New chats: model',
  newChatEffort: 'New chats: effort',
  newChatMode: 'New chats: mode',
  composerLayout: 'Composer layout',
  pasteCollapse: 'Pasted text',
  sendKey: 'Sending a message',
  improvePrompt: 'Improve prompt',
  voice: 'Voice input',
  voiceLanguage: 'Voice input: spoken language',
  voiceDevice: 'Voice input: microphone',
  customModels: 'Custom models',
  language: 'Language',
  feedback: 'Feedback',
  feedbackLog: 'Feedback: what gets attached',
  usageStats: 'Usage statistics',
  usageStatsReport: 'Usage statistics: what gets sent',
}

export const SCREENS: Record<Product, Record<string, string>> = {
  acc: {
    ...SHARED_SCREENS,
    accounts: 'Claude accounts',
    settingSources: 'Claude Code settings sources',
    claudeConfig: 'Claude Code settings',
  },
  acx: {
    ...SHARED_SCREENS,
    accounts: 'Codex accounts',
    codexConfig: 'Codex settings',
  },
}

/** The settings, by the name the plugin counts a change of each under (UsageFeatures.settingOf). */
const SHARED_SETTINGS: Record<string, string> = {
  theme: 'Theme',
  text_size: 'Text size',
  language: 'Language',
  layout: 'Composer layout',
  send_key: 'Send key',
  paste_collapse: 'Pasted text folding',
  calm_colors: 'No-stress colors',
  indicators: 'Indicators',
  sounds: 'Sound alerts',
  share_editor: 'Editor in messages',
  restore_tabs: 'Tabs on start',
  improve_prompt: 'Improve-prompt text',
  custom_models: 'Custom models',
  new_chat: 'New chats: model, effort or mode',
  voice: 'Voice input',
  relay: 'Relay address',
}

export const SETTINGS: Record<Product, Record<string, string>> = {
  acc: {
    ...SHARED_SETTINGS,
    executable: 'Path to Claude Code',
    claude_config: 'Claude Code settings',
    setting_sources: 'Claude Code settings sources',
  },
  acx: {
    ...SHARED_SETTINGS,
    executable: 'Path to Codex',
    codex_config: 'Codex settings',
    project_trust: 'Project trust',
  },
}

/** Whether this plugin may count this feature at all - the door a report's features go through. */
export const isKnownFeature = (product: Product, id: string): boolean => {
  if (id.startsWith(SCREEN)) return owns(SCREENS[product], id.slice(SCREEN.length))
  if (id.startsWith(SETTING)) return owns(SETTINGS[product], id.slice(SETTING.length))
  return owns(FEATURES[product], id)
}

/** "newChatModel" -> "New chat model". */
const words = (name: string): string => {
  const spaced = name
    .replace(/[_-]/g, ' ')
    .replace(/([a-z])([A-Z])/g, '$1 $2')
    .toLowerCase()
  return spaced.charAt(0).toUpperCase() + spaced.slice(1)
}

/**
 * A feature's label on one plugin's tab. Rows kept before the lists were held at the door may still name
 * something no longer on them; those are worded by rule, or shown as they are, rather than hidden.
 */
export const featureLabel = (product: Product, id: string): FeatureLabel => {
  if (owns(FEATURES[product], id)) return FEATURES[product][id]!

  if (id.startsWith(SCREEN)) {
    const name = id.slice(SCREEN.length)
    return { group: 'menu', label: owns(SCREENS[product], name) ? SCREENS[product][name]! : words(name) }
  }
  if (id.startsWith(SETTING)) {
    const name = id.slice(SETTING.length)
    return { group: 'settings', label: owns(SETTINGS[product], name) ? SETTINGS[product][name]! : words(name) }
  }

  return { group: 'other', label: id }
}

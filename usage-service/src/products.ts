/**
 * The plugins this service counts for, and the names each of them may put into a report.
 *
 * One service, one database and one address for two plugins: Amazing Claude Code GUI ("acc") and its fork
 * for OpenAI Codex, Amazing Codex GUI ("acx"). They share the panel and nearly all of its features, so their
 * reports have one shape; what differs is the agent underneath - its commands, its models, a few screens
 * and settings - and that is held apart here, product by product, rather than guessed from the names.
 *
 * The product is not a figure of the report but its address: it decides which plugin's figures a report
 * lands among. That is why a product this service does not know is refused outright, where an unknown
 * figure is only dropped (see report.ts) - a report filed under the wrong plugin would be wrong in every
 * number it carries, and the dashboard has no way to tell.
 *
 * A report without the field is ACC's. The versions of it already published were written before there was
 * a second plugin, and they will go on sending the old shape for as long as anybody runs them.
 */

export const PRODUCTS = ['acc', 'acx'] as const

export type Product = (typeof PRODUCTS)[number]

export const DEFAULT_PRODUCT: Product = 'acc'

/**
 * The product a report or a request names: the default when it names none, null when it names one this
 * service does not count. Only an absent value means "none" - an empty string, a null or a number is a
 * plugin saying something this service does not understand, and guessing would file it somewhere.
 */
export const readProduct = (value: unknown): Product | null => {
  if (value === undefined) return DEFAULT_PRODUCT
  return typeof value === 'string' && (PRODUCTS as readonly string[]).includes(value) ? (value as Product) : null
}

export interface ProductNames {
  /** The tab on the dashboard. */
  tab: string
  /** The plugin, as the Marketplace lists it. */
  plugin: string
  /** The agent the panel drives. */
  agent: string
}

export const NAMES: Record<Product, ProductNames> = {
  acc: { tab: 'Claude Code', plugin: 'Amazing Claude Code GUI', agent: 'Claude Code' },
  acx: { tab: 'Codex', plugin: 'Amazing Codex GUI', agent: 'Codex' },
}

/** Whether a plain object has this key of its own - never one it inherits, like "constructor". */
export const owns = (map: Record<string, unknown>, key: string): boolean => Object.hasOwn(map, key)

// --- Commands ---------------------------------------------------------------------------------------

/** What every command of a person's own becomes: a skill, a file of commands, a prompt of one's own. */
export const CUSTOM_COMMAND = 'custom'

/**
 * The built-in commands each plugin names by their own name; anything else is somebody's own command and
 * travels as [CUSTOM_COMMAND]. The plugin folds them before sending (UsageReport.commandName) and this
 * service folds them again on arrival, so the name of a person's own command - which can say what their
 * project is about - is never written even if a plugin forgets to fold it.
 *
 * ACC: Claude Code's own commands, the list in UsageReport.BUILT_IN_COMMANDS.
 *
 * ACX: the commands the panel itself runs for Codex, since `app-server` knows none (see CodexCommands in
 * the fork). A prompt of one's own (`/prompts:<name>`) and a skill (`/<skill>`, `$<skill>`) are both custom.
 */
export const COMMANDS: Record<Product, ReadonlySet<string>> = {
  acc: new Set([
    'add-dir', 'agents', 'bashes', 'bug', 'clear', 'code-review', 'compact', 'config', 'context', 'cost',
    'design-login', 'doctor', 'exit', 'export', 'fast', 'feedback', 'help', 'hooks', 'ide', 'init',
    'install-github-app', 'login', 'logout', 'loop', 'mcp', 'memory', 'model', 'output-style',
    'permissions', 'plugin', 'plugins', 'pr-comments', 'privacy-settings', 'release-notes', 'resume',
    'review', 'rewind', 'schedule', 'security-review', 'simplify', 'status', 'statusline',
    'terminal-setup', 'todos', 'ultrareview', 'upgrade', 'usage', 'vim',
  ]),
  acx: new Set([
    'compact', 'clear', 'new', 'init', 'review', 'btw', 'side', 'rename', 'config', 'model', 'effort',
    'resume', 'fork', 'login', 'logout',
  ]),
}

export const commandName = (product: Product, name: string): string =>
  COMMANDS[product].has(name) ? name : CUSTOM_COMMAND

// --- Models -----------------------------------------------------------------------------------------

/** What every model outside the list becomes - a custom model, a proxy's own name, a typo. */
export const OTHER_MODEL = 'Other'

/** ACC sends models by family (StatsCollector.familyOf on its side); the list is UsageReport.MODEL_FAMILIES. */
export const CLAUDE_FAMILIES: ReadonlySet<string> = new Set(['Opus', 'Sonnet', 'Haiku', 'Fable', 'Mythos'])

/**
 * ACX sends a model by its id in Codex's own catalogue (`model/list`): "gpt-5.6-sol", "gpt-5.5", "o3",
 * "codex-mini-latest". The catalogue changes with every Codex release, so there is no list to hold it to;
 * the shape is held instead, and held tightly - lower case, digits, single dots and hyphens between them,
 * a start that only OpenAI's own families have, and a short length. A model somebody added by hand is sent
 * as "Other" by the plugin, and a name that slips through anyway still cannot be a sentence or a path.
 */
const CODEX_MODEL = /^(?:gpt-[a-z0-9]+|o\d[a-z0-9]*|codex-[a-z0-9]+)(?:[.-][a-z0-9]+)*$/

const CODEX_MODEL_LENGTH = 40

export const modelName = (product: Product, name: string): string => {
  if (product === 'acc') return CLAUDE_FAMILIES.has(name) ? name : OTHER_MODEL
  return name.length <= CODEX_MODEL_LENGTH && CODEX_MODEL.test(name) ? name : OTHER_MODEL
}

// --- Tools ------------------------------------------------------------------------------------------

/**
 * The same for both plugins: the fork shows Codex's tools under Claude Code's names (a command that reads a
 * file is "Read", a patch is "Edit"), so both send the CLI's names, and every MCP tool as "MCP" - the name
 * of a server is somebody's own. Folded here again for the same reason as the commands.
 */
const TOOL = /^[A-Z][A-Za-z]{1,39}$/

export const MCP_TOOL = 'MCP'

export const toolName = (name: string): string => {
  if (name.startsWith('mcp__')) return MCP_TOOL
  return TOOL.test(name) ? name : 'other'
}

// --- Settings a report states -------------------------------------------------------------------------

/**
 * The settings a report carries - how the panel is set up on the machine (UsageFacts.settings) - by the
 * short name the plugin sends, with what the dashboard calls each. A name not listed for the product is
 * dropped on arrival: the plugin chooses these names, so a stranger one is either a plugin ahead of this
 * service, which loses nothing that matters until the service catches up, or not a plugin at all.
 *
 * ACX has ACC's list with its own accounts; when the fork's UsageFacts.kt appears, products.test.ts holds
 * the two to each other.
 */
const SHARED_SETTINGS: Record<string, string> = {
  remote: 'Remote access on',
  voice: 'Voice input on',
  layout: 'Composer layout',
  sendKey: 'Send key',
  restoreTabs: 'Tabs come back on start',
  shareEditor: 'Editor goes along with messages',
  calmColors: 'Gauge colour (0-100)',
  hiddenIndicators: 'Indicators switched off',
  customModels: 'Custom models added',
  improveCustom: 'Own improve-prompt text',
  theme: 'Theme',
  textSize: 'Own text size',
  language: 'Language chosen by hand',
  pasteCollapse: 'Paste folds from (lines)',
  soundsMuted: 'Sound alerts muted',
  newChatModel: 'New chats pinned to a model',
  newChatEffort: 'New chats pinned to an effort',
  newChatMode: 'New chats start in mode',
  pairedDevices: 'Phones paired',
}

export const REPORTED_SETTINGS: Record<Product, Record<string, string>> = {
  acc: { ...SHARED_SETTINGS, accounts: 'Claude accounts' },
  acx: { ...SHARED_SETTINGS, accounts: 'Codex accounts' },
}

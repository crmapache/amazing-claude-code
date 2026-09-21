import type { MenuOption } from './components/Menu'
import type { Dict } from './i18n/en'

/**
 * Which of Claude Code's settings layers this project's conversations are started with.
 *
 * Claude Code merges four layers, and the repository's two outrank the person's own. For permissions and
 * hooks that is right - a repository knows what may be run inside it. For the `env` block it is the
 * thing this setting exists for: a checked-in base URL or API key replaces the sign-in made on this
 * machine, and nothing on screen says so. The turn either runs on somebody else's gateway, or - measured
 * with a dead address - sits silent until it is killed, which from the panel is indistinguishable from
 * thinking.
 *
 * The value IS the argument the CLI is given (`--setting-sources`), so there is one vocabulary rather
 * than ours beside the CLI's. An empty value means the flag is not passed at all, which is what a panel
 * nobody has asked does - and what every panel did before this setting existed.
 *
 * An organization's managed settings apply whatever is chosen here, exactly as in the CLI, which takes
 * no `policy` in this flag at all.
 */
export type SettingSources = '' | 'user,project' | 'user'

/** In the order the screen offers them: the CLI's own behaviour first, the narrowest last. */
export const SETTING_SOURCES: SettingSources[] = ['', 'user,project', 'user']

/**
 * The value as the IDE may send it - anything unknown is "all of them".
 *
 * Unknown means older or newer than this panel, and both must land on the answer that changes nothing:
 * a value this side does not understand must never narrow what a conversation loads.
 */
export const normalizeSettingSources = (value: string | undefined): SettingSources =>
  (SETTING_SOURCES as string[]).includes(value ?? '') ? ((value ?? '') as SettingSources) : ''

/** The three options, each saying what it drops rather than only what it keeps. */
export const settingSourcesOptions = (t: Dict): MenuOption[] => [
  { id: '', label: t.settingSources.all, sub: t.settingSources.allSub },
  { id: 'user,project', label: t.settingSources.withoutLocal, sub: t.settingSources.withoutLocalSub },
  { id: 'user', label: t.settingSources.userOnly, sub: t.settingSources.userOnlySub },
]

/** The right-hand side of the row in the settings list. */
export const settingSourcesSummary = (value: SettingSources, t: Dict): string => {
  if (value === 'user') return t.settingSources.userOnly
  if (value === 'user,project') return t.settingSources.withoutLocal
  return t.settingSources.all
}

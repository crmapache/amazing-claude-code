/**
 * The sandbox dressed for the listing's pictures - and undressed afterwards.
 *
 * Three things in the sandbox's config are wrong for a picture and right for everyday work, so they are
 * changed only while the pictures are taken:
 *
 * - The recent projects. The phone's first screen lists the IDE's open project and, under "Recently
 *   opened", whatever the IDE opened before - in the sandbox, the developer's own folders. They are
 *   swapped for the demo's neighbours (nimbus-api, nimbus-mobile - the projects the statistics frame
 *   already names), written as empty repositories beside nimbus-checkout.
 * - The editor's tab limit. Every IDE frame opens the file it is about; without a limit the tabs pile up
 *   until the strip scrolls and cuts the first one in half. Three is what fits beside the panel.
 * - The "Install dependencies" balloon. A project whose packages were never installed gets a sticky one,
 *   right over the panel's input field.
 *
 *   node scripts/listing/sandbox-stage.mjs set        # with the sandbox closed: keep copies, dress it
 *   node scripts/listing/sandbox-stage.mjs restore    # with the sandbox closed: put the copies back
 *
 * The sandbox must be closed for either: it writes its config on the way out and would overwrite this.
 */

import { execFileSync } from 'node:child_process'
import { copyFileSync, existsSync, mkdirSync, readdirSync, rmSync, writeFileSync } from 'node:fs'
import { homedir } from 'node:os'
import { join } from 'node:path'

const SANDBOX = new URL('../../.intellijPlatform/sandbox/amazing-claude-code/', import.meta.url).pathname
const BACKUP = new URL('../../build/listing/sandbox-backup/', import.meta.url).pathname
const WORK = join(homedir(), 'work')

/** The config files this touches; a file that did not exist is restored by being removed. */
const FILES = ['recentProjects.xml', 'ui.lnf.xml', 'notifications.xml']

/** Oldest first; the open project is the last and newest. */
const PROJECTS = [
  { name: 'nimbus-mobile', branch: 'release/3.4' },
  { name: 'nimbus-api', branch: 'main' },
  { name: 'nimbus-checkout', open: true },
]

const optionsDir = () => {
  const version = readdirSync(SANDBOX).find((name) => existsSync(join(SANDBOX, name, 'config', 'options')))
  if (!version) throw new Error(`no sandbox config under ${SANDBOX}`)
  return join(SANDBOX, version, 'config', 'options')
}

const sandboxRunning = () => {
  try {
    execFileSync('pgrep', ['-f', 'idea.required.plugins.id=io.github.crmapache.amazingclaudecode'])
    return true
  } catch {
    return false
  }
}

/** A neighbour the phone can list: a folder with a git repository on a branch of its own. */
const neighbour = ({ name, branch }) => {
  const root = join(WORK, name)
  if (existsSync(join(root, '.git'))) return
  mkdirSync(root, { recursive: true })
  writeFileSync(join(root, 'README.md'), `# ${name}\n\nPart of the Nimbus store.\n`)
  const git = (...args) =>
    execFileSync('git', ['-c', 'user.name=Alex Kim', '-c', 'user.email=alex@nimbus.example', '-c', 'commit.gpgsign=false', ...args], {
      cwd: root,
      stdio: 'pipe',
    })
  git('init', '-q', '-b', branch)
  git('add', '-A')
  git('commit', '-q', '-m', 'Initial commit')
}

const recents = () => {
  const now = Date.now()
  const entries = PROJECTS.map((project, index) => {
    const at = now - (PROJECTS.length - index) * 3 * 3600_000
    return `        <entry key="$USER_HOME$/work/${project.name}">
          <value>
            <RecentProjectMetaInfo frameTitle="${project.name}"${project.open ? ' opened="true"' : ''}>
              <option name="activationTimestamp" value="${at}" />
              <option name="projectOpenTimestamp" value="${at}" />
            </RecentProjectMetaInfo>
          </value>
        </entry>`
  })
  return `<application>
  <component name="RecentProjectsManager">
    <option name="additionalInfo">
      <map>
${entries.join('\n')}
      </map>
    </option>
    <option name="lastOpenedProject" value="$USER_HOME$/work/nimbus-checkout" />
  </component>
</application>
`
}

const DRESS = {
  'recentProjects.xml': recents,
  'ui.lnf.xml': () => `<application>
  <component name="UISettings">
    <option name="EDITOR_TAB_LIMIT" value="3" />
  </component>
</application>
`,
  'notifications.xml': () => `<application>
  <component name="NotificationConfiguration">
    <notification groupId="Dependencies from package.json" displayType="NONE" shouldLog="false" />
  </component>
</application>
`,
}

const [command] = process.argv.slice(2)
if (!['set', 'restore'].includes(command)) {
  console.log('usage: sandbox-stage.mjs set | restore')
  process.exit(1)
}
if (sandboxRunning()) throw new Error('close the sandbox first: it writes its config on the way out')

const options = optionsDir()

if (command === 'set') {
  // The first copy is the developer's own config; a second "set" must not overwrite it with the dressed one.
  if (!existsSync(BACKUP)) {
    mkdirSync(BACKUP, { recursive: true })
    for (const file of FILES) {
      const from = join(options, file)
      if (existsSync(from)) copyFileSync(from, join(BACKUP, file))
    }
  }
  for (const project of PROJECTS) if (!project.open) neighbour(project)
  for (const [file, content] of Object.entries(DRESS)) writeFileSync(join(options, file), content())
  console.log('sandbox dressed; its own config is kept in', BACKUP)
} else {
  if (!existsSync(BACKUP)) throw new Error('nothing to restore: the sandbox was not dressed')
  for (const file of FILES) {
    const kept = join(BACKUP, file)
    const target = join(options, file)
    if (existsSync(kept)) copyFileSync(kept, target)
    else rmSync(target, { force: true })
  }
  rmSync(BACKUP, { recursive: true, force: true })
  console.log('sandbox config restored')
}


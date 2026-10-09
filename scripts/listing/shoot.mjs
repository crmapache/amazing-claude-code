/**
 * The listing's pictures in one command: the sandbox dressed, the IDE frames, the phone's screens, the
 * captions - and everything it started put away again, whatever happened on the way.
 *
 *   node scripts/listing/shoot.mjs            # everything (the phone part spends tokens, see phone-shots.mjs)
 *   node scripts/listing/shoot.mjs ide        # the IDE frames only - scripted, no model is called
 *   node scripts/listing/shoot.mjs phone      # the phone's screens only
 *   node scripts/listing/shoot.mjs compose    # captions and numbering over what build/listing already has
 *
 * A part that is not taken this time keeps its last pictures in build/listing, so `ide` after a change to
 * a frame recomposes the whole listing with the phone's screens of the last full take.
 *
 * It refuses to start while a sandbox is open: that one may be somebody's live check, and the pictures
 * need a sandbox started with flags of their own. The result is ~/Downloads/amazing-claude-code-listing.
 */

import { execFileSync, spawn } from 'node:child_process'
import { existsSync, mkdirSync, openSync } from 'node:fs'
import { join } from 'node:path'

const ROOT = new URL('../../', import.meta.url).pathname
const HERE = new URL('./', import.meta.url).pathname
const LOGS = join(ROOT, 'build', 'listing', 'logs')
const MARKER = 'idea.required.plugins.id=io.github.crmapache.amazingclaudecode'
const DEMO = join(process.env.HOME, 'work', 'nimbus-checkout')

const PART = process.argv[2] ?? 'all'
if (!['all', 'ide', 'phone', 'compose'].includes(PART)) {
  console.log('usage: shoot.mjs [all | ide | phone | compose]')
  process.exit(1)
}
const IDE = PART === 'all' || PART === 'ide'
const PHONE = PART === 'all' || PART === 'phone'

const sleep = (ms) => new Promise((r) => setTimeout(r, ms))
const say = (line) => console.log(`\n== ${line}`)

/** Playwright is not a dependency of this repository (see scripts/screenshots.mjs); it lives beside it. */
const playwright = () => {
  if (process.env.PLAYWRIGHT) return process.env.PLAYWRIGHT
  const prefix = '/tmp/acc-shots'
  const entry = join(prefix, 'node_modules', 'playwright', 'index.mjs')
  if (!existsSync(entry)) {
    say('installing Playwright into /tmp/acc-shots')
    execFileSync('npm', ['i', 'playwright', '--prefix', prefix, '--silent'], { stdio: 'inherit' })
  }
  // The browser itself, for the phone and the compositor; a no-op when the cache already has it.
  execFileSync('node', [join(prefix, 'node_modules', 'playwright', 'cli.js'), 'install', 'chromium'], { stdio: 'inherit' })
  return entry
}

const node = (script, ...args) =>
  execFileSync('node', [join(HERE, script), ...args], { stdio: 'inherit', env: { ...process.env, PLAYWRIGHT: process.env.PLAYWRIGHT } })

const listening = (port) => {
  try {
    execFileSync('lsof', ['-nP', `-iTCP:${port}`, '-sTCP:LISTEN'], { stdio: 'pipe' })
    return true
  } catch {
    return false
  }
}

const sandboxRunning = () => {
  try {
    execFileSync('pgrep', ['-f', MARKER], { stdio: 'pipe' })
    return true
  } catch {
    return false
  }
}

const started = []
/** What this run itself changed - only that is undone; a sandbox found open is never ours to close. */
const own = { sandbox: false, dressed: false }

/** A process of our own, in a group of its own, so the whole group goes down with it. */
const launch = (name, command, args, options = {}) => {
  mkdirSync(LOGS, { recursive: true })
  const log = openSync(join(LOGS, `${name}.log`), 'w')
  const child = spawn(command, args, { cwd: ROOT, detached: true, stdio: ['ignore', log, log], ...options })
  started.push({ name, child })
  return child
}

const waitFor = async (what, check, seconds) => {
  for (let waited = 0; waited < seconds; waited += 2) {
    if (await check().catch(() => false)) return
    await sleep(2000)
  }
  throw new Error(`${what} did not come up in ${seconds} s - see build/listing/logs`)
}

const answers = (url) => async () => (await fetch(url)).ok

/** The panel's page in the sandbox, once it has loaded from the dev server. */
const panelUp = async () => {
  const targets = await (await fetch('http://127.0.0.1:5176/json')).json()
  return targets.some((target) => target.url.startsWith('http://localhost:5173/'))
}

const stopSandbox = async () => {
  if (!sandboxRunning()) return
  // Politely first: an IDE killed in the middle of writing its indexes reports them corrupted next time.
  try {
    execFileSync('pkill', ['-f', MARKER])
  } catch {}
  for (let waited = 0; waited < 30 && sandboxRunning(); waited += 1) await sleep(1000)
  if (sandboxRunning()) {
    try {
      execFileSync('pkill', ['-9', '-f', MARKER])
    } catch {}
  }
}

const cleanUp = async () => {
  say('putting everything away')
  if (own.sandbox) await stopSandbox()
  for (const { name, child } of started.reverse()) {
    try {
      process.kill(-child.pid)
      console.log('stopped', name)
    } catch {}
  }
  if (own.dressed) node('sandbox-stage.mjs', 'restore')
}

const main = async () => {
  process.env.PLAYWRIGHT = playwright()

  if (IDE || PHONE) {
    if (sandboxRunning()) throw new Error('a sandbox IDE is open - close it first (it may be somebody else\'s live check)')
    for (const port of [5176, ...(PHONE ? [5174, 8080] : [])]) {
      if (listening(port)) throw new Error(`port ${port} is taken - stop whatever holds it first`)
    }

    say('the demo project and the dressed sandbox')
    node('demo-project.mjs')
    // The last take's chats go too: left in, the sandbox would bring their tabs back and wake their processes.
    node('phone-shots.mjs', 'reset')
    node('sandbox-stage.mjs', 'set')
    own.dressed = true

    say('the dev servers')
    // A dev server the developer already runs on :5173 is the same interface - used, and left alone.
    if (!listening(5173)) launch('webview', 'pnpm', ['dev'], { cwd: join(ROOT, 'webview') })
    await waitFor('the webview dev server', answers('http://localhost:5173/harness.html'), 120)
    if (PHONE) {
      execFileSync('pnpm', ['build'], { cwd: join(ROOT, 'relay'), stdio: 'inherit' })
      launch('relay', 'node', ['dist/index.js'], { cwd: join(ROOT, 'relay'), env: { ...process.env, PORT: '8080', RELAY_STATIC_DIR: '' } })
      launch('mobile', 'pnpm', ['vite', '-c', 'vite.mobile.config.ts'], { cwd: join(ROOT, 'webview') })
      await waitFor('the relay', async () => listening(8080), 60)
      await waitFor('the phone client', answers('http://localhost:5174/mobile.html'), 120)
    }

    say('the sandbox IDE (building the plugin takes a while)')
    own.sandbox = true
    launch('sandbox', './gradlew', [
      'runIde',
      `-PopenProject=${DEMO}`,
      '-PwebviewDevUrl=http://localhost:5173/',
      '-PjcefDebugPort=5176',
      ...(PHONE ? ['-PremoteRelay=ws://localhost:8080'] : []),
    ])
    await waitFor('the sandbox panel', panelUp, 600)
    // Indexing and the editor's first passes (inlay hints, the tree unfolding) settle after the panel does.
    await sleep(45_000)

    if (IDE) {
      say('the IDE frames')
      node('ide-shots.mjs')
    }
    if (PHONE) {
      say('the phone')
      const paired = execFileSync('node', [join(HERE, 'phone-shots.mjs'), 'paired'], { encoding: 'utf8' }).trim()
      if (paired !== 'yes') node('phone-shots.mjs', 'pair')
      node('phone-shots.mjs', 'stage')
      node('phone-shots.mjs')
    }
  }

  say('the pictures')
  node('compose.mjs')
}

let failed = false
try {
  await main()
} catch (error) {
  failed = true
  console.error(`\nFAILED: ${error.message}`)
} finally {
  await cleanUp()
}
process.exit(failed ? 1 : 0)

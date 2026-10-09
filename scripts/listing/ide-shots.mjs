/**
 * The listing's pictures of a whole IDE window: the project tree, the editor and the panel, in a real
 * WebStorm with the plugin in it.
 *
 * The panel in the sandbox loads its interface from the dev server, and the camera walks it to the harness
 * page of each frame (see frames.mjs) - so the feed is the scripted showcase, while everything around it is
 * the IDE itself: the demo project open, the file the conversation is about in the editor, the chip with
 * that file in the panel's input field. The window is captured by its id, never by a region of the screen.
 *
 * How to run it:
 *
 *   node scripts/listing/demo-project.mjs              # the project the IDE shows, with the sandbox closed
 *   cd webview && pnpm dev                             # the interface on :5173, in a terminal of its own
 *   ./gradlew runIde -PopenProject=$HOME/work/nimbus-checkout -PwebviewDevUrl=http://localhost:5173/ \
 *     -PjcefDebugPort=5176
 *   npm i playwright --prefix /tmp/acc-shots          # once: Playwright is not a dependency of this repo
 *   PLAYWRIGHT=/tmp/acc-shots/node_modules/playwright/index.mjs node scripts/listing/ide-shots.mjs
 *
 * Raw window captures land in build/listing/ide (override with OUT=...); compose.mjs then puts the
 * caption band over them. A name on the command line shoots only the frames it matches.
 */

import { execFileSync } from 'node:child_process'
import { mkdirSync, readFileSync } from 'node:fs'
import { homedir } from 'node:os'
import { join } from 'node:path'
import { FRAMES, sleep } from './frames.mjs'

const { chromium } = await import(process.env.PLAYWRIGHT ?? 'playwright')

const CDP = `http://127.0.0.1:${process.env.CDP_PORT ?? 5176}`
const HARNESS = 'http://localhost:5173/harness.html'
const OUT = process.env.OUT ?? new URL('../../build/listing/ide/', import.meta.url).pathname
const ONLY = process.argv.slice(2)
const DEMO = process.env.DEMO ?? join(homedir(), 'work', 'nimbus-checkout')

/** The window, as on a 14" MacBook with the dock shown: maximized, the size the listing's frames share. */
const WINDOW = { x: 0, y: 33, width: 1512, height: 890 }

/**
 * The harness inside the real panel, with the IDE's bridge kept out of it.
 *
 * The IDE installs its own `window.__accSend` on every page load and pushes its batches into
 * `window.__accReceive`. On a harness page the first would carry the scenario's prompts to a real Claude
 * session - it did, once, and a real turn started editing the demo project - and the second would mix
 * the real IDE's tabs and state into the frame. So the IDE's sender is put aside (it is still used, on
 * purpose, to open files in the editor) and of its batches only `editorContext` gets through: the chip in
 * the input field naming the file the editor shows.
 *
 * Runs before any script of the page, and must be installed on every connection before the first
 * navigation - a page reloaded without it is a page talking to the real IDE.
 */
const guard = () => {
  if (!location.pathname.endsWith('/harness.html')) return

  let harnessSend
  Object.defineProperty(window, '__accSend', {
    configurable: true,
    get: () => harnessSend,
    set: (fn) => {
      if (typeof fn === 'function' && String(fn).includes('cefQuery')) {
        window.__accIdeSend = fn
        return
      }
      harnessSend = fn
    },
  })

  // One wrapper per handler the panel installs: the harness tells a remounted panel from the old one by
  // the identity of window.__accReceive (see waitForFreshBridge), so the wrapper has to change with it.
  const KEEP = new Set(['editorContext'])
  let wrapped
  Object.defineProperty(window, '__accReceive', {
    configurable: true,
    get: () => wrapped,
    set: (fn) => {
      wrapped = fn
        ? (batch) => {
            if (!Array.isArray(batch)) return fn(batch)
            for (const message of batch) if (KEEP.has(message?.type)) fn(message)
          }
        : undefined
    },
  })
}

const findWindow = () => {
  const swift = new URL('./window.swift', import.meta.url).pathname
  const [id, pid] = execFileSync('swift', [swift, 'nimbus-checkout'], { encoding: 'utf8' }).trim().split(' ')
  return { id, pid }
}

/** Puts the window where every frame expects it - by its attributes, not by dragging anything. */
const placeWindow = (pid) => {
  const script = [
    `tell application "System Events" to set p to first process whose unix id is ${pid}`,
    `tell application "System Events" to set position of window 1 of p to {${WINDOW.x}, ${WINDOW.y}}`,
    `tell application "System Events" to set size of window 1 of p to {${WINDOW.width}, ${WINDOW.height}}`,
  ]
  execFileSync('osascript', script.flatMap((line) => ['-e', line]))
}

/**
 * The file the conversation is about, opened in the editor through the IDE's own bridge.
 *
 * The caret goes to the empty line at the end of the file: on a line of code the IDE lights the line up
 * and hangs an intention bulb beside it, and the files are short enough to be seen whole anyway.
 */
const openInEditor = async (page, editor) => {
  const text = readFileSync(join(DEMO, editor.path), 'utf8')
  const lastLine = text.split('\n').length
  const sent = await page.evaluate((target) => {
    if (typeof window.__accIdeSend !== 'function') return false
    window.__accIdeSend(JSON.stringify({ type: 'openFile', path: target.path, line: target.line }))
    return true
  }, { path: editor.path, line: lastLine })
  if (!sent) throw new Error('the IDE bridge never arrived on the harness page')
  await sleep(1200)
}

const main = async () => {
  mkdirSync(OUT, { recursive: true })
  const window = findWindow()
  placeWindow(window.pid)

  const browser = await chromium.connectOverCDP(CDP)
  const context = browser.contexts()[0]
  await context.addInitScript(guard)
  const page = context.pages().find((candidate) => candidate.url().startsWith('http://localhost:5173')) ?? context.pages()[0]
  page.on('pageerror', (error) => console.log('   page error:', error.message.slice(0, 160)))

  try {
    await shoot(page, window)
  } finally {
    // The panel goes back to the real interface whatever happened. A harness page left behind is a
    // harness page without the guard the moment anything reloads it - and the dev server reloads it on
    // every edit of the harness: its scenario's prompts then went to a real Claude session in this IDE.
    await page.goto('http://localhost:5173/?theme=dark', { waitUntil: 'load' }).catch(() => {})
    await browser.close().catch(() => {})
  }
}

const shoot = async (page, window) => {
  for (const frame of FRAMES) {
    if (ONLY.length && !ONLY.some((mask) => frame.id.includes(mask))) continue

    await page.goto(`${HARNESS}?shot=${frame.shot}&theme=dark`, { waitUntil: 'load' })
    await page.waitForFunction(() => window.__accShotReady === true, null, { timeout: 20_000 })
    await sleep(700)

    if (frame.editor) await openInEditor(page, frame.editor)
    if (frame.run) await frame.run(page)
    await sleep(500)

    // Nothing in the picture should look hovered - the pointer stands wherever the last click left it.
    const size = page.viewportSize() ?? (await page.evaluate(() => ({ width: innerWidth, height: innerHeight })))
    await page.mouse.move(size.width - 4, size.height - 4)
    await sleep(600)

    const path = `${OUT}/${frame.id}.png`
    execFileSync('screencapture', ['-x', '-o', '-l', window.id, path])
    console.log('shot', frame.id)
  }
}

main().catch((error) => {
  console.error(error)
  process.exit(1)
})

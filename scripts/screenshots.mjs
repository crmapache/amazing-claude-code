/**
 * The pictures of the Marketplace listing.
 *
 * The panel alone, in a browser: every frame of scripts/listing/frames.mjs played in the harness's shot
 * mode (`?shot=<id>`, see webview/src/harness/harness.tsx) and photographed at 1200x800 CSS pixels with a
 * device pixel ratio of 2 - a 2400x1600 PNG. The listing itself is now pictures of a whole IDE window
 * (scripts/listing/ide-shots.mjs); this camera stays for frames of the panel on its own. What is in a
 * frame lives in webview/src/harness/scenarios/showcase.ts and what is done to it in frames.mjs - the two
 * cameras share both.
 *
 * How to run it:
 *
 *   cd webview && pnpm dev            # the harness on :5173, in a terminal of its own
 *   npm i playwright --prefix /tmp/acc-shots      # once: Playwright is not a dependency of this repo
 *   PLAYWRIGHT=/tmp/acc-shots/node_modules/playwright/index.mjs node scripts/screenshots.mjs
 *
 * The pictures land in build/screenshots (override with OUT=...). A name on the command line shoots
 * only the frames it matches: `node scripts/screenshots.mjs 03 statistics`.
 *
 * Playwright is deliberately not in package.json: it is a hundreds-of-megabytes browser download for a
 * job done a few times a release, and Gradle installs this workspace's dependencies on every build.
 */

import { mkdir } from 'node:fs/promises'
import { FRAMES, sleep } from './listing/frames.mjs'

/**
 * Playwright is looked for wherever it was installed - PLAYWRIGHT points at it when that is not this
 * repository (it is not a dependency here, see the note above). An ES module ignores NODE_PATH, so the
 * path has to arrive as a path rather than as a lookup root.
 */
const { chromium } = await import(process.env.PLAYWRIGHT ?? 'playwright')

const BASE = 'http://localhost:5173/harness.html'
const OUT = process.env.OUT ?? new URL('../build/screenshots/', import.meta.url).pathname
const ONLY = process.argv.slice(2)

const WIDTH = 1200
const HEIGHT = 800

const main = async () => {
  await mkdir(OUT, { recursive: true })
  const browser = await chromium.launch()
  const context = await browser.newContext({
    viewport: { width: WIDTH, height: HEIGHT },
    deviceScaleFactor: 2,
    reducedMotion: 'reduce',
  })
  const page = await context.newPage()
  page.on('console', (msg) => {
    if (msg.type() === 'error') console.log('   console error:', msg.text().slice(0, 160))
  })

  for (const [index, frame] of FRAMES.entries()) {
    const file = `${String(index + 1).padStart(2, '0')}-${frame.id}`
    if (ONLY.length && !ONLY.some((mask) => file.includes(mask))) continue

    await page.goto(`${BASE}?shot=${frame.shot}`, { waitUntil: 'load' })
    await page.waitForFunction(() => window.__accShotReady === true, null, { timeout: 15_000 })
    await sleep(700)

    if (frame.run) await frame.run(page)
    await sleep(400)

    // Nothing in the picture should look hovered - the pointer stands wherever the last click left it.
    await page.mouse.move(WIDTH / 2, HEIGHT - 2)
    await sleep(200)

    const path = `${OUT}/${file}.png`
    await page.screenshot({ path })
    console.log('shot', file)
  }

  await browser.close()
}

main().catch((error) => {
  console.error(error)
  process.exit(1)
})

/**
 * The pictures of the Marketplace listing.
 *
 * Every frame is a scenario of the harness played in shot mode (`?shot=<id>`, see
 * webview/src/harness/harness.tsx) and photographed at 1200x800 CSS pixels with a device pixel ratio of
 * 2 - a 2400x1600 PNG, well over the 1200x760 the Marketplace asks for. What is in each frame lives in
 * webview/src/harness/scenarios/showcase.ts; this file only presses the shutter, so a frame that needs
 * different data is changed there rather than here.
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

const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

/** Click the first button whose text contains every one of the given fragments. */
const clickButton = async (page, ...fragments) => {
  const found = await page.evaluate((parts) => {
    const button = [...document.querySelectorAll('button')].find((b) => {
      const text = b.textContent ?? ''
      return parts.every((part) => text.includes(part))
    })
    if (!button) return false
    button.click()
    return true
  }, fragments)
  if (!found) throw new Error(`no button matching ${fragments.join(' + ')}`)
  await sleep(220)
}

/** The same, but the last match rather than the first - the newest group in the feed. */
const clickLastButton = async (page, ...fragments) => {
  const found = await page.evaluate((parts) => {
    const buttons = [...document.querySelectorAll('button')].filter((b) => {
      const text = b.textContent ?? ''
      return parts.every((part) => text.includes(part))
    })
    const button = buttons[buttons.length - 1]
    if (!button) return false
    button.click()
    return true
  }, fragments)
  if (!found) throw new Error(`no button matching ${fragments.join(' + ')}`)
  await sleep(220)
}

const openMenu = async (page) => {
  await page.click('[aria-label="Menu"]')
  await sleep(420)
}

/** The feed is the tallest scrollable box on the page. */
const scrollFeed = async (page, where) => {
  await page.evaluate((target) => {
    const boxes = [...document.querySelectorAll('div')].filter((el) => el.scrollHeight - el.clientHeight > 24)
    const feed = boxes.sort((a, b) => b.clientHeight - a.clientHeight)[0]
    if (!feed) return
    if (target === 'bottom') feed.scrollTop = feed.scrollHeight
    else if (target === 'top') feed.scrollTop = 0
    else feed.scrollTop = feed.scrollHeight * target
  }, where)
  await sleep(260)
}

/** Scroll the feed so that the button whose text matches sits near the top, with a little air above it. */
const scrollTo = async (page, ...fragments) => {
  await page.evaluate((parts) => {
    const button = [...document.querySelectorAll('button')].find((b) => {
      const text = b.textContent ?? ''
      return parts.every((part) => text.includes(part))
    })
    if (!button) return
    const boxes = [...document.querySelectorAll('div')].filter((el) => el.scrollHeight - el.clientHeight > 24)
    const feed = boxes.sort((a, b) => b.clientHeight - a.clientHeight)[0]
    if (!feed) return
    const shift = button.getBoundingClientRect().top - feed.getBoundingClientRect().top - 40
    feed.scrollTop += shift
  }, fragments)
  await sleep(240)
}

/**
 * A card with a scroll of its own (a long plan, say) starts at the top rather than wherever it was left.
 * The feed itself - the tallest scrollable box - is left alone.
 */
const resetInnerScrolls = async (page) => {
  await page.evaluate(() => {
    const boxes = [...document.querySelectorAll('div')].filter((el) => el.scrollHeight - el.clientHeight > 8)
    const feed = boxes.sort((a, b) => b.clientHeight - a.clientHeight)[0]
    for (const box of boxes) if (box !== feed) box.scrollTop = 0
  })
  await sleep(200)
}

/**
 * Drag the mouse across a line of an answer, the way a person marks a sentence they want to branch from:
 * the menu over a selection appears on mouseup and on nothing else (see useSelection).
 */
const selectLine = async (page, fragment) => {
  const box = await page.evaluate((part) => {
    const card = [...document.querySelectorAll('[data-copyable]')].find((el) => (el.textContent ?? '').includes(part))
    if (!card) return null
    const line = [...card.querySelectorAll('p, li, div')].find((el) => (el.textContent ?? '').includes(part)) ?? card
    const rect = line.getBoundingClientRect()
    return { x: rect.left, y: rect.top, width: rect.width, height: rect.height }
  }, fragment)
  if (!box) throw new Error(`no answer text containing "${fragment}"`)

  const y = box.y + 10
  await page.mouse.move(box.x + 6, y)
  await page.mouse.down()
  await page.mouse.move(box.x + box.width * 0.45, y, { steps: 12 })
  await page.mouse.move(box.x + box.width * 0.62, y, { steps: 8 })
  await page.mouse.up()
  await sleep(400)
}

const typeInComposer = async (page, text) => {
  await page.click('[contenteditable="true"]')
  await sleep(120)
  await page.keyboard.type(text, { delay: 24 })
  await sleep(420)
}

const FRAMES = [
  {
    file: '01-a-turn-in-progress',
    shot: 'shot-turn',
    run: async (page) => {
      await clickLastButton(page, 'tools')
      await scrollFeed(page, 'bottom')
    },
  },
  {
    file: '02-edits-as-diffs',
    shot: 'shot-diff',
    run: async (page) => {
      await clickLastButton(page, 'tools')
      await clickLastButton(page, 'paymentMethods.ts', '+11')
      await scrollFeed(page, 'bottom')
    },
  },
  {
    file: '03-a-plan-to-approve',
    shot: 'shot-plan',
    run: async (page) => {
      await scrollFeed(page, 'bottom')
      await resetInnerScrolls(page)
    },
  },
  {
    file: '04-permission-request',
    shot: 'shot-permission',
    run: async (page) => {
      await clickLastButton(page, 'tools')
      await scrollFeed(page, 'bottom')
    },
  },
  {
    file: '05-a-question-with-options',
    shot: 'shot-question',
    run: async (page) => {
      await scrollFeed(page, 'bottom')
    },
  },
  {
    file: '06-subagents-in-parallel',
    shot: 'shot-subagents',
    run: async (page) => {
      await scrollFeed(page, 'bottom')
    },
  },
  {
    file: '07-forks-of-a-conversation',
    shot: 'shot-fork',
    run: async (page) => {
      await scrollFeed(page, 'bottom')
      await selectLine(page, 'On rotation the new certificate')
    },
  },
  {
    file: '08-composer-and-queue',
    shot: 'shot-composer',
    run: async (page) => {
      await scrollFeed(page, 'bottom')
    },
  },
  {
    file: '09-slash-commands',
    shot: 'shot-commands',
    run: async (page) => {
      await scrollFeed(page, 'bottom')
      await typeInComposer(page, '/e')
    },
  },
  {
    file: '10-shell-commands',
    shot: 'shot-bash',
    run: async (page) => {
      await scrollFeed(page, 'bottom')
      await typeInComposer(page, '!pnpm exec playwright test e2e/apple-pay.spec.ts')
    },
  },
  {
    file: '11-model-effort-and-mode',
    shot: 'shot-diff',
    run: async (page) => {
      await scrollFeed(page, 'bottom')
      await clickButton(page, 'MODEL')
      await sleep(500)
    },
  },
  {
    file: '12-statistics',
    shot: 'shot-stats',
    run: async (page) => {
      await clickButton(page, '30 days')
      await sleep(500)
    },
  },
  { file: '13-achievements', shot: 'shot-achievements' },
  {
    file: '14-remote-access',
    shot: 'shot-remote',
    run: async (page) => {
      await scrollFeed(page, 'bottom')
      await openMenu(page)
      await clickButton(page, 'Remote access')
      await sleep(600)
    },
  },
  {
    file: '15-mcp-servers',
    shot: 'shot-mcp',
    run: async (page) => {
      await scrollFeed(page, 'bottom')
      await openMenu(page)
      await clickButton(page, 'MCP servers')
      await sleep(600)
    },
  },
  {
    file: '16-plugins',
    shot: 'shot-plugins',
    run: async (page) => {
      await scrollFeed(page, 'bottom')
      await openMenu(page)
      await clickButton(page, 'Plugins')
      await sleep(600)
      await clickButton(page, 'Browse (')
      await sleep(500)
    },
  },
  {
    file: '17-sound-alerts',
    shot: 'shot-sounds',
    run: async (page) => {
      await scrollFeed(page, 'bottom')
      await openMenu(page)
      await clickButton(page, 'Sound alerts')
      await sleep(600)
    },
  },
  {
    file: '18-past-conversations',
    shot: 'shot-history',
    run: async (page) => {
      await scrollFeed(page, 'bottom')
      await openMenu(page)
      await clickButton(page, 'History')
      await sleep(700)
    },
  },
]

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

  for (const frame of FRAMES) {
    if (ONLY.length && !ONLY.some((mask) => frame.file.includes(mask))) continue

    await page.goto(`${BASE}?shot=${frame.shot}`, { waitUntil: 'load' })
    await page.waitForFunction(() => window.__accShotReady === true, null, { timeout: 15_000 })
    await sleep(700)

    if (frame.run) await frame.run(page)
    await sleep(400)

    // Nothing in the picture should look hovered - the pointer stands wherever the last click left it.
    await page.mouse.move(WIDTH / 2, HEIGHT - 2)
    await sleep(200)

    const path = `${OUT}/${frame.file}.png`
    await page.screenshot({ path })
    console.log('shot', frame.file)
  }

  await browser.close()
}

main().catch((error) => {
  console.error(error)
  process.exit(1)
})

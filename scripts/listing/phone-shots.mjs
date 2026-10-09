/**
 * The phone's screens of the listing, taken from the real phone client paired with the sandbox.
 *
 * Unlike the IDE frames, nothing here is scripted: the phone talks to the sandbox through a relay, end to
 * end encrypted, and shows whatever the sandbox really has. So the screens are real conversations in the
 * demo project, set up through the real panel (`stage`), and a real run of the project's cheapest
 * scenario. That costs tokens - three short Opus conversations and a Haiku run, a few dollars together.
 *
 *   node scripts/listing/phone-shots.mjs reset     # with the sandbox closed: forget the last take's chats
 *   node scripts/listing/phone-shots.mjs paired    # prints yes / no
 *   node scripts/listing/phone-shots.mjs pair      # pairs a headless phone with the sandbox
 *   node scripts/listing/phone-shots.mjs stage     # starts the three conversations and steers them
 *   node scripts/listing/phone-shots.mjs [names]   # shoots the screens into build/listing/phone
 *
 * shoot.mjs runs all of it in order. Needed around it: the relay on :8080, the phone client on :5174, the
 * sandbox with -PremoteRelay=ws://localhost:8080 and -PjcefDebugPort=5176 (see shoot.mjs).
 *
 * The viewport is the phone's screen minus its status bar and home indicator (852 - 59 - 34 points):
 * the client in a browser gets no safe-area insets, so compose.mjs draws those two strips around the shot
 * instead, in the app's own colours.
 */

import { existsSync, mkdirSync, readdirSync, readFileSync, rmSync } from 'node:fs'
import { homedir } from 'node:os'
import { join } from 'node:path'

const { chromium } = await import(process.env.PLAYWRIGHT ?? 'playwright')

const PHONE = 'http://localhost:5174/mobile.html?relay=ws://localhost:8080'
const PANEL = 'http://localhost:5173/?theme=dark'
const CDP = `http://127.0.0.1:${process.env.CDP_PORT ?? 5176}`
const PROFILE = process.env.PROFILE ?? new URL('../../build/listing/phone-profile/', import.meta.url).pathname
const OUT = process.env.OUT ?? new URL('../../build/listing/phone/', import.meta.url).pathname
const DEMO = process.env.DEMO ?? join(homedir(), 'work', 'nimbus-checkout')
const SANDBOX = new URL('../../.intellijPlatform/sandbox/amazing-claude-code/', import.meta.url).pathname

const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

/**
 * The three conversations the phone's screens are made of, in the order of the panel's tabs.
 *
 * Every prompt opens with "Reply in English": the sandbox runs the CLI with the developer's own settings,
 * whose language is Russian, and a project's CLAUDE.md does not outrank that. The tab names are given
 * here for the same reason - the CLI names a conversation in that language too. The model and the effort
 * are never touched: in the sandbox they are the account's memory, shared with the working IDE.
 */
const CHATS = [
  {
    name: 'Google Pay beside Apple Pay',
    mode: 'Accept edits',
    prompt:
      "Reply in English. Add Google Pay next to Apple Pay in the payment registry. Create apps/web/src/checkout/googlePay.ts with canUseGooglePay() (true when window.PaymentRequest exists) and createGooglePayRequest(total: Money) that builds a PaymentRequest for Google Pay in Google's TEST environment with the gateway 'example'. Then add the entry to METHODS right after Apple Pay. Do not ask me anything and do not add tests. When the code is in, run `pnpm exec tsc --noEmit -p .` and tell me in two sentences what changed.",
  },
  {
    name: 'Pay later in the sheet',
    mode: 'Auto',
    prompt:
      "Reply in English. We want a 'Pay later' option in the sheet. Before touching any code, use the AskUserQuestion tool to ask me two things: which provider to integrate (Klarna, Affirm or Afterpay, each with a one-line trade-off for our checkout) and whether it should show for carts under $50. Then wait for my answers.",
  },
  {
    name: 'Apple Pay flag on staging',
    mode: 'Ask',
    prompt:
      'Reply in English. Apply the new migration apps/api/migrations/20260827_apple_pay_flag.sql to staging with `pnpm db:migrate --env staging` and tell me what it printed.',
  },
]

/** The scenario the run screens show: three Haiku cards that only read and write a release note. */
const RUN = 'Pre-merge check'

const openPhone = async () => {
  mkdirSync(PROFILE, { recursive: true })
  const context = await chromium.launchPersistentContext(PROFILE, {
    viewport: { width: 393, height: 759 },
    deviceScaleFactor: 3,
    isMobile: true,
    hasTouch: true,
    colorScheme: 'dark',
    userAgent:
      'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1',
  })
  const page = context.pages()[0] ?? (await context.newPage())
  return { context, page }
}

/** The real panel in the sandbox - never a harness page, which would need the guard of ide-shots.mjs. */
const openPanel = async () => {
  const ide = await chromium.connectOverCDP(CDP)
  const page = ide.contexts()[0].pages().find((p) => p.url().startsWith('http://localhost:5173')) ?? ide.contexts()[0].pages()[0]
  if (!page.url().startsWith(PANEL.split('?')[0] + '?')) await page.goto(PANEL, { waitUntil: 'load' })
  await sleep(1500)
  return { ide, page }
}

const home = async (page) => {
  await page.goto(PHONE)
  await sleep(3500)
  return page.evaluate(() => document.body.innerText)
}

/**
 * The first button whose text contains every fragment - a row of the home screen, a tab, an action. A row
 * is named by its title glued to its state ("<name>waiting"): the project card around the rows holds every
 * name and a "3 waiting" of its own.
 */
const press = async (page, ...fragments) => {
  const found = await page.evaluate((parts) => {
    const button = [...document.querySelectorAll('button, [role=button], [role=tab]')].find((b) =>
      parts.every((part) => (b.textContent ?? '').includes(part)),
    )
    if (!button) return false
    button.click()
    return true
  }, fragments)
  if (!found) throw new Error(`nothing to press with ${fragments.join(' + ')}`)
  await sleep(1500)
}

/** The scroller of the screen brought to where the given text stands `offset` pixels below the top. */
const scrollToText = async (page, text, offset) => {
  await page.evaluate(
    ([needle, below]) => {
      // Exactly that text, in any case: a stage title is set in capitals by CSS, not in the DOM.
      const target = [...document.querySelectorAll('*')].find(
        (e) => e.children.length === 0 && (e.textContent ?? '').trim().toLowerCase() === needle.toLowerCase(),
      )
      if (!target) return
      const scrollers = [...document.querySelectorAll('*')].filter(
        (el) => el.scrollHeight - el.clientHeight > 40 && getComputedStyle(el).overflowY !== 'visible',
      )
      const feed = scrollers.sort((a, b) => b.clientHeight - a.clientHeight)[0]
      const top = target.getBoundingClientRect().top
      if (feed) feed.scrollTop += top - below
      else window.scrollBy(0, top - below)
    },
    [text, offset],
  )
  await sleep(800)
}

const openScenarios = async (page, band) => {
  await press(page, 'Scenarios')
  await page.evaluate((name) => {
    const tab = [...document.querySelectorAll('[role=tab], button')].find((b) => b.textContent.trim().startsWith(name))
    tab?.click()
  }, band)
  await sleep(1200)
}

/** The Run button of one scenario on the shelf - the one whose own card names it. */
const runScenario = async (page, name) => {
  const pressed = await page.evaluate((title) => {
    for (const button of document.querySelectorAll('button')) {
      if (button.textContent.trim() !== 'Run') continue
      let card = button.parentElement
      while (card && !/Night patrol|Review and fix|Pre-merge check/.test(card.textContent ?? '')) card = card.parentElement
      if (card && (card.textContent ?? '').includes(title)) {
        button.click()
        return true
      }
    }
    return false
  }, name)
  if (!pressed) throw new Error(`no Run button for ${name}`)
  await sleep(2500)
}

/** What each screen is, given the conversations of `stage`. */
const SCREENS = {
  home: async () => {},
  'thread-diff': async (page) => {
    await press(page, `${CHATS[0].name}waiting`)
    await press(page, 'Open the conversation')
  },
  permission: async (page) => press(page, `${CHATS[2].name}waiting`),
  question: async (page) => press(page, `${CHATS[1].name}waiting`),
  'model-sheet': async (page) => {
    await press(page, `${CHATS[1].name}waiting`)
    await press(page, 'Open the conversation')
    await press(page, ' · ')
  },
  menu: async (page) => {
    await page.click('[aria-label="Menu"]')
    await sleep(1000)
  },
  scenarios: async (page) => openScenarios(page, 'Scenarios'),
  'run-live': async (page) => {
    // Starts the real run, and is taken while its second card works.
    await openScenarios(page, 'Scenarios')
    await runScenario(page, RUN)
    await openScenarios(page, 'Runs')
    await press(page, RUN)
    await sleep(25_000)
  },
  'run-done': async (page) => {
    // The run started by run-live, once it is over.
    for (let waited = 0; ; waited += 10) {
      await home(page)
      await openScenarios(page, 'Runs')
      const text = await page.evaluate(() => document.body.innerText)
      if (/PAST RUNS[\s\S]*Done/i.test(text) && !/RUNNING NOW\s*\n\s*Pre-merge/i.test(text)) break
      if (waited > 420) throw new Error('the scenario run did not finish in seven minutes')
      await sleep(10_000)
    }
    await page.locator('[class*=pastRunOpen]').first().click()
    await sleep(2500)
    await scrollToText(page, 'REVIEW', 200)
  },
}

/**
 * The last take's conversations, runs and tabs, forgotten - so the phone lists this take's three chats and
 * one run rather than everything the demo project ever had. Only with the sandbox closed: it keeps the tab
 * list in memory and writes it back.
 */
const reset = () => {
  const transcripts = join(homedir(), '.claude', 'projects', DEMO.replace(/[^a-zA-Z0-9]/g, '-'))
  if (existsSync(transcripts)) {
    for (const entry of readdirSync(transcripts)) if (entry !== 'memory') rmSync(join(transcripts, entry), { recursive: true, force: true })
  }

  for (const version of existsSync(SANDBOX) ? readdirSync(SANDBOX) : []) {
    const tabs = join(SANDBOX, version, 'system', 'amazing-claude-code', 'tabs')
    if (!existsSync(tabs)) continue
    for (const file of readdirSync(tabs)) if (file.startsWith('nimbus-checkout-')) rmSync(join(tabs, file))
  }

  // A project's runs sit in a folder of their own; it is the demo's when a run in it names the demo's path.
  const runs = join(homedir(), '.amazing-claude-code', 'scenario-runs')
  for (const project of existsSync(runs) ? readdirSync(runs) : []) {
    const folder = join(runs, project)
    const ours = readdirSync(folder).some((run) => {
      const file = join(folder, run, 'run.json')
      return existsSync(file) && readFileSync(file, 'utf8').includes(DEMO)
    })
    if (ours) rmSync(folder, { recursive: true, force: true })
  }
  console.log('the last take is forgotten')
}

const paired = async () => {
  const { context, page } = await openPhone()
  const text = await home(page)
  await context.close()
  return text.includes('Projects') && text.includes('WebStorm on')
}

const pair = async () => {
  const { context, page } = await openPhone()
  // The dev server bundles on the first visit and reloads the page, which loses a pairing half done.
  await home(page)

  const { ide, page: panel } = await openPanel()
  const link = await panel.evaluate(async () => {
    const wait = (ms) => new Promise((r) => setTimeout(r, ms))
    const exactly = (text) => [...document.querySelectorAll('button')].find((b) => (b.textContent ?? '').trim() === text)
    if (!document.body.innerText.includes('REMOTE ACCESS')) {
      document.querySelector('[aria-label=Menu]').click()
      await wait(500)
      ;[...document.querySelectorAll('button')].find((b) => (b.textContent ?? '').includes('Remote access')).click()
      await wait(800)
    }
    exactly('Stop offering')?.click()
    await wait(400)
    exactly('Pair a device')?.click()
    await wait(1500)
    return document.body.innerText.match(/http:\/\/localhost:8080\/p#\S+/)?.[0] ?? ''
  })
  if (!link) throw new Error('the panel offered no pairing link - is remote access on (-PremoteRelay)?')

  await page.goto(`${PHONE}${link.slice(link.indexOf('#'))}`)
  await sleep(3000)
  // "Allow" exactly: a looser match takes the "Allow this IDE to be reached remotely" switch instead.
  await panel.evaluate(() => [...document.querySelectorAll('button')].find((b) => (b.textContent ?? '').trim() === 'Allow')?.click())
  await sleep(4000)
  // The remote-access screen is put away, so the panel is back on its conversations.
  await panel.goto(PANEL, { waitUntil: 'load' })
  await context.close()
  await ide.close().catch(() => {})
  console.log('paired')
}

/** A conversation started the way a person starts one: the mode picked on its chip, the prompt typed, Send. */
const startChat = async (panel, chat, newTab) => {
  if (newTab) {
    await panel.evaluate(() => [...document.querySelectorAll('button')].find((b) => b.textContent.trim() === '+')?.click())
    await sleep(2500)
  }
  await panel.evaluate(() => {
    // MODE, not MODEL: both chips start with the same four letters.
    const chip = [...document.querySelectorAll('button')].find((b) => /^MODE(?!L)/.test(b.textContent.trim()) && b.offsetParent)
    chip?.click()
  })
  await sleep(500)
  const picked = await panel.evaluate((label) => {
    const item = [...document.querySelectorAll('[class*=_menuItem_]')].find((i) =>
      (i.querySelector('[class*=_menuLabel_]')?.textContent ?? i.textContent).trim().startsWith(label),
    )
    item?.click()
    return Boolean(item)
  }, chat.mode)
  if (!picked) throw new Error(`no mode "${chat.mode}" on the MODE chip`)
  await sleep(600)
  await panel.click('[contenteditable="true"]')
  await panel.keyboard.type(chat.prompt, { delay: 2 })
  await sleep(400)
  const sent = await panel.evaluate(() => {
    const send = [...document.querySelectorAll('button')].find((b) => b.textContent.replace(/\s/g, '') === 'Send' && b.offsetParent)
    send?.click()
    return Boolean(send)
  })
  if (!sent) throw new Error(`could not send "${chat.name}"`)
  await sleep(3000)
}

/** Renamed by a double click on the tab, as a person renames one - a name given so outranks the CLI's. */
const renameTab = async (panel, index, name) => {
  const tab = panel.locator('[role=tab]').nth(index)
  const box = await tab.boundingBox()
  await tab.dblclick({ position: { x: Math.min(60, (box?.width ?? 120) / 2), y: (box?.height ?? 20) / 2 } })
  await sleep(500)
  const field = panel.locator('[role=tab] input').first()
  await field.fill(name)
  await field.press('Enter')
  await sleep(800)
}

/**
 * The three conversations, started in the panel and walked to the state the screens show: the first one
 * with its edits made and waiting to run the type check, the second on its question, the third on its
 * permission. The first may ask on the way for a harmless look around (an `ls`, a `cat`); those are
 * allowed from the phone, the way a person would.
 */
const stage = async () => {
  const { ide, page: panel } = await openPanel()
  const fresh = await panel.evaluate(() => {
    const tabs = document.querySelectorAll('[role=tab]')
    return tabs.length === 1 && !document.body.innerText.includes('YOU\n')
  })
  for (const [index, chat] of CHATS.entries()) await startChat(panel, chat, index > 0 || !fresh)

  // The CLI's own names arrive a few seconds after the message; a person's rename outranks them.
  await sleep(8000)
  const offset = (await panel.locator('[role=tab]').count()) - CHATS.length
  for (const [index, chat] of CHATS.entries()) await renameTab(panel, offset + index, chat.name)
  await ide.close().catch(() => {})

  const { context, page } = await openPhone()
  const deadline = Date.now() + 12 * 60_000
  for (;;) {
    const text = await home(page)
    // The line under a conversation's row says where it stands; the cards above repeat the name without it.
    const state = (name) =>
      [...text.matchAll(new RegExp(`${name}\\s*\\n\\s*([^\\n]+)`, 'g'))]
        .map((match) => match[1])
        .find((line) => /waiting on you|working|done|idle/.test(line)) ?? ''
    const [edits, question, permission] = CHATS.map((chat) => state(chat.name))

    let editsReady = false
    if (/waiting on you · permission/.test(edits)) {
      await press(page, `${CHATS[0].name}waiting`)
      // The command itself, not the whole screen: the screen also quotes the prompt, which names tsc too.
      const asked = await page.evaluate(() => document.body.innerText)
      const command = (asked.split('wants to run a command')[1] ?? '').split('\n').map((line) => line.trim()).find(Boolean) ?? ''
      if (/\btsc\b/.test(command)) editsReady = true
      else await press(page, 'Allow once')
    } else if (/waiting on you · question/.test(edits)) {
      throw new Error(`"${CHATS[0].name}" asked a question instead of working - answer it in the panel and run stage again`)
    }

    if (editsReady && /question/.test(question) && /permission/.test(permission)) break
    if (Date.now() > deadline) {
      throw new Error(`the conversations did not settle in twelve minutes: ${JSON.stringify({ edits, question, permission })}`)
    }
    await sleep(8000)
  }
  await context.close()
  console.log('staged: one edit waits on its type check, one question, one permission')
}

const shoot = async (names) => {
  mkdirSync(OUT, { recursive: true })
  const { context, page } = await openPhone()
  for (const [name, reach] of Object.entries(SCREENS)) {
    if (names.length && !names.includes(name)) continue
    await home(page)
    await reach(page)
    await page.screenshot({ path: `${OUT}/${name}.png` })
    console.log('shot', name)
  }
  await context.close()
}

const [command, ...rest] = process.argv.slice(2)
if (command === 'reset') reset()
else if (command === 'paired') console.log((await paired()) ? 'yes' : 'no')
else if (command === 'pair') await pair()
else if (command === 'stage') await stage()
else await shoot(command ? [command, ...rest] : [])

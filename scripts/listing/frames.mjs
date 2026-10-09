/**
 * The frames of the Marketplace listing, in the order the listing shows them - the first is the one a
 * visitor sees first, the rest go down by how much they matter.
 *
 * Every frame is a scenario of the harness played in shot mode (`?shot=<id>`, see
 * webview/src/harness/harness.tsx) plus whatever has to be pressed or typed on top of it. What is in a
 * frame's feed lives in webview/src/harness/scenarios/showcase.ts; this file only says which scenario,
 * what to do to it, which file the editor beside the panel shows, and the caption the picture carries.
 *
 * Two cameras use it: scripts/screenshots.mjs photographs the panel alone in a browser, and
 * scripts/listing/ide-shots.mjs photographs a whole IDE window with this panel in it.
 */

export const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

/** Click the first button whose text contains every one of the given fragments. */
export const clickButton = async (page, ...fragments) => {
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
export const clickLastButton = async (page, ...fragments) => {
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

export const openMenu = async (page) => {
  await page.click('[aria-label="Menu"]')
  await sleep(420)
}

/** The feed is the tallest scrollable box on the page. */
export const scrollFeed = async (page, where) => {
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
export const scrollTo = async (page, ...fragments) => {
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
export const resetInnerScrolls = async (page) => {
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
export const selectLine = async (page, fragment) => {
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

export const typeInComposer = async (page, text) => {
  await page.click('[contenteditable="true"]')
  await sleep(120)
  await page.keyboard.type(text, { delay: 24 })
  await sleep(420)
}

/** The button whose whole text is this - "Run" on a scenario's row is not the "Runs" tab beside it. */
export const clickExact = async (page, label, { last = false } = {}) => {
  const found = await page.evaluate(([text, useLast]) => {
    const all = [...document.querySelectorAll('button')].filter((b) => (b.textContent ?? '').trim() === text)
    const button = useLast ? all[all.length - 1] : all[0]
    if (!button) return false
    button.click()
    return true
  }, [label, last])
  if (!found) throw new Error(`no button whose text is exactly "${label}"`)
  await sleep(320)
}

/**
 * The scenarios hub.
 *
 * The button beside the magnifier opens it, and it is only on a conversation's screen: a run started
 * from the hub takes a tab of its own, and there is no composer on that one. So the way back is the tab
 * in the strip, which is what this falls back to.
 */
export const openScenarios = async (page) => {
  const pressed = await page.evaluate(() => {
    const button = document.querySelector('[aria-label="Scenarios"]')
    if (button) {
      button.click()
      return true
    }

    // A tab of the strip is a div with role="tab" - the cross inside it is the button.
    const tab = [...document.querySelectorAll('[role="tab"]')].find((el) =>
      (el.textContent ?? '').trim().startsWith('Scenarios'),
    )
    if (!tab) return false
    tab.click()
    return true
  })
  if (!pressed) throw new Error('the scenarios hub is neither a button nor a tab on this screen')
  await sleep(900)
}

/**
 * The hub's shelf of scenarios - its first band. The hub opens on its runs (see AT_FIRST in
 * components/scenarios/view.ts), so a frame that starts, edits or schedules a scenario goes here first.
 * The band tabs are the tablist without a name; the strip of conversations is the one that has one.
 */
export const toShelf = async (page) => {
  const found = await page.evaluate(() => {
    const band = document.querySelector('[role="tablist"]:not([aria-label]) [role="tab"]')
    if (!band) return false
    band.click()
    return true
  })
  if (!found) throw new Error('the hub shows no band tabs on this screen')
  await sleep(400)
}

/** Start the scenario on the first shelf, answering the one thing it asks. */
export const startTheScenario = async (page, branch) => {
  await clickExact(page, 'Run')
  await sleep(320)
  await page.locator('input').last().fill(branch)
  await sleep(200)
  await clickExact(page, 'Run', { last: true })
}

/**
 * The frames, most important first. `editor` is the file the IDE beside the panel shows (a path from the
 * demo project's root, see scripts/listing/demo-project.mjs) - the one the frame's conversation is about.
 */
export const FRAMES = [
  {
    id: 'a-turn-in-progress',
    shot: 'shot-turn',
    caption: 'Claude Code in a real IDE panel: the task list, every tool call, the answer as it is written',
    editor: { path: 'apps/web/src/checkout/paymentMethods.ts', line: 5 },
    run: async (page) => {
      await clickLastButton(page, 'tools')
      await scrollFeed(page, 'bottom')
    },
  },
  {
    id: 'edits-as-diffs',
    shot: 'shot-diff',
    caption: 'Every edit is a diff you can read, and every path in the chat opens in the editor',
    editor: { path: 'apps/web/src/checkout/paymentMethods.ts', line: 6 },
    run: async (page) => {
      // An edit's diff stands open by itself (see tool-cards), so unfolding the group is the whole job.
      await clickLastButton(page, 'tools')
      await scrollFeed(page, 'bottom')
    },
  },
  {
    id: 'a-scenario-run',
    shot: 'shot-turn',
    caption: 'Scenarios: a road of sessions that carries a whole task to the end while you are away',
    editor: { path: 'e2e/apple-pay.spec.ts', line: 10 },
    run: async (page) => {
      await openScenarios(page)
      await toShelf(page)
      await startTheScenario(page, 'feature/apple-pay-sheet')
      // Long enough for the walk to reach the card that stops to ask - the one state the whole screen
      // is arranged around (see scenarioDesk).
      await sleep(6200)
    },
  },
  {
    id: 'remote-access',
    shot: 'shot-remote',
    caption: 'Pair a phone in one scan, and answer your agent from anywhere, end-to-end encrypted',
    editor: { path: 'apps/web/src/checkout/applePay.ts', line: 12 },
    run: async (page) => {
      await scrollFeed(page, 'bottom')
      await openMenu(page)
      await clickButton(page, 'Remote access')
      await sleep(600)
    },
  },
  {
    id: 'a-plan-to-approve',
    shot: 'shot-plan',
    caption: 'A plan arrives as a card: approve it, or send it back with a note',
    editor: { path: 'apps/api/src/payments/webhooks.ts', line: 13 },
    run: async (page) => {
      await scrollFeed(page, 'bottom')
      await resetInnerScrolls(page)
      // In a narrow panel the plan's own body is the tallest scroller on the page, so scrollFeed took it
      // for the feed and wound it to its end - the plan has to be read from its heading.
      await page.evaluate(() => {
        for (const body of document.querySelectorAll('[class*="planBody"]')) body.scrollTop = 0
      })
      await sleep(200)
    },
  },
  {
    id: 'permission-request',
    shot: 'shot-permission',
    caption: 'A permission request says what it wants to run and why it is asking',
    editor: { path: 'apps/api/migrations/20260827_apple_pay_flag.sql', line: 1 },
    run: async (page) => {
      await clickLastButton(page, 'tools')
      await scrollFeed(page, 'bottom')
    },
  },
  {
    id: 'a-question-with-options',
    shot: 'shot-question',
    caption: 'Questions come with options: answer with a click or a number key',
    editor: { path: 'apps/api/src/payments/session.ts', line: 10 },
    run: async (page) => {
      await scrollFeed(page, 'bottom')
    },
  },
  {
    id: 'subagents-in-parallel',
    shot: 'shot-subagents',
    caption: 'Subagents work in parallel, each on a live card of its own',
    editor: { path: 'apps/api/src/payments/webhooks.ts', line: 18 },
    run: async (page) => {
      await scrollFeed(page, 'bottom')
    },
  },
  {
    id: 'forks-of-a-conversation',
    shot: 'shot-fork',
    caption: 'Fork the conversation from any sentence and try another way in a tab beside it',
    editor: { path: 'apps/api/src/payments/applePay.ts', line: 11 },
    run: async (page) => {
      await scrollFeed(page, 'bottom')
      await selectLine(page, 'On rotation the new certificate')
    },
  },
  {
    id: 'composer-and-queue',
    shot: 'shot-composer',
    caption: 'Queue the next messages while Claude works, with files and selections as chips',
    editor: { path: 'apps/web/src/checkout/useCheckoutSession.ts', line: 12 },
    run: async (page) => {
      await scrollFeed(page, 'bottom')
    },
  },
  {
    id: 'model-effort-and-mode',
    shot: 'shot-diff',
    caption: 'Model, effort and permission mode belong to each conversation',
    editor: { path: 'apps/web/src/checkout/applePay.ts', line: 1 },
    run: async (page) => {
      await scrollFeed(page, 'bottom')
      await clickButton(page, 'MODEL')
      await sleep(500)
    },
  },
  {
    id: 'search-the-conversations',
    shot: 'shot-diff',
    caption: 'Search every conversation of the project, or ask the search in your own words',
    editor: { path: 'apps/api/src/payments/webhooks.ts', line: 10 },
    run: async (page) => {
      await scrollFeed(page, 'bottom')
      await page.evaluate(() => window.__accHarnessOpenSearch?.())
      await sleep(700)
      await page.click('[role="dialog"] input')
      await page.keyboard.type('refund', { delay: 40 })
      await sleep(900)
      // The search opens on the conversation at hand; the frame is about the whole project's past.
      await clickButton(page, 'All chats')
      await sleep(1200)
    },
  },
  {
    id: 'past-conversations',
    shot: 'shot-history',
    caption: 'Every past conversation of the project is a click away, ready to carry on',
    editor: { path: 'docs/adr/0014-payment-registry.md', line: 1 },
    run: async (page) => {
      await scrollFeed(page, 'bottom')
      await openMenu(page)
      await clickButton(page, 'History')
      await sleep(700)
    },
  },
  {
    id: 'slash-commands',
    shot: 'shot-commands',
    caption: 'Slash commands and your own skills, suggested as you type',
    editor: { path: 'apps/web/src/checkout/PaymentSheet.tsx', line: 31 },
    run: async (page) => {
      await scrollFeed(page, 'bottom')
      await typeInComposer(page, '/e')
    },
  },
  {
    id: 'shell-commands',
    shot: 'shot-bash',
    caption: 'Run a shell command of your own with "!" - its output lands in the conversation',
    editor: { path: 'apps/web/src/checkout/applePay.ts', line: 1 },
    run: async (page) => {
      await scrollFeed(page, 'bottom')
      await typeInComposer(page, '!pnpm exec playwright test e2e/apple-pay.spec.ts')
    },
  },
  {
    id: 'the-scenario-editor',
    shot: 'shot-turn',
    caption: 'Write a scenario once: stages, cards, and what must be true before the road moves on',
    editor: { path: 'docs/payments.md', line: 1 },
    run: async (page) => {
      await openScenarios(page)
      await toShelf(page)
      await clickButton(page, 'Review and fix')
      await sleep(700)
      // A stage rather than the name: the cards are what the editor is about - what each session is
      // told, with the slot names lit up in it, and what has to be true before the main thread moves on.
      await clickButton(page, 'Review, then fix')
      await sleep(600)
    },
  },
  {
    id: 'scenarios-on-a-clock',
    shot: 'shot-turn',
    caption: 'Put scenarios on a clock: the night shift runs them one after another',
    editor: { path: 'e2e/checkout.spec.ts', line: 1 },
    run: async (page) => {
      await openScenarios(page)
      await toShelf(page)
      // Every scenario of the shelf on an hour and a rhythm of its own, so the timetable reads as a week.
      const plan = [
        { hour: '02', minute: '00', repeat: 'Weekdays', answer: 'feature/apple-pay-sheet' },
        { hour: '03', minute: '30', repeat: 'Every day', answer: 'NIM-482' },
        { hour: '06', minute: '00', repeat: 'Weekly', answer: '' },
      ]
      for (const [index, slot] of plan.entries()) {
        await page.locator('[aria-label="Schedule a run"]').nth(index).click()
        await sleep(500)
        const dialog = page.locator('[role="dialog"]')
        // The hour and the minute are the panel's own pickers: a button that opens a menu of entries.
        for (const [picker, value] of [[0, slot.hour], [1, slot.minute]]) {
          await dialog.locator('[class*="_selector_"]').nth(picker).click()
          await sleep(300)
          await page.locator('[data-menu-entry]').filter({ hasText: new RegExp(`^✓?${value}$`) }).first().click()
          await sleep(300)
        }
        await dialog.getByRole('button', { name: slot.repeat, exact: true }).click()
        // A scenario that asks for something is answered now: at that hour nobody is there to answer.
        const asks = dialog.locator('input')
        if (slot.answer && (await asks.count())) await asks.last().fill(slot.answer)
        await sleep(200)
        await clickButton(page, 'Set the time')
        await sleep(700)
      }
      await clickButton(page, 'Schedule')
      await sleep(600)
    },
  },
  {
    id: 'statistics',
    shot: 'shot-stats',
    caption: 'Statistics: hours, habits and streaks of your work with Claude',
    editor: { path: 'apps/web/src/checkout/PaymentSheet.tsx', line: 12 },
    run: async (page) => {
      await clickButton(page, '30 days')
      await sleep(500)
    },
  },
  {
    id: 'achievements',
    shot: 'shot-achievements',
    caption: 'Achievements for the way you actually work',
    editor: { path: 'apps/web/src/checkout/PaymentSheet.tsx', line: 12 },
  },
  {
    id: 'mcp-servers',
    shot: 'shot-mcp',
    caption: 'MCP servers: status, sign-in and reconnect without leaving the IDE',
    editor: { path: 'apps/api/src/payments/providers/stripe.ts', line: 4 },
    run: async (page) => {
      await scrollFeed(page, 'bottom')
      await openMenu(page)
      await clickButton(page, 'MCP servers')
      await sleep(600)
    },
  },
  {
    id: 'plugins',
    shot: 'shot-plugins',
    caption: 'Plugins and marketplaces: browse, install and switch them from the panel',
    editor: { path: 'apps/web/src/checkout/PaymentSheet.tsx', line: 12 },
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
    id: 'claude-accounts',
    shot: 'shot-diff',
    caption: 'Several Claude accounts, switched in a click, each with its own limits',
    editor: { path: 'apps/web/src/checkout/paymentMethods.ts', line: 1 },
    run: async (page) => {
      await scrollFeed(page, 'bottom')
      await openMenu(page)
      await clickButton(page, 'Claude accounts')
      await sleep(700)
    },
  },
  {
    id: 'settings',
    shot: 'shot-sounds',
    caption: 'Settings: sound alerts, light or dark, ten languages, and how a new chat starts',
    editor: { path: 'apps/web/src/checkout/applePay.ts', line: 12 },
    run: async (page) => {
      await scrollFeed(page, 'bottom')
      await openMenu(page)
      await clickButton(page, 'Settings')
      await sleep(700)
    },
  },
]
